(() => {
  'use strict';

  const STORAGE_KEY = 'filament-inventory-v1';
  const APP_VERSION = 2;
  const DEFAULT_REORDER_GRAMS = 250;
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

  let inventory = [];
  let weighLog = [];
  let toastTimer;

  function normalizeSpool(spool) {
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
      confidence: String(spool.confidence || 'Unknown'),
      opened: normalizeTriState(spool.opened),
      bagged: normalizeTriState(spool.bagged),
      purchaseSource: String(spool.purchaseSource || '').trim(),
      purchasePrice: validNum(spool.purchasePrice) && Number(spool.purchasePrice) >= 0 ? Number(spool.purchasePrice) : null,
      purchaseDate: /^\d{4}-\d{2}-\d{2}$/.test(String(spool.purchaseDate || '')) ? String(spool.purchaseDate) : '',
      reorderThreshold: validNum(spool.reorderThreshold) && Number(spool.reorderThreshold) >= 0 ? Number(spool.reorderThreshold) : DEFAULT_REORDER_GRAMS,
      notes: String(spool.notes || '').trim(),
      updatedAt: spool.updatedAt || null
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

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {spools: clone(starterInventory).map(normalizeSpool), weighLog: []};
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.spools)) throw new Error('Invalid inventory backup');
      return {
        spools: parsed.spools.map(normalizeSpool).filter(s => s.id),
        weighLog: Array.isArray(parsed.weighLog) ? parsed.weighLog.map(normalizeLogEntry).filter(x => x.id) : []
      };
    } catch (error) {
      console.warn('Could not load inventory; using starter data.', error);
      return {spools: clone(starterInventory).map(normalizeSpool), weighLog: []};
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({version:APP_VERSION, savedAt:nowIso(), spools:inventory, weighLog}));
  }

  function measurement(spool) {
    const start = Number(spool.startWeight) || 1000;
    if (validNum(spool.gross) && validNum(spool.tare) && Number(spool.gross) >= Number(spool.tare)) {
      const grams = Math.max(0, Math.min(start, Number(spool.gross) - Number(spool.tare)));
      return {grams, percent: Math.round((grams / start) * 1000) / 10, source:'Measured'};
    }
    if (validNum(spool.visualPercent)) {
      const percent = Math.max(0, Math.min(100, Number(spool.visualPercent)));
      return {grams: Math.round(start * percent / 100), percent, source:'Visual'};
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
    const m = measurement(spool);
    return m.grams !== null && m.grams <= Number(spool.reorderThreshold ?? DEFAULT_REORDER_GRAMS);
  }

  function showToast(message) {
    const el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  function switchView(view) {
    document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.id === `${view}View`));
    document.querySelectorAll('.tab').forEach(el => el.setAttribute('aria-selected', String(el.dataset.view === view)));
    window.scrollTo({top:0, behavior:'smooth'});
  }

  function renderAll() {
    renderDashboard();
    renderFilters();
    renderInventory();
    renderWeighOptions();
    renderRecentMeasurements();
  }

  function renderDashboard() {
    const known = inventory.map(s => ({s, m:measurement(s)})).filter(x => x.m.grams !== null);
    const measured = known.filter(x => x.m.source === 'Measured').length;
    const knownGrams = known.reduce((sum, x) => sum + x.m.grams, 0);
    const reorder = inventory.filter(reorderNeeded).length;
    const unknown = inventory.filter(s => measurement(s).percent === null).length;

    $('metrics').innerHTML = [
      ['Active spools', inventory.length, 'Unique inventory records'],
      ['Known filament', `${(knownGrams/1000).toFixed(1)} kg`, `${known.length} spools have a usable estimate`],
      ['Measured', measured, `${weighLog.length} measurements logged`],
      ['Reorder', reorder, `${unknown} spools still need a fill check`]
    ].map(([label,value,sub]) => `<article class="metric"><span class="metric-label">${esc(label)}</span><strong class="metric-value">${esc(value)}</strong><div class="metric-sub">${esc(sub)}</div></article>`).join('');

    const counts = Object.fromEntries(STATUS_ORDER.map(x => [x,0]));
    inventory.forEach(s => counts[statusFor(measurement(s).percent)]++);
    const max = Math.max(1, ...Object.values(counts));
    $('statusBars').innerHTML = STATUS_ORDER.map(status => `<div class="status-row"><div class="status-label"><i class="dot" style="color:${STATUS_COLORS[status]};background:${STATUS_COLORS[status]}"></i>${status}</div><div class="bar"><i style="width:${counts[status]/max*100}%;background:${STATUS_COLORS[status]}"></i></div><div class="bar-count">${counts[status]}</div></div>`).join('');

    const materials = {};
    inventory.forEach(s => materials[s.material || 'Unknown'] = (materials[s.material || 'Unknown'] || 0) + 1);
    $('materialGrid').innerHTML = Object.entries(materials).sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0])).map(([name,count]) => `<article class="material-card"><div class="row"><strong>${esc(name)}</strong><strong>${count}</strong></div><small>${inventory.length ? Math.round(count/inventory.length*100) : 0}% of active spools</small></article>`).join('');

    const reorderItems = inventory.filter(reorderNeeded).map(s => ({s,m:measurement(s),kind:'REORDER'})).sort((a,b) => a.m.grams-b.m.grams);
    const lowItems = inventory.map(s => ({s,m:measurement(s),kind:'LOW'})).filter(x => x.m.percent !== null && !reorderNeeded(x.s)).sort((a,b) => a.m.percent-b.m.percent);
    const unknownItems = inventory.filter(s => measurement(s).percent === null).map(s => ({s,m:measurement(s),kind:'CHECK'}));
    const queue = [...reorderItems, ...lowItems, ...unknownItems].slice(0,5);
    $('priorityList').innerHTML = queue.length ? queue.map(({s,m,kind}) => {
      const status = statusFor(m.percent);
      const right = kind === 'REORDER' ? 'REORDER' : (m.percent === null ? 'CHECK' : `${Math.round(m.percent)}%`);
      return `<div class="quick-item"><i class="dot" style="color:${kind === 'REORDER' ? '#ef4444' : STATUS_COLORS[status]};background:${kind === 'REORDER' ? '#ef4444' : STATUS_COLORS[status]}"></i><div><strong>${esc(s.id)} · ${esc(s.brand)} ${esc(s.material)}</strong><br><span>${esc(s.colorName)} · ${esc(s.location || 'Unassigned')}</span></div><span>${esc(right)}</span></div>`;
    }).join('') : '<div class="empty"><strong>No urgent items</strong>No current reorder or fill-check items.</div>';
  }

  function uniqueValues(key) {
    return [...new Set(inventory.map(s => String(s[key] || '').trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b));
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

  function filteredInventory() {
    const q = $('searchInput').value.trim().toLowerCase();
    const material = $('materialFilter').value;
    const status = $('statusFilter').value;
    const location = $('locationFilter').value;
    return inventory.filter(s => {
      const hay = [s.id,s.brand,s.material,s.colorName,s.spoolType,s.location,s.purchaseSource,s.notes].join(' ').toLowerCase();
      const statusMatch = !status || (status === 'Reorder needed' ? reorderNeeded(s) : statusFor(measurement(s).percent) === status);
      return (!q || hay.includes(q)) && (!material || s.material === material) && statusMatch && (!location || s.location === location);
    }).sort((a,b) => a.id.localeCompare(b.id, undefined, {numeric:true}));
  }

  function renderInventory() {
    const list = filteredInventory();
    $('inventoryCountText').textContent = `${list.length} of ${inventory.length} spools`;
    if (!list.length) {
      $('inventoryGrid').innerHTML = '<div class="empty" style="grid-column:1/-1"><strong>No matching spools</strong>Change a filter or add a new spool.</div>';
      return;
    }

    $('inventoryGrid').innerHTML = list.map(s => {
      const m = measurement(s);
      const status = statusFor(m.percent);
      const color = STATUS_COLORS[status];
      const pct = m.percent === null ? 0 : Math.max(0, Math.min(100, m.percent));
      const reorderBadge = reorderNeeded(s) ? '<span class="confidence" style="color:#fecaca;border-color:rgba(239,68,68,.35)">REORDER</span>' : `<span class="confidence">${esc(s.confidence)}</span>`;
      const purchase = s.purchaseSource || s.purchaseDate || s.purchasePrice !== null ? [s.purchaseSource, s.purchaseDate, s.purchasePrice !== null ? `$${s.purchasePrice.toFixed(2)}` : ''].filter(Boolean).join(' · ') : 'Not recorded';
      return `<article class="spool-card" data-id="${esc(s.id)}">
        <div class="spool-head"><div class="swatch" style="background:${esc(s.colorHex)}"></div><div class="spool-title"><h4>${esc(s.id)} · ${esc(s.colorName)}</h4><p>${esc(s.brand)} · ${esc(s.material)}</p></div>${reorderBadge}</div>
        <div class="spool-body">
          <div class="fill-top"><strong>${m.percent === null ? '—' : `${Math.round(m.percent)}%`}</strong><small>${m.grams === null ? 'Fill unknown' : `~${Math.round(m.grams)} g`}<br>${esc(m.source)}</small></div>
          <div class="progress"><i style="width:${pct}%;background:${color}"></i></div>
          <div class="meta">
            <div><span>Status</span><strong style="color:${color}">${status}</strong></div>
            <div><span>Location</span><strong>${esc(s.location || 'Unassigned')}</strong></div>
            <div><span>Opened / Bagged</span><strong>${esc(s.opened)} / ${esc(s.bagged)}</strong></div>
            <div><span>Reorder at</span><strong>${Math.round(s.reorderThreshold)} g</strong></div>
            <div><span>Purchase</span><strong title="${esc(purchase)}">${esc(purchase)}</strong></div>
            <div><span>Updated</span><strong>${s.updatedAt ? new Date(s.updatedAt).toLocaleDateString() : 'Photo audit'}</strong></div>
          </div>
        </div>
        <div class="card-actions"><button class="btn" data-action="weigh" data-id="${esc(s.id)}" type="button">Weigh</button><button class="btn" data-action="edit" data-id="${esc(s.id)}" type="button">Edit</button><button class="btn btn-danger" data-action="delete" data-id="${esc(s.id)}" type="button">Delete</button></div>
      </article>`;
    }).join('');
  }

  function renderWeighOptions() {
    const select = $('weighSpool');
    const current = select.value;
    select.innerHTML = inventory.slice().sort((a,b) => a.id.localeCompare(b.id,undefined,{numeric:true})).map(s => `<option value="${esc(s.id)}">${esc(s.id)} — ${esc(s.brand)} ${esc(s.material)} — ${esc(s.colorName)}</option>`).join('');
    if ([...select.options].some(o => o.value === current)) select.value = current;
  }

  function renderRecentMeasurements() {
    const el = $('recentMeasurements');
    if (!el) return;
    const recent = weighLog.slice().sort((a,b) => new Date(b.at)-new Date(a.at)).slice(0,6);
    if (!recent.length) {
      el.innerHTML = '<div class="empty" style="padding:20px"><strong>No measurements yet</strong>Weigh a spool to start the history.</div>';
      return;
    }
    el.innerHTML = recent.map(x => `<div class="quick-item"><i class="dot" style="color:#38bdf8;background:#38bdf8"></i><div><strong>${esc(x.id)} · ${x.remaining === null ? '—' : `${Math.round(x.remaining)} g`}</strong><br><span>${new Date(x.at).toLocaleString()}${x.location ? ` · ${esc(x.location)}` : ''}</span></div><span>${x.percent === null ? '—' : `${x.percent.toFixed(1)}%`}</span></div>`).join('');
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
    $('notes').value = spool?.notes || '';
    $('spoolDialog').showModal();
  }

  function closeSpoolDialog() {
    if ($('spoolDialog').open) $('spoolDialog').close();
  }

  function saveSpoolFromForm(event) {
    event.preventDefault();
    const originalId = $('editOriginalId').value.trim();
    const id = $('spoolId').value.trim();
    if (!id) return showToast('Spool ID is required.');
    if (inventory.some(s => s.id.toLowerCase() === id.toLowerCase() && s.id !== originalId)) return showToast('That spool ID already exists.');

    const gross = num($('grossEdit').value);
    const tare = num($('tareEdit').value);
    if (gross !== null && tare !== null && gross < tare) return showToast('Gross weight cannot be less than tare weight.');

    const spool = normalizeSpool({
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
      notes:$('notes').value,
      updatedAt:nowIso()
    });

    if (originalId) {
      inventory = inventory.map(s => s.id === originalId ? spool : s);
      if (originalId !== id) weighLog = weighLog.map(x => x.id === originalId ? {...x, id} : x);
    } else {
      inventory.push(spool);
    }

    saveState();
    closeSpoolDialog();
    renderAll();
    showToast(originalId ? 'Spool updated.' : 'Spool added.');
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
      $('calcRemaining').textContent = '—';
      $('calcPercent').textContent = '—';
      $('calcStatus').textContent = gross !== null && tare !== null && gross < tare ? 'Check weights' : '—';
      return;
    }
    const grams = Math.max(0, gross - tare);
    const pct = Math.max(0, Math.min(100, grams / (spool.startWeight || 1000) * 100));
    $('calcRemaining').textContent = `${Math.round(grams)} g`;
    $('calcPercent').textContent = `${pct.toFixed(1)}%`;
    $('calcStatus').textContent = reorderNeeded({...spool, gross, tare}) ? `${statusFor(pct)} · REORDER` : statusFor(pct);
  }

  function saveMeasurement(event) {
    event.preventDefault();
    const id = $('weighSpool').value;
    const spool = inventory.find(s => s.id === id);
    const gross = num($('grossWeight').value);
    const tare = num($('tareWeight').value);
    if (!spool || gross === null || tare === null) return showToast('Choose a spool and enter both weights.');
    if (gross < tare) return showToast('Gross weight cannot be less than tare.');

    spool.gross = gross;
    spool.tare = tare;
    spool.updatedAt = nowIso();
    const location = $('weighLocation').value.trim();
    if (location) spool.location = location;
    const note = $('weighNotes').value.trim();
    if (note) spool.notes = [spool.notes, `${new Date().toLocaleDateString()}: ${note}`].filter(Boolean).join(' • ');

    const m = measurement(spool);
    weighLog.push(normalizeLogEntry({id, at:spool.updatedAt, gross, tare, remaining:m.grams, percent:m.percent, location:spool.location, note}));
    if (weighLog.length > 500) weighLog = weighLog.slice(-500);

    saveState();
    renderAll();
    updateCalcPreview();
    showToast(`${id} measurement saved.`);
  }

  function download(name, content, type) {
    const blob = new Blob([content], {type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportJson() {
    download(`filament-inventory-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify({version:APP_VERSION, exportedAt:nowIso(), spools:inventory, weighLog}, null, 2), 'application/json');
  }

  function csvCell(value) {
    const s = String(value ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  }

  function exportCsv() {
    const headers = ['ID','Brand','Material','Color','Spool Type','Starting g','Visual %','Gross g','Tare g','Effective Remaining g','Effective %','Status','Reorder Needed','Reorder Threshold g','Location','Opened','Bagged','Purchase Source','Purchase Price','Purchase Date','Confidence','Notes','Updated'];
    const rows = inventory.map(s => {
      const m = measurement(s);
      return [s.id,s.brand,s.material,s.colorName,s.spoolType,s.startWeight,s.visualPercent ?? '',s.gross ?? '',s.tare ?? '',m.grams ?? '',m.percent ?? '',statusFor(m.percent),reorderNeeded(s) ? 'Yes' : 'No',s.reorderThreshold,s.location,s.opened,s.bagged,s.purchaseSource,s.purchasePrice ?? '',s.purchaseDate,s.confidence,s.notes,s.updatedAt ?? ''];
    });
    download(`filament-inventory-${new Date().toISOString().slice(0,10)}.csv`, [headers,...rows].map(r => r.map(csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8');
  }

  async function importJson(file) {
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || !Array.isArray(parsed.spools)) throw new Error('JSON does not contain a spools array.');
      const incoming = parsed.spools.map(normalizeSpool).filter(s => s.id);
      if (!incoming.length) throw new Error('No usable spool records found.');
      if (!confirm(`Replace local inventory with ${incoming.length} imported spools?`)) return;
      inventory = incoming;
      weighLog = Array.isArray(parsed.weighLog) ? parsed.weighLog.map(normalizeLogEntry).filter(x => x.id) : [];
      saveState();
      renderAll();
      showToast('Backup imported.');
    } catch (error) {
      alert(`Import failed: ${error.message}`);
    }
  }

  function bindEvents() {
    document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
    document.querySelectorAll('[data-jump]').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.jump)));
    ['addTopBtn','heroAddBtn','inventoryAddBtn','mobileAddBtn'].forEach(id => $(id)?.addEventListener('click', () => openSpoolDialog()));

    $('dialogCloseBtn').addEventListener('click', closeSpoolDialog);
    $('cancelSpoolBtn').addEventListener('click', closeSpoolDialog);
    $('spoolForm').addEventListener('submit', saveSpoolFromForm);

    ['searchInput','materialFilter','statusFilter','locationFilter'].forEach(id => $(id).addEventListener(id === 'searchInput' ? 'input' : 'change', renderInventory));
    $('clearFiltersBtn').addEventListener('click', () => {
      $('searchInput').value='';
      $('materialFilter').value='';
      $('statusFilter').value='';
      $('locationFilter').value='';
      renderInventory();
    });

    $('inventoryGrid').addEventListener('click', event => {
      const btn = event.target.closest('button[data-action]');
      if (!btn) return;
      const spool = inventory.find(s => s.id === btn.dataset.id);
      if (!spool) return;
      if (btn.dataset.action === 'edit') openSpoolDialog(spool);
      if (btn.dataset.action === 'weigh') selectForWeigh(spool.id);
      if (btn.dataset.action === 'delete' && confirm(`Delete ${spool.id} — ${spool.colorName}?`)) {
        inventory = inventory.filter(s => s.id !== spool.id);
        weighLog = weighLog.filter(x => x.id !== spool.id);
        saveState();
        renderAll();
        showToast('Spool deleted.');
      }
    });

    ['grossWeight','tareWeight','weighSpool'].forEach(id => $(id).addEventListener(id === 'weighSpool' ? 'change' : 'input', updateCalcPreview));
    $('weighSpool').addEventListener('change', () => {
      const s = inventory.find(x => x.id === $('weighSpool').value);
      $('weighLocation').value = s?.location || '';
    });
    $('weighForm').addEventListener('submit', saveMeasurement);

    $('exportTopBtn').addEventListener('click', exportJson);
    $('exportJsonBtn').addEventListener('click', exportJson);
    $('exportCsvBtn').addEventListener('click', exportCsv);
    $('importJsonBtn').addEventListener('click', () => $('importJsonFile').click());
    $('importJsonFile').addEventListener('change', event => {
      const file = event.target.files?.[0];
      if (file) importJson(file);
      event.target.value='';
    });

    $('resetBtn').addEventListener('click', () => {
      if (!confirm('Reset all local edits and restore the 21-spool photo-audited starter inventory?')) return;
      inventory = clone(starterInventory).map(normalizeSpool);
      weighLog = [];
      saveState();
      renderAll();
      showToast('Starter inventory restored.');
    });
  }

  function init() {
    const state = loadState();
    inventory = state.spools;
    weighLog = state.weighLog;
    bindEvents();
    renderAll();
    updateCalcPreview();
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('/sw.js').catch(error => console.warn('Service worker registration failed', error));
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
