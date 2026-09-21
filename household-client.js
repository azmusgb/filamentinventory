(() => {
  'use strict';

  const STORAGE_KEY = 'filament-inventory-v1';
  const CURRENT_USER_KEY = 'filament-current-user-v1';
  const VERSION_INFO = globalThis.FilamentInventoryVersion || Object.freeze({APP_VERSION:'9.0.0', DATA_SCHEMA_VERSION:9, DISPLAY_VERSION:'v9.0.0'});
  const VERSION = VERSION_INFO.DATA_SCHEMA_VERSION;
  const APP_VERSION = VERSION_INFO.APP_VERSION;
  const VERSION_LABEL = VERSION_INFO.DISPLAY_VERSION;
  const OWNERS = ['Bill', 'Aimee'];
  const priorGetItem = Storage.prototype.getItem;
  const priorSetItem = Storage.prototype.setItem;
  const spoolContract = globalThis.FilamentInventorySpoolContract;
  let inventoryObserver = null;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const parse = (text, fallback = null) => { try { return JSON.parse(text); } catch { return fallback; } };
  const nowIso = () => new Date().toISOString();
  const validNum = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
  const normalizeOwner = value => OWNERS.includes(String(value)) ? String(value) : 'Bill';
  const safeText = (value, max = 60) => String(value || '').trim().slice(0, max);
  const validIso = value => value && !Number.isNaN(Date.parse(String(value))) ? String(value) : null;

  function normalizeHousehold(spool = {}, fallback = {}) {
    const merged = {...fallback,...spool};
    if (spoolContract?.normalizeSpool) {
      const canonical = spoolContract.normalizeSpool(merged,{owner:currentUser(),householdId:merged.householdId || 'default-household'});
      const placementState = canonical?.placement?.state || 'Unknown';
      return {
        owner:normalizeOwner(canonical.owner),
        placementState,
        printerName:placementState === 'Loaded' ? safeText(canonical.printerName || canonical.placement?.printerId) : '',
        feederName:placementState === 'Loaded' && !canonical.placement?.external ? safeText(canonical.feederName || canonical.placement?.feederId) : '',
        feederSlot:placementState === 'Loaded' && canonical.placement?.slot !== null && canonical.placement?.slot !== undefined ? String(canonical.placement.slot) : '',
        loadedAt:placementState === 'Loaded' ? (canonical.loadedAt || canonical.placement?.observedAt || null) : null,
        placementStatus:canonical?.placement?.status || 'Unknown',
        verificationRequired:Boolean(canonical?.placement?.verificationRequired),
      };
    }
    return {
      owner:normalizeOwner(merged.owner),
      placementState:'Unknown',
      printerName:'',
      feederName:'',
      feederSlot:'',
      loadedAt:null,
      placementStatus:'Unknown',
      verificationRequired:true,
    };
  }

  function currentUser() {
    const value = String(priorGetItem.call(localStorage, CURRENT_USER_KEY) || '');
    return normalizeOwner(value);
  }

  function setCurrentUser(owner) {
    priorSetItem.call(localStorage, CURRENT_USER_KEY, normalizeOwner(owner));
  }

  function readState() {
    const state = parse(localStorage.getItem(STORAGE_KEY), null);
    return state?.spools ? state : {version:VERSION, spools:[], weighLog:[], meta:{}};
  }

  function writeState(state) {
    state.version = Math.max(Number(state.version) || 0, VERSION);
    state.savedAt = nowIso();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function measurement(spool) {
    if (spoolContract?.measurement) return spoolContract.measurement(spool);
    return {grams:null,percent:null,source:'Unknown',verificationRequired:true};
  }

  function statusFor(percent) {
    if (!validNum(percent)) return 'Unknown';
    const p = Number(percent);
    if (p >= 85) return 'Nearly full';
    if (p >= 70) return 'High';
    if (p >= 55) return 'Good';
    if (p >= 40) return 'Medium';
    if (p >= 20) return 'Low';
    return 'Very low';
  }

  function reorderNeeded(spool) {
    if (spoolContract?.reorderNeeded) return spoolContract.reorderNeeded(spool);
    return false;
  }

  function loadedLabel(spool) {
    if (spool?.placementState === 'Unknown') return 'Placement unknown · verify';
    if (spool?.placementState !== 'Loaded') return `Stored${spool?.location ? ` · ${spool.location}` : ''}`;
    const parts = [spool.printerName || 'Printer not named', spool.feederName, spool.feederSlot ? `Slot ${spool.feederSlot}` : ''].filter(Boolean);
    const caveat = spool.verificationRequired ? ' · verify' : '';
    return `Loaded · ${parts.join(' · ')}${caveat}`;
  }

  function injectOwnerFilter() {
    const lifecycle = document.getElementById('lifecycleFilter');
    if (!lifecycle || document.getElementById('ownerFilterV8')) return;
    const select = document.createElement('select');
    select.className = 'select';
    select.id = 'ownerFilterV8';
    select.setAttribute('aria-label','Filter by owner');
    select.innerHTML = '<option value="">All owners</option><option>Bill</option><option>Aimee</option>';
    lifecycle.insertAdjacentElement('afterend', select);
    select.addEventListener('change', decorateInventory);
  }

  function decorateInventory() {
    const state = readState();
    const byId = new Map(state.spools.map(s => [String(s.id), s]));
    const ownerFilter = document.getElementById('ownerFilterV8')?.value || '';
    let visible = 0;
    document.querySelectorAll('#inventoryGrid .spool-card').forEach(card => {
      const spool = byId.get(String(card.dataset.id));
      if (!spool) return;
      const hh = normalizeHousehold(spool);
      card.hidden = Boolean(ownerFilter && hh.owner !== ownerFilter);
      if (!card.hidden) visible++;
      let strip = card.querySelector('.v8-card-strip');
      if (!strip) {
        strip = document.createElement('div');
        strip.className = 'v8-card-strip';
        card.querySelector('.spool-body')?.appendChild(strip);
      }
      strip.innerHTML = `<span class="v8-owner-badge">${esc(hh.owner)}</span><span class="${hh.placementState === 'Loaded' ? 'v8-loaded-badge' : 'v8-stored-badge'}">${esc(loadedLabel({...spool,...hh}))}</span>`;
    });
    const count = document.getElementById('inventoryCountText');
    if (count && ownerFilter) count.textContent = `${visible} shown for ${ownerFilter} · owner filter active`;
  }

  function watchInventory() {
    const grid = document.getElementById('inventoryGrid');
    if (!grid || inventoryObserver) return;
    inventoryObserver = new MutationObserver(() => decorateInventory());
    inventoryObserver.observe(grid, {childList:true, subtree:false});
    decorateInventory();
  }

  function injectTabAndView() {
    const tabs = document.querySelector('.tabs');
    const dataTab = tabs?.querySelector('[data-view="data"]');
    if (tabs && dataTab && !tabs.querySelector('[data-view="household"]')) {
      const btn = document.createElement('button');
      btn.className = 'tab';
      btn.dataset.view = 'household';
      btn.setAttribute('aria-selected','false');
      btn.textContent = 'Printer / AMS';
      tabs.insertBefore(btn, dataTab);
    }
    const dataView = document.getElementById('dataView');
    if (dataView && !document.getElementById('householdView')) {
      const view = document.createElement('section');
      view.className = 'view';
      view.id = 'householdView';
      view.setAttribute('aria-labelledby','householdTitle');
      view.innerHTML = householdMarkup();
      dataView.parentNode.insertBefore(view, dataView);
    }
    const heroActions = document.querySelector('#dashboardView .hero-actions');
    if (heroActions && !heroActions.querySelector('[data-jump="household"]')) {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.type = 'button';
      btn.dataset.jump = 'household';
      btn.textContent = 'Printer / AMS';
      heroActions.insertBefore(btn, heroActions.lastElementChild);
    }
    const eyebrow = document.querySelector('#dashboardView .hero-copy .eyebrow');
    if (eyebrow) eyebrow.textContent = `Household inventory control · ${VERSION_LABEL}`;
    const dataTitle = document.getElementById('dataTitle');
    if (dataTitle) dataTitle.textContent = `Data, backup & install · ${VERSION_LABEL}`;
  }

  function householdMarkup() {
    return `
      <div class="v8-hero panel">
        <div><span class="eyebrow">Two-user household inventory · ${VERSION_LABEL}</span><h2 id="householdTitle">Bill + Aimee, one inventory system.</h2><p class="muted">Every spool has an owner and a physical state. Stored spools keep their storage location; loaded spools can be assigned to a printer, AMS/feeder, and slot.</p></div>
        <label class="v8-current-user">New spools default to <select class="select" id="currentUserV8"><option>Bill</option><option>Aimee</option></select></label>
      </div>
      <div class="v8-metrics" id="householdMetrics"></div>
      <div class="v8-grid">
        <section class="panel v8-panel"><div class="panel-head"><div><h3>Printer / AMS board</h3><p>What is physically loaded right now.</p></div></div><div id="loadedBoard" class="v8-loaded-board"></div></section>
        <section class="panel v8-panel"><div class="panel-head"><div><h3>Physical placement</h3><p>Printer / AMS is the only active placement authority. This household view is read-only for physical state.</p></div></div><div class="sync-empty"><strong>Manage placement in Printer</strong><span>Load, unload, external-spool, feeder, and slot changes are recorded there as canonical placement evidence.</span></div><div class="v8-actions"><button class="btn btn-primary" id="openPrinterV8" type="button">Open Printer / AMS</button></div></section>
      </div>
      <div class="v8-grid">
        <section class="panel v8-panel"><div class="panel-head"><div><h3>Bill vs Aimee report</h3><p>Counts, known filament, loaded spools, and reorder exposure.</p></div></div><div id="ownerReportV8" class="v8-owner-report"></div><div class="v8-actions"><button class="btn" id="exportHouseholdCsvV8" type="button">Export household CSV</button><button class="btn" id="backupHouseholdV8" type="button">Download complete JSON backup</button><button class="btn" id="restoreHouseholdV8" type="button">Restore complete backup</button></div><input class="sr-only" id="restoreHouseholdFileV8" type="file" accept="application/json,.json"/><input class="sr-only" id="restoreHouseholdCsvFileV8" type="file" accept="text/csv,.csv"/></section>
        <section class="panel v8-panel"><div class="panel-head"><div><h3>Find filament for a print</h3><p>Rank available spools by owner, material, color, remaining amount, and whether they are already loaded.</p></div></div><div class="form-grid"><div class="form-field"><label for="findOwnerV8">Owner</label><select class="select" id="findOwnerV8"><option value="">Either owner</option><option>Bill</option><option>Aimee</option></select></div><div class="form-field"><label for="findMaterialV8">Material</label><select class="select" id="findMaterialV8"><option value="">Any material</option></select></div><div class="form-field"><label for="findColorV8">Color contains</label><input class="field" id="findColorV8" placeholder="Black / blue / red…"/></div><div class="form-field"><label for="findMinV8">Minimum remaining (g)</label><input class="field" id="findMinV8" type="number" min="0" step="25" value="100"/></div><div class="form-field full"><label for="findPrinterV8">Prefer already loaded on printer</label><select class="select" id="findPrinterV8"><option value="">Any printer</option></select></div></div><div id="finderResultsV8" class="v8-finder"></div></section>
      </div>
      <section class="panel v8-panel"><div class="panel-head"><div><h3>Household spool list</h3><p>Review ownership and jump to authoritative physical workflows. Ownership transfer remains gated until the member-scoped migration is complete.</p></div></div><div class="v8-household-toolbar"><select class="select" id="householdListOwnerV8"><option value="">Both owners</option><option>Bill</option><option>Aimee</option></select><input class="field" id="householdSearchV8" type="search" placeholder="Search ID, brand, material, color, printer…"/></div><div id="householdListV8" class="v8-household-list"></div></section>`;
  }

  function injectStyle() {
    if (document.getElementById('householdV8Styles')) return;
    const style = document.createElement('style');
    style.id = 'householdV8Styles';
    style.textContent = `.v8-card-strip{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}.v8-owner-badge,.v8-loaded-badge,.v8-stored-badge{display:inline-flex;align-items:center;min-height:26px;padding:4px 8px;border-radius:999px;font-size:10px;font-weight:800;letter-spacing:.03em;border:1px solid var(--line)}.v8-owner-badge{background:rgba(56,189,248,.1)}.v8-loaded-badge{background:rgba(132,204,22,.12);color:#bef264}.v8-stored-badge{background:rgba(100,116,139,.12);color:var(--muted)}.v8-hero{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:22px}.v8-hero h2{margin:7px 0 5px;font-size:30px;letter-spacing:-.04em}.v8-current-user{display:flex;align-items:center;gap:10px;white-space:nowrap;color:var(--muted);font-size:12px}.v8-current-user .select{min-width:120px}.v8-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin:16px 0}.v8-metric{padding:16px;border:1px solid var(--line);border-radius:16px;background:rgba(3,10,18,.35)}.v8-metric span{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.07em}.v8-metric strong{display:block;margin-top:6px;font-size:23px}.v8-metric small{display:block;margin-top:4px;color:var(--muted);font-size:10px}.v8-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px}.v8-panel{padding:20px}.v8-loaded-board,.v8-owner-report,.v8-finder,.v8-household-list{display:grid;gap:9px}.v8-printer{padding:13px;border:1px solid var(--line);border-radius:15px;background:rgba(3,10,18,.25)}.v8-printer>strong{font-size:13px}.v8-slot{display:grid;grid-template-columns:88px 1fr auto;gap:10px;align-items:center;margin-top:8px;padding:9px 10px;border:1px solid var(--line);border-radius:12px}.v8-slot span,.v8-row span{color:var(--muted);font-size:11px}.v8-slot strong,.v8-row strong{font-size:12px}.v8-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:14px}.v8-actions .btn{flex:1}.v8-owner-card{display:grid;grid-template-columns:100px repeat(4,1fr) auto;gap:10px;align-items:center;padding:12px;border:1px solid var(--line);border-radius:14px;background:rgba(3,10,18,.25)}.v8-owner-card>strong{font-size:15px}.v8-owner-card div span{display:block;color:var(--muted);font-size:10px}.v8-owner-card div strong{display:block;margin-top:2px;font-size:13px}.v8-finder-row,.v8-row{display:grid;grid-template-columns:1.3fr .7fr .8fr auto;gap:10px;align-items:center;padding:11px 12px;border:1px solid var(--line);border-radius:13px;background:rgba(3,10,18,.25)}.v8-finder-row[data-loaded=true]{border-color:rgba(132,204,22,.35)}.v8-score{font-size:10px;color:var(--muted)}.v8-household-toolbar{display:grid;grid-template-columns:180px 1fr;gap:10px;margin-bottom:12px}.v8-owner-dot{width:9px;height:9px;border-radius:50%;display:inline-block;margin-right:6px;background:#38bdf8}.v8-owner-dot[data-owner=Aimee]{background:#c084fc}.v8-transfer{white-space:nowrap}@media(max-width:980px){.v8-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.v8-grid{grid-template-columns:1fr}.v8-owner-card{grid-template-columns:90px repeat(2,1fr)}.v8-owner-card .btn{grid-column:1/-1}}@media(max-width:600px){.v8-hero{align-items:flex-start;flex-direction:column}.v8-current-user{width:100%;justify-content:space-between}.v8-metrics{grid-template-columns:1fr 1fr}.v8-slot,.v8-finder-row,.v8-row{grid-template-columns:1fr}.v8-household-toolbar{grid-template-columns:1fr}.v8-owner-card{grid-template-columns:1fr 1fr}.v8-owner-card>strong{grid-column:1/-1}}`;
    document.head.appendChild(style);
  }

  function activeSpools(state = readState()) { return state.spools.filter(s => !s.archivedAt); }

  function renderHouseholdMetrics() {
    const active = activeSpools();
    const known = active.map(measurement).filter(m => m.grams !== null).reduce((a,m) => a + m.grams,0);
    const loaded = active.filter(s => normalizeHousehold(s).placementState === 'Loaded').length;
    const reorder = active.filter(reorderNeeded).length;
    const bill = active.filter(s => normalizeOwner(s.owner) === 'Bill').length;
    const aimee = active.filter(s => normalizeOwner(s.owner) === 'Aimee').length;
    const el = document.getElementById('householdMetrics');
    if (el) el.innerHTML = [['Bill',bill,'active spools'],['Aimee',aimee,'active spools'],['Loaded',loaded,'printer / AMS'],['Known filament',`${(known/1000).toFixed(2)} kg`,'measured + visual'],['Reorder',reorder,'at/below threshold']].map(([label,value,note]) => `<div class="v8-metric"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`).join('');
  }

  function renderLoadedBoard() {
    const loaded = activeSpools().filter(s => normalizeHousehold(s).placementState === 'Loaded');
    const el = document.getElementById('loadedBoard');
    if (!el) return;
    if (!loaded.length) return void (el.innerHTML = '<div class="sync-empty">No spools are marked loaded yet. Use Quick move to assign one to a printer/AMS slot.</div>');
    const groups = new Map();
    loaded.forEach(s => { const hh=normalizeHousehold(s),key=hh.printerName||'Unassigned printer'; if(!groups.has(key))groups.set(key,[]); groups.get(key).push({...s,...hh}); });
    el.innerHTML = [...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([printer,rows]) => `<div class="v8-printer"><strong>${esc(printer)}</strong>${rows.sort((a,b)=>`${a.feederName}|${a.feederSlot}`.localeCompare(`${b.feederName}|${b.feederSlot}`,undefined,{numeric:true})).map(s=>{const m=measurement(s);return `<div class="v8-slot"><span>${esc([s.feederName||'Feeder',s.feederSlot?`Slot ${s.feederSlot}`:''].filter(Boolean).join(' · '))}</span><div><strong><i class="v8-owner-dot" data-owner="${esc(s.owner)}"></i>${esc(s.id)} · ${esc(s.material||'Unknown')} · ${esc(s.colorName||'Unknown')}</strong><span>${esc(s.owner)} · ${m.grams===null?'remaining unknown':`${Math.round(m.grams)} g remaining`}</span></div><button class="btn" data-v8-manage-placement="${esc(s.id)}" type="button">Manage placement</button></div>`;}).join('')}</div>`).join('');
  }

  function renderOwnerReport() {
    const active=activeSpools(),el=document.getElementById('ownerReportV8'); if(!el)return;
    el.innerHTML=OWNERS.map(owner=>{const rows=active.filter(s=>normalizeOwner(s.owner)===owner),known=rows.map(measurement).filter(m=>m.grams!==null).reduce((a,m)=>a+m.grams,0),loaded=rows.filter(s=>normalizeHousehold(s).placementState==='Loaded').length,reorder=rows.filter(reorderNeeded).length,unknown=rows.filter(s=>measurement(s).grams===null).length;return `<div class="v8-owner-card"><strong><i class="v8-owner-dot" data-owner="${owner}"></i>${owner}</strong><div><span>Active</span><strong>${rows.length}</strong></div><div><span>Known</span><strong>${(known/1000).toFixed(2)} kg</strong></div><div><span>Loaded</span><strong>${loaded}</strong></div><div><span>Reorder / unknown</span><strong>${reorder} / ${unknown}</strong></div><button class="btn" data-v8-owner-list="${owner}" type="button">Show spools</button></div>`;}).join('');
  }

  function renderFinderOptions() {
    const active=activeSpools(),materials=[...new Set(active.map(s=>safeText(s.material)).filter(Boolean))].sort(),printers=[...new Set(active.map(s=>safeText(s.printerName)).filter(Boolean))].sort();
    const m=document.getElementById('findMaterialV8'),p=document.getElementById('findPrinterV8'),mv=m?.value||'',pv=p?.value||'';
    if(m){m.innerHTML='<option value="">Any material</option>'+materials.map(x=>`<option>${esc(x)}</option>`).join('');if([...m.options].some(o=>o.value===mv))m.value=mv;}
    if(p){p.innerHTML='<option value="">Any printer</option>'+printers.map(x=>`<option>${esc(x)}</option>`).join('');if([...p.options].some(o=>o.value===pv))p.value=pv;}
  }

  function renderFinder() {
    const owner=document.getElementById('findOwnerV8')?.value||'',material=document.getElementById('findMaterialV8')?.value||'',color=String(document.getElementById('findColorV8')?.value||'').trim().toLowerCase(),min=Math.max(0,Number(document.getElementById('findMinV8')?.value||0)),printer=document.getElementById('findPrinterV8')?.value||'';
    const ranked=activeSpools().map(s=>{const hh=normalizeHousehold(s),m=measurement(s);if(owner&&hh.owner!==owner)return null;if(material&&String(s.material)!==material)return null;if(m.grams!==null&&m.grams<min)return null;if(m.grams===null&&min>0)return null;if(color&&!String(s.colorName||'').toLowerCase().includes(color))return null;let score=0;if(material)score+=60;if(color)score+=25;if(m.source==='Measured')score+=8;if(hh.placementState==='Loaded')score+=12;if(printer&&hh.printerName===printer)score+=28;if(!reorderNeeded(s))score+=5;score+=Math.min(20,(m.grams||0)/100);return {...s,...hh,_m:m,_score:score};}).filter(Boolean).sort((a,b)=>b._score-a._score||(b._m.grams||0)-(a._m.grams||0)).slice(0,8);
    const el=document.getElementById('finderResultsV8');if(!el)return;el.innerHTML=ranked.length?ranked.map(s=>`<div class="v8-finder-row" data-loaded="${s.placementState==='Loaded'}"><div><strong><i class="v8-owner-dot" data-owner="${esc(s.owner)}"></i>${esc(s.id)} · ${esc(s.material)} · ${esc(s.colorName)}</strong><span>${esc(s.owner)} · ${esc(loadedLabel(s))}</span></div><div><span>Remaining</span><strong>${s._m.grams===null?'—':`${Math.round(s._m.grams)} g`}</strong></div><div><span>Source</span><strong>${esc(s._m.source)}</strong><div class="v8-score">match ${Math.round(s._score)}</div></div><button class="btn" data-v8-weigh="${esc(s.id)}" type="button">Weigh</button></div>`).join(''):'<div class="sync-empty">No active spool matches these requirements.</div>';
  }

  function renderHouseholdList() {
    const state=readState(),owner=document.getElementById('householdListOwnerV8')?.value||'',q=String(document.getElementById('householdSearchV8')?.value||'').trim().toLowerCase();
    const rows=state.spools.filter(s=>{const hh=normalizeHousehold(s),hay=[s.id,s.brand,s.material,s.colorName,s.location,hh.owner,hh.printerName,hh.feederName,hh.feederSlot].join(' ').toLowerCase();return(!owner||hh.owner===owner)&&(!q||hay.includes(q));}).sort((a,b)=>Number(Boolean(a.archivedAt))-Number(Boolean(b.archivedAt))||String(a.id).localeCompare(String(b.id),undefined,{numeric:true}));
    const el=document.getElementById('householdListV8');if(!el)return;el.innerHTML=rows.length?rows.map(s=>{const hh=normalizeHousehold(s),m=measurement(s);return `<div class="v8-row"><div><strong><i class="v8-owner-dot" data-owner="${esc(hh.owner)}"></i>${esc(s.id)} · ${esc(s.brand)} ${esc(s.material)}</strong><span>${esc(s.colorName)} · ${esc(loadedLabel({...s,...hh}))}${s.archivedAt?' · Archived':''}</span></div><div><span>Owner</span><strong>${esc(hh.owner)}</strong></div><div><span>Remaining</span><strong>${m.grams===null?'—':`${Math.round(m.grams)} g`}</strong></div><div class="v8-actions"><button class="btn" data-v8-manage-placement="${esc(s.id)}" type="button">Printer / AMS</button>${!s.archivedAt?`<button class="btn" data-v8-weigh="${esc(s.id)}" type="button">Weigh</button>`:''}</div></div>`;}).join(''):'<div class="sync-empty">No spools match this household filter.</div>';
  }

  function renderHousehold() { if(!document.getElementById('householdView'))return;renderHouseholdMetrics();renderLoadedBoard();renderOwnerReport();renderFinderOptions();renderFinder();renderHouseholdList();decorateInventory(); }

  function navigatePrinter(id='') {
    document.querySelector('.tab[data-view="printer"]')?.click();
    setTimeout(()=>{
      if (id) {
        const openLoad = globalThis.FilamentInventoryPrinterUI?.openLoad;
        if (typeof openLoad === 'function') {
          openLoad(id);
          return;
        }
      }
      const target=document.getElementById('printerView');
      target?.scrollIntoView?.({behavior:'smooth',block:'center'});
      target?.focus?.({preventScroll:true});
    },80);
  }

  function navigateWeigh(id) { document.querySelector('.tab[data-view="weigh"]')?.click();setTimeout(()=>{const select=document.getElementById('weighSpool');if(select){select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}));}document.getElementById('grossWeight')?.focus();},80); }
  function toast(message) { const el=document.getElementById('toast');if(!el)return;el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2800); }
  function download(name,content,type) { const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000); }
  function csvCell(value) { const s=String(value??'');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; }

  function exportHouseholdCsv() {
    const state=readState();
    const headers=['ID','Owner','Brand','Material','Color','Color Hex','Spool Type','Starting g','Visual %','Gross g','Tare g','Effective Remaining g','Effective %','Status','Reorder Needed','Reorder Threshold g','Physical State','Printer','AMS / Feeder','Slot / Bay','Loaded At','Location','Opened','Bagged','Last Dried Date','Purchase Source','Purchase Price','Purchase Date','Confidence','Archived','Notes','Created','Updated'];
    const rows=state.spools.map(s=>{const hh=normalizeHousehold(s),m=measurement(s);return [s.id,hh.owner,s.brand,s.material,s.colorName,s.colorHex,s.spoolType,s.startWeight,s.visualPercent??'',s.gross??'',s.tare??'',m.grams??'',m.percent??'',statusFor(m.percent),reorderNeeded(s)?'Yes':'No',s.reorderThreshold??250,hh.placementState,hh.printerName,hh.feederName,hh.feederSlot,hh.loadedAt||'',s.location,s.opened,s.bagged,s.lastDriedDate,s.purchaseSource,s.purchasePrice??'',s.purchaseDate,s.confidence,s.archivedAt?'Yes':'No',s.notes,s.createdAt||'',s.updatedAt||''];});
    download(`filament-inventory-${VERSION_LABEL}-${nowIso().slice(0,10)}.csv`,[headers,...rows].map(r=>r.map(csvCell).join(',')).join('\n'),'text/csv;charset=utf-8');
    toast(`Full ${VERSION_LABEL} inventory CSV exported.`);
  }

  function backupComplete() { const state=readState(),exportedAt=nowIso();state.meta={...(state.meta||{}),lastBackupAt:exportedAt};writeState(state);download(`filament-inventory-${VERSION_LABEL}-${exportedAt.slice(0,10)}.json`,JSON.stringify({...state,version:VERSION,appVersion:APP_VERSION,exportedAt},null,2),'application/json');toast(`Complete ${VERSION_LABEL} backup exported.`); }

  async function restoreComplete(file) {
    try { const parsed=JSON.parse(await file.text());if(!parsed||!Array.isArray(parsed.spools))throw new Error('Backup does not contain a spools array.');const incoming=spoolContract?.normalizeState?spoolContract.normalizeState(parsed,{owner:currentUser()}):null;if(!incoming||!Array.isArray(incoming.spools))throw new Error('Canonical inventory normalizer is unavailable. Refresh and try again.');const replace=confirm(`Restore ${incoming.spools.length} spools. OK = replace local inventory; Cancel = merge by spool ID.`);if(replace){if(!confirm('Replace the current local inventory and measurement history?'))return;writeState(incoming);}else{const current=readState(),mergeBackupStates=globalThis.FilamentInventoryStateMerge?.mergeBackupStates;if(!mergeBackupStates)throw new Error('Backup merge engine is unavailable. Refresh and try again.');const merged=mergeBackupStates(current,incoming);writeState(merged);}alert(`${VERSION_LABEL} backup restored. The app will reload.`);location.reload(); } catch(error){alert(`Restore failed: ${error.message}`);}
  }

  function decorateLabels() {
    const state=readState(),byId=new Map(state.spools.map(s=>[String(s.id),s]));
    document.querySelectorAll('#labelPreviewGrid .label-preview').forEach(card=>{const id=card.querySelector('strong')?.textContent?.trim(),s=byId.get(id);if(!s||card.querySelector('.v8-label-owner'))return;const hh=normalizeHousehold(s);const tag=document.createElement('div');tag.className='label-line v8-label-owner';tag.textContent=`Owner: ${hh.owner} · ${loadedLabel({...s,...hh})}`;card.querySelector('div')?.appendChild(tag);});
  }

  function bind() {
    document.getElementById('currentUserV8')?.addEventListener('change',e=>{setCurrentUser(e.target.value);toast(`New spools will default to ${e.target.value}.`);});
    document.getElementById('openPrinterV8')?.addEventListener('click',()=>navigatePrinter());
    ['findOwnerV8','findMaterialV8','findPrinterV8'].forEach(id=>document.getElementById(id)?.addEventListener('change',renderFinder));['findColorV8','findMinV8'].forEach(id=>document.getElementById(id)?.addEventListener('input',renderFinder));document.getElementById('householdListOwnerV8')?.addEventListener('change',renderHouseholdList);document.getElementById('householdSearchV8')?.addEventListener('input',renderHouseholdList);
    document.getElementById('exportHouseholdCsvV8')?.addEventListener('click',exportHouseholdCsv);document.getElementById('backupHouseholdV8')?.addEventListener('click',backupComplete);document.getElementById('restoreHouseholdV8')?.addEventListener('click',()=>document.getElementById('restoreHouseholdFileV8')?.click());document.getElementById('restoreHouseholdFileV8')?.addEventListener('change',e=>{const f=e.target.files?.[0];if(f)restoreComplete(f);e.target.value='';});
    document.addEventListener('click',event=>{const manage=event.target.closest('[data-v8-manage-placement]');if(manage){navigatePrinter(manage.dataset.v8ManagePlacement);return;}const weigh=event.target.closest('[data-v8-weigh]');if(weigh){navigateWeigh(weigh.dataset.v8Weigh);return;}const ownerList=event.target.closest('[data-v8-owner-list]');if(ownerList){const f=document.getElementById('householdListOwnerV8');if(f){f.value=ownerList.dataset.v8OwnerList;renderHouseholdList();document.getElementById('householdListV8')?.scrollIntoView({behavior:'smooth',block:'start'});}return;}if(event.target.closest('#clearFiltersBtn')){const f=document.getElementById('ownerFilterV8');if(f)f.value='';setTimeout(decorateInventory,0);}if(event.target.closest('#resetBtn')){return;}if(event.target.closest('.tab[data-view="household"]'))setTimeout(renderHousehold,0);if(event.target.closest('.tab[data-view="labels"]'))setTimeout(decorateLabels,120);},true);
    document.addEventListener('click',event=>{const target=event.target.closest('#exportTopBtn,#exportJsonBtn,#exportCsvBtn,#importJsonBtn');if(!target)return;event.preventDefault();event.stopImmediatePropagation();if(target.id==='exportTopBtn'||target.id==='exportJsonBtn')backupComplete();else if(target.id==='exportCsvBtn')exportHouseholdCsv();else if(target.id==='importJsonBtn')document.getElementById('restoreHouseholdFileV8')?.click();},true);
    const current=document.getElementById('currentUserV8');if(current)current.value=currentUser();
  }

  function init() { injectStyle();injectOwnerFilter();injectTabAndView();bind();watchInventory();renderHousehold();setTimeout(()=>{decorateInventory();decorateLabels();const params=new URLSearchParams(location.hash.slice(1));if(params.get('view')==='household')document.querySelector('.tab[data-view="household"]')?.click();},120); }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();