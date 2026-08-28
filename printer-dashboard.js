(() => {
  'use strict';

  const core=globalThis.FilamentInventoryPrinter;
  if(!core)return;
  const STORAGE_KEY='filament-inventory-v1';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text=value=>String(value||'').trim();
  const parse=(value,fallback=null)=>{try{return JSON.parse(value);}catch{return fallback;}};
  const nowIso=()=>new Date().toISOString();
  const currentUser=()=>globalThis.FilamentInventoryUsers?.currentUser?.()||'Bill';
  let storageBound=false;
  let pendingLoad=null;

  function readState(){const value=parse(localStorage.getItem(STORAGE_KEY)||'{}',{});return Array.isArray(value?.spools)?value:{version:10,spools:[],weighLog:[],auditLog:[],meta:{}};}
  function writeState(value){value.savedAt=nowIso();localStorage.setItem(STORAGE_KEY,JSON.stringify(value));}
  function toast(message){const node=document.getElementById('toast');if(!node)return;node.textContent=message;node.classList.add('show');setTimeout(()=>node.classList.remove('show'),2600);}
  function activeRows(value=readState()){return core.activeSpools(value).slice().sort((a,b)=>String(a.id).localeCompare(String(b.id),undefined,{numeric:true}));}
  function slotLabel(spool){return [text(spool.feederName)||'Feeder',text(spool.feederSlot)?`Slot ${text(spool.feederSlot)}`:'No slot'].join(' · ');}

  function pageMarkup(){
    return `<div class="printer-command">
      <section class="panel printer-hero"><div><h2 id="householdTitle">Loaded filament</h2><p class="muted">See every occupied Printer / AMS slot, remaining material, and anything that needs attention.</p></div><div><span class="printer-private-chip" id="printerPrivateChip"></span></div></section>
      <div class="printer-metrics" id="printerMetrics"></div>
      <section class="panel printer-panel"><div class="panel-head"><div><h3>Loaded now</h3><p>Current printer, feeder and slot occupancy.</p></div><div class="printer-panel-actions"><button class="btn" type="button" data-printer-scan>Scan spool</button><button class="btn btn-primary" type="button" data-printer-load-open>Load / move spool</button></div></div><div class="printer-board" id="printerBoard"></div></section>
      <section class="panel printer-panel"><div class="panel-head"><div><h3>Needs attention</h3><p>Only low, unmeasured, or conflicting loaded spools appear here.</p></div></div><div class="printer-attention" id="printerAttention"></div></section>
    </div>`;
  }

  function ensureDialogs(){
    if(!document.querySelector('.printer-load-dialog')){
      const dialog=document.createElement('dialog');dialog.className='printer-load-dialog';dialog.innerHTML=`<div class="dialog-head"><div><span class="eyebrow">Printer / AMS</span><h3>Load or move a spool</h3></div><button class="btn icon-btn" type="button" data-printer-dialog-close aria-label="Close">×</button></div><div class="dialog-body"><div class="printer-context"><div class="form-field"><label for="printerFindMaterial">Material</label><input class="field" id="printerFindMaterial" placeholder="PLA"></div><div class="form-field"><label for="printerFindColor">Color contains</label><input class="field" id="printerFindColor" placeholder="Black"></div></div><div class="printer-candidates" id="printerCandidates"></div><div class="printer-form"><div class="form-field full"><label for="moveSpoolV8">Spool</label><select class="select" id="moveSpoolV8"></select></div><div class="form-field"><label for="movePrinterV8">Printer</label><input class="field" id="movePrinterV8" list="printerCommandNames" placeholder="Bambu P1S"></div><div class="form-field"><label for="moveFeederV8">AMS / feeder</label><input class="field" id="moveFeederV8" list="printerFeederNames" placeholder="AMS 1"></div><div class="form-field"><label for="moveSlotV8">Slot / bay</label><input class="field" id="moveSlotV8" maxlength="24" placeholder="1"></div></div><datalist id="printerCommandNames"></datalist><datalist id="printerFeederNames"></datalist><div class="dialog-actions"><button class="btn" type="button" data-printer-unload-selected>Unload selected</button><button class="btn btn-primary" type="button" data-printer-load-save>Load / move</button></div></div>`;document.body.appendChild(dialog);
    }
    if(!document.querySelector('.printer-conflict-dialog')){
      const dialog=document.createElement('dialog');dialog.className='printer-conflict-dialog';dialog.innerHTML=`<div class="dialog-head"><div><span class="eyebrow">Slot occupied</span><h3>Replace loaded spool?</h3></div><button class="btn icon-btn" type="button" data-printer-conflict-cancel aria-label="Close">×</button></div><div class="dialog-body"><p class="fi-confirm-copy" data-printer-conflict-copy></p><div class="fi-selected-targets" data-printer-conflict-targets></div><div class="dialog-actions"><button class="btn" type="button" data-printer-conflict-cancel>Cancel</button><button class="btn btn-primary" type="button" data-printer-conflict-accept>Replace spool</button></div></div>`;document.body.appendChild(dialog);
    }
  }

  function installView(){
    const view=document.getElementById('householdView');if(!view)return false;if(view.dataset.printerCommand==='2')return true;
    view.dataset.printerCommand='2';view.setAttribute('aria-labelledby','householdTitle');view.innerHTML=pageMarkup();ensureDialogs();bindView();render();globalThis.FilamentInventoryNavigation?.register?.('household');return true;
  }

  function renderMetrics(value,summary){
    const node=document.getElementById('printerMetrics');if(!node)return;const attention=summary.lowLoaded.length+summary.unknownLoaded.length+summary.conflicts.length;
    const rows=[['Loaded',summary.loaded,`${summary.active} active spools`],['Printers',summary.printers,'with filament assigned'],['Loaded filament',`${(summary.knownLoadedGrams/1000).toFixed(2)} kg`,'known remaining'],['Attention',attention,'low · unknown · conflict']];
    node.innerHTML=rows.map(([label,amount,note])=>`<div class="printer-metric"><span>${esc(label)}</span><strong>${esc(amount)}</strong><small>${esc(note)}</small></div>`).join('');
  }

  function renderBoard(value){
    const node=document.getElementById('printerBoard');if(!node)return;const groups=core.printerGroups(value);
    if(!groups.length){node.innerHTML='<div class="printer-empty"><strong>Nothing is loaded yet.</strong>Scan a spool or use Load / move spool to assign filament to a printer or AMS slot.<button class="btn btn-primary" type="button" data-printer-load-open>Load a spool</button></div>';return;}
    node.innerHTML=groups.map(group=>`<article class="printer-machine"><div class="printer-machine-head"><strong>${esc(group.printer)}</strong><span>${group.rows.length} loaded</span></div><div class="printer-slots">${group.rows.map(spool=>{const m=core.measurement(spool);const low=m.grams!==null&&m.grams<=Number(spool.reorderThreshold??250);return `<div class="printer-slot" data-low="${low}" data-unknown="${m.grams===null}"><i class="fi-spool-swatch" style="background:${esc(spool.colorHex||'#666d7d')}"></i><div class="printer-slot-label">${esc(slotLabel(spool))}</div><div class="printer-slot-main"><strong>${esc(spool.id)} · ${esc(spool.material||'Unknown')} · ${esc(spool.colorName||'Unknown')}</strong><span>${m.grams===null?'Remaining unknown':`${Math.round(m.grams)} g · ${Math.round(m.percent)}%`}${low?' · Low':''}</span></div><div class="printer-slot-actions"><button class="btn" type="button" data-printer-weigh="${esc(spool.id)}">Weigh</button><button class="btn" type="button" data-printer-edit-load="${esc(spool.id)}">Move</button><button class="btn" type="button" data-printer-unload="${esc(spool.id)}">Unload</button></div></div>`;}).join('')}</div></article>`).join('');
  }

  function renderAttention(value,summary){
    const node=document.getElementById('printerAttention');if(!node)return;const rows=[];
    summary.conflicts.forEach(group=>rows.push({kind:'conflict',id:group[0]?.id,title:'Duplicate slot assignment',detail:group.map(row=>row.id).join(', ')}));
    summary.lowLoaded.forEach(spool=>{const m=core.measurement(spool);rows.push({kind:'low',id:spool.id,title:`${spool.id} is low`,detail:`${Math.round(m.grams)} g remaining · ${slotLabel(spool)}`});});
    summary.unknownLoaded.forEach(spool=>rows.push({kind:'unknown',id:spool.id,title:`${spool.id} needs a measurement`,detail:slotLabel(spool)}));
    node.innerHTML=rows.length?rows.map(row=>`<div class="printer-attention-row" data-kind="${esc(row.kind)}"><span class="printer-attention-dot"></span><div><strong>${esc(row.title)}</strong><span>${esc(row.detail)}</span></div><button class="btn" type="button" data-printer-${row.kind==='conflict'?'edit-load':'weigh'}="${esc(row.id)}">${row.kind==='conflict'?'Review':'Weigh'}</button></div>`).join(''):'<div class="printer-empty"><strong>No placement issues.</strong>Loaded spools are measured, above reorder thresholds, and have no duplicate slot assignments.</div>';
  }

  function renderForm(value){
    const rows=activeRows(value);const select=document.getElementById('moveSpoolV8');const selected=select?.value;
    if(select){select.innerHTML=rows.map(spool=>{const m=core.measurement(spool);const remain=m.grams===null?'unknown':`${Math.round(m.grams)} g`;return `<option value="${esc(spool.id)}">${esc(spool.id)} — ${esc(spool.material||'Unknown')} — ${esc(spool.colorName||'Unknown')} — ${esc(remain)}</option>`;}).join('');if([...select.options].some(option=>option.value===selected))select.value=selected;}
    const printers=[...new Set(rows.map(spool=>text(spool.printerName)).filter(Boolean))].sort();const feeders=[...new Set(rows.map(spool=>text(spool.feederName)).filter(Boolean))].sort();
    const p=document.getElementById('printerCommandNames');const f=document.getElementById('printerFeederNames');if(p)p.innerHTML=printers.map(value=>`<option value="${esc(value)}"></option>`).join('');if(f)f.innerHTML=feeders.map(value=>`<option value="${esc(value)}"></option>`).join('');populateSelectedPlacement(value);
  }

  function renderCandidates(value=readState()){
    const node=document.getElementById('printerCandidates');if(!node)return;const material=document.getElementById('printerFindMaterial')?.value||'';const color=document.getElementById('printerFindColor')?.value||'';const rows=core.rankedCandidates(value,{material,color}).slice(0,5);
    node.innerHTML=rows.length?rows.map(({spool,measurement})=>`<div class="printer-candidate"><i class="fi-spool-swatch" style="background:${esc(spool.colorHex||'#666d7d')}"></i><div><strong>${esc(spool.id)} · ${esc(spool.material||'Unknown')} · ${esc(spool.colorName||'Unknown')}</strong><span>${measurement.grams===null?'Remaining unknown':`${Math.round(measurement.grams)} g remaining`} · ${spool.placementState==='Loaded'?'Already loaded':'Stored'}</span></div><button class="btn" type="button" data-printer-use="${esc(spool.id)}">Use</button></div>`).join(''):'<div class="printer-empty">No active spools match these filters.</div>';
  }

  function populateSelectedPlacement(value=readState()){
    const id=document.getElementById('moveSpoolV8')?.value;const spool=value.spools.find(row=>String(row.id)===String(id));if(!spool)return;
    const printer=document.getElementById('movePrinterV8');const feeder=document.getElementById('moveFeederV8');const slot=document.getElementById('moveSlotV8');if(printer)printer.value=text(spool.printerName);if(feeder)feeder.value=text(spool.feederName);if(slot)slot.value=text(spool.feederSlot);
  }

  function render(){
    if(document.getElementById('householdView')?.dataset.printerCommand!=='2')return;const value=readState();const summary=core.summary(value);const chip=document.getElementById('printerPrivateChip');if(chip)chip.textContent=`${currentUser()}'s private inventory`;renderMetrics(value,summary);renderBoard(value);renderAttention(value,summary);renderForm(value);renderCandidates(value);
  }

  function openLoad(id=''){
    ensureDialogs();const dialog=document.querySelector('.printer-load-dialog');if(!dialog)return;renderForm(readState());if(id)selectSpool(id);renderCandidates(readState());if(!dialog.open)dialog.showModal();setTimeout(()=>document.getElementById('moveSpoolV8')?.focus(),20);
  }

  function selectSpool(id){const select=document.getElementById('moveSpoolV8');if(!select)return;const option=[...select.options].find(row=>String(row.value).toLowerCase()===String(id).toLowerCase());if(option){select.value=option.value;populateSelectedPlacement();}}

  function setPlacement(id,placement){const value=readState();const spool=value.spools.find(row=>String(row.id)===String(id));if(!spool)return false;Object.assign(spool,placement,{updatedAt:nowIso()});writeState(value);return true;}
  function unload(id){if(!id)return;if(!setPlacement(id,{placementState:'Stored',printerName:'',feederName:'',feederSlot:'',loadedAt:null}))return;render();toast(`${id} unloaded to storage.`);}

  function commitLoad(value,spool,placement,conflict=null){
    if(conflict)Object.assign(conflict,{placementState:'Stored',printerName:'',feederName:'',feederSlot:'',loadedAt:null,updatedAt:nowIso()});Object.assign(spool,placement,{updatedAt:nowIso()});writeState(value);document.querySelector('.printer-load-dialog')?.close();render();toast(`${spool.id} loaded on ${placement.printerName}.`);
  }

  function loadSelected(){
    const id=document.getElementById('moveSpoolV8')?.value;if(!id)return;const value=readState();const spool=value.spools.find(row=>String(row.id)===String(id));if(!spool)return;
    const placement={placementState:'Loaded',printerName:text(document.getElementById('movePrinterV8')?.value),feederName:text(document.getElementById('moveFeederV8')?.value),feederSlot:text(document.getElementById('moveSlotV8')?.value),loadedAt:spool.loadedAt||nowIso()};
    if(!placement.printerName){toast('Choose or enter a printer first.');document.getElementById('movePrinterV8')?.focus();return;}
    const wantedKey=core.slotKey(placement);const conflict=value.spools.find(row=>!row.archivedAt&&String(row.id)!==String(id)&&core.slotKey(row)===wantedKey&&wantedKey!=='||');
    if(!conflict){commitLoad(value,spool,placement);return;}
    pendingLoad={value,spool,placement,conflict};const dialog=document.querySelector('.printer-conflict-dialog');const label=[placement.printerName,placement.feederName,placement.feederSlot?`Slot ${placement.feederSlot}`:''].filter(Boolean).join(' · ');dialog.querySelector('[data-printer-conflict-copy]').textContent=`${conflict.id} currently occupies ${label}. Replacing it will unload ${conflict.id} to storage and load ${id} into that slot.`;dialog.querySelector('[data-printer-conflict-targets]').innerHTML=`<div class="fi-selected-target"><i style="background:${esc(conflict.colorHex||'#666d7d')}"></i><strong>${esc(conflict.id)} · ${esc(conflict.material||'Unknown')} · ${esc(conflict.colorName||'Unknown')}</strong><small>Currently loaded</small></div><div class="fi-selected-target"><i style="background:${esc(spool.colorHex||'#666d7d')}"></i><strong>${esc(spool.id)} · ${esc(spool.material||'Unknown')} · ${esc(spool.colorName||'Unknown')}</strong><small>Will replace it</small></div>`;dialog.showModal();
  }

  function navigateWeigh(id){if(globalThis.FilamentInventoryWorkflows?.weigh)return globalThis.FilamentInventoryWorkflows.weigh(id);globalThis.FilamentInventoryNavigation?.navigate?.('weigh',{historyMode:'replace',focus:true});setTimeout(()=>{const select=document.getElementById('weighSpool');if(select){select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}));}document.getElementById('grossWeight')?.focus();},60);}

  function bindView(){
    document.getElementById('householdView')?.addEventListener('click',event=>{const unloadButton=event.target.closest('[data-printer-unload]');if(unloadButton)return unload(unloadButton.dataset.printerUnload);const weighButton=event.target.closest('[data-printer-weigh]');if(weighButton)return navigateWeigh(weighButton.dataset.printerWeigh);const editButton=event.target.closest('[data-printer-edit-load]');if(editButton)return openLoad(editButton.dataset.printerEditLoad);if(event.target.closest('[data-printer-load-open]'))return openLoad();if(event.target.closest('[data-printer-scan]'))return document.querySelector('.scan-launch')?.click();});
    document.addEventListener('click',event=>{if(event.target.closest('[data-printer-dialog-close]')){event.target.closest('dialog')?.close();return;}const use=event.target.closest('[data-printer-use]');if(use){selectSpool(use.dataset.printerUse);return;}if(event.target.closest('[data-printer-load-save]')){loadSelected();return;}if(event.target.closest('[data-printer-unload-selected]')){const id=document.getElementById('moveSpoolV8')?.value;unload(id);document.querySelector('.printer-load-dialog')?.close();return;}if(event.target.closest('[data-printer-conflict-cancel]')){pendingLoad=null;document.querySelector('.printer-conflict-dialog')?.close();return;}if(event.target.closest('[data-printer-conflict-accept]')){const next=pendingLoad;pendingLoad=null;document.querySelector('.printer-conflict-dialog')?.close();if(next)commitLoad(next.value,next.spool,next.placement,next.conflict);}});
    document.getElementById('moveSpoolV8')?.addEventListener('change',()=>populateSelectedPlacement());['printerFindMaterial','printerFindColor'].forEach(id=>document.getElementById(id)?.addEventListener('input',()=>renderCandidates(readState())));
  }

  function bindGlobal(){if(storageBound)return;storageBound=true;window.addEventListener('storage',event=>{if(event.key===STORAGE_KEY)render();});document.addEventListener('fi:navigation',event=>{if(event.detail?.view==='household')setTimeout(render,0);});const priorSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){const result=priorSetItem.call(this,key,value);if(this===localStorage&&key===STORAGE_KEY)queueMicrotask(render);return result;};}
  function init(){installView();bindGlobal();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0),{once:true});else setTimeout(init,0);
})();
