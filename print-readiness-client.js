(() => {
  'use strict';

  const core=globalThis.FilamentInventoryPrintReadiness;
  if(!core)return;
  const KEY='filament-inventory-v1';
  const $=id=>document.getElementById(id);
  const state=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}');}catch{return {};}};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function ensureLauncher(){
    if(document.querySelector('[data-print-readiness]'))return;
    const host=document.querySelector('.fi-home-actions, #dashboardView .hero-actions');if(!host)return;
    const button=document.createElement('button');button.className='btn btn-primary';button.type='button';button.dataset.printReadiness='';button.textContent='Can I print this?';host.prepend(button);
  }

  function defaultMargin(){return globalThis.FilamentInventoryProfileUI?.read?.()?.printing?.safetyMargin??10;}

  function ensure(){
    ensureLauncher();if($('printReadinessDialog'))return;
    const dialog=document.createElement('dialog');dialog.id='printReadinessDialog';dialog.className='spool-action-dialog';dialog.setAttribute('aria-labelledby','printReadinessTitle');
    dialog.innerHTML=`<form method="dialog" class="spool-action-shell" id="printReadinessForm">
      <div class="spool-action-head"><div><span class="eyebrow">Print check</span><h2 id="printReadinessTitle">Can I print this?</h2></div><button class="btn icon-btn" type="button" data-readiness-close aria-label="Close">×</button></div>
      <div class="spool-action-body">
        <p class="muted">Describe the filament the model needs. The check prefers known amounts and already-loaded spools.</p>
        <div class="form-grid"><div class="form-field"><label for="printMaterial">Material</label><input class="field" id="printMaterial" placeholder="PLA" autocomplete="off"></div><div class="form-field"><label for="printColor">Color</label><input class="field" id="printColor" placeholder="Black · leave blank for any" autocomplete="off"></div><div class="form-field full"><label for="printGrams">Filament needed (g)</label><input class="field" id="printGrams" type="number" min="1" step="1" required value="250"></div></div>
        <details class="fi-readiness-options"><summary>Options</summary><div class="form-field"><label for="printMargin">Safety margin (%)</label><input class="field" id="printMargin" type="number" min="0" max="100" step="1" value="${defaultMargin()}"><small class="muted">Added to the model estimate so a borderline spool is not recommended as ready.</small></div></details>
        <div id="printReadinessResult" role="status" aria-live="polite" aria-atomic="true"></div>
        <div class="dialog-actions"><button class="btn" type="button" data-readiness-close>Cancel</button><button class="btn btn-primary" type="submit">Check inventory</button></div>
      </div>
    </form>`;
    document.body.appendChild(dialog);
    $('printReadinessForm').addEventListener('submit',event=>{event.preventDefault();render();});
    dialog.querySelectorAll('[data-readiness-close]').forEach(button=>button.addEventListener('click',()=>dialog.close()));
  }

  function resultAction(row,status){
    if(!row)return '';
    const id=esc(row.spool.id);
    if(status==='measurement-needed')return `<button class="btn btn-primary" type="button" data-ready-action="weigh" data-ready-id="${id}">Weigh this spool</button>`;
    if(status==='ready')return `<button class="btn btn-primary" type="button" data-ready-action="${row.loaded?'open':'place'}" data-ready-id="${id}">${row.loaded?'Use this spool':'Load this spool'}</button>`;
    return `<button class="btn" type="button" data-ready-action="open" data-ready-id="${id}">Review spool</button>`;
  }

  function render(){
    const result=core.evaluate(state().spools||[],{material:$('printMaterial').value,color:$('printColor').value,grams:$('printGrams').value,safetyMargin:$('printMargin').value});
    const host=$('printReadinessResult');if(!host)return;host.dataset.hasResult='1';
    const row=result.recommended;
    if(!row){
      host.innerHTML=`<section class="fi-readiness-result" data-state="no-match"><span class="eyebrow">No match</span><h3>No active spool matches</h3><p>Try a broader color, another material, or leave color blank to check any color.</p></section>`;
      return;
    }
    const spool=row.spool;
    const config={
      ready:{eyebrow:'Ready',title:'You have enough filament',copy:`${Math.round(row.grams)} g is available and ${result.required} g is required with your safety margin.`},
      'measurement-needed':{eyebrow:'Measurement needed',title:'This spool could work, but its amount is unknown',copy:'Weigh it before relying on it for this print.'},
      'not-enough':{eyebrow:'Not enough',title:'Best matching spool is short',copy:`${Math.round(row.grams)} g is available and ${result.required} g is required with your safety margin.`},
    }[result.status];
    const after=row.after===null?'Unknown':`${Math.round(row.after)} g`;
    host.innerHTML=`<section class="fi-readiness-result" data-state="${esc(result.status)}"><span class="eyebrow">${esc(config.eyebrow)}</span><h3>${esc(config.title)}</h3><p>${esc(spool.id)} · ${esc(spool.brand||'Unknown')} · ${esc(spool.material||'Unknown')} · ${esc(spool.colorName||'Unknown')}</p><p>${esc(config.copy)}</p><div class="fi-readiness-metric"><span>Model estimate</span><strong>${Math.round(result.needed)} g</strong></div><div class="fi-readiness-metric"><span>Required with margin</span><strong>${Math.round(result.required)} g</strong></div><div class="fi-readiness-metric"><span>Available now</span><strong>${row.grams===null?'Unknown':`${Math.round(row.grams)} g`}</strong></div><div class="fi-readiness-metric"><span>After print</span><strong>${esc(after)}</strong></div>${row.loaded?`<p class="muted">Loaded now: ${esc(spool.printerName||'Printer')}${spool.feederName?` · ${esc(spool.feederName)}`:''}${spool.feederSlot?` · Slot ${esc(spool.feederSlot)}`:''}</p>`:''}<div class="dialog-actions">${resultAction(row,result.status)}</div></section>`;
  }

  function hasRecheckableQuery(){return $('printReadinessResult')?.dataset.hasResult==='1'&&Number($('printGrams')?.value)>0;}

  function open(){
    ensure();const dialog=$('printReadinessDialog');if(!dialog)return;
    if(!dialog.open)dialog.showModal();
    if(hasRecheckableQuery())render();
    setTimeout(()=>$('printMaterial')?.focus({preventScroll:true}),20);
  }

  document.addEventListener('click',event=>{
    const launch=event.target.closest('[data-print-readiness]');if(launch){event.preventDefault();open();return;}
    const action=event.target.closest('[data-ready-action]');if(!action)return;
    $('printReadinessDialog')?.close();const workflows=globalThis.FilamentInventoryWorkflows;if(!workflows)return;
    if(action.dataset.readyAction==='weigh')workflows.weigh(action.dataset.readyId);
    else if(action.dataset.readyAction==='place')workflows.place(action.dataset.readyId);
    else workflows.open(action.dataset.readyId,{source:'print-readiness'});
  });

  globalThis.FilamentInventoryPrintReadinessUI=Object.freeze({open,render});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensure,{once:true});else ensure();
})();
