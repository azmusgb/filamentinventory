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
  let pendingLoad = null;
  let renderQueued = false;
  let feederCounter = 0;

  function readState() {
    const value = parse(localStorage.getItem(STORAGE_KEY) || '{}', {});
    return Array.isArray(value?.spools)
      ? {...value, printers:Array.isArray(value.printers) ? value.printers : [], printJobs:Array.isArray(value.printJobs) ? value.printJobs : []}
      : {version:10,spools:[],printers:[],weighLog:[],auditLog:[],printJobs:[],tombstones:{},meta:{}};
  }

  function writeState(value) {
    value.savedAt = nowIso();
    value.printers = core.normalizePrinters(value.printers).map(printer => ({...printer,owner:currentUser()}));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    globalThis.FilamentInventoryEvents?.emit?.('inventory:changed',{source:'printer'});
  }

  function toast(message) {
    const node = document.getElementById('toast');
    if (!node) return;
    node.textContent = message;
    node.classList.add('show');
    setTimeout(() => node.classList.remove('show'), 2800);
  }

  function activeRows(value = readState()) {
    return core.activeSpools(value).slice().sort((a,b) => String(a.id).localeCompare(String(b.id), undefined, {numeric:true}));
  }

  function slotLabel(spool) {
    const feeder = text(spool.feederName);
    const slot = text(spool.feederSlot);
    if (!feeder) return 'Direct / external spool';
    return [feeder, slot ? `Slot ${slot}` : 'No slot'].join(' · ');
  }

  function ensureLegacyPrinterRecords(value) {
    const configured = core.normalizePrinters(value.printers);
    const names = new Set(configured.map(printer => printer.name.toLowerCase()));
    const inferred = core.legacyPrintersFromSpools(value).filter(printer => !names.has(printer.name.toLowerCase()));
    if (!inferred.length) return value;
    const at = nowIso();
    value.printers = [...configured, ...inferred.map(printer => ({
      ...printer,
      owner:currentUser(),
      createdAt:printer.createdAt || at,
      updatedAt:printer.updatedAt || at,
      legacyInferred:true,
    }))];
    writeState(value);
    return value;
  }

  function pageMarkup() {
    return `<div class="printer-command">
      <section class="panel printer-hero">
        <div><h2 id="householdTitle">Printers & loaded filament</h2><p class="muted">Configure each printer once, define its AMS or feeder slots, then place spools into real targets instead of retyping printer names.</p></div>
        <div class="printer-hero-actions"><span class="printer-private-chip" id="printerPrivateChip"></span><button class="btn btn-primary" type="button" data-printer-add>+ Add printer</button></div>
      </section>
      <div class="printer-metrics" id="printerMetrics"></div>
      <section class="panel printer-panel">
        <div class="panel-head"><div><h3>My printers</h3><p>Printer identity, hardware, location and AMS / feeder configuration.</p></div><button class="btn" type="button" data-printer-add>Add printer</button></div>
        <div class="printer-registry" id="printerRegistry"></div>
      </section>
      <section class="panel printer-panel">
        <div class="panel-head"><div><h3>Loaded now</h3><p>Current printer, feeder and slot occupancy.</p></div><div class="printer-panel-actions"><button class="btn" type="button" data-printer-scan>Scan spool</button><button class="btn btn-primary" type="button" data-printer-load-open>Load / move spool</button></div></div>
        <div class="printer-board" id="printerBoard"></div>
      </section>
      <section class="panel printer-panel"><div class="panel-head"><div><h3>Needs attention</h3><p>Only low, unmeasured, or conflicting loaded spools appear here.</p></div></div><div class="printer-attention" id="printerAttention"></div></section>
    </div>`;
  }

  function ensureDialogs() {
    if (!document.querySelector('.printer-config-dialog')) {
      const dialog = document.createElement('dialog');
      dialog.className = 'printer-config-dialog';
      dialog.setAttribute('aria-labelledby','printerConfigTitle');
      dialog.innerHTML = `<form id="printerConfigForm">
        <div class="dialog-head"><div><span class="eyebrow">Printer setup</span><h3 id="printerConfigTitle">Add printer</h3></div><button class="btn icon-btn" type="button" data-printer-config-close aria-label="Close">×</button></div>
        <div class="dialog-body printer-config-body">
          <input id="printerConfigId" type="hidden">
          <div class="printer-config-grid">
            <div class="form-field full"><label for="printerConfigName">Printer name</label><input class="field" id="printerConfigName" maxlength="80" required placeholder="P1S"></div>
            <div class="form-field"><label for="printerConfigManufacturer">Manufacturer</label><input class="field" id="printerConfigManufacturer" maxlength="80" placeholder="Bambu Lab"></div>
            <div class="form-field"><label for="printerConfigModel">Model</label><input class="field" id="printerConfigModel" maxlength="80" placeholder="P1S"></div>
            <div class="form-field"><label for="printerConfigLocation">Location</label><input class="field" id="printerConfigLocation" maxlength="100" placeholder="Print room"></div>
            <div class="form-field"><label for="printerConfigNozzleSize">Nozzle size</label><input class="field" id="printerConfigNozzleSize" maxlength="24" placeholder="0.4 mm"></div>
            <div class="form-field"><label for="printerConfigNozzleMaterial">Nozzle material</label><input class="field" id="printerConfigNozzleMaterial" maxlength="60" placeholder="Hardened steel"></div>
            <div class="form-field"><label for="printerConfigBuildPlate">Build plate</label><input class="field" id="printerConfigBuildPlate" maxlength="100" placeholder="Textured PEI"></div>
            <div class="form-field"><label for="printerConfigFirmware">Firmware</label><input class="field" id="printerConfigFirmware" maxlength="80" placeholder="Optional"></div>
            <div class="form-field full"><label for="printerConfigSerial">Serial number</label><input class="field" id="printerConfigSerial" maxlength="100" autocomplete="off" placeholder="Optional"></div>
          </div>
          <section class="printer-feeder-editor" aria-labelledby="printerFeedersTitle">
            <div class="printer-feeder-editor-head"><div><span class="eyebrow">AMS / feeders</span><h4 id="printerFeedersTitle">Filament inputs</h4><p>Define each AMS, feeder or external bay and how many slots it has.</p></div><button class="btn" type="button" data-feeder-add>+ Add feeder</button></div>
            <div id="printerFeederRows" class="printer-feeder-rows"></div>
          </section>
          <div class="form-field"><label for="printerConfigNotes">Notes</label><textarea class="field" id="printerConfigNotes" rows="3" maxlength="1000" placeholder="Maintenance, accessories, setup notes…"></textarea></div>
          <div class="dialog-actions"><button class="btn" type="button" data-printer-config-close>Cancel</button><button class="btn btn-primary" type="submit">Save printer</button></div>
        </div>
      </form>`;
      document.body.appendChild(dialog);
    }

    if (!document.querySelector('.printer-load-dialog')) {
      const dialog = document.createElement('dialog');
      dialog.className = 'printer-load-dialog';
      dialog.setAttribute('aria-labelledby','printerLoadTitle');
      dialog.innerHTML = `<div class="dialog-head"><div><span class="eyebrow">Printer / AMS</span><h3 id="printerLoadTitle">Load or move a spool</h3></div><button class="btn icon-btn" type="button" data-printer-dialog-close aria-label="Close">×</button></div><div class="dialog-body">
        <div class="printer-context"><div class="form-field"><label for="printerFindMaterial">Material</label><input class="field" id="printerFindMaterial" placeholder="PLA"></div><div class="form-field"><label for="printerFindColor">Color contains</label><input class="field" id="printerFindColor" placeholder="Black"></div></div>
        <div class="printer-candidates" id="printerCandidates"></div>
        <div class="printer-form">
          <div class="form-field full"><label for="moveSpoolV8">Spool</label><select class="select" id="moveSpoolV8"></select></div>
          <div class="form-field"><label for="movePrinterV8">Printer</label><select class="select" id="movePrinterV8"></select></div>
          <div class="form-field"><label for="moveFeederV8">AMS / feeder</label><select class="select" id="moveFeederV8"></select></div>
          <div class="form-field"><label for="moveSlotV8">Slot / bay</label><select class="select" id="moveSlotV8"></select></div>
        </div>
        <div class="printer-load-empty" id="printerLoadEmpty" hidden><strong>Add a printer first.</strong><span>Printer targets are configured once and then reused for every spool placement.</span><button class="btn btn-primary" type="button" data-printer-add-from-load>Add printer</button></div>
        <div class="dialog-actions"><button class="btn" type="button" data-printer-unload-selected>Unload selected</button><button class="btn btn-primary" type="button" data-printer-load-save>Load / move</button></div>
      </div>`;
      document.body.appendChild(dialog);
    }

    if (!document.querySelector('.printer-conflict-dialog')) {
      const dialog = document.createElement('dialog');
      dialog.className = 'printer-conflict-dialog';
      dialog.setAttribute('aria-labelledby','printerConflictTitle');
      dialog.innerHTML = `<div class="dialog-head"><div><span class="eyebrow">Slot occupied</span><h3 id="printerConflictTitle">Replace loaded spool?</h3></div><button class="btn icon-btn" type="button" data-printer-conflict-cancel aria-label="Close">×</button></div><div class="dialog-body"><p class="fi-confirm-copy" data-printer-conflict-copy></p><div class="fi-selected-targets" data-printer-conflict-targets></div><div class="dialog-actions"><button class="btn" type="button" data-printer-conflict-cancel>Cancel</button><button class="btn btn-primary" type="button" data-printer-conflict-accept>Replace spool</button></div></div>`;
      document.body.appendChild(dialog);
    }
  }

  function installView() {
    const view = document.getElementById('householdView');
    if (!view) return false;
    if (view.dataset.printerCommand === '3') return true;
    view.dataset.printerCommand = '3';
    view.setAttribute('aria-labelledby','householdTitle');
    view.innerHTML = pageMarkup();
    ensureDialogs();
    render();
    globalThis.FilamentInventoryNavigation?.register?.('household');
    return true;
  }

  function renderMetrics(value, summary) {
    const node = document.getElementById('printerMetrics');
    if (!node) return;
    const attention = summary.lowLoaded.length + summary.unknownLoaded.length + summary.conflicts.length;
    const rows = [
      ['Printers',summary.printers,summary.printers === 1 ? 'configured printer' : 'configured printers'],
      ['Loaded',summary.loaded,`${summary.loadedPrinters} printer${summary.loadedPrinters === 1 ? '' : 's'} active`],
      ['Loaded filament',`${(summary.knownLoadedGrams/1000).toFixed(2)} kg`,'known remaining'],
      ['Attention',attention,'low · unknown · conflict'],
    ];
    node.innerHTML = rows.map(([label,amount,note]) => `<div class="printer-metric"><span>${esc(label)}</span><strong>${esc(amount)}</strong><small>${esc(note)}</small></div>`).join('');
  }

  function printerSubtitle(printer) {
    return [printer.manufacturer,printer.model].filter(Boolean).join(' · ') || 'Printer details not recorded';
  }

  function renderRegistry(value) {
    const node = document.getElementById('printerRegistry');
    if (!node) return;
    const printers = core.configuredPrinters(value,{includeLegacy:false});
    if (!printers.length) {
      node.innerHTML = '<div class="printer-empty printer-registry-empty"><strong>No printers configured yet.</strong><span>Add your printer once, then define its AMS / feeder slots for faster loading and print planning.</span><button class="btn btn-primary" type="button" data-printer-add>Add printer</button></div>';
      return;
    }
    const loaded = core.loadedSpools(value);
    node.innerHTML = printers.map(printer => {
      const onPrinter = loaded.filter(spool => text(spool.printerId) === printer.id || (!text(spool.printerId) && text(spool.printerName).toLowerCase() === printer.name.toLowerCase()));
      const slotCount = printer.feeders.reduce((sum,feeder) => sum + Number(feeder.slotCount || 0), 0);
      const nozzle = [printer.nozzleSize,printer.nozzleMaterial].filter(Boolean).join(' · ') || 'Not recorded';
      const feederLabel = printer.feeders.length ? `${printer.feeders.length} feeder${printer.feeders.length === 1 ? '' : 's'} · ${slotCount} slot${slotCount === 1 ? '' : 's'}` : 'Direct / external spool only';
      return `<article class="printer-registry-card" data-printer-id="${esc(printer.id)}">
        <div class="printer-registry-main"><div><span class="eyebrow">${printer.legacyInferred ? 'Imported printer' : 'Configured printer'}</span><h4>${esc(printer.name)}</h4><p>${esc(printerSubtitle(printer))}</p></div><span class="printer-loaded-count">${onPrinter.length} loaded</span></div>
        <dl class="printer-spec-grid"><div><dt>Location</dt><dd>${esc(printer.location || 'Not recorded')}</dd></div><div><dt>Nozzle</dt><dd>${esc(nozzle)}</dd></div><div><dt>Build plate</dt><dd>${esc(printer.buildPlate || 'Not recorded')}</dd></div><div><dt>Filament inputs</dt><dd>${esc(feederLabel)}</dd></div></dl>
        <div class="printer-registry-actions"><button class="btn" type="button" data-printer-edit="${esc(printer.id)}">Edit printer</button><button class="btn btn-primary" type="button" data-printer-load-target="${esc(printer.name)}">Load spool</button></div>
      </article>`;
    }).join('');
  }

  function renderBoard(value) {
    const node = document.getElementById('printerBoard');
    if (!node) return;
    const groups = core.printerGroups(value);
    if (!groups.length) {
      node.innerHTML = '<div class="printer-empty"><strong>Nothing is loaded yet.</strong><span>Use Load / move spool to assign filament to a configured printer or AMS slot.</span><button class="btn btn-primary" type="button" data-printer-load-open>Load a spool</button></div>';
      return;
    }
    node.innerHTML = groups.map(group => `<article class="printer-machine"><div class="printer-machine-head"><div><strong>${esc(group.printer)}</strong>${group.printerRecord?.location ? `<small>${esc(group.printerRecord.location)}</small>` : ''}</div><span>${group.rows.length} loaded</span></div><div class="printer-slots">${group.rows.map(spool => {
      const m = core.measurement(spool);
      const low = m.grams !== null && m.grams <= Number(spool.reorderThreshold ?? 250);
      return `<div class="printer-slot" data-low="${low}" data-unknown="${m.grams===null}"><i class="fi-spool-swatch" style="background:${esc(spool.colorHex||'#666d7d')}"></i><div class="printer-slot-label">${esc(slotLabel(spool))}</div><div class="printer-slot-main"><strong>${esc(spool.id)} · ${esc(spool.material||'Unknown')} · ${esc(spool.colorName||'Unknown')}</strong><span>${m.grams===null?'Remaining unknown':`${Math.round(m.grams)} g · ${Math.round(m.percent)}%`}${low?' · Low':''}</span></div><div class="printer-slot-actions"><button class="btn" type="button" data-printer-weigh="${esc(spool.id)}">Weigh</button><button class="btn" type="button" data-printer-edit-load="${esc(spool.id)}">Move</button><button class="btn" type="button" data-printer-unload="${esc(spool.id)}">Unload</button></div></div>`;
    }).join('')}</div></article>`).join('');
  }

  function renderAttention(value, summary) {
    const node = document.getElementById('printerAttention');
    if (!node) return;
    const rows = [];
    summary.conflicts.forEach(group => rows.push({kind:'conflict',id:group[0]?.id,title:'Duplicate slot assignment',detail:group.map(row => row.id).join(', ')}));
    summary.lowLoaded.forEach(spool => { const m=core.measurement(spool); rows.push({kind:'low',id:spool.id,title:`${spool.id} is low`,detail:`${Math.round(m.grams)} g remaining · ${slotLabel(spool)}`}); });
    summary.unknownLoaded.forEach(spool => rows.push({kind:'unknown',id:spool.id,title:`${spool.id} needs a measurement`,detail:slotLabel(spool)}));
    node.innerHTML = rows.length ? rows.map(row => `<div class="printer-attention-row" data-kind="${esc(row.kind)}"><span class="printer-attention-dot"></span><div><strong>${esc(row.title)}</strong><span>${esc(row.detail)}</span></div><button class="btn" type="button" data-printer-${row.kind==='conflict'?'edit-load':'weigh'}="${esc(row.id)}">${row.kind==='conflict'?'Review':'Weigh'}</button></div>`).join('') : '<div class="printer-empty"><strong>No placement issues.</strong><span>Loaded spools are measured, above reorder thresholds, and have no duplicate slot assignments.</span></div>';
  }

  function renderPrinterTargetOptions(value, {printerRef='',feederRef='',slot=''} = {}) {
    const printers = core.configuredPrinters(value,{includeLegacy:false});
    const printerSelect = document.getElementById('movePrinterV8');
    const feederSelect = document.getElementById('moveFeederV8');
    const slotSelect = document.getElementById('moveSlotV8');
    const empty = document.getElementById('printerLoadEmpty');
    const save = document.querySelector('[data-printer-load-save]');
    if (!printerSelect || !feederSelect || !slotSelect) return;

    empty.hidden = printers.length > 0;
    if (save) save.disabled = printers.length === 0;
    printerSelect.disabled = printers.length === 0;
    feederSelect.disabled = printers.length === 0;
    slotSelect.disabled = printers.length === 0;
    printerSelect.innerHTML = printers.length ? printers.map(printer => `<option value="${esc(printer.name)}">${esc(printer.name)}${printer.model && printer.model !== printer.name ? ` — ${esc(printer.model)}` : ''}</option>`).join('') : '<option value="">No printers configured</option>';

    const wantedPrinter = core.printerByRef(value,printerRef);
    if (wantedPrinter && printers.some(printer => printer.id === wantedPrinter.id)) printerSelect.value = wantedPrinter.name;
    else if (printers[0]) printerSelect.value = printers[0].name;

    const printer = core.printerByRef(value,printerSelect.value);
    const feeders = printer?.feeders || [];
    feederSelect.innerHTML = `<option value="">Direct / external spool</option>${feeders.map(feeder => `<option value="${esc(feeder.name)}">${esc(feeder.name)} · ${esc(feeder.type)} · ${feeder.slotCount} slot${feeder.slotCount === 1 ? '' : 's'}</option>`).join('')}`;
    const wantedFeeder = printer ? core.feederByRef(printer,feederRef) : null;
    if (wantedFeeder) feederSelect.value = wantedFeeder.name;

    const feeder = printer ? core.feederByRef(printer,feederSelect.value) : null;
    const slots = feeder ? core.slotsForFeeder(feeder) : [];
    slotSelect.innerHTML = feeder ? slots.map(value => `<option value="${esc(value)}">Slot ${esc(value)}</option>`).join('') : '<option value="">No slot</option>';
    if (feeder && slots.includes(String(slot))) slotSelect.value = String(slot);
  }

  function renderForm(value) {
    const rows = activeRows(value);
    const select = document.getElementById('moveSpoolV8');
    const selected = select?.value;
    if (select) {
      select.innerHTML = rows.map(spool => { const m=core.measurement(spool); const remain=m.grams===null?'unknown':`${Math.round(m.grams)} g`; return `<option value="${esc(spool.id)}">${esc(spool.id)} — ${esc(spool.material||'Unknown')} — ${esc(spool.colorName||'Unknown')} — ${esc(remain)}</option>`; }).join('');
      if ([...select.options].some(option => option.value === selected)) select.value = selected;
    }
    const spool = value.spools.find(row => String(row.id) === String(select?.value));
    renderPrinterTargetOptions(value,{printerRef:spool?.printerId || spool?.printerName,feederRef:spool?.feederId || spool?.feederName,slot:spool?.feederSlot});
  }

  function renderCandidates(value = readState()) {
    const node = document.getElementById('printerCandidates');
    if (!node) return;
    const material = document.getElementById('printerFindMaterial')?.value || '';
    const color = document.getElementById('printerFindColor')?.value || '';
    const rows = core.rankedCandidates(value,{material,color}).slice(0,5);
    node.innerHTML = rows.length ? rows.map(({spool,measurement}) => `<div class="printer-candidate"><i class="fi-spool-swatch" style="background:${esc(spool.colorHex||'#666d7d')}"></i><div><strong>${esc(spool.id)} · ${esc(spool.material||'Unknown')} · ${esc(spool.colorName||'Unknown')}</strong><span>${measurement.grams===null?'Remaining unknown':`${Math.round(measurement.grams)} g remaining`} · ${spool.placementState==='Loaded'?'Already loaded':'Stored'}</span></div><button class="btn" type="button" data-printer-use="${esc(spool.id)}">Use</button></div>`).join('') : '<div class="printer-empty">No active spools match these filters.</div>';
  }

  function render() {
    if (document.getElementById('householdView')?.dataset.printerCommand !== '3') return;
    const value = ensureLegacyPrinterRecords(readState());
    const summary = core.summary(value);
    const chip = document.getElementById('printerPrivateChip');
    if (chip) chip.textContent = `${currentUser()}'s private inventory`;
    renderMetrics(value,summary);
    renderRegistry(value);
    renderBoard(value);
    renderAttention(value,summary);
    if (document.querySelector('.printer-load-dialog[open]')) { renderForm(value); renderCandidates(value); }
  }

  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued=false; render(); });
  }

  function selectSpool(id) {
    const select = document.getElementById('moveSpoolV8');
    if (!select) return;
    const option = [...select.options].find(row => String(row.value).toLowerCase() === String(id).toLowerCase());
    if (!option) return;
    select.value = option.value;
    const value = readState();
    const spool = value.spools.find(row => String(row.id).toLowerCase() === String(id).toLowerCase());
    renderPrinterTargetOptions(value,{printerRef:spool?.printerId || spool?.printerName,feederRef:spool?.feederId || spool?.feederName,slot:spool?.feederSlot});
  }

  function openLoad(id='', printerRef='') {
    ensureDialogs();
    const dialog = document.querySelector('.printer-load-dialog');
    if (!dialog) return;
    const value = ensureLegacyPrinterRecords(readState());
    renderForm(value);
    if (id) selectSpool(id);
    if (printerRef) renderPrinterTargetOptions(value,{printerRef});
    renderCandidates(value);
    if (!dialog.open) dialog.showModal();
    setTimeout(() => document.getElementById('moveSpoolV8')?.focus(),20);
  }

  function newPrinterId() {
    return `printer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
  }

  function newFeederId() {
    feederCounter += 1;
    return `feeder-${Date.now().toString(36)}-${feederCounter}`;
  }

  function feederRowMarkup(feeder = {}) {
    const normalized = core.normalizeFeeder({...feeder,id:text(feeder.id)||newFeederId()},0);
    return `<div class="printer-feeder-row" data-feeder-row><input type="hidden" data-feeder-id value="${esc(normalized.id)}"><div class="form-field"><label>Feeder name</label><input class="field" data-feeder-name maxlength="80" value="${esc(normalized.name)}" placeholder="AMS 1"></div><div class="form-field"><label>Type</label><select class="select" data-feeder-type><option value="AMS"${normalized.type==='AMS'?' selected':''}>AMS</option><option value="Feeder"${normalized.type==='Feeder'?' selected':''}>Feeder</option><option value="External"${normalized.type==='External'?' selected':''}>External</option></select></div><div class="form-field"><label>Slots</label><input class="field" data-feeder-slots type="number" min="1" max="16" step="1" value="${normalized.slotCount}"></div><button class="btn printer-feeder-remove" type="button" data-feeder-remove aria-label="Remove ${esc(normalized.name)}">Remove</button></div>`;
  }

  function renderFeederRows(feeders = []) {
    const host = document.getElementById('printerFeederRows');
    if (!host) return;
    host.innerHTML = feeders.map(feederRowMarkup).join('');
  }

  function openPrinterConfig(id='') {
    ensureDialogs();
    const value = ensureLegacyPrinterRecords(readState());
    const existing = id ? core.configuredPrinters(value,{includeArchived:true,includeLegacy:false}).find(printer => printer.id === id) : null;
    const dialog = document.querySelector('.printer-config-dialog');
    if (!dialog) return;
    document.getElementById('printerConfigTitle').textContent = existing ? `Edit ${existing.name}` : 'Add printer';
    document.getElementById('printerConfigId').value = existing?.id || '';
    document.getElementById('printerConfigName').value = existing?.name || '';
    document.getElementById('printerConfigManufacturer').value = existing?.manufacturer || '';
    document.getElementById('printerConfigModel').value = existing?.model || '';
    document.getElementById('printerConfigLocation').value = existing?.location || '';
    document.getElementById('printerConfigNozzleSize').value = existing?.nozzleSize || '';
    document.getElementById('printerConfigNozzleMaterial').value = existing?.nozzleMaterial || '';
    document.getElementById('printerConfigBuildPlate').value = existing?.buildPlate || '';
    document.getElementById('printerConfigFirmware').value = existing?.firmware || '';
    document.getElementById('printerConfigSerial').value = existing?.serialNumber || '';
    document.getElementById('printerConfigNotes').value = existing?.notes || '';
    renderFeederRows(existing ? existing.feeders : [{id:newFeederId(),name:'AMS 1',type:'AMS',slotCount:4}]);
    if (!dialog.open) dialog.showModal();
    setTimeout(() => document.getElementById('printerConfigName')?.focus(),20);
  }

  function collectFeeders() {
    return [...document.querySelectorAll('#printerFeederRows [data-feeder-row]')].map((row,index) => core.normalizeFeeder({
      id:row.querySelector('[data-feeder-id]')?.value || newFeederId(),
      name:row.querySelector('[data-feeder-name]')?.value,
      type:row.querySelector('[data-feeder-type]')?.value,
      slotCount:row.querySelector('[data-feeder-slots]')?.value,
    },index)).filter(feeder => text(feeder.name));
  }

  function savePrinter(event) {
    event.preventDefault();
    const value = readState();
    const id = text(document.getElementById('printerConfigId')?.value) || newPrinterId();
    const existing = core.normalizePrinters(value.printers).find(printer => printer.id === id) || null;
    const name = text(document.getElementById('printerConfigName')?.value);
    if (!name) return toast('Printer name is required.');
    if (core.normalizePrinters(value.printers).some(printer => printer.id !== id && !printer.archivedAt && printer.name.toLowerCase() === name.toLowerCase())) return toast('A printer with that name already exists.');
    const feeders = collectFeeders();
    const oldFeeders = new Map((existing?.feeders || []).map(feeder => [feeder.id,feeder]));
    const newFeederIds = new Set(feeders.map(feeder => feeder.id));
    const associated = value.spools.filter(spool => spool.placementState === 'Loaded' && (text(spool.printerId) === id || (!text(spool.printerId) && existing && text(spool.printerName).toLowerCase() === existing.name.toLowerCase())));
    const removedInUse = associated.find(spool => {
      if (spool.feederId) return !newFeederIds.has(spool.feederId);
      const old = [...oldFeeders.values()].find(feeder => feeder.name.toLowerCase() === text(spool.feederName).toLowerCase());
      return old ? !newFeederIds.has(old.id) : false;
    });
    if (removedInUse) return toast(`Unload ${removedInUse.id} before removing its feeder.`);

    const at = nowIso();
    const printer = core.normalizePrinter({
      ...existing,
      id,
      owner:currentUser(),
      name,
      manufacturer:document.getElementById('printerConfigManufacturer')?.value,
      model:document.getElementById('printerConfigModel')?.value,
      location:document.getElementById('printerConfigLocation')?.value,
      nozzleSize:document.getElementById('printerConfigNozzleSize')?.value,
      nozzleMaterial:document.getElementById('printerConfigNozzleMaterial')?.value,
      buildPlate:document.getElementById('printerConfigBuildPlate')?.value,
      firmware:document.getElementById('printerConfigFirmware')?.value,
      serialNumber:document.getElementById('printerConfigSerial')?.value,
      notes:document.getElementById('printerConfigNotes')?.value,
      feeders,
      legacyInferred:false,
      createdAt:existing?.createdAt || at,
      updatedAt:at,
    },0);

    value.printers = [...core.normalizePrinters(value.printers).filter(row => row.id !== id),printer];
    for (const spool of associated) {
      spool.printerId = printer.id;
      spool.printerName = printer.name;
      if (spool.feederId) {
        const nextFeeder = printer.feeders.find(feeder => feeder.id === spool.feederId);
        if (nextFeeder) spool.feederName = nextFeeder.name;
      } else if (existing) {
        const old = existing.feeders.find(feeder => feeder.name.toLowerCase() === text(spool.feederName).toLowerCase());
        const nextFeeder = old ? printer.feeders.find(feeder => feeder.id === old.id) : null;
        if (nextFeeder) { spool.feederId = nextFeeder.id; spool.feederName = nextFeeder.name; }
      }
      spool.updatedAt = at;
    }
    writeState(value);
    document.querySelector('.printer-config-dialog')?.close();
    render();
    toast(existing ? 'Printer updated.' : 'Printer added.');
  }

  function setPlacement(id, placement) {
    const value = readState();
    const spool = value.spools.find(row => String(row.id) === String(id));
    if (!spool) return false;
    Object.assign(spool,placement,{updatedAt:nowIso()});
    writeState(value);
    return true;
  }

  function unload(id) {
    if (!id) return;
    if (!setPlacement(id,{placementState:'Stored',printerId:'',printerName:'',feederId:'',feederName:'',feederSlot:'',loadedAt:null})) return;
    render();
    toast(`${id} unloaded to storage.`);
  }

  function commitLoad(value, spool, placement, conflict=null) {
    if (conflict) Object.assign(conflict,{placementState:'Stored',printerId:'',printerName:'',feederId:'',feederName:'',feederSlot:'',loadedAt:null,updatedAt:nowIso()});
    Object.assign(spool,placement,{updatedAt:nowIso()});
    writeState(value);
    document.querySelector('.printer-load-dialog')?.close();
    render();
    toast(`${spool.id} loaded on ${placement.printerName}.`);
  }

  function loadSelected() {
    const id = document.getElementById('moveSpoolV8')?.value;
    if (!id) return;
    const value = readState();
    const spool = value.spools.find(row => String(row.id) === String(id));
    if (!spool) return;
    const printer = core.printerByRef(value,document.getElementById('movePrinterV8')?.value);
    if (!printer) { toast('Add or choose a configured printer first.'); document.getElementById('movePrinterV8')?.focus(); return; }
    const feeder = core.feederByRef(printer,document.getElementById('moveFeederV8')?.value);
    const slot = feeder ? text(document.getElementById('moveSlotV8')?.value) : '';
    const placement = {
      placementState:'Loaded',
      printerId:printer.id,
      printerName:printer.name,
      feederId:feeder?.id || '',
      feederName:feeder?.name || '',
      feederSlot:slot,
      loadedAt:spool.loadedAt || nowIso(),
    };
    const wantedKey = feeder && slot ? core.slotKey(placement) : '';
    const conflict = wantedKey ? value.spools.find(row => !row.archivedAt && String(row.id) !== String(id) && core.slotKey(row) === wantedKey) : null;
    if (!conflict) { commitLoad(value,spool,placement); return; }
    pendingLoad = {value,spool,placement,conflict};
    const dialog = document.querySelector('.printer-conflict-dialog');
    const label = [placement.printerName,placement.feederName,placement.feederSlot ? `Slot ${placement.feederSlot}` : ''].filter(Boolean).join(' · ');
    dialog.querySelector('[data-printer-conflict-copy]').textContent = `${conflict.id} currently occupies ${label}. Replacing it will unload ${conflict.id} to storage and load ${id} into that slot.`;
    dialog.querySelector('[data-printer-conflict-targets]').innerHTML = `<div class="fi-selected-target"><i style="background:${esc(conflict.colorHex||'#666d7d')}"></i><strong>${esc(conflict.id)} · ${esc(conflict.material||'Unknown')} · ${esc(conflict.colorName||'Unknown')}</strong><small>Currently loaded</small></div><div class="fi-selected-target"><i style="background:${esc(spool.colorHex||'#666d7d')}"></i><strong>${esc(spool.id)} · ${esc(spool.material||'Unknown')} · ${esc(spool.colorName||'Unknown')}</strong><small>Will replace it</small></div>`;
    dialog.showModal();
  }

  function openWeigh(id) {
    globalThis.FilamentInventoryNavigation?.navigate?.('weigh',{historyMode:'push',focus:true});
    setTimeout(() => {
      const select = document.getElementById('weighSpool');
      if (!select) return;
      select.value = id;
      select.dispatchEvent(new Event('change',{bubbles:true}));
      select.focus({preventScroll:true});
    },60);
  }

  function bind() {
    document.addEventListener('click',event => {
      const add = event.target.closest('[data-printer-add]');
      if (add) { openPrinterConfig(); return; }
      const addFromLoad = event.target.closest('[data-printer-add-from-load]');
      if (addFromLoad) { document.querySelector('.printer-load-dialog')?.close(); openPrinterConfig(); return; }
      const edit = event.target.closest('[data-printer-edit]');
      if (edit) { openPrinterConfig(edit.dataset.printerEdit); return; }
      const target = event.target.closest('[data-printer-load-target]');
      if (target) { openLoad('',target.dataset.printerLoadTarget); return; }
      const loadOpen = event.target.closest('[data-printer-load-open]');
      if (loadOpen) { openLoad(); return; }
      const scan = event.target.closest('[data-printer-scan]');
      if (scan) { globalThis.FilamentInventoryScanner?.open?.(); return; }
      const weigh = event.target.closest('[data-printer-weigh]');
      if (weigh) { openWeigh(weigh.dataset.printerWeigh); return; }
      const move = event.target.closest('[data-printer-edit-load]');
      if (move) { openLoad(move.dataset.printerEditLoad); return; }
      const unloadButton = event.target.closest('[data-printer-unload]');
      if (unloadButton) { unload(unloadButton.dataset.printerUnload); return; }
      const use = event.target.closest('[data-printer-use]');
      if (use) { selectSpool(use.dataset.printerUse); return; }
      if (event.target.closest('[data-printer-dialog-close]')) { document.querySelector('.printer-load-dialog')?.close(); return; }
      if (event.target.closest('[data-printer-config-close]')) { document.querySelector('.printer-config-dialog')?.close(); return; }
      if (event.target.closest('[data-printer-conflict-cancel]')) { pendingLoad=null; document.querySelector('.printer-conflict-dialog')?.close(); return; }
      if (event.target.closest('[data-printer-conflict-accept]')) {
        const pending = pendingLoad;
        pendingLoad = null;
        document.querySelector('.printer-conflict-dialog')?.close();
        if (pending) commitLoad(pending.value,pending.spool,pending.placement,pending.conflict);
        return;
      }
      if (event.target.closest('[data-printer-load-save]')) { loadSelected(); return; }
      if (event.target.closest('[data-printer-unload-selected]')) { unload(document.getElementById('moveSpoolV8')?.value); document.querySelector('.printer-load-dialog')?.close(); return; }
      if (event.target.closest('[data-feeder-add]')) {
        const host = document.getElementById('printerFeederRows');
        host?.insertAdjacentHTML('beforeend',feederRowMarkup({id:newFeederId(),name:`AMS ${host.children.length + 1}`,type:'AMS',slotCount:4}));
        return;
      }
      const removeFeeder = event.target.closest('[data-feeder-remove]');
      if (removeFeeder) { removeFeeder.closest('[data-feeder-row]')?.remove(); return; }
    });

    document.addEventListener('change',event => {
      if (event.target.id === 'moveSpoolV8') { selectSpool(event.target.value); return; }
      if (event.target.id === 'movePrinterV8') { renderPrinterTargetOptions(readState(),{printerRef:event.target.value}); return; }
      if (event.target.id === 'moveFeederV8') {
        const printer = document.getElementById('movePrinterV8')?.value;
        renderPrinterTargetOptions(readState(),{printerRef:printer,feederRef:event.target.value});
      }
    });
    document.getElementById('printerConfigForm')?.addEventListener('submit',savePrinter);
    document.addEventListener('input',event => { if (event.target.id === 'printerFindMaterial' || event.target.id === 'printerFindColor') renderCandidates(readState()); });
    window.addEventListener('storage',event => { if (event.key?.includes('inventory')) queueRender(); });
    globalThis.FilamentInventoryEvents?.on?.('inventory:changed',queueRender);
  }

  function bindStorage() {
    if (storageBound) return;
    storageBound = true;
    const priorSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key,value) {
      const result = priorSetItem.call(this,key,value);
      if (this === localStorage && key === STORAGE_KEY) queueRender();
      return result;
    };
  }

  function init() {
    ensureDialogs();
    installView();
    bind();
    bindStorage();
    globalThis.FilamentInventoryPrinterUI = Object.freeze({openPrinter:openPrinterConfig,openLoad,render:queueRender});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();