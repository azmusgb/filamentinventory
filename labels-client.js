(() => {
  'use strict';

  const STORAGE_KEY = 'filament-inventory-v1';
  const incomingUrl = new URL(location.href);
  const pendingSpoolId = incomingUrl.searchParams.get('spool');
  const pendingScan = incomingUrl.searchParams.get('scan') === '1';
  const selected = new Set();
  let labelSize = '2x1';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const validNum = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
  const toast = message => {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2800);
  };

  function readState() {
    try {
      const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return state && Array.isArray(state.spools) ? state : {spools:[], weighLog:[]};
    } catch {
      return {spools:[], weighLog:[]};
    }
  }

  function measurement(spool) {
    const start = validNum(spool?.startWeight) && Number(spool.startWeight) > 0 ? Number(spool.startWeight) : 1000;
    if (validNum(spool?.gross) && validNum(spool?.tare) && Number(spool.gross) >= Number(spool.tare)) {
      const grams = Math.min(start, Math.max(0, Number(spool.gross) - Number(spool.tare)));
      return {grams, percent:Math.round((grams / start) * 1000) / 10, source:'Measured'};
    }
    if (validNum(spool?.visualPercent)) {
      const percent = Math.max(0, Math.min(100, Number(spool.visualPercent)));
      return {grams:Math.round(start * percent / 100), percent, source:'Visual'};
    }
    return {grams:null, percent:null, source:'Unknown'};
  }

  const allSpools = () => readState().spools.filter(spool => String(spool?.id || '').trim());
  const activeSpools = () => allSpools().filter(spool => !spool.archivedAt);

  function linkFor(id) {
    const url = new URL(location.origin + '/');
    const profile = globalThis.FilamentInventoryUsers?.currentUser?.() || 'Bill';
    url.searchParams.set('spool', id);
    url.searchParams.set('scan', '1');
    url.hash = new URLSearchParams({'filament-user':profile}).toString();
    return url.toString();
  }

  function labelMarkup(spool, preview = true) {
    const m = measurement(spool);
    const remain = m.grams === null ? 'Remaining unknown' : `${Math.round(m.grams)} g · ${Math.round(m.percent)}%`;
    const details = [spool.brand || 'Unknown', spool.material || 'Unknown', spool.colorName || 'Unknown'].join(' · ');
    const profile = globalThis.FilamentInventoryUsers?.currentUser?.() || 'Bill';
    const qr = `/qr?spool=${encodeURIComponent(spool.id)}&profile=${encodeURIComponent(profile)}`;
    if (preview) {
      return `<article class="label-preview"><img alt="QR for ${esc(spool.id)}" loading="lazy" src="${qr}"><div><strong>${esc(spool.id)}</strong><div class="label-line">${esc(details)}</div><div class="label-line label-remaining">${esc(remain)}</div><div class="label-line">${esc(spool.location || 'Location not set')}</div></div></article>`;
    }
    return `<article class="physical-print-label"><img alt="" src="${qr}"><div><strong>${esc(spool.id)}</strong><span>${esc(spool.brand || 'Unknown')} · ${esc(spool.material || 'Unknown')}</span><span>${esc(spool.colorName || 'Unknown')}</span><span>${esc(remain)}${spool.location ? ` · ${esc(spool.location)}` : ''}</span><small>Scan to open spool controls</small></div></article>`;
  }

  function selectionRows() {
    const byId = new Map(allSpools().map(spool => [String(spool.id),spool]));
    return [...selected].map(id => byId.get(String(id))).filter(Boolean);
  }

  function updateSelectionState() {
    const count = document.getElementById('labelSelectionCount');
    const print = document.getElementById('printLabelsBtn');
    if (count) count.textContent = `${selected.size} selected`;
    if (print) {
      print.disabled = selected.size === 0;
      print.textContent = selected.size > 0 ? `Print ${selected.size} label${selected.size === 1 ? '' : 's'}` : 'Print labels';
    }
  }

  function renderPicker() {
    const list = document.getElementById('spoolPickList');
    if (!list) return;
    const q = String(document.getElementById('labelSearch')?.value || '').trim().toLowerCase();
    const rows = allSpools().filter(spool => !q || [spool.id,spool.brand,spool.material,spool.colorName,spool.location].some(value => String(value || '').toLowerCase().includes(q)));
    list.innerHTML = rows.length ? rows.map(spool => {
      const m = measurement(spool);
      const status = spool.archivedAt ? 'Archived' : (m.grams === null ? 'Unknown remaining' : `${Math.round(m.grams)} g`);
      const swatch = /^#[0-9a-f]{6}$/i.test(spool.colorHex || '') ? spool.colorHex : '#64748b';
      return `<label class="spool-pick"><input type="checkbox" data-label-id="${esc(spool.id)}" ${selected.has(spool.id) ? 'checked' : ''}><i class="swatch" style="background:${swatch}"></i><span class="spool-pick-copy"><strong>${esc(spool.id)} · ${esc(spool.colorName || 'Unknown')}</strong><small>${esc(spool.brand || 'Unknown')} · ${esc(spool.material || 'Unknown')} · ${esc(spool.location || 'No location')}</small></span><span class="spool-pick-status">${esc(status)}</span></label>`;
    }).join('') : '<div class="sync-empty">No spools match this search.</div>';
    updateSelectionState();
    renderPreview();
  }

  function renderPreview() {
    const grid = document.getElementById('labelPreviewGrid');
    if (!grid) return;
    const rows = selectionRows();
    grid.innerHTML = rows.length ? rows.map(spool => labelMarkup(spool,true)).join('') : '<div class="label-preview-empty"><strong>No labels selected yet.</strong><span>Select one or more physical spools on the left to build the print sheet.</span></div>';
  }

  function selectActive() {
    selected.clear();
    activeSpools().forEach(spool => selected.add(spool.id));
    renderPicker();
  }

  function clearSelection() {
    selected.clear();
    renderPicker();
  }

  function buildPrintSheet() {
    const root = document.getElementById('physicalPrintRoot');
    const rows = selectionRows();
    if (!rows.length || !root) return false;
    const dimensions = {'2x1':['2in','1in'],'2.25x1.25':['2.25in','1.25in'],'1.5-square':['1.5in','1.5in']}[labelSize] || ['2in','1in'];
    root.style.setProperty('--label-w',dimensions[0]);
    root.style.setProperty('--label-h',dimensions[1]);
    root.innerHTML = rows.map(spool => labelMarkup(spool,false)).join('');
    return true;
  }

  function printLabels() {
    if (!buildPrintSheet()) { toast('Select at least one spool first.'); return; }
    document.body.classList.add('print-labels');
    setTimeout(() => window.print(),80);
  }

  function cleanupPrintMode() { document.body.classList.remove('print-labels'); }

  function navigate(view) {
    if (!globalThis.FilamentInventoryNavigation?.navigate?.(view,{historyMode:'replace',focus:true})) document.querySelector(`.tab[data-view="${CSS.escape(view)}"]`)?.click();
  }

  function showScanDialog(id) {
    const dialog = document.getElementById('scanSpoolDialog');
    const body = document.getElementById('scanSpoolBody');
    const spool = allSpools().find(row => String(row.id).toLowerCase() === String(id || '').toLowerCase());
    if (!dialog || !body) return;
    dialog.dataset.spoolId = id || '';
    if (!spool) {
      body.innerHTML = `<div class="scan-summary"><i class="scan-swatch"></i><div><strong>${esc(id || 'Unknown spool')}</strong><span>This valid spool ID is not in this private inventory on this device.</span></div></div>`;
      document.getElementById('scanWeighBtn').hidden = true;
      document.getElementById('scanInventoryBtn').textContent = 'Sync devices';
      dialog.showModal();
      return;
    }
    const m = measurement(spool);
    const remain = m.grams === null ? 'Remaining amount unknown' : `${Math.round(m.grams)} g remaining · ${Math.round(m.percent)}% · ${m.source}`;
    const swatch = /^#[0-9a-f]{6}$/i.test(spool.colorHex || '') ? spool.colorHex : '#64748b';
    body.innerHTML = `<div class="scan-summary"><i class="scan-swatch" style="background:${swatch}"></i><div><strong>${esc(spool.id)}</strong><span>${esc(spool.brand || 'Unknown')} · ${esc(spool.material || 'Unknown')} · ${esc(spool.colorName || 'Unknown')}</span><span>${esc(remain)}</span><span>${esc(spool.location || 'Location not set')}${spool.archivedAt ? ' · Archived' : ''}</span></div></div>`;
    document.getElementById('scanWeighBtn').hidden = Boolean(spool.archivedAt);
    document.getElementById('scanInventoryBtn').textContent = 'Find in inventory';
    dialog.showModal();
  }

  function navigateWeigh(id) {
    navigate('weigh');
    setTimeout(() => {
      const select = document.getElementById('weighSpool');
      const option = [...(select?.options || [])].find(row => String(row.value).toLowerCase() === String(id).toLowerCase());
      if (select && option) { select.value = option.value; select.dispatchEvent(new Event('change',{bubbles:true})); }
      document.getElementById('grossWeight')?.focus();
    },80);
  }

  function navigateInventory(id) {
    const exists = allSpools().some(spool => String(spool.id).toLowerCase() === String(id || '').toLowerCase());
    if (!exists) { navigate('sync'); return; }
    navigate('inventory');
    setTimeout(() => {
      const lifecycle = document.getElementById('lifecycleFilter');
      const search = document.getElementById('searchInput');
      if (lifecycle) { lifecycle.value='all'; lifecycle.dispatchEvent(new Event('change',{bubbles:true})); }
      if (search) { search.value=id; search.dispatchEvent(new Event('input',{bubbles:true})); }
    },80);
  }

  async function copySpoolLink(id) {
    const link = linkFor(id);
    try { await navigator.clipboard.writeText(link); toast('Spool link copied.'); }
    catch { toast('Clipboard access is unavailable on this browser.'); }
  }

  function markup() {
    return `<div class="labels-workflow"><section class="panel labels-card labels-select-card"><div class="labels-step-head"><span class="labels-step-number">1</span><div><span class="eyebrow">Select spools</span><h3>Choose what to label</h3><p>Search the physical inventory, then select only the labels you need.</p></div></div><div class="label-controls"><div class="search-wrap"><label class="sr-only" for="labelSearch">Search spools</label><input class="field" id="labelSearch" type="search" placeholder="Search ID, brand, material, color, location…"></div><select class="select" id="labelSize" aria-label="Label size"><option value="2x1">2 × 1 in</option><option value="2.25x1.25">2.25 × 1.25 in</option><option value="1.5-square">1.5 × 1.5 in</option></select></div><div class="label-actions"><button class="btn" id="selectActiveLabelsBtn" type="button">Select active</button><button class="btn" id="clearLabelsBtn" type="button">Clear</button><span class="label-selection-count" id="labelSelectionCount">0 selected</span></div><div class="spool-pick-list" id="spoolPickList"></div></section><section class="panel labels-card labels-preview-card"><div class="labels-step-head"><span class="labels-step-number">2</span><div><span class="eyebrow">Preview & print</span><h3>Check the label sheet</h3><p>QR labels contain the app address, spool ID and private profile name—not the private sync key.</p></div></div><div class="label-preview-grid" id="labelPreviewGrid"></div><div class="labels-print-bar"><span>For reliable QR scanning, print at 100% scale.</span><button class="btn btn-primary" id="printLabelsBtn" type="button" disabled>Print selected</button></div></section></div>`;
  }

  function injectUi() {
    const tabs = document.querySelector('.tabs');
    const dataTab = tabs?.querySelector('[data-view="data"]');
    if (tabs && dataTab && !tabs.querySelector('[data-view="labels"]')) {
      const button = document.createElement('button');
      button.className='tab';
      button.dataset.view='labels';
      button.setAttribute('aria-selected','false');
      button.textContent='Labels';
      tabs.insertBefore(button,dataTab);
    }
    const dataView = document.getElementById('dataView');
    if (dataView && !document.getElementById('labelsView')) {
      const section = document.createElement('section');
      section.className='view';
      section.id='labelsView';
      section.setAttribute('aria-label','QR labels');
      section.innerHTML=markup();
      dataView.parentNode.insertBefore(section,dataView);
    }
    if (!document.getElementById('scanSpoolDialog')) {
      const dialog = document.createElement('dialog');
      dialog.id='scanSpoolDialog';
      dialog.innerHTML=`<div class="dialog-head"><div><span class="eyebrow">Physical spool</span><h3>Spool scan</h3></div><button class="btn icon-btn" id="scanCloseBtn" type="button" aria-label="Close">×</button></div><div class="dialog-body"><div id="scanSpoolBody"></div><div class="scan-actions"><button class="btn btn-primary" id="scanWeighBtn" type="button">Weigh now</button><button class="btn" id="scanInventoryBtn" type="button">Find in inventory</button><button class="btn" id="scanCopyLinkBtn" type="button">Copy spool link</button><button class="btn" id="scanDoneBtn" type="button">Done</button></div></div>`;
      document.body.appendChild(dialog);
    }
    if (!document.getElementById('physicalPrintRoot')) {
      const root=document.createElement('div');
      root.id='physicalPrintRoot';
      root.setAttribute('aria-hidden','true');
      document.body.appendChild(root);
    }
  }

  function bind() {
    document.getElementById('labelSearch')?.addEventListener('input',renderPicker);
    document.getElementById('labelSize')?.addEventListener('change',event => { labelSize=event.target.value; });
    document.getElementById('selectActiveLabelsBtn')?.addEventListener('click',selectActive);
    document.getElementById('clearLabelsBtn')?.addEventListener('click',clearSelection);
    document.getElementById('printLabelsBtn')?.addEventListener('click',printLabels);
    document.getElementById('spoolPickList')?.addEventListener('change',event => {
      const input=event.target.closest('[data-label-id]');
      if (!input) return;
      if (input.checked) selected.add(input.dataset.labelId); else selected.delete(input.dataset.labelId);
      updateSelectionState();
      renderPreview();
    });
    window.addEventListener('afterprint',cleanupPrintMode);
    document.getElementById('scanCloseBtn')?.addEventListener('click',() => document.getElementById('scanSpoolDialog')?.close());
    document.getElementById('scanDoneBtn')?.addEventListener('click',() => document.getElementById('scanSpoolDialog')?.close());
    document.getElementById('scanWeighBtn')?.addEventListener('click',() => { const dialog=document.getElementById('scanSpoolDialog'); const id=dialog?.dataset.spoolId; dialog?.close(); if(id) navigateWeigh(id); });
    document.getElementById('scanInventoryBtn')?.addEventListener('click',() => { const dialog=document.getElementById('scanSpoolDialog'); const id=dialog?.dataset.spoolId; dialog?.close(); if(id) navigateInventory(id); });
    document.getElementById('scanCopyLinkBtn')?.addEventListener('click',() => { const id=document.getElementById('scanSpoolDialog')?.dataset.spoolId; if(id) copySpoolLink(id); });
  }

  function scheduleIncomingScanFallback() {
    if (!pendingSpoolId || !pendingScan) return;
    setTimeout(() => {
      const current=new URL(location.href);
      if (current.searchParams.get('scan') !== '1') return;
      if (globalThis.FilamentInventorySpoolActions?.openIncomingScan?.()) return;
      current.searchParams.delete('scan');
      history.replaceState(null,'',current.pathname + current.search + current.hash);
      showScanDialog(pendingSpoolId);
    },650);
  }

  function init() {
    injectUi();
    bind();
    renderPicker();
    scheduleIncomingScanFallback();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();