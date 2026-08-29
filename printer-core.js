(function(root, factory) {
  const resolveContract = () => {
    if (typeof module === 'object' && module.exports) return require('./spool-contract-core.js');
    return root?.FilamentInventorySpoolContract || null;
  };
  const api = factory(resolveContract);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FilamentInventoryPrinter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(resolveContract) {
  'use strict';

  const DEFAULT_SLOT_COUNT = 4;
  const validNum = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
  const text = value => String(value || '').trim();
  const contract = () => resolveContract?.() || null;
  const timestamp = value => {
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const slug = value => text(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48) || 'printer';

  function measurement(spool = {}) {
    const api = contract();
    if (api?.measurement) return api.measurement(spool);
    const start = validNum(spool.startWeight) && Number(spool.startWeight) > 0 ? Number(spool.startWeight) : 1000;
    if (validNum(spool.gross) && validNum(spool.tare) && Number(spool.gross) >= Number(spool.tare)) {
      const grams = Math.max(0, Number(spool.gross) - Number(spool.tare));
      return {grams, percent:Math.round(Math.min(100, grams / start * 100) * 10) / 10, source:'Measured', evidence:'scale', measured:true};
    }
    if (validNum(spool.estimatedRemainingGrams)) {
      const grams = Math.max(0, Number(spool.estimatedRemainingGrams));
      return {grams, percent:Math.round(Math.min(100, grams / start * 100) * 10) / 10, source:'Estimated', evidence:'usage', measured:false};
    }
    if (validNum(spool.visualPercent)) {
      const percent = Math.max(0, Math.min(100, Number(spool.visualPercent)));
      return {grams:Math.round(start * percent / 100), percent, source:'Estimated', evidence:'visual', measured:false};
    }
    return {grams:null, percent:null, source:'Unknown', evidence:'none', measured:false};
  }

  function reorderNeeded(spool = {}) {
    const api = contract();
    if (api?.reorderNeeded) return api.reorderNeeded(spool);
    if (spool.archivedAt) return false;
    const m = measurement(spool);
    return m.grams !== null && m.grams <= Number(spool.reorderThreshold ?? 250);
  }

  function stockState(spool = {}) {
    const api = contract();
    if (api?.stockState) return api.stockState(spool);
    if (spool.archivedAt) return 'Archived';
    const m = measurement(spool);
    if (m.grams === null) return 'Unknown';
    if (m.grams === 0) return 'Empty';
    return reorderNeeded(spool) ? 'Low' : 'Available';
  }

  function evidenceLabel(spool = {}) {
    const api = contract();
    if (api?.evidenceLabel) return api.evidenceLabel(spool);
    const m = measurement(spool);
    if (m.source === 'Measured') return 'Measured · scale';
    if (m.evidence === 'usage') return 'Estimated · print usage';
    if (m.source === 'Estimated') return 'Estimated · visual';
    return 'Unknown · verify';
  }

  function productLabel(spool = {}) {
    const api = contract();
    if (api?.productLabel) return api.productLabel(spool);
    return [spool.brand, spool.productLine, spool.material].map(text).filter(value => value && value !== 'Unknown').join(' · ') || 'Unknown filament';
  }

  function normalizeFeeder(raw = {}, index = 0) {
    const slotCount = Math.max(1, Math.min(16, validNum(raw.slotCount) ? Math.round(Number(raw.slotCount)) : (/\bams\b/i.test(text(raw.type) || text(raw.name)) ? DEFAULT_SLOT_COUNT : 1)));
    return {
      ...raw,
      id:text(raw.id) || `feeder-${index + 1}`,
      name:text(raw.name) || `Feeder ${index + 1}`,
      type:text(raw.type) || (/\bams\b/i.test(text(raw.name)) ? 'AMS' : 'Feeder'),
      slotCount,
    };
  }

  function normalizePrinter(raw = {}, index = 0) {
    const feeders = [];
    const seen = new Set();
    for (const [feederIndex, feederRaw] of (Array.isArray(raw.feeders) ? raw.feeders : []).entries()) {
      const feeder = normalizeFeeder(feederRaw, feederIndex);
      const key = feeder.id.toLowerCase();
      if (!seen.has(key)) { seen.add(key); feeders.push(feeder); }
    }
    const name = text(raw.name) || text(raw.model) || `Printer ${index + 1}`;
    return {
      ...raw,
      id:text(raw.id) || `printer-${slug(name)}-${index + 1}`,
      name,
      manufacturer:text(raw.manufacturer),
      model:text(raw.model),
      location:text(raw.location),
      nozzleSize:text(raw.nozzleSize),
      nozzleMaterial:text(raw.nozzleMaterial),
      buildPlate:text(raw.buildPlate),
      serialNumber:text(raw.serialNumber),
      firmware:text(raw.firmware),
      notes:text(raw.notes),
      feeders,
      legacyInferred:Boolean(raw.legacyInferred),
      createdAt:raw.createdAt || null,
      updatedAt:raw.updatedAt || raw.createdAt || null,
      archivedAt:raw.archivedAt || null,
    };
  }

  function printerRecordTime(printer = {}) {
    return Math.max(timestamp(printer.updatedAt), timestamp(printer.createdAt));
  }

  function normalizePrinters(value = []) {
    const map = new Map();
    for (const [index, raw] of (Array.isArray(value) ? value : []).entries()) {
      if (!raw || typeof raw !== 'object') continue;
      const printer = normalizePrinter(raw, index);
      if (!text(printer.id) || !text(printer.name)) continue;
      const key = printer.id.toLowerCase();
      const old = map.get(key);
      if (!old || printerRecordTime(printer) >= printerRecordTime(old)) map.set(key, printer);
    }
    return [...map.values()].sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric:true}));
  }

  function legacyPrintersFromSpools(state = {}) {
    const byName = new Map();
    for (const spool of activeSpools(state)) {
      const printerName = text(spool.printerName);
      if (!printerName) continue;
      const key = printerName.toLowerCase();
      if (!byName.has(key)) byName.set(key, {name:printerName, feeders:new Map(), updatedAt:null});
      const entry = byName.get(key);
      if (timestamp(spool.updatedAt) > timestamp(entry.updatedAt)) entry.updatedAt = spool.updatedAt;
      const feederName = text(spool.feederName);
      if (!feederName) continue;
      const feederKey = feederName.toLowerCase();
      const numericSlot = Number.parseInt(text(spool.feederSlot), 10);
      const minimumSlots = Number.isFinite(numericSlot) && numericSlot > 0 ? numericSlot : 1;
      const inferredSlots = /\bams\b/i.test(feederName) ? Math.max(DEFAULT_SLOT_COUNT, minimumSlots) : minimumSlots;
      const old = entry.feeders.get(feederKey);
      entry.feeders.set(feederKey, {name:feederName, slotCount:Math.max(old?.slotCount || 0, inferredSlots)});
    }
    return [...byName.values()].map((entry, index) => normalizePrinter({
      id:`legacy-${slug(entry.name)}`,
      name:entry.name,
      feeders:[...entry.feeders.values()].map((feeder, feederIndex) => ({
        id:`legacy-${slug(feeder.name)}-${feederIndex + 1}`,
        name:feeder.name,
        type:/\bams\b/i.test(feeder.name) ? 'AMS' : 'Feeder',
        slotCount:feeder.slotCount,
      })),
      legacyInferred:true,
      createdAt:entry.updatedAt,
      updatedAt:entry.updatedAt,
    }, index));
  }

  function configuredPrinters(state = {}, {includeArchived=false, includeLegacy=true} = {}) {
    const configured = normalizePrinters(state.printers).filter(printer => includeArchived || !printer.archivedAt);
    if (!includeLegacy) return configured;
    const names = new Set(configured.map(printer => printer.name.toLowerCase()));
    return [...configured, ...legacyPrintersFromSpools(state).filter(printer => !names.has(printer.name.toLowerCase()))]
      .sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric:true}));
  }

  function printerByRef(state = {}, ref = '') {
    const wanted = text(ref).toLowerCase();
    if (!wanted) return null;
    return configuredPrinters(state, {includeArchived:true}).find(printer => printer.id.toLowerCase() === wanted || printer.name.toLowerCase() === wanted) || null;
  }

  function feederByRef(printer = {}, ref = '') {
    const wanted = text(ref).toLowerCase();
    if (!wanted) return null;
    return (Array.isArray(printer.feeders) ? printer.feeders : []).map(normalizeFeeder).find(feeder => feeder.id.toLowerCase() === wanted || feeder.name.toLowerCase() === wanted) || null;
  }

  function slotsForFeeder(feeder = {}) {
    const count = Math.max(1, Math.min(16, Number(feeder.slotCount) || 1));
    return Array.from({length:count}, (_,index) => String(index + 1));
  }

  function slotKey(spool = {}) {
    if (spool.placementState !== 'Loaded') return '';
    const printerRef = text(spool.printerId) || text(spool.printerName).toLowerCase();
    const feederRef = text(spool.feederId) || text(spool.feederName).toLowerCase();
    return [printerRef.toLowerCase(), feederRef.toLowerCase(), text(spool.feederSlot).toLowerCase()].join('|');
  }

  function activeSpools(state = {}) {
    return (state.spools || []).filter(spool => spool && !spool.archivedAt && text(spool.id));
  }

  function loadedSpools(state = {}) {
    return activeSpools(state).filter(spool => spool.placementState === 'Loaded');
  }

  function printerGroups(state = {}) {
    const groups = new Map();
    loadedSpools(state).forEach(spool => {
      const printer = printerByRef(state, spool.printerId || spool.printerName);
      const printerName = printer?.name || text(spool.printerName) || 'Unassigned printer';
      const key = printer?.id || printerName.toLowerCase();
      if (!groups.has(key)) groups.set(key, {printer:printerName, printerRecord:printer, rows:[]});
      groups.get(key).rows.push(spool);
    });
    return [...groups.values()].sort((a,b) => a.printer.localeCompare(b.printer)).map(group => ({
      ...group,
      rows:group.rows.slice().sort((a,b) => `${text(a.feederName)}|${text(a.feederSlot)}`.localeCompare(`${text(b.feederName)}|${text(b.feederSlot)}`, undefined, {numeric:true})),
    }));
  }

  function slotConflicts(state = {}) {
    const bySlot = new Map();
    loadedSpools(state).forEach(spool => {
      const key = slotKey(spool);
      if (!key || key === '||') return;
      if (!bySlot.has(key)) bySlot.set(key, []);
      bySlot.get(key).push(spool);
    });
    return [...bySlot.values()].filter(rows => rows.length > 1);
  }

  function summary(state = {}) {
    const active = activeSpools(state);
    const loaded = loadedSpools(state);
    const printers = configuredPrinters(state);
    const known = loaded.map(measurement).filter(m => m.grams !== null);
    const low = loaded.filter(reorderNeeded);
    const unknown = loaded.filter(spool => measurement(spool).grams === null);
    const estimated = loaded.filter(spool => measurement(spool).source === 'Estimated');
    return {
      active:active.length,
      loaded:loaded.length,
      printers:printers.length,
      loadedPrinters:new Set(loaded.map(spool => text(spool.printerId) || text(spool.printerName).toLowerCase()).filter(Boolean)).size,
      knownLoadedGrams:known.reduce((sum,m) => sum + m.grams, 0),
      lowLoaded:low,
      unknownLoaded:unknown,
      estimatedLoaded:estimated,
      conflicts:slotConflicts(state),
    };
  }

  function candidateScore(spool = {}, context = {}) {
    if (spool.archivedAt) return -Infinity;
    const m = measurement(spool);
    let score = spool.placementState === 'Loaded' ? 4 : 8;
    if (context.material && text(spool.material).toLowerCase() === text(context.material).toLowerCase()) score += 20;
    if (context.color && text(spool.colorName).toLowerCase().includes(text(context.color).toLowerCase())) score += 12;
    if (m.grams !== null) score += Math.min(20, m.grams / 100);
    if (m.source === 'Measured') score += 4;
    else if (m.source === 'Estimated') score += 1;
    else score -= 4;
    if (reorderNeeded(spool)) score -= 12;
    return score;
  }

  function rankedCandidates(state = {}, context = {}) {
    return activeSpools(state)
      .map(spool => ({spool, score:candidateScore(spool, context), measurement:measurement(spool)}))
      .sort((a,b) => b.score - a.score || String(a.spool.id).localeCompare(String(b.spool.id), undefined, {numeric:true}));
  }

  return Object.freeze({
    DEFAULT_SLOT_COUNT,
    measurement,
    reorderNeeded,
    stockState,
    evidenceLabel,
    productLabel,
    normalizeFeeder,
    normalizePrinter,
    normalizePrinters,
    printerRecordTime,
    legacyPrintersFromSpools,
    configuredPrinters,
    printerByRef,
    feederByRef,
    slotsForFeeder,
    slotKey,
    activeSpools,
    loadedSpools,
    printerGroups,
    slotConflicts,
    summary,
    candidateScore,
    rankedCandidates,
  });
});
