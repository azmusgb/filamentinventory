(() => {
  'use strict';

  const LOGICAL_INVENTORY_KEY = 'filament-inventory-v1';
  const CURRENT_USER_KEY = 'filament-current-user-v1';
  const PHYSICAL_KEY = /^filament-user-v1:(bill|aimee):inventory$/i;
  const core = globalThis.FilamentInventorySpoolContract;
  if (!core) {
    console.error('Canonical spool contract core is unavailable.');
    return;
  }

  const pendingFormMeta = new Map();
  let inventoryObserver = null;
  let dialogObserver = null;
  let toastTimer = null;

  const parse = (text, fallback = null) => { try { return JSON.parse(text); } catch { return fallback; } };
  const nowIso = () => new Date().toISOString();
  const lowerId = value => String(value || '').trim().toLowerCase();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const numeric = value => value === '' || value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value);
  const inventoryKey = key => key === LOGICAL_INVENTORY_KEY || PHYSICAL_KEY.test(String(key || ''));

  function currentProfile() {
    const fromApi = globalThis.FilamentInventoryUsers?.currentUser?.();
    if (core.OWNERS.includes(String(fromApi))) return String(fromApi);
    const stored = localStorage.getItem(CURRENT_USER_KEY);
    return core.normalizeOwner(stored, 'Bill');
  }

  function profileForKey(key, state = null) {
    const match = String(key || '').match(PHYSICAL_KEY);
    if (match) return match[1].toLowerCase() === 'aimee' ? 'Aimee' : 'Bill';
    return core.normalizeOwner(state?.profile, currentProfile());
  }

  function newerTimestamp(first, second) {
    const a = Date.parse(String(first || '')) || 0;
    const b = Date.parse(String(second || '')) || 0;
    return a >= b ? (first || second || null) : (second || first || null);
  }

  function mergeMeta(previous = {}, incoming = {}) {
    const merged = {...previous, ...incoming};
    merged.lastBackupAt = newerTimestamp(previous.lastBackupAt, incoming.lastBackupAt);
    return merged;
  }

  function canonicalizeState(incoming, previous = null, owner = currentProfile()) {
    if (!incoming || !Array.isArray(incoming.spools)) return incoming;
    const prior = previous && Array.isArray(previous.spools) ? previous : {};
    const previousById = new Map((prior.spools || []).map(spool => [lowerId(spool.id), spool]));
    const profile = core.normalizeOwner(owner || incoming.profile || prior.profile, currentProfile());
    const spools = incoming.spools.map(row => {
      const id = lowerId(row?.id);
      const old = previousById.get(id) || {};
      const formMeta = pendingFormMeta.get(id) || {};
      return core.normalizeSpool({...old, ...row, ...formMeta, owner:profile}, {owner:profile});
    }).filter(spool => spool.id);
    const version = Math.max(Number(prior.version) || 0, Number(incoming.version) || 0, Number(globalThis.FilamentInventoryVersion?.DATA_SCHEMA_VERSION) || 10);
    return {
      ...prior,
      ...incoming,
      version,
      profile,
      meta: mergeMeta(prior.meta || {}, incoming.meta || {}),
      spools,
    };
  }

  function installStorageContract() {
    if (!globalThis.Storage || globalThis.__filamentSpoolContractStorageInstalled) return;
    globalThis.__filamentSpoolContractStorageInstalled = true;
    const proto = Storage.prototype;
    const priorGet = proto.getItem;
    const priorSet = proto.setItem;

    proto.getItem = function(key) {
      const raw = priorGet.call(this, key);
      if (this !== localStorage || !inventoryKey(key) || !raw) return raw;
      const state = parse(raw, null);
      if (!state?.spools) return raw;
      return JSON.stringify(canonicalizeState(state, state, profileForKey(key, state)));
    };

    proto.setItem = function(key, value) {
      if (this !== localStorage || !inventoryKey(key)) return priorSet.call(this, key, value);
      const incoming = parse(String(value), null);
      if (!incoming?.spools) return priorSet.call(this, key, value);
      const previous = parse(priorGet.call(this, key), null);
      const owner = profileForKey(key, incoming);
      const canonical = canonicalizeState(incoming, previous, owner);
      const result = priorSet.call(this, key, JSON.stringify(canonical));
      pendingFormMeta.clear();
      queueMicrotask(() => {
        document.dispatchEvent(new CustomEvent('fi:spool-contract-changed', {detail:{profile:owner}}));
      });
      return result;
    };
  }

  function readState() {
    const profile = currentProfile();
    const raw = parse(localStorage.getItem(LOGICAL_INVENTORY_KEY), null);
    const base = raw?.spools ? raw : {version:globalThis.FilamentInventoryVersion?.DATA_SCHEMA_VERSION || 10, profile, spools:[], weighLog:[], auditLog:[], tombstones:{}, meta:{}};
    const canonical = canonicalizeState(base, base, profile);
    canonical.profile = profile;
    canonical.spools = canonical.spools.map(spool => core.normalizeSpool({...spool, owner:profile}, {owner:profile}));
    return canonical;
  }

  function writeState(state) {
    const profile = currentProfile();
    const canonical = canonicalizeState({...state, profile, savedAt:nowIso()}, readState(), profile);
    canonical.spools = canonical.spools.map(spool => core.normalizeSpool({...spool, owner:profile}, {owner:profile}));
    const validation = core.validateState(canonical, {owner:profile});
    if (!validation.valid) throw new Error(validation.errors.map(issue => issue.message).join(' '));
    localStorage.setItem(LOGICAL_INVENTORY_KEY, JSON.stringify(validation.state));
    return validation.state;
  }

  function createField(id, label, inputMarkup, className = '') {
    const field = document.createElement('div');
    field.className = `form-field ${className}`.trim();
    field.dataset.spoolContractField = id;
    field.innerHTML = `<label for="${id}">${label}</label>${inputMarkup}`;
    return field;
  }

  function ensureFormFields() {
    const form = document.getElementById('spoolForm');
    const notes = document.getElementById('notes')?.closest('.form-field');
    if (!form || !notes) return;

    if (!document.getElementById('productLineV11')) {
      const brandField = document.getElementById('brand')?.closest('.form-field');
      const field = createField('productLineV11', 'Product line', '<input class="field" id="productLineV11" maxlength="80" placeholder="Basic / Matte / Rapid / PLA Pro" type="text"/>');
      if (brandField) brandField.insertAdjacentElement('afterend', field); else notes.parentNode.insertBefore(field, notes);
    }
    if (!document.getElementById('diameterV11')) {
      notes.parentNode.insertBefore(createField('diameterV11', 'Diameter (mm)', '<input class="field" id="diameterV11" inputmode="decimal" min="1" max="3" step="0.01" placeholder="1.75" type="number"/>'), notes);
    }
    if (!document.getElementById('manufacturerSkuV11')) {
      notes.parentNode.insertBefore(createField('manufacturerSkuV11', 'Manufacturer SKU', '<input class="field" id="manufacturerSkuV11" maxlength="80" placeholder="Optional product / SKU code" type="text"/>'), notes);
    }
    if (!document.getElementById('lotBatchV11')) {
      notes.parentNode.insertBefore(createField('lotBatchV11', 'Lot / batch', '<input class="field" id="lotBatchV11" maxlength="80" placeholder="Optional lot or batch" type="text"/>'), notes);
    }

    const nominalLabel = document.querySelector('label[for="startWeight"]');
    if (nominalLabel) nominalLabel.textContent = 'Nominal filament weight (g)';
    const estimateLabel = document.querySelector('label[for="visualPercent"]');
    if (estimateLabel) estimateLabel.textContent = 'Estimated remaining (%)';
    const sourceLabel = document.querySelector('label[for="purchaseSource"]');
    if (sourceLabel) sourceLabel.textContent = 'Vendor / purchase source';
    reconcileFormLayout();
  }

  function reconcileFormLayout() {
    const essential = document.querySelector('#spoolDialog .v10-essential-grid');
    const productField = document.querySelector('[data-spool-contract-field="productLineV11"]');
    if (essential && productField && !essential.contains(productField)) essential.appendChild(productField);
  }

  function populateContractFields() {
    ensureFormFields();
    const originalId = String(document.getElementById('editOriginalId')?.value || '').trim();
    const spool = originalId ? readState().spools.find(row => String(row.id) === originalId) : null;
    const values = {
      productLineV11: spool?.productLine || '',
      diameterV11: spool?.diameterMm ?? '',
      manufacturerSkuV11: spool?.manufacturerSku || '',
      lotBatchV11: spool?.lotBatch || '',
    };
    for (const [id, value] of Object.entries(values)) {
      const element = document.getElementById(id);
      if (element) element.value = value;
    }
    reconcileFormLayout();
  }

  function captureContractFields(event) {
    if (event.target?.id !== 'spoolForm') return;
    const id = String(document.getElementById('spoolId')?.value || '').trim();
    if (!id) return;
    pendingFormMeta.set(lowerId(id), {
      productLine: String(document.getElementById('productLineV11')?.value || '').trim(),
      diameterMm: numeric(document.getElementById('diameterV11')?.value),
      manufacturerSku: String(document.getElementById('manufacturerSkuV11')?.value || '').trim(),
      lotBatch: String(document.getElementById('lotBatchV11')?.value || '').trim(),
    });
  }

  function watchDialog() {
    const dialog = document.getElementById('spoolDialog');
    if (!dialog || dialogObserver) return;
    dialogObserver = new MutationObserver(() => {
      if (dialog.open) queueMicrotask(populateContractFields);
    });
    dialogObserver.observe(dialog, {attributes:true, attributeFilter:['open']});
  }

  function decorateInventory() {
    const state = readState();
    const byId = new Map(state.spools.map(spool => [String(spool.id), spool]));
    document.querySelectorAll('#inventoryGrid .spool-card').forEach(card => {
      const spool = byId.get(String(card.dataset.id));
      if (!spool) return;
      const title = card.querySelector('.spool-title p');
      if (title) title.textContent = core.productLabel(spool);
      card.dataset.lifecycleStatus = core.lifecycle(spool);
      const meta = card.querySelector('.meta');
      if (!meta) return;
      let detail = meta.querySelector('[data-contract-detail]');
      const parts = [
        spool.diameterMm !== null ? `${spool.diameterMm} mm` : '',
        spool.manufacturerSku ? `SKU ${spool.manufacturerSku}` : '',
        spool.lotBatch ? `Lot ${spool.lotBatch}` : '',
      ].filter(Boolean);
      if (!parts.length) {
        detail?.remove();
        return;
      }
      if (!detail) {
        detail = document.createElement('div');
        detail.dataset.contractDetail = 'true';
        meta.appendChild(detail);
      }
      detail.innerHTML = `<span>Product details</span><strong>${esc(parts.join(' · '))}</strong>`;
    });
  }

  function watchInventory() {
    const grid = document.getElementById('inventoryGrid');
    if (!grid || inventoryObserver) return;
    inventoryObserver = new MutationObserver(decorateInventory);
    inventoryObserver.observe(grid, {childList:true, subtree:false});
    decorateInventory();
  }

  function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
  }

  function download(name, content, type) {
    const blob = new Blob([content], {type});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function csvCell(value) {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function markBackup(state) {
    return writeState({...state, meta:{...(state.meta || {}), lastBackupAt:nowIso()}});
  }

  function exportJson() {
    const state = readState();
    const exportedAt = nowIso();
    const profile = currentProfile();
    const payload = {...state, profile, exportedAt, appVersion:globalThis.FilamentInventoryVersion?.APP_VERSION || '', spools:state.spools.map(spool => core.normalizeSpool(spool, {owner:profile}))};
    download(`filament-inventory-${profile.toLowerCase()}-canonical-${exportedAt.slice(0, 10)}.json`, JSON.stringify(payload, null, 2), 'application/json');
    markBackup(state);
    showToast('Full-fidelity canonical backup exported.');
  }

  function exportCsv() {
    const state = readState();
    const headers = [
      'ID','Brand','Product Line','Material','Color','Color Hex','Diameter mm','Manufacturer SKU','Lot / Batch','Spool Type',
      'Nominal Filament g','Estimated %','Gross g','Tare g','Effective Remaining g','Effective %','Measurement Source','Lifecycle',
      'Reorder Needed','Reorder Threshold g','Location','Owner','Physical State','Printer','Feeder / AMS','Slot / Bay','Loaded At',
      'Opened','Bagged','Last Dried Date','Purchase Source','Purchase Price','Purchase Date','Confidence','Archived','Notes','Created','Updated','Last Used At'
    ];
    const rows = state.spools.map(spool => {
      const remaining = core.measurement(spool);
      return [
        spool.id,spool.brand,spool.productLine,spool.material,spool.colorName,spool.colorHex,spool.diameterMm ?? '',spool.manufacturerSku,spool.lotBatch,spool.spoolType,
        spool.startWeight,spool.visualPercent ?? '',spool.gross ?? '',spool.tare ?? '',remaining.grams ?? '',remaining.percent ?? '',remaining.source,core.lifecycle(spool),
        core.reorderNeeded(spool) ? 'Yes' : 'No',spool.reorderThreshold,spool.location,spool.owner,spool.placementState,spool.printerName,spool.feederName,spool.feederSlot,spool.loadedAt || '',
        spool.opened,spool.bagged,spool.lastDriedDate,spool.purchaseSource,spool.purchasePrice ?? '',spool.purchaseDate,spool.confidence,spool.archivedAt ? 'Yes' : 'No',spool.notes,spool.createdAt || '',spool.updatedAt || '',spool.lastUsedAt || ''
      ];
    });
    const profile = currentProfile();
    download(`filament-inventory-${profile.toLowerCase()}-canonical-${nowIso().slice(0, 10)}.csv`, [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8');
    markBackup(state);
    showToast('Canonical inventory CSV exported.');
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let index = 0; index < text.length; index++) {
      const char = text[index];
      if (quoted) {
        if (char === '"' && text[index + 1] === '"') { field += '"'; index++; }
        else if (char === '"') quoted = false;
        else field += char;
      } else if (char === '"') quoted = true;
      else if (char === ',') { row.push(field); field = ''; }
      else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (char !== '\r') field += char;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter(item => item.some(value => String(value).trim()));
  }

  function headerMap(headers) {
    return new Map(headers.map((header, index) => [String(header).trim().toLowerCase(), index]));
  }

  function cell(map, row, ...names) {
    for (const name of names) {
      const index = map.get(String(name).toLowerCase());
      if (index !== undefined) return {present:true, value:row[index] ?? ''};
    }
    return {present:false, value:''};
  }

  function applyCell(target, key, source, transform = value => value) {
    if (source.present) target[key] = transform(source.value);
  }

  function mergeLogRows(existing = [], incoming = [], keyFor) {
    const result = Array.isArray(existing) ? existing.slice() : [];
    const keys = new Set(result.map(keyFor));
    for (const row of Array.isArray(incoming) ? incoming : []) {
      const key = keyFor(row);
      if (!keys.has(key)) { result.push(row); keys.add(key); }
    }
    return result;
  }

  async function importCsv(file) {
    const rows = parseCsv(await file.text());
    if (rows.length < 2) throw new Error('CSV has no data rows.');
    const headers = headerMap(rows[0]);
    const idIndex = headers.get('id') ?? headers.get('spool id');
    if (idIndex === undefined) throw new Error('CSV must contain an ID column.');
    const profile = currentProfile();
    const state = readState();
    const byId = new Map(state.spools.map(spool => [lowerId(spool.id), spool]));
    const seen = new Set();
    const imported = [];

    for (const row of rows.slice(1)) {
      const id = String(row[idIndex] || '').trim();
      if (!id) continue;
      const key = lowerId(id);
      if (seen.has(key)) throw new Error(`Duplicate ID in CSV: ${id}.`);
      seen.add(key);
      const next = {...(byId.get(key) || {}), id};
      applyCell(next, 'brand', cell(headers,row,'Brand'));
      applyCell(next, 'productLine', cell(headers,row,'Product Line','Product'));
      applyCell(next, 'material', cell(headers,row,'Material','Material / Type'));
      applyCell(next, 'colorName', cell(headers,row,'Color','Color / Finish'));
      applyCell(next, 'colorHex', cell(headers,row,'Color Hex'));
      applyCell(next, 'diameterMm', cell(headers,row,'Diameter mm','Diameter'), numeric);
      applyCell(next, 'manufacturerSku', cell(headers,row,'Manufacturer SKU','SKU'));
      applyCell(next, 'lotBatch', cell(headers,row,'Lot / Batch','Lot','Batch'));
      applyCell(next, 'spoolType', cell(headers,row,'Spool Type','Spool Format'));
      applyCell(next, 'startWeight', cell(headers,row,'Nominal Filament g','Starting g','Starting Filament (g)'), numeric);
      applyCell(next, 'visualPercent', cell(headers,row,'Estimated %','Visual %','Visual Estimate (%)'), numeric);
      applyCell(next, 'gross', cell(headers,row,'Gross g','Gross Weight (g)'), numeric);
      applyCell(next, 'tare', cell(headers,row,'Tare g','Tare Weight (g)'), numeric);
      applyCell(next, 'reorderThreshold', cell(headers,row,'Reorder Threshold g'), numeric);
      applyCell(next, 'location', cell(headers,row,'Location'));
      applyCell(next, 'placementState', cell(headers,row,'Physical State','Placement State'));
      applyCell(next, 'printerName', cell(headers,row,'Printer'));
      applyCell(next, 'feederName', cell(headers,row,'Feeder / AMS','AMS / Feeder'));
      applyCell(next, 'feederSlot', cell(headers,row,'Slot / Bay','Slot'));
      applyCell(next, 'loadedAt', cell(headers,row,'Loaded At'));
      applyCell(next, 'opened', cell(headers,row,'Opened'));
      applyCell(next, 'bagged', cell(headers,row,'Bagged'));
      applyCell(next, 'lastDriedDate', cell(headers,row,'Last Dried Date'));
      applyCell(next, 'purchaseSource', cell(headers,row,'Purchase Source','Vendor / Purchase Source'));
      applyCell(next, 'purchasePrice', cell(headers,row,'Purchase Price'), numeric);
      applyCell(next, 'purchaseDate', cell(headers,row,'Purchase Date'));
      applyCell(next, 'confidence', cell(headers,row,'Confidence'));
      applyCell(next, 'notes', cell(headers,row,'Notes'));
      applyCell(next, 'lastUsedAt', cell(headers,row,'Last Used At'));
      const ownerCell = cell(headers,row,'Owner');
      if (ownerCell.present && String(ownerCell.value).trim() && core.normalizeOwner(ownerCell.value, profile) !== profile) {
        throw new Error(`${id} belongs to ${ownerCell.value}. Switch to that profile before importing it.`);
      }
      next.owner = profile;
      const archivedCell = cell(headers,row,'Archived');
      if (archivedCell.present) next.archivedAt = /^yes|true|1$/i.test(String(archivedCell.value).trim()) ? (next.archivedAt || nowIso()) : null;
      const normalized = core.normalizeSpool(next, {owner:profile});
      const validation = core.validateSpool(normalized, {owner:profile});
      if (!validation.valid) throw new Error(`${id}: ${validation.errors.map(issue => issue.message).join(' ')}`);
      imported.push(validation.spool);
    }
    if (!imported.length) throw new Error('No usable spool rows found.');
    if (!confirm(`Merge ${imported.length} canonical spool record${imported.length === 1 ? '' : 's'} into ${profile}'s inventory? Matching IDs will be updated.`)) return;
    for (const spool of imported) byId.set(lowerId(spool.id), spool);
    writeState({...state, spools:[...byId.values()]});
    showToast(`${imported.length} spool record${imported.length === 1 ? '' : 's'} imported.`);
    setTimeout(() => location.reload(), 250);
  }

  async function importJson(file) {
    const parsed = JSON.parse(await file.text());
    if (!parsed || !Array.isArray(parsed.spools)) throw new Error('JSON does not contain a spools array.');
    const profile = currentProfile();
    if (parsed.profile && core.normalizeOwner(parsed.profile, profile) !== profile) {
      throw new Error(`This backup belongs to ${parsed.profile}. Switch to ${parsed.profile} before importing it.`);
    }
    const incoming = parsed.spools.map(spool => core.normalizeSpool({...spool, owner:profile}, {owner:profile})).filter(spool => spool.id);
    if (!incoming.length) throw new Error('No usable spool records found.');
    const duplicateIds = incoming.map(spool => lowerId(spool.id)).filter((id, index, ids) => ids.indexOf(id) !== index);
    if (duplicateIds.length) throw new Error(`Backup contains duplicate spool IDs: ${[...new Set(duplicateIds)].join(', ')}.`);
    const validation = core.validateState({...parsed, profile, spools:incoming}, {owner:profile});
    if (!validation.valid) throw new Error(validation.errors.map(issue => issue.message).join(' '));
    const replace = confirm(`Import ${incoming.length} spools into ${profile}'s inventory. Press OK to REPLACE the current inventory, or Cancel to MERGE by spool ID.`);
    const current = readState();
    let next;
    if (replace) {
      if (!confirm(`Replace all of ${profile}'s current inventory and history with this backup?`)) return;
      next = {...parsed, profile, spools:incoming};
    } else {
      const byId = new Map(current.spools.map(spool => [lowerId(spool.id), spool]));
      incoming.forEach(spool => byId.set(lowerId(spool.id), core.normalizeSpool({...byId.get(lowerId(spool.id)), ...spool, owner:profile}, {owner:profile})));
      next = {
        ...current,
        spools:[...byId.values()],
        weighLog:mergeLogRows(current.weighLog, parsed.weighLog, row => `${row?.id || ''}|${row?.at || ''}|${row?.gross ?? ''}|${row?.tare ?? ''}`),
        auditLog:mergeLogRows(current.auditLog, parsed.auditLog, row => `${row?.id || row?.eventId || ''}|${row?.at || row?.timestamp || ''}|${row?.type || row?.action || ''}`),
        tombstones:{...(current.tombstones || {}), ...(parsed.tombstones || {})},
        meta:mergeMeta(current.meta || {}, parsed.meta || {}),
      };
    }
    writeState(next);
    showToast(replace ? 'Canonical backup restored.' : 'Canonical backup merged.');
    setTimeout(() => location.reload(), 250);
  }

  function interceptDataActions(event) {
    const button = event.target.closest?.('button');
    if (!button) return;
    if (['exportTopBtn','exportJsonBtn','backupHouseholdV8'].includes(button.id)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      exportJson();
      return;
    }
    if (['exportCsvBtn','exportHouseholdCsvV8'].includes(button.id)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      exportCsv();
    }
  }

  function interceptImports(event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file') return;
    const jsonIds = new Set(['importJsonFile','restoreHouseholdFileV8']);
    const csvIds = new Set(['importCsvFile','restoreHouseholdCsvFileV8']);
    if (!jsonIds.has(input.id) && !csvIds.has(input.id)) return;
    const file = input.files?.[0];
    if (!file) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    input.value = '';
    const task = jsonIds.has(input.id) ? importJson(file) : importCsv(file);
    task.catch(error => alert(`Import failed: ${error.message}`));
  }

  function initDom() {
    ensureFormFields();
    watchDialog();
    watchInventory();
    setTimeout(() => { ensureFormFields(); reconcileFormLayout(); decorateInventory(); }, 100);
    setTimeout(() => { ensureFormFields(); reconcileFormLayout(); decorateInventory(); }, 750);
  }

  installStorageContract();
  document.addEventListener('submit', captureContractFields, true);
  document.addEventListener('click', interceptDataActions, true);
  document.addEventListener('change', interceptImports, true);
  document.addEventListener('fi:spool-contract-changed', decorateInventory);
  document.addEventListener('fi:navigation', () => setTimeout(decorateInventory, 0));

  globalThis.FilamentInventorySpoolContractUI = Object.freeze({
    readState,
    writeState,
    decorateInventory,
    exportJson,
    exportCsv,
    importJson,
    importCsv,
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDom, {once:true});
  else initDom();
})();
