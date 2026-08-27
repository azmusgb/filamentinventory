(() => {
  'use strict';

  const core = globalThis.FilamentInventoryPrinter;
  if (!core) return;

  const STORAGE_KEY = 'filament-inventory-v1';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text = value => String(value || '').trim();
  const parse = (value, fallback = null) => { try { return JSON.parse(value); } catch { return fallback; } };
  const nowIso = () => new Date().toISOString();
  const currentUser = () => globalThis.FilamentInventoryUsers?.currentUser?.() || 'Bill';
  let storageBound = false;
  let viewObserver = null;

  function readState() {
    const state = parse(localStorage.getItem(STORAGE_KEY) || '{}', {});
    return Array.isArray(state?.spools) ? state : {version:10, spools:[], weighLog:[], auditLog:[], meta:{}};
  }

  function writeState(state) {
    state.savedAt = nowIso();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function toast(message) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2600);
  }

  function injectStyles() {
    if (document.getElementById('printerCommandStyles')) return;
    const style = document.createElement('style');
    style.id = 'printerCommandStyles';
    style.textContent = `
      .printer-command{display:grid;gap:16px}.printer-hero{padding:20px;display:flex;align-items:flex-start;justify-content:space-between;gap:18px}.printer-hero h2{margin:6px 0 4px;font-size:clamp(26px,4vw,38px);letter-spacing:-.045em}.printer-hero p{max-width:740px;line-height:1.55}.printer-private-chip{display:inline-flex;align-items:center;gap:7px;min-height:38px;padding:8px 11px;border:1px solid var(--line);border-radius:999px;background:rgba(3,10,18,.26);font-size:11px;font-weight:800;white-space:nowrap}.printer-private-chip:before{content:'';width:8px;height:8px;border-radius:50%;background:#38bdf8}body[data-inventory-user="Aimee"] .printer-private-chip:before{background:#c084fc}
      .printer-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.printer-metric{padding:14px 15px;border:1px solid var(--line);border-radius:15px;background:rgba(3,10,18,.28)}.printer-metric span{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.07em}.printer-metric strong{display:block;margin-top:5px;font-size:23px}.printer-metric small{display:block;margin-top:3px;color:var(--muted);font-size:10px;line-height:1.35}
      .printer-layout{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(320px,.8fr);gap:16px}.printer-panel{padding:18px}.printer-panel .panel-head{margin-bottom:13px}.printer-board{display:grid;gap:12px}.printer-machine{border:1px solid var(--line);border-radius:17px;background:rgba(3,10,18,.22);overflow:hidden}.printer-machine-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 13px;border-bottom:1px solid var(--line)}.printer-machine-head strong{font-size:13px}.printer-machine-head span{font-size:10px;color:var(--muted)}.printer-slots{display:grid;gap:8px;padding:10px}.printer-slot{display:grid;grid-template-columns:minmax(76px,.55fr) minmax(0,1.7fr) auto;gap:10px;align-items:center;padding:11px 12px;border:1px solid var(--line);border-radius:13px;background:rgba(3,10,18,.24)}.printer-slot[data-low="true"]{border-color:rgba(245,158,11,.45)}.printer-slot[data-unknown="true"]{border-style:dashed}.printer-slot-label{font-size:10px;color:var(--muted);line-height:1.4}.printer-slot-main{min-width:0}.printer-slot-main strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.printer-slot-main span{display:block;margin-top:3px;color:var(--muted);font-size:10px}.printer-slot-actions{display:flex;gap:6px}.printer-slot-actions .btn{min-height:34px;padding:6px 9px;font-size:10px}
      .printer-empty{padding:26px 18px;border:1px dashed var(--line);border-radius:15px;text-align:center;color:var(--muted);font-size:12px;line-height:1.55}.printer-empty strong{display:block;margin-bottom:5px;color:var(--text);font-size:14px}.printer-form{display:grid;grid-template-columns:1fr 1fr;gap:10px}.printer-form .full{grid-column:1/-1}.printer-form label{font-size:10px}.printer-form-actions{display:grid;grid-template-columns:1.2fr .8fr;gap:9px;margin-top:12px}.printer-context{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:14px;padding-top:14px;border-top:1px solid var(--line)}.printer-candidates{display:grid;gap:7px;margin-top:10px}.printer-candidate{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px 10px;border:1px solid var(--line);border-radius:12px;background:rgba(3,10,18,.2)}.printer-candidate strong{display:block;font-size:11px}.printer-candidate span{display:block;margin-top:2px;color:var(--muted);font-size:9px}.printer-candidate .btn{min-height:32px;padding:5px 8px;font-size:10px}
      .printer-attention{display:grid;gap:8px}.printer-attention-row{display:grid;grid-template-columns:10px minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 11px;border:1px solid var(--line);border-radius:12px;background:rgba(3,10,18,.2)}.printer-attention-dot{width:9px;height:9px;border-radius:50%;background:#f59e0b}.printer-attention-row[data-kind="unknown"] .printer-attention-dot{background:#64748b}.printer-attention-row[data-kind="conflict"] .printer-attention-dot{background:#ef4444}.printer-attention-row strong{display:block;font-size:11px}.printer-attention-row span{display:block;margin-top:2px;color:var(--muted);font-size:9px}.printer-attention-row .btn{min-height:32px;padding:5px 8px;font-size:10px}
      @media(max-width:900px){.printer-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.printer-layout{grid-template-columns:1fr}.printer-hero{flex-direction:column}.printer-private-chip{align-self:flex-start}}
      @media(max-width:600px){.printer-command{gap:12px}.printer-hero,.printer-panel{padding:15px}.printer-metrics{grid-template-columns:1fr 1fr}.printer-slot{grid-template-columns:1fr}.printer-slot-actions{display:grid;grid-template-columns:1fr 1fr}.printer-slot-actions .btn{width:100%}.printer-form{grid-template-columns:1fr}.printer-form .full{grid-column:auto}.printer-form-actions{grid-template-columns:1fr}.printer-context{grid-template-columns:1fr}.printer-candidate{grid-template-columns:1fr}.printer-candidate .btn{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function markup() {
    return `<div class="printer-command">
      <section class="panel printer-hero"><div><span class="eyebrow">Printer / AMS command center</span><h2 id="householdTitle">What is loaded, where, and what needs attention.</h2><p class="muted">Manage the active private inventory's physical printer and AMS assignments without opening the full spool editor.</p></div><div class="printer-private-chip" id="printerPrivateChip"></div></section>
      <div class="printer-metrics" id="printerMetrics"></div>
      <div class="printer-layout">
        <section class="panel printer-panel"><div class="panel-head"><div><h3>Loaded now</h3><p>Current printer, feeder and slot occupancy.</p></div><button class="btn" id="printerScanBtn" type="button">Scan spool</button></div><div class="printer-board" id="printerBoard"></div></section>
        <section class="panel printer-panel"><div class="panel-head"><div><h3>Quick load / move</h3><p>Choose a spool and destination. Occupied slots are handled explicitly.</p></div></div><div class="printer-form"><div class="form-field full"><label for="moveSpoolV8">Spool</label><select class="select" id="moveSpoolV8"></select></div><div class="form-field"><label for="movePrinterV8">Printer</label><input class="field" id="movePrinterV8" list="printerCommandNames" placeholder="Bambu P1S"/></div><div class="form-field"><label for="moveFeederV8">AMS / feeder</label><input class="field" id="moveFeederV8" list="printerFeederNames" placeholder="AMS 1"/></div><div class="form-field"><label for="moveSlotV8">Slot / bay</label><input class="field" id="moveSlotV8" maxlength="24" placeholder="1"/></div></div><datalist id="printerCommandNames"></datalist><datalist id="printerFeederNames"></datalist><div class="printer-form-actions"><button class="btn btn-primary" id="printerLoadBtn" type="button">Load / move spool</button><button class="btn" id="printerUnloadBtn" type="button">Unload to storage</button></div><div class="printer-context"><div class="form-field"><label for="printerFindMaterial">Material</label><input class="field" id="printerFindMaterial" placeholder="PLA"/></div><div class="form-field"><label for="printerFindColor">Color contains</label><input class="field" id="printerFindColor" placeholder="Black"/></div></div><div class="printer-candidates" id="printerCandidates"></div></section>
      </div>
      <div class="printer-layout">
        <section class="panel printer-panel"><div class="panel-head"><div><h3>Needs attention</h3><p>Loaded spools that are low, unmeasured, or assigned inconsistently.</p></div></div><div class="printer-attention" id="printerAttention"></div></section>
        <section class="panel printer-panel"><div class="panel-head"><div><h3>Fast workflow</h3><p>Pick up a spool, scan it, then load, weigh, edit, or move it from one place.</p></div></div><div class="printer-empty"><strong>Physical inventory loop</strong>Scan QR → choose Printer / AMS → select destination → load. Placement changes are written to the same private inventory, activity ledger, backups, and sync.</div></section>
      </div>
    </div>`;
  }

  function installView() {
    const view = document.getElementById('householdView');
    if (!view) return false;
    if (view.dataset.printerCommand === '1') return true;
    view.dataset.printerCommand = '1';
    view.setAttribute('aria-labelledby', 'householdTitle');
    view.innerHTML = markup();
    const tab = document.querySelector('.tab[data-view="household"]');
    if (tab) tab.textContent = 'Printer / AMS';
    bindView();
    render();
    return true;
  }

  function ensureView() {
    if (installView() || viewObserver) return;
    viewObserver = new MutationObserver(() => {
      if (installView()) { viewObserver.disconnect(); viewObserver = null; }
    });
    viewObserver.observe(document.body, {childList:true, subtree:true});
  }

  function activeRows(state = readState()) {
    return core.activeSpools(state).slice().sort((a,b) => String(a.id).localeCompare(String(b.id), undefined, {numeric:true}));
  }

  function renderMetrics(state, summary) {
    const node = document.getElementById('printerMetrics');
    if (!node) return;
    const attention = summary.lowLoaded.length + summary.unknownLoaded.length + summary.conflicts.length;
    const values = [
      ['Loaded', summary.loaded, `${summary.active} active spools`],
      ['Printers', summary.printers, 'with assigned filament'],
      ['Loaded filament', `${(summary.knownLoadedGrams/1000).toFixed(2)} kg`, 'known remaining'],
      ['Low loaded', summary.lowLoaded.length, 'at/below threshold'],
      ['Attention', attention, 'low · unknown · conflict'],
    ];
    node.innerHTML = values.map(([label,value,note]) => `<div class="printer-metric"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`).join('');
  }

  function slotLabel(spool) {
    return [text(spool.feederName) || 'Feeder', text(spool.feederSlot) ? `Slot ${text(spool.feederSlot)}` : 'No slot'].join(' · ');
  }

  function renderBoard(state) {
    const node = document.getElementById('printerBoard');
    if (!node) return;
    const groups = core.printerGroups(state);
    if (!groups.length) {
      node.innerHTML = '<div class="printer-empty"><strong>Nothing is loaded yet.</strong>Choose a spool in Quick load / move or scan a physical label and select Printer / AMS.</div>';
      return;
    }
    node.innerHTML = groups.map(group => `<article class="printer-machine"><div class="printer-machine-head"><strong>${esc(group.printer)}</strong><span>${group.rows.length} loaded</span></div><div class="printer-slots">${group.rows.map(spool => {
      const m = core.measurement(spool);
      const low = m.grams !== null && m.grams <= Number(spool.reorderThreshold ?? 250);
      return `<div class="printer-slot" data-low="${low}" data-unknown="${m.grams === null}"><div class="printer-slot-label">${esc(slotLabel(spool))}</div><div class="printer-slot-main"><strong>${esc(spool.id)} · ${esc(spool.material || 'Unknown')} · ${esc(spool.colorName || 'Unknown')}</strong><span>${m.grams === null ? 'Remaining unknown' : `${Math.round(m.grams)} g remaining · ${Math.round(m.percent)}%`}${low ? ' · Low' : ''}</span></div><div class="printer-slot-actions"><button class="btn" type="button" data-printer-weigh="${esc(spool.id)}">Weigh</button><button class="btn" type="button" data-printer-unload="${esc(spool.id)}">Unload</button></div></div>`;
    }).join('')}</div></article>`).join('');
  }

  function renderForm(state) {
    const rows = activeRows(state);
    const select = document.getElementById('moveSpoolV8');
    const selected = select?.value;
    if (select) {
      select.innerHTML = rows.map(spool => {
        const m = core.measurement(spool);
        const remain = m.grams === null ? 'unknown' : `${Math.round(m.grams)} g`;
        return `<option value="${esc(spool.id)}">${esc(spool.id)} — ${esc(spool.brand || 'Unknown')} ${esc(spool.material || '')} — ${esc(spool.colorName || '')} — ${esc(remain)}</option>`;
      }).join('');
      if ([...select.options].some(option => option.value === selected)) select.value = selected;
    }
    const printers = [...new Set(rows.map(spool => text(spool.printerName)).filter(Boolean))].sort();
    const feeders = [...new Set(rows.map(spool => text(spool.feederName)).filter(Boolean))].sort();
    const p = document.getElementById('printerCommandNames');
    const f = document.getElementById('printerFeederNames');
    if (p) p.innerHTML = printers.map(value => `<option value="${esc(value)}"></option>`).join('');
    if (f) f.innerHTML = feeders.map(value => `<option value="${esc(value)}"></option>`).join('');
    populateSelectedPlacement(state);
  }

  function populateSelectedPlacement(state = readState()) {
    const id = document.getElementById('moveSpoolV8')?.value;
    const spool = state.spools.find(row => String(row.id) === String(id));
    if (!spool) return;
    const printer = document.getElementById('movePrinterV8');
    const feeder = document.getElementById('moveFeederV8');
    const slot = document.getElementById('moveSlotV8');
    if (printer) printer.value = text(spool.printerName);
    if (feeder) feeder.value = text(spool.feederName);
    if (slot) slot.value = text(spool.feederSlot);
  }

  function renderCandidates(state) {
    const node = document.getElementById('printerCandidates');
    if (!node) return;
    const material = document.getElementById('printerFindMaterial')?.value || '';
    const color = document.getElementById('printerFindColor')?.value || '';
    const rows = core.rankedCandidates(state, {material,color}).slice(0,4);
    node.innerHTML = rows.length ? rows.map(({spool,measurement}) => `<div class="printer-candidate"><div><strong>${esc(spool.id)} · ${esc(spool.material || 'Unknown')} · ${esc(spool.colorName || 'Unknown')}</strong><span>${measurement.grams === null ? 'Remaining unknown' : `${Math.round(measurement.grams)} g remaining`} · ${spool.placementState === 'Loaded' ? 'Already loaded' : 'Stored'}</span></div><button class="btn" type="button" data-printer-use="${esc(spool.id)}">Use</button></div>`).join('') : '<div class="printer-empty">No active spools available.</div>';
  }

  function renderAttention(state, summary) {
    const node = document.getElementById('printerAttention');
    if (!node) return;
    const rows = [];
    summary.conflicts.forEach(group => rows.push({kind:'conflict', id:group[0]?.id, title:'Duplicate slot assignment', detail:group.map(row => row.id).join(', ')}));
    summary.lowLoaded.forEach(spool => { const m=core.measurement(spool); rows.push({kind:'low',id:spool.id,title:`${spool.id} is low`,detail:`${Math.round(m.grams)} g remaining · ${slotLabel(spool)}`}); });
    summary.unknownLoaded.forEach(spool => rows.push({kind:'unknown',id:spool.id,title:`${spool.id} needs a measurement`,detail:slotLabel(spool)}));
    node.innerHTML = rows.length ? rows.map(row => `<div class="printer-attention-row" data-kind="${esc(row.kind)}"><span class="printer-attention-dot"></span><div><strong>${esc(row.title)}</strong><span>${esc(row.detail)}</span></div><button class="btn" type="button" data-printer-${row.kind === 'conflict' ? 'select' : 'weigh'}="${esc(row.id)}">${row.kind === 'conflict' ? 'Review' : 'Weigh'}</button></div>`).join('') : '<div class="printer-empty"><strong>No placement issues.</strong>Loaded spools are measured, above reorder thresholds, and have no duplicate slot assignments.</div>';
  }

  function render() {
    if (!document.getElementById('householdView')?.dataset.printerCommand) return;
    const state = readState();
    const summary = core.summary(state);
    const chip = document.getElementById('printerPrivateChip');
    if (chip) chip.textContent = `${currentUser()}'s private inventory`;
    renderMetrics(state, summary);
    renderBoard(state);
    renderForm(state);
    renderCandidates(state);
    renderAttention(state, summary);
  }

  function setPlacement(id, placement) {
    const state = readState();
    const spool = state.spools.find(row => String(row.id) === String(id));
    if (!spool) return false;
    Object.assign(spool, placement, {updatedAt:nowIso()});
    writeState(state);
    return true;
  }

  function loadSelected() {
    const id = document.getElementById('moveSpoolV8')?.value;
    if (!id) return;
    const state = readState();
    const spool = state.spools.find(row => String(row.id) === String(id));
    if (!spool) return;
    const placement = {
      placementState:'Loaded',
      printerName:text(document.getElementById('movePrinterV8')?.value),
      feederName:text(document.getElementById('moveFeederV8')?.value),
      feederSlot:text(document.getElementById('moveSlotV8')?.value),
      loadedAt:spool.loadedAt || nowIso(),
    };
    if (!placement.printerName) return void toast('Choose or enter a printer first.');
    const wantedKey = core.slotKey(placement);
    const conflict = state.spools.find(row => !row.archivedAt && String(row.id) !== String(id) && core.slotKey(row) === wantedKey && wantedKey !== '||');
    if (conflict) {
      const label = [placement.printerName, placement.feederName, placement.feederSlot ? `Slot ${placement.feederSlot}` : ''].filter(Boolean).join(' · ');
      if (!confirm(`${conflict.id} currently occupies ${label}. Unload ${conflict.id} and load ${id} there instead?`)) return;
      Object.assign(conflict, {placementState:'Stored',printerName:'',feederName:'',feederSlot:'',loadedAt:null,updatedAt:nowIso()});
    }
    Object.assign(spool, placement, {updatedAt:nowIso()});
    writeState(state);
    render();
    toast(`${id} loaded on ${placement.printerName}.`);
  }

  function unload(id) {
    if (!id) return;
    if (!setPlacement(id,{placementState:'Stored',printerName:'',feederName:'',feederSlot:'',loadedAt:null})) return;
    render();
    toast(`${id} unloaded to storage.`);
  }

  function navigateWeigh(id) {
    document.querySelector('.tab[data-view="weigh"]')?.click();
    setTimeout(() => {
      const select = document.getElementById('weighSpool');
      if (select) { select.value = id; select.dispatchEvent(new Event('change',{bubbles:true})); }
      document.getElementById('grossWeight')?.focus();
    }, 80);
  }

  function selectSpool(id) {
    const select = document.getElementById('moveSpoolV8');
    if (!select) return;
    const option = [...select.options].find(row => String(row.value).toLowerCase() === String(id).toLowerCase());
    if (option) {
      select.value = option.value;
      select.dispatchEvent(new Event('change',{bubbles:true}));
      select.scrollIntoView({behavior:'smooth',block:'center'});
    }
  }

  function bindView() {
    document.getElementById('moveSpoolV8')?.addEventListener('change', () => populateSelectedPlacement());
    document.getElementById('printerLoadBtn')?.addEventListener('click', loadSelected);
    document.getElementById('printerUnloadBtn')?.addEventListener('click', () => unload(document.getElementById('moveSpoolV8')?.value));
    document.getElementById('printerScanBtn')?.addEventListener('click', () => document.getElementById('qrScanLaunch')?.click());
    ['printerFindMaterial','printerFindColor'].forEach(id => document.getElementById(id)?.addEventListener('input', () => renderCandidates(readState())));
    document.getElementById('householdView')?.addEventListener('click', event => {
      const unloadBtn = event.target.closest('[data-printer-unload]');
      if (unloadBtn) return unload(unloadBtn.dataset.printerUnload);
      const weighBtn = event.target.closest('[data-printer-weigh]');
      if (weighBtn) return navigateWeigh(weighBtn.dataset.printerWeigh);
      const useBtn = event.target.closest('[data-printer-use]');
      if (useBtn) return selectSpool(useBtn.dataset.printerUse);
      const selectBtn = event.target.closest('[data-printer-select]');
      if (selectBtn) return selectSpool(selectBtn.dataset.printerSelect);
    });
  }

  function bindGlobal() {
    if (storageBound) return;
    storageBound = true;
    window.addEventListener('storage', event => { if (event.key === STORAGE_KEY) render(); });
    document.addEventListener('click', event => {
      if (event.target.closest('.tab[data-view="household"]')) setTimeout(render, 30);
    }, true);
    const priorSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      const result = priorSetItem.call(this, key, value);
      if (this === localStorage && key === STORAGE_KEY) queueMicrotask(render);
      return result;
    };
  }

  function init() {
    injectStyles();
    ensureView();
    bindGlobal();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0), {once:true});
  else setTimeout(init, 0);
})();
