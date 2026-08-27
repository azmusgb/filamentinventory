(() => {
  'use strict';

  const STORAGE_KEY = 'filament-inventory-v1';
  const pendingSpoolId = new URL(location.href).searchParams.get('spool');
  const pendingScan = new URL(location.href).searchParams.get('scan') === '1';
  const selected = new Set();
  let labelSize = '2x1';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const validNum = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));

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

  function activeSpools() {
    return readState().spools.filter(s => !s?.archivedAt && String(s?.id || '').trim());
  }

  function allSpools() {
    return readState().spools.filter(s => String(s?.id || '').trim());
  }

  function linkFor(id) {
    const url = new URL(location.origin + '/');
    const profile = globalThis.FilamentInventoryUsers?.currentUser?.() || 'Bill';
    url.searchParams.set('spool', id);
    url.searchParams.set('scan', '1');
    url.hash = new URLSearchParams({'filament-user':profile}).toString();
    return url.toString();
  }

  function injectStyle() {
    const style = document.createElement('style');
    style.id = 'physicalLayerStyles';
    style.textContent = `
      .labels-layout{display:grid;grid-template-columns:.82fr 1.18fr;gap:18px}.labels-card{padding:22px}.label-controls{display:grid;grid-template-columns:1fr 180px;gap:10px;margin-top:16px}.label-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}.label-actions .btn{flex:1}.spool-pick-list{display:grid;gap:8px;margin-top:14px;max-height:520px;overflow:auto;padding-right:4px}.spool-pick{display:grid;grid-template-columns:auto 12px 1fr auto;gap:10px;align-items:center;padding:10px 11px;border:1px solid var(--line);border-radius:13px;background:rgba(3,10,18,.25)}.spool-pick input{width:18px;height:18px;accent-color:var(--cyan)}.spool-pick .swatch{width:12px;height:30px;border-radius:7px;border:1px solid rgba(255,255,255,.16)}.spool-pick strong{display:block;font-size:12px}.spool-pick span{display:block;color:var(--muted);font-size:11px;margin-top:2px}.label-preview-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;margin-top:14px}.label-preview{display:grid;grid-template-columns:82px 1fr;gap:10px;align-items:center;padding:10px;border:1px solid var(--line);border-radius:14px;background:#fff;color:#07111f;min-height:104px}.label-preview img{width:82px;height:82px;display:block}.label-preview strong{display:block;font-size:16px;line-height:1}.label-preview .label-line{font-size:11px;line-height:1.3;margin-top:4px;color:#27364b}.label-preview .label-remaining{font-weight:700}.label-preview .label-url{font-size:8px;word-break:break-all;color:#667085;margin-top:4px}.scan-summary{display:grid;grid-template-columns:18px 1fr;gap:12px;align-items:start;padding:14px;border:1px solid var(--line);border-radius:16px;background:rgba(3,10,18,.28)}.scan-swatch{width:18px;height:56px;border-radius:9px;border:1px solid rgba(255,255,255,.18)}.scan-summary strong{display:block;font-size:18px}.scan-summary span{display:block;color:var(--muted);font-size:12px;line-height:1.45;margin-top:4px}.scan-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}.physical-tip{margin-top:14px;padding:12px 13px;border:1px solid var(--line);border-radius:14px;background:rgba(3,10,18,.25);color:var(--muted);font-size:12px;line-height:1.55}
      #physicalPrintRoot{display:none}
      @media(max-width:900px){.labels-layout{grid-template-columns:1fr}.spool-pick-list{max-height:360px}}
      @media(max-width:560px){.label-controls{grid-template-columns:1fr}.scan-actions{grid-template-columns:1fr}.label-preview-grid{grid-template-columns:1fr}}
      @media print{
        @page{margin:.18in}
        body.print-labels *{visibility:hidden!important}
        body.print-labels #physicalPrintRoot,body.print-labels #physicalPrintRoot *{visibility:visible!important}
        body.print-labels #physicalPrintRoot{display:grid!important;position:absolute;inset:0 auto auto 0;grid-template-columns:repeat(auto-fill,var(--label-w));grid-auto-rows:var(--label-h);gap:.08in;width:100%;align-content:start}
        body.print-labels .physical-print-label{box-sizing:border-box;width:var(--label-w);height:var(--label-h);display:grid;grid-template-columns:calc(var(--label-h) - .12in) 1fr;gap:.06in;align-items:center;padding:.05in;border:1px solid #d0d5dd;border-radius:.04in;background:#fff!important;color:#000!important;break-inside:avoid;overflow:hidden}
        body.print-labels .physical-print-label img{width:calc(var(--label-h) - .14in);height:calc(var(--label-h) - .14in);display:block}
        body.print-labels .physical-print-label strong{display:block;font:700 10pt/1 Arial,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        body.print-labels .physical-print-label span{display:block;font:7.5pt/1.18 Arial,sans-serif;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        body.print-labels .physical-print-label small{display:block;font:6pt/1.1 Arial,sans-serif;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#444!important}
      }
    `;
    document.head.appendChild(style);
  }

  function labelMarkup(spool, preview = true) {
    const m = measurement(spool);
    const remain = m.grams === null ? 'Remaining unknown' : `${Math.round(m.grams)} g · ${Math.round(m.percent)}%`;
    const details = [spool.brand || 'Unknown', spool.material || 'Unknown', spool.colorName || 'Unknown'].join(' · ');
    const qr = `/qr?spool=${encodeURIComponent(spool.id)}&profile=${encodeURIComponent(globalThis.FilamentInventoryUsers?.currentUser?.() || 'Bill')}`;
    if (preview) {
      return `<article class="label-preview"><img alt="QR for ${esc(spool.id)}" loading="lazy" src="${qr}"/><div><strong>${esc(spool.id)}</strong><div class="label-line">${esc(details)}</div><div class="label-line label-remaining">${esc(remain)}</div><div class="label-line">${esc(spool.location || 'Location not set')}</div><div class="label-url">${esc(linkFor(spool.id))}</div></div></article>`;
    }
    return `<article class="physical-print-label"><img alt="" src="${qr}"/><div><strong>${esc(spool.id)}</strong><span>${esc(spool.brand || 'Unknown')} · ${esc(spool.material || 'Unknown')}</span><span>${esc(spool.colorName || 'Unknown')}</span><span>${esc(remain)}${spool.location ? ` · ${esc(spool.location)}` : ''}</span><small>Scan to open spool controls</small></div></article>`;
  }

  function renderPicker() {
    const list = document.getElementById('spoolPickList');
    const count = document.getElementById('labelSelectionCount');
    if (!list) return;
    const q = String(document.getElementById('labelSearch')?.value || '').trim().toLowerCase();
    const rows = allSpools().filter(s => !q || [s.id,s.brand,s.material,s.colorName,s.location].some(v => String(v || '').toLowerCase().includes(q)));
    list.innerHTML = rows.length ? rows.map(s => {
      const m = measurement(s);
      const status = s.archivedAt ? 'Archived' : (m.grams === null ? 'Unknown remaining' : `${Math.round(m.grams)} g`);
      return `<label class="spool-pick"><input type="checkbox" data-label-id="${esc(s.id)}" ${selected.has(s.id) ? 'checked' : ''}/><i class="swatch" style="background:${/^#[0-9a-f]{6}$/i.test(s.colorHex || '') ? s.colorHex : '#64748b'}"></i><span><strong>${esc(s.id)} · ${esc(s.brand || 'Unknown')} · ${esc(s.material || 'Unknown')}</strong><span>${esc(s.colorName || 'Unknown')} · ${esc(s.location || 'No location')}</span></span><span>${esc(status)}</span></label>`;
    }).join('') : '<div class="sync-empty">No spools match this search.</div>';
    if (count) count.textContent = `${selected.size} selected`;
    renderPreview();
  }

  function renderPreview() {
    const grid = document.getElementById('labelPreviewGrid');
    if (!grid) return;
    const byId = new Map(allSpools().map(s => [String(s.id), s]));
    const rows = [...selected].map(id => byId.get(id)).filter(Boolean);
    grid.innerHTML = rows.length ? rows.map(s => labelMarkup(s, true)).join('') : '<div class="sync-empty">Select one or more spools to preview labels.</div>';
  }

  function selectActive() {
    selected.clear();
    activeSpools().forEach(s => selected.add(s.id));
    renderPicker();
  }

  function clearSelection() {
    selected.clear();
    renderPicker();
  }

  function buildPrintSheet() {
    const root = document.getElementById('physicalPrintRoot');
    const byId = new Map(allSpools().map(s => [String(s.id), s]));
    const rows = [...selected].map(id => byId.get(id)).filter(Boolean);
    if (!rows.length || !root) return false;
    const dimensions = {
      '2x1':['2in','1in'],
      '2.25x1.25':['2.25in','1.25in'],
      '1.5-square':['1.5in','1.5in']
    }[labelSize] || ['2in','1in'];
    root.style.setProperty('--label-w', dimensions[0]);
    root.style.setProperty('--label-h', dimensions[1]);
    root.innerHTML = rows.map(s => labelMarkup(s, false)).join('');
    return true;
  }

  function printLabels() {
    if (!buildPrintSheet()) return alert('Select at least one spool first.');
    document.body.classList.add('print-labels');
    setTimeout(() => window.print(), 80);
  }

  function cleanupPrintMode() {
    document.body.classList.remove('print-labels');
  }

  function showScanDialog(id) {
    const dialog = document.getElementById('scanSpoolDialog');
    const body = document.getElementById('scanSpoolBody');
    const spool = allSpools().find(s => String(s.id).toLowerCase() === String(id || '').toLowerCase());
    if (!dialog || !body) return;
    dialog.dataset.spoolId = id || '';
    if (!spool) {
      body.innerHTML = `<div class="scan-summary"><i class="scan-swatch" style="background:#64748b"></i><div><strong>${esc(id || 'Unknown spool')}</strong><span>This spool is not present in the local inventory on this device. If this is a new device, connect it from the Sync tab first.</span></div></div>`;
      document.getElementById('scanWeighBtn').hidden = true;
      document.getElementById('scanInventoryBtn').textContent = 'Open Sync';
      dialog.showModal();
      return;
    }
    const m = measurement(spool);
    const remain = m.grams === null ? 'Remaining amount unknown' : `${Math.round(m.grams)} g remaining · ${Math.round(m.percent)}% · ${m.source}`;
    body.innerHTML = `<div class="scan-summary"><i class="scan-swatch" style="background:${/^#[0-9a-f]{6}$/i.test(spool.colorHex || '') ? spool.colorHex : '#64748b'}"></i><div><strong>${esc(spool.id)}</strong><span>${esc(spool.brand || 'Unknown')} · ${esc(spool.material || 'Unknown')} · ${esc(spool.colorName || 'Unknown')}</span><span>${esc(remain)}</span><span>${esc(spool.location || 'Location not set')}${spool.archivedAt ? ' · Archived' : ''}</span></div></div>`;
    document.getElementById('scanWeighBtn').hidden = Boolean(spool.archivedAt);
    document.getElementById('scanInventoryBtn').textContent = 'Find in inventory';
    dialog.showModal();
  }

  function navigateWeigh(id) {
    document.querySelector('.tab[data-view="weigh"]')?.click();
    setTimeout(() => {
      const select = document.getElementById('weighSpool');
      if (select) {
        const option = [...select.options].find(o => String(o.value).toLowerCase() === String(id).toLowerCase());
        if (option) { select.value = option.value; select.dispatchEvent(new Event('change', {bubbles:true})); }
      }
      document.getElementById('grossWeight')?.focus();
    }, 80);
  }

  function navigateInventory(id) {
    const exists = allSpools().some(s => String(s.id).toLowerCase() === String(id || '').toLowerCase());
    if (!exists) {
      document.querySelector('.tab[data-view="sync"]')?.click();
      return;
    }
    document.querySelector('.tab[data-view="inventory"]')?.click();
    setTimeout(() => {
      const lifecycle = document.getElementById('lifecycleFilter');
      if (lifecycle) { lifecycle.value = 'all'; lifecycle.dispatchEvent(new Event('change', {bubbles:true})); }
      const search = document.getElementById('searchInput');
      if (search) { search.value = id; search.dispatchEvent(new Event('input', {bubbles:true})); }
    }, 80);
  }

  async function copySpoolLink(id) {
    const link = linkFor(id);
    try { await navigator.clipboard.writeText(link); }
    catch { prompt('Copy spool link:', link); }
  }

  function markup() {
    return `<div class="labels-layout"><section class="panel labels-card"><span class="eyebrow">Physical spool labels · ${esc(globalThis.FilamentInventoryVersion?.DISPLAY_VERSION || '')}</span><h2 id="labelsTitle" style="margin:8px 0 6px;font-size:30px;letter-spacing:-.04em">Scan the spool, not the spreadsheet.</h2><p class="muted" style="line-height:1.6">Generate printable QR labels for the physical spools. The QR contains only the public app URL, spool ID, and private profile name; it never contains your private sync key.</p><div class="label-controls"><input class="field" id="labelSearch" type="search" placeholder="Search ID, brand, material, color, location…"/><select class="select" id="labelSize"><option value="2x1">2 × 1 in</option><option value="2.25x1.25">2.25 × 1.25 in</option><option value="1.5-square">1.5 × 1.5 in</option></select></div><div class="label-actions"><button class="btn" id="selectActiveLabelsBtn" type="button">Select active</button><button class="btn" id="clearLabelsBtn" type="button">Clear</button><button class="btn btn-primary" id="printLabelsBtn" type="button">Print selected</button></div><p class="muted" id="labelSelectionCount" style="font-size:12px;margin:12px 0 0">0 selected</p><div class="spool-pick-list" id="spoolPickList"></div></section><aside class="panel labels-card"><span class="eyebrow">Print preview</span><h3 style="margin-top:8px">Label sheet</h3><p class="muted">Use your browser Print dialog to print directly or save the sheet as PDF. For best QR reliability, print at 100% scale.</p><div class="label-preview-grid" id="labelPreviewGrid"></div><div class="physical-tip"><strong>iPhone workflow:</strong> point Camera or Code Scanner at a label → open the link → use the <strong>Physical spool</strong> sheet for Weigh, Printer / AMS, Edit, QR, and lifecycle actions. The device still needs its normal local/synced inventory to display private spool details.</div></aside></div>`;
  }

  function injectUi() {
    injectStyle();
    const tabs = document.querySelector('.tabs');
    const dataTab = tabs?.querySelector('[data-view="data"]');
    if (tabs && dataTab && !tabs.querySelector('[data-view="labels"]')) {
      const btn = document.createElement('button');
      btn.className = 'tab'; btn.dataset.view = 'labels'; btn.setAttribute('aria-selected','false'); btn.textContent = 'Labels';
      tabs.insertBefore(btn, dataTab);
    }
    const dataView = document.getElementById('dataView');
    if (dataView && !document.getElementById('labelsView')) {
      const section = document.createElement('section'); section.className = 'view'; section.id = 'labelsView'; section.setAttribute('aria-labelledby','labelsTitle'); section.innerHTML = markup();
      dataView.parentNode.insertBefore(section, dataView);
    }
    if (!document.getElementById('scanSpoolDialog')) {
      const dialog = document.createElement('dialog');
      dialog.id = 'scanSpoolDialog';
      dialog.innerHTML = `<div class="dialog-head"><h3>Spool scan</h3><button class="btn icon-btn" id="scanCloseBtn" type="button">×</button></div><div class="dialog-body"><div id="scanSpoolBody"></div><div class="scan-actions"><button class="btn btn-primary" id="scanWeighBtn" type="button">Weigh now</button><button class="btn" id="scanInventoryBtn" type="button">Find in inventory</button></div><div class="scan-actions"><button class="btn" id="scanCopyLinkBtn" type="button">Copy spool link</button><button class="btn" id="scanDoneBtn" type="button">Done</button></div></div>`;
      document.body.appendChild(dialog);
    }
    if (!document.getElementById('physicalPrintRoot')) {
      const root = document.createElement('div'); root.id = 'physicalPrintRoot'; root.setAttribute('aria-hidden','true'); document.body.appendChild(root);
    }
    const eyebrow = document.querySelector('#dashboardView .hero-copy .eyebrow');
    if (eyebrow) eyebrow.textContent = 'Inventory control center · v7';
    const dataTitle = document.getElementById('dataTitle');
    if (dataTitle) dataTitle.textContent = 'Data, backup & install · v7';
  }

  function bind() {
    document.getElementById('labelSearch')?.addEventListener('input', renderPicker);
    document.getElementById('labelSize')?.addEventListener('change', e => { labelSize = e.target.value; });
    document.getElementById('selectActiveLabelsBtn')?.addEventListener('click', selectActive);
    document.getElementById('clearLabelsBtn')?.addEventListener('click', clearSelection);
    document.getElementById('printLabelsBtn')?.addEventListener('click', printLabels);
    document.getElementById('spoolPickList')?.addEventListener('change', e => {
      const input = e.target.closest('[data-label-id]'); if (!input) return;
      if (input.checked) selected.add(input.dataset.labelId); else selected.delete(input.dataset.labelId);
      renderPicker();
    });
    window.addEventListener('afterprint', cleanupPrintMode);
    document.getElementById('scanCloseBtn')?.addEventListener('click', () => document.getElementById('scanSpoolDialog')?.close());
    document.getElementById('scanDoneBtn')?.addEventListener('click', () => document.getElementById('scanSpoolDialog')?.close());
    document.getElementById('scanWeighBtn')?.addEventListener('click', () => { const d=document.getElementById('scanSpoolDialog'); const id=d?.dataset.spoolId; d?.close(); if (id) navigateWeigh(id); });
    document.getElementById('scanInventoryBtn')?.addEventListener('click', () => { const d=document.getElementById('scanSpoolDialog'); const id=d?.dataset.spoolId; d?.close(); if (id) navigateInventory(id); });
    document.getElementById('scanCopyLinkBtn')?.addEventListener('click', () => { const id=document.getElementById('scanSpoolDialog')?.dataset.spoolId; if (id) copySpoolLink(id); });
  }

  function scheduleIncomingScanFallback() {
    if (!pendingSpoolId || !pendingScan) return;
    setTimeout(() => {
      const current = new URL(location.href);
      if (current.searchParams.get('scan') !== '1') return;
      if (globalThis.FilamentInventorySpoolActions?.openIncomingScan?.()) return;
      current.searchParams.delete('scan');
      history.replaceState(null, '', current.pathname + current.search + current.hash);
      showScanDialog(pendingSpoolId);
    }, 650);
  }

  function init() {
    injectUi();
    bind();
    selectActive();
    setTimeout(renderPicker, 650);
    scheduleIncomingScanFallback();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true}); else init();
})();
