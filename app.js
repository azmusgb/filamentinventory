(() => {
  'use strict';

  const STORAGE_KEY = 'filament-inventory-v1';
  const VERSION_INFO = globalThis.FilamentInventoryVersion || Object.freeze({APP_VERSION:'9.0.0', DATA_SCHEMA_VERSION:9, DISPLAY_VERSION:'v9.0.0'});
  const APP_VERSION = VERSION_INFO.APP_VERSION;
  const DATA_SCHEMA_VERSION = VERSION_INFO.DATA_SCHEMA_VERSION;
  const DEFAULT_REORDER_GRAMS = 250;
  const MAX_LOG_ENTRIES = 1000;
  const STATUS_ORDER = ['Nearly full', 'High', 'Good', 'Medium', 'Low', 'Very low', 'Unknown'];
  const STATUS_COLORS = {
    'Nearly full': '#84cc16', High: '#65a30d', Good: '#38bdf8', Medium: '#f59e0b', Low: '#f97316', 'Very low': '#ef4444', Unknown: '#64748b'
  };

  const starterInventory = [
    {id:'F01', brand:'ELEGOO', material:'Rapid PETG', colorName:'Brown / Tan', colorHex:'#8b5e3c', spoolType:'Cardboard', startWeight:1000, visualPercent:15, gross:null, tare:null, location:'Floor audit', confidence:'High', notes:'Label visible: ELEGOO Rapid PETG. Visual fill estimate only.'},
    {id:'F02', brand:'Inland', material:'Unknown', colorName:'Light Blue', colorHex:'#8fd3ff', spoolType:'Cardboard', startWeight:1000, visualPercent:null, gross:null, tare:null, location:'Floor audit', confidence:'High', notes:'Inland brand visible; exact subtype and remaining amount not readable from photo.'},
    {id:'F03', brand:'Probable Inland', material:'Probable PLA+ refill', colorName:'Neon Green', colorHex:'#7cff57', spoolType:'Spoolless / refill', startWeight:1000, visualPercent:90, gross:null, tare:null, location:'Floor audit', confidence:'Medium', notes:'Exposed refill; tightly wound. Brand/type inferred from purchase history, not confirmed on label.'},
    {id:'F04', brand:'Unknown', material:'Unknown', colorName:'Tan / Natural', colorHex:'#c9a675', spoolType:'Cardboard', startWeight:1000, visualPercent:10, gross:null, tare:null, location:'Floor audit', confidence:'Low', notes:'Very small visible remnant.'},
    {id:'F05', brand:'Polymaker', material:'Probable PLA Pro', colorName:'Light Yellow / Cream', colorHex:'#f3d779', spoolType:'Cardboard', startWeight:1000, visualPercent:null, gross:null, tare:null, location:'Floor audit', confidence:'Medium', notes:'Polymaker branding visible; exact line likely PLA Pro based on purchase history.'},
    {id:'F06', brand:'Inland', material:'High Speed PLA+', colorName:'Green', colorHex:'#2f7d4a', spoolType:'Cardboard', startWeight:1000, visualPercent:null, gross:null, tare:null, location:'Floor audit', confidence:'High', notes:'High Speed PLA+ label visible.'},
    {id:'F07', brand:'Probable Inland', material:'Probable PLA+ refill', colorName:'Bright Orange', colorHex:'#ff5a1f', spoolType:'Spoolless / refill', startWeight:1000, visualPercent:85, gross:null, tare:null, location:'Floor audit', confidence:'Medium', notes:'Exposed refill. Brand/type inferred rather than label-confirmed.'},
    {id:'F08', brand:'Inland', material:'ABS Fiber / ABS-GF', colorName:'Green / Teal', colorHex:'#12806e', spoolType:'Cardboard', startWeight:1000, visualPercent:null, gross:null, tare:null, location:'Floor audit', confidence:'High', notes:'ABS fiber family label visible.'},
    {id:'F09', brand:'Unknown', material:'Unknown', colorName:'Brown / Bronze', colorHex:'#7c5a3a', spoolType:'Plastic', startWeight:1000, visualPercent:15, gross:null, tare:null, location:'Floor audit', confidence:'Medium', notes:'Clear plastic spool with a small amount remaining.'},
    {id:'F10', brand:'Inland', material:'Unknown', colorName:'Light Blue', colorHex:'#9fdcf8', spoolType:'Cardboard', startWeight:1000, visualPercent:null, gross:null, tare:null, location:'Floor audit', confidence:'High', notes:'Inland brand visible; subtype and fill amount not determinable.'},
    {id:'F11', brand:'Inland', material:'Silk PLA', colorName:'Gold', colorHex:'#c79a35', spoolType:'Cardboard', startWeight:1000, visualPercent:null, gross:null, tare:null, location:'Floor audit', confidence:'High', notes:'Silk PLA label visible.'},
    {id:'F12', brand:'Inland', material:'PLA / Basic PLA', colorName:'Dark Green', colorHex:'#184f37', spoolType:'Cardboard', startWeight:1000, visualPercent:null, gross:null, tare:null, location:'Floor audit', confidence:'High', notes:'PLA/basic PLA family visible.'},
    {id:'F13', brand:'Overture', material:'PLA', colorName:'Orange', colorHex:'#ea6a22', spoolType:'Cardboard', startWeight:1000, visualPercent:null, gross:null, tare:null, location:'Floor audit', confidence:'High', notes:'Overture PLA branding visible.'},
    {id:'F14', brand:'Inland', material:'PLA+', colorName:'Cream / Tan', colorHex:'#e8d8b3', spoolType:'Cardboard', startWeight:1000, visualPercent:null, gross:null, tare:null, location:'Floor audit', confidence:'High', notes:'PLA+ type visible.'},
    {id:'F15', brand:'Inland', material:'PETG+', colorName:'Natural / Off White', colorHex:'#e8e3d8', spoolType:'Cardboard', startWeight:1000, visualPercent:null, gross:null, tare:null, location:'Floor audit', confidence:'High', notes:'PETG+ label visible.'},
    {id:'F16', brand:'Cookiecad', material:'PLA', colorName:'Pink / Blue / Purple Gradient', colorHex:'#b35bd8', spoolType:'Plastic', startWeight:1000, visualPercent:25, gross:null, tare:null, location:'Floor audit', confidence:'High', notes:'Cookiecad brand visible on clear spool. Visual fill estimate only.'},
    {id:'F17', brand:'Inland', material:'PLA', colorName:'Purple / Magenta', colorHex:'#9b4bb5', spoolType:'Cardboard', startWeight:1000, visualPercent:null, gross:null, tare:null, location:'Floor audit', confidence:'High', notes:'PLA type visible.'},
    {id:'F18', brand:'ELEGOO', material:'Sparkle PLA', colorName:'Yellow / Gold', colorHex:'#e3b422', spoolType:'Cardboard', startWeight:1000, visualPercent:null, gross:null, tare:null, location:'Floor audit', confidence:'High', notes:'ELEGOO Sparkle PLA label visible.'},
    {id:'C01', brand:'Inland', material:'PLA+', colorName:'Purple', colorHex:'#6f3ba5', spoolType:'Cardboard', startWeight:1000, visualPercent:65, gross:null, tare:null, location:'Close-up set', confidence:'Confirmed', notes:'Confirmed directly from close-up label photo.'},
    {id:'C02', brand:'Inland', material:'TPU', colorName:'Translucent Blue', colorHex:'#1673c8', spoolType:'Cardboard', startWeight:1000, visualPercent:40, gross:null, tare:null, location:'Close-up set', confidence:'Confirmed', notes:'Confirmed directly from close-up label photo.'},
    {id:'C03', brand:'Inland', material:'PLA+', colorName:'Black', colorHex:'#111827', spoolType:'Cardboard', startWeight:1000, visualPercent:50, gross:null, tare:null, location:'Close-up set', confidence:'Confirmed', notes:'Confirmed directly from close-up label photo.'}
  ];

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const num = value => value === '' || value === null || value === undefined ? null : Number(value);
  const validNum = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
  const clone = value => JSON.parse(JSON.stringify(value));
  const nowIso = () => new Date().toISOString();
  const normalizeTriState = value => ['Yes','No','Unknown'].includes(String(value)) ? String(value) : 'Unknown';
  const isArchived = spool => Boolean(spool.archivedAt);

  let inventory = [];
  let weighLog = [];
  let meta = {lastBackupAt:null};
  let toastTimer;
  let deferredInstallPrompt = null;

  function normalizeSpool(spool) {
    const createdAt = spool.createdAt || spool.updatedAt || null;
    return {
      id: String(spool.id || '').trim(),
      brand: String(spool.brand || 'Unknown').trim() || 'Unknown',
      material: String(spool.material || 'Unknown').trim() || 'Unknown',
      colorName: String(spool.colorName || 'Unknown').trim() || 'Unknown',
      colorHex: /^#[0-9a-f]{6}$/i.test(spool.colorHex || '') ? spool.colorHex : '#64748b',
      spoolType: String(spool.spoolType || 'Unknown'),
      startWeight: validNum(spool.startWeight) && Number(spool.startWeight) > 0 ? Number(spool.startWeight) : 1000,
      visualPercent: validNum(spool.visualPercent) ? Math.min(100, Math.max(0, Number(spool.visualPercent))) : null,
      gross: validNum(spool.gross) ? Math.max(0, Number(spool.gross)) : null,
      tare: validNum(spool.tare) ? Math.max(0, Number(spool.tare)) : null,
      location: String(spool.location || '').trim(),
      confidence: ['Confirmed','High','Medium','Low','Unknown'].includes(String(spool.confidence)) ? String(spool.confidence) : 'Unknown',
      opened: normalizeTriState(spool.opened),
      bagged: normalizeTriState(spool.bagged),
      purchaseSource: String(spool.purchaseSource || '').trim(),
      purchasePrice: validNum(spool.purchasePrice) && Number(spool.purchasePrice) >= 0 ? Number(spool.purchasePrice) : null,
      purchaseDate: /^\d{4}-\d{2}-\d{2}$/.test(String(spool.purchaseDate || '')) ? String(spool.purchaseDate) : '',
      reorderThreshold: validNum(spool.reorderThreshold) && Number(spool.reorderThreshold) >= 0 ? Number(spool.reorderThreshold) : DEFAULT_REORDER_GRAMS,
      lastDriedDate: /^\d{4}-\d{2}-\d{2}$/.test(String(spool.lastDriedDate || '')) ? String(spool.lastDriedDate) : '',
      notes: String(spool.notes || '').trim(),
      createdAt,
      updatedAt: spool.updatedAt || null,
      archivedAt: spool.archivedAt || null
    };
  }

  function normalizeLogEntry(entry) {
    const gross = num(entry.gross);
    const tare = num(entry.tare);
    return {
      id: String(entry.id || '').trim(),
      at: entry.at || nowIso(),
      gross: gross === null ? null : Math.max(0, gross),
      tare: tare === null ? null : Math.max(0, tare),
      remaining: validNum(entry.remaining) ? Math.max(0, Number(entry.remaining)) : null,
      percent: validNum(entry.percent) ? Math.max(0, Math.min(100, Number(entry.percent))) : null,
      location: String(entry.location || '').trim(),
      note: String(entry.note || '').trim()
    };
  }

  function starterState() {
    return {spools:clone(starterInventory).map(s => normalizeSpool({...s, createdAt:null})), weighLog:[], meta:{lastBackupAt:null}};
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return starterState();
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.spools)) throw new Error('Invalid inventory data');
      return {
        spools: parsed.spools.map(normalizeSpool).filter(s => s.id),
        weighLog: Array.isArray(parsed.weighLog) ? parsed.weighLog.map(normalizeLogEntry).filter(x => x.id) : [],
        meta: {lastBackupAt: parsed.meta?.lastBackupAt || parsed.lastBackupAt || null}
      };
    } catch (error) {
      console.warn('Could not load inventory; using starter data.', error);
      return starterState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({version:DATA_SCHEMA_VERSION, appVersion:APP_VERSION, savedAt:nowIso(), meta, spools:inventory, weighLog}));
  }

  function measurement(spool) {
    const start = Number(spool.startWeight) || 1000;
    if (validNum(spool.gross) && validNum(spool.tare) && Number(spool.gross) >= Number(spool.tare)) {
      const raw = Math.max(0, Number(spool.gross) - Number(spool.tare));
      const grams = Math.min(start, raw);
      return {grams, percent:Math.round((grams / start) * 1000) / 10, source:'Measured'};
    }
    if (validNum(spool.visualPercent)) {
      const percent = Math.max(0, Math.min(100, Number(spool.visualPercent)));
      return {grams:Math.round(start * percent / 100), percent, source:'Visual'};
    }
    return {grams:null, percent:null, source:'Unknown'};
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
    if (isArchived(spool)) return false;
    const m = measurement(spool);
    return m.grams !== null && m.grams <= Number(spool.reorderThreshold ?? DEFAULT_REORDER_GRAMS);
  }

  function activeSpools() { return inventory.filter(s => !isArchived(s)); }
  function archivedSpools() { return inventory.filter(isArchived); }

  function backupAgeText() {
    if (!meta.lastBackupAt) return 'Never exported';
    const days = Math.floor((Date.now() - new Date(meta.lastBackupAt).getTime()) / 86400000);
    if (days <= 0) return 'Backed up today';
    if (days === 1) return 'Backed up yesterday';
    return `Backed up ${days} days ago`;
  }

  function showToast(message, action = null) {
    const el = $('toast');
    if (!el) return;
    el.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button" class="toast-action" id="toastAction">${esc(action.label)}</button>` : ''}`;
    el.classList.add('show');
    clearTimeout(toastTimer);
    if (action) $('toastAction')?.addEventListener('click', () => { action.run(); el.classList.remove('show'); });
    toastTimer = setTimeout(() => el.classList.remove('show'), action ? 6000 : 2600);
  }

  function switchView(view) {
    document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.id === `${view}View`));
    document.querySelectorAll('.tab').forEach(el => el.setAttribute('aria-selected', String(el.dataset.view === view)));
    history.replaceState(null, '', view === 'dashboard' ? location.pathname : `${location.pathname}#view=${encodeURIComponent(view)}`);
    window.scrollTo({top:0, behavior:'smooth'});
  }

  function renderAll() {
    renderDashboard();
    renderFilters();
    renderInventory();
    renderWeighOptions();
    renderRecentMeasurements();
    renderHistory();
    renderDataHealth();
  }

  function renderDashboard() {
    const active = activeSpools();
    const known = active.map(s => ({s,m:measurement(s)})).filter(x => x.m.grams !== null);
    const measured = known.filter(x => x.m.source === 'Measured').length;
    const knownGrams = known.reduce((sum,x) => sum + x.m.grams, 0);
    const reorder = active.filter(reorderNeeded).length;
    const unknown = active.filter(s => measurement(s).percent === null).length;

    $('metrics').innerHTML = [
      ['Active spools', active.length, `${archivedSpools().length} archived`],
      ['Known filament', `${(knownGrams/1000).toFixed(1)} kg`, `${known.length}/${active.length} have a usable estimate`],
      ['Measured', measured, `${weighLog.length} measurements logged`],
      ['Reorder', reorder, `${unknown} still need a fill check`]
    ].map(([label,value,sub]) => `<article class="metric"><span class="metric-label">${esc(label)}</span><strong class="metric-value">${esc(value)}</strong><div class="metric-sub">${esc(sub)}</div></article>`).join('');

    const counts = Object.fromEntries(STATUS_ORDER.map(x => [x,0]));
    active.forEach(s => counts[statusFor(measurement(s).percent)]++);
    const max = Math.max(1, ...Object.values(counts));
    $('statusBars').innerHTML = STATUS_ORDER.map(status => `<div class="status-row"><div class="status-label"><i class="dot" style="color:${STATUS_COLORS[status]};background:${STATUS_COLORS[status]}"></i>${status}</div><div class="bar"><i style="width:${counts[status]/max*100}%;background:${STATUS_COLORS[status]}"></i></div><div class="bar-count">${counts[status]}</div></div>`).join('');

    const materials = {};
    active.forEach(s => materials[s.material || 'Unknown'] = (materials[s.material || 'Unknown'] || 0) + 1);
    $('materialGrid').innerHTML = Object.entries(materials).sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0])).slice(0,10).map(([name,count]) => `<article class="material-card"><div class="row"><strong>${esc(name)}</strong><strong>${count}</strong></div><small>${active.length ? Math.round(count/active.length*100) : 0}% of active spools</small></article>`).join('') || '<div class="empty"><strong>No active spools</strong>Add or restore a spool to begin.</div>';

    const reorderItems = active.filter(reorderNeeded).map(s => ({s,m:measurement(s),kind:'REORDER'})).sort((a,b) => a.m.grams-b.m.grams);
    const lowItems = active.map(s => ({s,m:measurement(s),kind:'LOW'})).filter(x => x.m.percent !== null && !reorderNeeded(x.s) && x.m.percent < 40).sort((a,b) => a.m.percent-b.m.percent);
    const unknownItems = active.filter(s => measurement(s).percent === null).map(s => ({s,m:measurement(s),kind:'CHECK'}));
    const queue = [...reorderItems, ...lowItems, ...unknownItems].slice(0,5);
    $('priorityList').innerHTML = queue.length ? queue.map(({s,m,kind}) => {
      const status = statusFor(m.percent);
      const right = kind === 'REORDER' ? 'REORDER' : (m.percent === null ? 'CHECK' : `${Math.round(m.percent)}%`);
      return `<button class="quick-item quick-button" type="button" data-open-id="${esc(s.id)}"><i class="dot" style="color:${kind === 'REORDER' ? '#ef4444' : STATUS_COLORS[status]};background:${kind === 'REORDER' ? '#ef4444' : STATUS_COLORS[status]}"></i><div><strong>${esc(s.id)} · ${esc(s.brand)} ${esc(s.material)}</strong><br><span>${esc(s.colorName)} · ${esc(s.location || 'Unassigned')}</span></div><span>${esc(right)}</span></button>`;
    }).join('') : '<div class="empty"><strong>No urgent items</strong>No current reorder or fill-check items.</div>';
  }

  function uniqueValues(key, includeArchived = true) {
    const source = includeArchived ? inventory : activeSpools();
    return [...new Set(source.map(s => String(s[key] || '').trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b));
  }

  function preserveSelectOptions(select, values, defaultLabel) {
    const current = select.value;
    select.innerHTML = `<option value="">${esc(defaultLabel)}</option>${values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('')}`;
    if ([...select.options].some(o => o.value === current)) select.value = current;
  }

  function renderFilters() {
    preserveSelectOptions($('materialFilter'), uniqueValues('material'), 'All materials');
    preserveSelectOptions($('locationFilter'), uniqueValues('location'), 'All locations');
  }

  function compareSpools(a,b,sort) {
    const ma = measurement(a), mb = measurement(b);
    if (sort === 'fill-asc') return (ma.percent ?? 999) - (mb.percent ?? 999) || a.id.localeCompare(b.id,undefined,{numeric:true});
    if (sort === 'fill-desc') return (mb.percent ?? -1) - (ma.percent ?? -1) || a.id.localeCompare(b.id,undefined,{numeric:true});
    if (sort === 'brand') return a.brand.localeCompare(b.brand) || a.colorName.localeCompare(b.colorName);
    if (sort === 'updated') return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0) || a.id.localeCompare(b.id,undefined,{numeric:true});
    if (sort === 'reorder') return Number(reorderNeeded(b)) - Number(reorderNeeded(a)) || (ma.grams ?? 99999) - (mb.grams ?? 99999);
    return a.id.localeCompare(b.id,undefined,{numeric:true});
  }

  function filteredInventory() {
    const q = $('searchInput').value.trim().toLowerCase();
    const material = $('materialFilter').value;
    const status = $('statusFilter').value;
    const location = $('locationFilter').value;
    const lifecycle = $('lifecycleFilter').value;
    const sort = $('sortSelect').value;
    return inventory.filter(s => {
      const hay = [s.id,s.brand,s.material,s.colorName,s.spoolType,s.location,s.purchaseSource,s.notes].join(' ').toLowerCase();
      const statusMatch = !status || (status === 'Reorder needed' ? reorderNeeded(s) : statusFor(measurement(s).percent) === status);
      const lifecycleMatch = lifecycle === 'all' || (lifecycle === 'archived' ? isArchived(s) : !isArchived(s));
      return (!q || hay.includes(q)) && (!material || s.material === material) && statusMatch && (!location || s.location === location) && lifecycleMatch;
    }).sort((a,b) => compareSpools(a,b,sort));
  }

  function renderInventory() {
    const list = filteredInventory();
    const activeCount = activeSpools().length;
    $('inventoryCountText').textContent = `${list.length} shown · ${activeCount} active · ${archivedSpools().length} archived`;
    if (!list.length) {
      $('inventoryGrid').innerHTML = '<div class="empty" style="grid-column:1/-1"><strong>No matching spools</strong>Change a filter, restore an archived spool, or add a new spool.</div>';
      return;
    }

    $('inventoryGrid').innerHTML = list.map(s => {
      const m = measurement(s);
      const status = statusFor(m.percent);
      const color = STATUS_COLORS[status];
      const pct = m.percent === null ? 0 : Math.max(0,Math.min(100,m.percent));
      const archived = isArchived(s);
      const badge = archived ? '<span class="confidence archived-badge">ARCHIVED</span>' : reorderNeeded(s) ? '<span class="confidence reorder-badge">REORDER</span>' : `<span class="confidence">${esc(s.confidence)}</span>`;
      const purchase = s.purchaseSource || s.purchaseDate || s.purchasePrice !== null ? [s.purchaseSource,s.purchaseDate,s.purchasePrice !== null ? `$${s.purchasePrice.toFixed(2)}` : ''].filter(Boolean).join(' · ') : 'Not recorded';
      return `<article class="spool-card${archived ? ' archived-card' : ''}" data-id="${esc(s.id)}">
        <div class="spool-head"><button class="swatch swatch-button" type="button" data-action="focus" data-id="${esc(s.id)}" style="background:${esc(s.colorHex)}" aria-label="Focus ${esc(s.id)}"></button><div class="spool-title"><h4>${esc(s.id)} · ${esc(s.colorName)}</h4><p>${esc(s.brand)} · ${esc(s.material)}</p></div>${badge}</div>
        <div class="spool-body">
          <div class="fill-top"><strong>${m.percent === null ? '—' : `${Math.round(m.percent)}%`}</strong><small>${m.grams === null ? 'Fill unknown' : `~${Math.round(m.grams)} g`}<br>${esc(m.source)}</small></div>
          <div class="progress"><i style="width:${pct}%;background:${color}"></i></div>
          <div class="meta">
            <div><span>Status</span><strong style="color:${color}">${archived ? 'Archived' : status}</strong></div>
            <div><span>Location</span><strong>${esc(s.location || 'Unassigned')}</strong></div>
            <div><span>Opened / Bagged</span><strong>${esc(s.opened)} / ${esc(s.bagged)}</strong></div>
            <div><span>Reorder at</span><strong>${Math.round(s.reorderThreshold)} g</strong></div>
            <div><span>Purchase</span><strong title="${esc(purchase)}">${esc(purchase)}</strong></div>
            <div><span>Last dried</span><strong>${s.lastDriedDate || 'Not recorded'}</strong></div>
          </div>
        </div>
        <div class="card-actions card-actions-wrap">
          ${archived ? `<button class="btn" data-action="restore" data-id="${esc(s.id)}" type="button">Restore</button>` : `<button class="btn" data-action="weigh" data-id="${esc(s.id)}" type="button">Weigh</button><button class="btn" data-action="empty" data-id="${esc(s.id)}" type="button">Empty</button>`}
          <button class="btn" data-action="edit" data-id="${esc(s.id)}" type="button">Edit</button>
          <button class="btn" data-action="copylink" data-id="${esc(s.id)}" type="button">Link</button>
          ${archived ? `<button class="btn btn-danger" data-action="delete" data-id="${esc(s.id)}" type="button">Delete</button>` : `<button class="btn btn-danger" data-action="archive" data-id="${esc(s.id)}" type="button">Archive</button>`}
        </div>
      </article>`;
    }).join('');
  }

  function renderWeighOptions() {
    const select = $('weighSpool');
    const current = select.value;
    const active = activeSpools().slice().sort((a,b) => a.id.localeCompare(b.id,undefined,{numeric:true}));
    select.innerHTML = active.map(s => `<option value="${esc(s.id)}">${esc(s.id)} — ${esc(s.brand)} ${esc(s.material)} — ${esc(s.colorName)}</option>`).join('');
    if ([...select.options].some(o => o.value === current)) select.value = current;
  }

  function renderRecentMeasurements() {
    const el = $('recentMeasurements');
    if (!el) return;
    const recent = weighLog.slice().sort((a,b) => new Date(b.at)-new Date(a.at)).slice(0,6);
    el.innerHTML = recent.length ? recent.map(x => `<button class="quick-item quick-button" type="button" data-open-id="${esc(x.id)}"><i class="dot" style="color:#38bdf8;background:#38bdf8"></i><div><strong>${esc(x.id)} · ${x.remaining === null ? '—' : `${Math.round(x.remaining)} g`}</strong><br><span>${new Date(x.at).toLocaleString()}${x.location ? ` · ${esc(x.location)}` : ''}</span></div><span>${x.percent === null ? '—' : `${x.percent.toFixed(1)}%`}</span></button>`).join('') : '<div class="empty" style="padding:20px"><strong>No measurements yet</strong>Weigh a spool to start the history.</div>';
  }

  function renderHistory() {
    const el = $('historyList');
    if (!el) return;
    const q = $('historySearch')?.value.trim().toLowerCase() || '';
    const entries = weighLog.slice().sort((a,b) => new Date(b.at)-new Date(a.at)).filter(x => {
      const spool = inventory.find(s => s.id === x.id);
      const hay = [x.id,x.location,x.note,spool?.brand,spool?.material,spool?.colorName].join(' ').toLowerCase();
      return !q || hay.includes(q);
    });
    $('historyCount').textContent = `${entries.length} measurement${entries.length === 1 ? '' : 's'}`;
    el.innerHTML = entries.length ? entries.map(x => {
      const spool = inventory.find(s => s.id === x.id);
      return `<article class="history-row"><div class="history-main"><strong>${esc(x.id)} · ${esc(spool?.brand || 'Unknown')} ${esc(spool?.material || '')}</strong><span>${esc(spool?.colorName || '')}</span></div><div><span>Remaining</span><strong>${x.remaining === null ? '—' : `${Math.round(x.remaining)} g`}</strong></div><div><span>Percent</span><strong>${x.percent === null ? '—' : `${x.percent.toFixed(1)}%`}</strong></div><div><span>Date</span><strong>${new Date(x.at).toLocaleString()}</strong></div><div><span>Location</span><strong>${esc(x.location || '—')}</strong></div>${x.note ? `<div class="history-note"><span>Note</span><strong>${esc(x.note)}</strong></div>` : ''}</article>`;
    }).join('') : '<div class="empty"><strong>No matching measurements</strong>Weigh a spool or change your history search.</div>';
  }

  function renderDataHealth() {
    if (!$('dataHealth')) return;
    const bytes = new Blob([localStorage.getItem(STORAGE_KEY) || '']).size;
    const active = activeSpools();
    const unknownFill = active.filter(s => measurement(s).percent === null).length;
    const lowConfidence = active.filter(s => ['Low','Unknown'].includes(s.confidence)).length;
    $('dataHealth').innerHTML = `
      <div class="health-stat"><span>App version</span><strong>${VERSION_INFO.DISPLAY_VERSION}</strong></div>
      <div class="health-stat"><span>Local data</span><strong>${(bytes/1024).toFixed(1)} KB</strong></div>
      <div class="health-stat"><span>Backup</span><strong>${esc(backupAgeText())}</strong></div>
      <div class="health-stat"><span>Unknown fill</span><strong>${unknownFill}</strong></div>
      <div class="health-stat"><span>Low confidence</span><strong>${lowConfidence}</strong></div>
      <div class="health-stat"><span>Archived</span><strong>${archivedSpools().length}</strong></div>`;
  }

  function nextId() {
    let n = 1;
    const used = new Set(inventory.map(s => s.id.toUpperCase()));
    while (used.has(`S${String(n).padStart(3,'0')}`)) n++;
    return `S${String(n).padStart(3,'0')}`;
  }

  function openSpoolDialog(spool = null) {
    $('spoolForm').reset();
    $('editOriginalId').value = spool ? spool.id : '';
    $('dialogTitle').textContent = spool ? `Edit ${spool.id}` : 'Add spool';
    $('spoolId').value = spool?.id || nextId();
    $('brand').value = spool?.brand || '';
    $('material').value = spool?.material || '';
    $('colorName').value = spool?.colorName || '';
    $('colorHex').value = spool?.colorHex || '#e5e7eb';
    $('spoolType').value = spool?.spoolType || 'Cardboard';
    $('startWeight').value = spool?.startWeight || 1000;
    $('visualPercent').value = spool?.visualPercent ?? '';
    $('grossEdit').value = spool?.gross ?? '';
    $('tareEdit').value = spool?.tare ?? '';
    $('location').value = spool?.location || '';
    $('confidence').value = spool?.confidence || 'Unknown';
    $('opened').value = spool?.opened || 'Unknown';
    $('bagged').value = spool?.bagged || 'Unknown';
    $('purchaseSource').value = spool?.purchaseSource || '';
    $('purchasePrice').value = spool?.purchasePrice ?? '';
    $('purchaseDate').value = spool?.purchaseDate || '';
    $('reorderThreshold').value = spool?.reorderThreshold ?? DEFAULT_REORDER_GRAMS;
    $('lastDriedDate').value = spool?.lastDriedDate || '';
    $('notes').value = spool?.notes || '';
    $('spoolDialog').showModal();
  }

  function closeSpoolDialog() { if ($('spoolDialog').open) $('spoolDialog').close(); }

  function saveSpoolFromForm(event) {
    event.preventDefault();
    const originalId = $('editOriginalId').value.trim();
    const id = $('spoolId').value.trim();
    if (!id) return showToast('Spool ID is required.');
    if (inventory.some(s => s.id.toLowerCase() === id.toLowerCase() && s.id !== originalId)) return showToast('That spool ID already exists.');

    const gross = num($('grossEdit').value);
    const tare = num($('tareEdit').value);
    if (gross !== null && tare !== null && gross < tare) return showToast('Gross weight cannot be less than tare weight.');
    const existing = originalId ? inventory.find(s => s.id === originalId) : null;

    const spool = normalizeSpool({
      ...existing,
      id,
      brand:$('brand').value,
      material:$('material').value,
      colorName:$('colorName').value,
      colorHex:$('colorHex').value,
      spoolType:$('spoolType').value,
      startWeight:num($('startWeight').value) || 1000,
      visualPercent:num($('visualPercent').value),
      gross,
      tare,
      location:$('location').value,
      confidence:$('confidence').value,
      opened:$('opened').value,
      bagged:$('bagged').value,
      purchaseSource:$('purchaseSource').value,
      purchasePrice:num($('purchasePrice').value),
      purchaseDate:$('purchaseDate').value,
      reorderThreshold:num($('reorderThreshold').value) ?? DEFAULT_REORDER_GRAMS,
      lastDriedDate:$('lastDriedDate').value,
      notes:$('notes').value,
      createdAt: existing?.createdAt || nowIso(),
      updatedAt:nowIso()
    });

    if (originalId) {
      inventory = inventory.map(s => s.id === originalId ? spool : s);
      if (originalId !== id) weighLog = weighLog.map(x => x.id === originalId ? {...x,id} : x);
    } else inventory.push(spool);

    saveState(); closeSpoolDialog(); renderAll(); showToast(originalId ? 'Spool updated.' : 'Spool added.');
  }

  function selectForWeigh(id) {
    switchView('weigh');
    $('weighSpool').value = id;
    const spool = inventory.find(s => s.id === id);
    $('grossWeight').value = spool?.gross ?? '';
    $('tareWeight').value = spool?.tare ?? '';
    $('weighLocation').value = spool?.location || '';
    $('weighNotes').value = '';
    updateCalcPreview();
  }

  function updateCalcPreview() {
    const id = $('weighSpool').value;
    const spool = inventory.find(s => s.id === id);
    const gross = num($('grossWeight').value);
    const tare = num($('tareWeight').value);
    $('calcGross').textContent = gross === null ? '—' : `${gross} g`;
    $('calcTare').textContent = tare === null ? '—' : `${tare} g`;
    if (!spool || gross === null || tare === null || gross < tare) {
      $('calcRemaining').textContent = '—'; $('calcPercent').textContent = '—'; $('calcStatus').textContent = gross !== null && tare !== null && gross < tare ? 'Check weights' : '—';
      return;
    }
    const grams = Math.max(0, gross - tare);
    const pct = Math.max(0, Math.min(100, grams / (spool.startWeight || 1000) * 100));
    $('calcRemaining').textContent = `${Math.round(grams)} g`;
    $('calcPercent').textContent = `${pct.toFixed(1)}%`;
    $('calcStatus').textContent = reorderNeeded({...spool,gross,tare}) ? `${statusFor(pct)} · REORDER` : statusFor(pct);
  }

  function saveMeasurement(event) {
    event.preventDefault();
    const id = $('weighSpool').value;
    const spool = inventory.find(s => s.id === id && !isArchived(s));
    const gross = num($('grossWeight').value);
    const tare = num($('tareWeight').value);
    if (!spool || gross === null || tare === null) return showToast('Choose an active spool and enter both weights.');
    if (gross < tare) return showToast('Gross weight cannot be less than tare.');

    spool.gross = gross; spool.tare = tare; spool.updatedAt = nowIso();
    const location = $('weighLocation').value.trim(); if (location) spool.location = location;
    const note = $('weighNotes').value.trim();
    const m = measurement(spool);
    weighLog.push(normalizeLogEntry({id,at:spool.updatedAt,gross,tare,remaining:m.grams,percent:m.percent,location:spool.location,note}));
    if (weighLog.length > MAX_LOG_ENTRIES) weighLog = weighLog.slice(-MAX_LOG_ENTRIES);
    saveState(); renderAll(); updateCalcPreview(); showToast(`${id} measurement saved.`);
  }

  function markEmpty(spool) {
    const before = clone(spool);
    spool.visualPercent = 0;
    if (validNum(spool.tare)) spool.gross = Number(spool.tare);
    else spool.gross = null;
    spool.updatedAt = nowIso();
    const m = measurement(spool);
    weighLog.push(normalizeLogEntry({id:spool.id,at:spool.updatedAt,gross:spool.gross,tare:spool.tare,remaining:m.grams,percent:m.percent,location:spool.location,note:'Marked empty'}));
    saveState(); renderAll();
    showToast(`${spool.id} marked empty.`, {label:'Undo', run:() => { inventory = inventory.map(s => s.id === before.id ? before : s); for (let i = weighLog.length - 1; i >= 0; i--) { if (weighLog[i].id === before.id && weighLog[i].note === 'Marked empty') { weighLog.splice(i,1); break; } } saveState(); renderAll(); }});
  }

  function archiveSpool(spool) {
    const archivedAt = nowIso();
    spool.archivedAt = archivedAt; spool.updatedAt = archivedAt;
    saveState(); renderAll();
    showToast(`${spool.id} archived.`, {label:'Undo', run:() => { spool.archivedAt = null; spool.updatedAt = nowIso(); saveState(); renderAll(); }});
  }

  function restoreSpool(spool) { spool.archivedAt = null; spool.updatedAt = nowIso(); saveState(); renderAll(); showToast(`${spool.id} restored.`); }

  function permanentlyDeleteSpool(spool) {
    if (!confirm(`Permanently delete archived spool ${spool.id} and its measurement history? This cannot be undone.`)) return;
    inventory = inventory.filter(s => s.id !== spool.id);
    weighLog = weighLog.filter(x => x.id !== spool.id);
    saveState(); renderAll(); showToast(`${spool.id} permanently deleted.`);
  }

  async function copySpoolLink(id) {
    const url = new URL(location.href);
    url.hash = `spool=${encodeURIComponent(id)}`;
    try { await navigator.clipboard.writeText(url.toString()); showToast(`Link copied for ${id}.`); }
    catch { prompt('Copy this spool link:', url.toString()); }
  }

  function focusSpool(id) {
    switchView('inventory');
    $('searchInput').value = id;
    $('lifecycleFilter').value = 'all';
    renderInventory();
    setTimeout(() => {
      const card = [...document.querySelectorAll('.spool-card')].find(el => el.dataset.id === id);
      card?.scrollIntoView({behavior:'smooth',block:'center'});
    }, 80);
  }

  function download(name, content, type) {
    const blob = new Blob([content], {type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function markBackup() { meta.lastBackupAt = nowIso(); saveState(); renderDataHealth(); }

  function exportJson() {
    const exportedAt = nowIso();
    download(`filament-inventory-${VERSION_INFO.DISPLAY_VERSION}-${exportedAt.slice(0,10)}.json`, JSON.stringify({version:DATA_SCHEMA_VERSION,appVersion:APP_VERSION,exportedAt,meta,spools:inventory,weighLog},null,2), 'application/json');
    markBackup(); showToast('JSON backup exported.');
  }

  function csvCell(value) { const s = String(value ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; }

  function exportCsv() {
    const headers = ['ID','Brand','Material','Color','Color Hex','Spool Type','Starting g','Visual %','Gross g','Tare g','Effective Remaining g','Effective %','Status','Reorder Needed','Reorder Threshold g','Location','Opened','Bagged','Last Dried Date','Purchase Source','Purchase Price','Purchase Date','Confidence','Archived','Notes','Created','Updated'];
    const rows = inventory.map(s => { const m = measurement(s); return [s.id,s.brand,s.material,s.colorName,s.colorHex,s.spoolType,s.startWeight,s.visualPercent ?? '',s.gross ?? '',s.tare ?? '',m.grams ?? '',m.percent ?? '',statusFor(m.percent),reorderNeeded(s)?'Yes':'No',s.reorderThreshold,s.location,s.opened,s.bagged,s.lastDriedDate,s.purchaseSource,s.purchasePrice ?? '',s.purchaseDate,s.confidence,isArchived(s)?'Yes':'No',s.notes,s.createdAt ?? '',s.updatedAt ?? '']; });
    download(`filament-inventory-${VERSION_INFO.DISPLAY_VERSION}-${new Date().toISOString().slice(0,10)}.csv`, [headers,...rows].map(r => r.map(csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8');
    markBackup(); showToast('CSV inventory exported.');
  }

  function exportHistoryCsv() {
    const headers = ['ID','Timestamp','Gross g','Tare g','Remaining g','Percent','Location','Note'];
    const rows = weighLog.slice().sort((a,b) => new Date(b.at)-new Date(a.at)).map(x => [x.id,x.at,x.gross ?? '',x.tare ?? '',x.remaining ?? '',x.percent ?? '',x.location,x.note]);
    download(`filament-measurements-${VERSION_INFO.DISPLAY_VERSION}-${new Date().toISOString().slice(0,10)}.csv`, [headers,...rows].map(r => r.map(csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8');
    markBackup(); showToast('Measurement history exported.');
  }

  function parseCsv(text) {
    const rows = []; let row = []; let field = ''; let quoted = false;
    for (let i=0;i<text.length;i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i+1] === '"') { field += '"'; i++; }
        else if (c === '"') quoted = false;
        else field += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row=[]; field=''; }
      else if (c !== '\r') field += c;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(v => String(v).trim() !== ''));
  }

  function headerIndex(headers, ...names) {
    const lower = headers.map(h => String(h).trim().toLowerCase());
    for (const name of names) { const i = lower.indexOf(name.toLowerCase()); if (i >= 0) return i; }
    return -1;
  }

  async function importCsv(file) {
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) throw new Error('CSV has no data rows.');
      const h = rows[0];
      const idx = {
        id:headerIndex(h,'ID','Spool ID'), brand:headerIndex(h,'Brand'), material:headerIndex(h,'Material','Material / Type'), colorName:headerIndex(h,'Color','Color / Finish'), colorHex:headerIndex(h,'Color Hex'), spoolType:headerIndex(h,'Spool Type','Spool Format'), startWeight:headerIndex(h,'Starting g','Starting Filament (g)'), visualPercent:headerIndex(h,'Visual %','Visual Estimate (%)'), gross:headerIndex(h,'Gross g','Gross Weight (g)'), tare:headerIndex(h,'Tare g','Tare Weight (g)'), location:headerIndex(h,'Location'), opened:headerIndex(h,'Opened'), bagged:headerIndex(h,'Bagged'), lastDriedDate:headerIndex(h,'Last Dried Date'), purchaseSource:headerIndex(h,'Purchase Source'), purchasePrice:headerIndex(h,'Purchase Price'), purchaseDate:headerIndex(h,'Purchase Date'), confidence:headerIndex(h,'Confidence'), reorderThreshold:headerIndex(h,'Reorder Threshold g'), archived:headerIndex(h,'Archived'), notes:headerIndex(h,'Notes')
      };
      if (idx.id < 0) throw new Error('CSV must contain an ID column.');
      const imported = rows.slice(1).map(r => normalizeSpool({
        id:r[idx.id], brand:idx.brand>=0?r[idx.brand]:'Unknown', material:idx.material>=0?r[idx.material]:'Unknown', colorName:idx.colorName>=0?r[idx.colorName]:'Unknown', colorHex:idx.colorHex>=0?r[idx.colorHex]:'#64748b', spoolType:idx.spoolType>=0?r[idx.spoolType]:'Unknown', startWeight:idx.startWeight>=0?num(r[idx.startWeight]):1000, visualPercent:idx.visualPercent>=0?num(r[idx.visualPercent]):null, gross:idx.gross>=0?num(r[idx.gross]):null, tare:idx.tare>=0?num(r[idx.tare]):null, location:idx.location>=0?r[idx.location]:'', opened:idx.opened>=0?r[idx.opened]:'Unknown', bagged:idx.bagged>=0?r[idx.bagged]:'Unknown', lastDriedDate:idx.lastDriedDate>=0?r[idx.lastDriedDate]:'', purchaseSource:idx.purchaseSource>=0?r[idx.purchaseSource]:'', purchasePrice:idx.purchasePrice>=0?num(r[idx.purchasePrice]):null, purchaseDate:idx.purchaseDate>=0?r[idx.purchaseDate]:'', confidence:idx.confidence>=0?r[idx.confidence]:'Unknown', reorderThreshold:idx.reorderThreshold>=0?num(r[idx.reorderThreshold]):DEFAULT_REORDER_GRAMS, archivedAt:idx.archived>=0 && String(r[idx.archived]).trim().toLowerCase()==='yes'?nowIso():null, notes:idx.notes>=0?r[idx.notes]:'', createdAt:nowIso(), updatedAt:nowIso()
      })).filter(s => s.id);
      if (!imported.length) throw new Error('No usable spool rows found.');
      const duplicates = new Set(); imported.forEach((s,i) => { if (imported.findIndex(x => x.id.toLowerCase() === s.id.toLowerCase()) !== i) duplicates.add(s.id); });
      if (duplicates.size) throw new Error(`Duplicate IDs in CSV: ${[...duplicates].join(', ')}`);
      if (!confirm(`Merge ${imported.length} CSV spool records into this browser? Matching IDs will be updated; new IDs will be added.`)) return;
      const byId = new Map(inventory.map(s => [s.id.toLowerCase(),s]));
      imported.forEach(s => { const old = byId.get(s.id.toLowerCase()); if (old) inventory = inventory.map(x => x.id.toLowerCase() === s.id.toLowerCase() ? normalizeSpool({...old,...s,createdAt:old.createdAt || s.createdAt}) : x); else inventory.push(s); });
      saveState(); renderAll(); showToast(`${imported.length} CSV records merged.`);
    } catch (error) { alert(`CSV import failed: ${error.message}`); }
  }

  async function importJson(file) {
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || !Array.isArray(parsed.spools)) throw new Error('JSON does not contain a spools array.');
      const incoming = parsed.spools.map(normalizeSpool).filter(s => s.id);
      if (!incoming.length) throw new Error('No usable spool records found.');
      const mode = confirm(`Import ${incoming.length} spools. Press OK to REPLACE local inventory, or Cancel to MERGE by spool ID.`) ? 'replace' : 'merge';
      if (mode === 'replace') {
        if (!confirm('Replace all local inventory and measurement history with this backup?')) return;
        inventory = incoming;
        weighLog = Array.isArray(parsed.weighLog) ? parsed.weighLog.map(normalizeLogEntry).filter(x => x.id) : [];
      } else {
        const byId = new Map(inventory.map(s => [s.id.toLowerCase(),s]));
        incoming.forEach(s => { const old = byId.get(s.id.toLowerCase()); if (old) inventory = inventory.map(x => x.id.toLowerCase() === s.id.toLowerCase() ? normalizeSpool({...old,...s,createdAt:old.createdAt || s.createdAt}) : x); else inventory.push(s); });
        if (Array.isArray(parsed.weighLog)) {
          const existingKeys = new Set(weighLog.map(x => `${x.id}|${x.at}|${x.gross}|${x.tare}`));
          parsed.weighLog.map(normalizeLogEntry).forEach(x => { const key = `${x.id}|${x.at}|${x.gross}|${x.tare}`; if (!existingKeys.has(key)) { weighLog.push(x); existingKeys.add(key); } });
        }
      }
      meta.lastBackupAt = parsed.meta?.lastBackupAt || parsed.exportedAt || meta.lastBackupAt;
      saveState(); renderAll(); showToast(`Backup ${mode === 'replace' ? 'restored' : 'merged'}.`);
    } catch (error) { alert(`Import failed: ${error.message}`); }
  }

  function resetStarter() {
    if (!confirm('Reset all local edits and restore the 21-spool starter inventory? This replaces current local data.')) return;
    const state = starterState(); inventory = state.spools; weighLog = state.weighLog; meta = state.meta; saveState(); renderAll(); showToast('Starter inventory restored.');
  }

  function handleInitialHash() {
    const hash = location.hash.slice(1);
    const params = new URLSearchParams(hash.replace(/^\?/,''));
    const spoolId = params.get('spool');
    const view = params.get('view');
    if (spoolId) focusSpool(spoolId);
    else if (view && ['dashboard','inventory','weigh','history','data'].includes(view)) switchView(view);
  }

  function bindEvents() {
    document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
    document.querySelectorAll('[data-jump]').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.jump)));
    ['addTopBtn','heroAddBtn','inventoryAddBtn','mobileAddBtn'].forEach(id => $(id)?.addEventListener('click', () => openSpoolDialog()));
    $('dialogCloseBtn').addEventListener('click', closeSpoolDialog); $('cancelSpoolBtn').addEventListener('click', closeSpoolDialog); $('spoolForm').addEventListener('submit', saveSpoolFromForm);

    ['searchInput','materialFilter','statusFilter','locationFilter','lifecycleFilter','sortSelect'].forEach(id => $(id).addEventListener(id === 'searchInput' ? 'input' : 'change', renderInventory));
    $('clearFiltersBtn').addEventListener('click', () => { $('searchInput').value=''; $('materialFilter').value=''; $('statusFilter').value=''; $('locationFilter').value=''; $('lifecycleFilter').value='active'; $('sortSelect').value='id'; renderInventory(); });

    document.addEventListener('click', event => {
      const open = event.target.closest('[data-open-id]'); if (open) focusSpool(open.dataset.openId);
    });

    $('inventoryGrid').addEventListener('click', event => {
      const btn = event.target.closest('button[data-action]'); if (!btn) return;
      const spool = inventory.find(s => s.id === btn.dataset.id); if (!spool) return;
      const action = btn.dataset.action;
      if (action === 'edit') openSpoolDialog(spool);
      else if (action === 'weigh') selectForWeigh(spool.id);
      else if (action === 'empty' && confirm(`Mark ${spool.id} as empty?`)) markEmpty(spool);
      else if (action === 'archive' && confirm(`Archive ${spool.id}? Its history will be preserved.`)) archiveSpool(spool);
      else if (action === 'restore') restoreSpool(spool);
      else if (action === 'delete') permanentlyDeleteSpool(spool);
      else if (action === 'copylink') copySpoolLink(spool.id);
      else if (action === 'focus') focusSpool(spool.id);
    });

    ['grossWeight','tareWeight','weighSpool'].forEach(id => $(id).addEventListener(id === 'weighSpool' ? 'change' : 'input', updateCalcPreview));
    $('weighSpool').addEventListener('change', () => { const s = inventory.find(x => x.id === $('weighSpool').value); $('weighLocation').value = s?.location || ''; });
    $('weighForm').addEventListener('submit', saveMeasurement);

    $('historySearch').addEventListener('input', renderHistory);
    $('exportHistoryBtn').addEventListener('click', exportHistoryCsv);

    $('exportTopBtn').addEventListener('click', exportJson); $('exportJsonBtn').addEventListener('click', exportJson); $('exportCsvBtn').addEventListener('click', exportCsv);
    $('importJsonBtn').addEventListener('click', () => $('importJsonFile').click());
    $('importJsonFile').addEventListener('change', event => { const file = event.target.files?.[0]; if (file) importJson(file); event.target.value=''; });
    $('importCsvBtn').addEventListener('click', () => $('importCsvFile').click());
    $('importCsvFile').addEventListener('change', event => { const file = event.target.files?.[0]; if (file) importCsv(file); event.target.value=''; });
    $('resetBtn').addEventListener('click', resetStarter);

    $('installBtn').addEventListener('click', async () => {
      if (!deferredInstallPrompt) return showToast('On iPhone/iPad: Share → Add to Home Screen.');
      deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; $('installBtn').disabled = true;
    });

    window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredInstallPrompt = event; $('installBtn').disabled = false; });
    window.addEventListener('appinstalled', () => { deferredInstallPrompt = null; $('installBtn').disabled = true; showToast('App installed.'); });
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !(location.protocol === 'https:' || location.hostname === 'localhost')) return;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      reg.update().catch(() => {});
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) showToast('A new version is ready.', {label:'Reload', run:() => location.reload()});
        });
      });
    } catch (error) { console.warn('Service worker registration failed', error); }
  }

  function init() {
    const state = loadState(); inventory = state.spools; weighLog = state.weighLog; meta = state.meta;
    bindEvents(); renderAll(); updateCalcPreview(); handleInitialHash(); registerServiceWorker();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
