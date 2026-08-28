(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FilamentInventorySpoolContract = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const DEFAULT_NOMINAL_GRAMS = 1000;
  const DEFAULT_REORDER_GRAMS = 250;
  const OWNERS = Object.freeze(['Bill', 'Aimee']);
  const PLACEMENT_STATES = Object.freeze(['Stored', 'Loaded']);
  const LIFECYCLE_STATES = Object.freeze(['Available', 'Loaded', 'Low', 'Empty', 'Archived']);
  const CONFIDENCE_LEVELS = Object.freeze(['Confirmed', 'High', 'Medium', 'Low', 'Unknown']);
  const TRI_STATES = Object.freeze(['Yes', 'No', 'Unknown']);

  const isFiniteNumber = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
  const numberOrNull = value => isFiniteNumber(value) ? Number(value) : null;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const safeText = (value, max = 120) => String(value ?? '').trim().slice(0, max);
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '';
  const validIso = value => value && !Number.isNaN(Date.parse(String(value))) ? String(value) : null;
  const validHex = value => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : '#64748b';
  const normalizeTriState = value => TRI_STATES.includes(String(value)) ? String(value) : 'Unknown';
  const normalizeOwner = (value, fallback = 'Bill') => OWNERS.includes(String(value)) ? String(value) : (OWNERS.includes(String(fallback)) ? String(fallback) : 'Bill');
  const lowerId = value => safeText(value, 24).toLowerCase();

  function normalizeSpool(input = {}, {owner = 'Bill'} = {}) {
    const nominal = isFiniteNumber(input.startWeight) && Number(input.startWeight) > 0
      ? Number(input.startWeight)
      : DEFAULT_NOMINAL_GRAMS;
    const gross = isFiniteNumber(input.gross) ? Math.max(0, Number(input.gross)) : null;
    const tare = isFiniteNumber(input.tare) ? Math.max(0, Number(input.tare)) : null;
    const visualPercent = isFiniteNumber(input.visualPercent) ? clamp(Number(input.visualPercent), 0, 100) : null;
    const estimatedRemainingGrams = isFiniteNumber(input.estimatedRemainingGrams)
      ? Math.max(0, Number(input.estimatedRemainingGrams))
      : null;
    const archivedAt = validIso(input.archivedAt);
    let placementState = PLACEMENT_STATES.includes(String(input.placementState)) ? String(input.placementState) : '';
    const printerName = safeText(input.printerName, 60);
    const feederName = safeText(input.feederName, 60);
    const feederSlot = safeText(input.feederSlot, 24);
    if (!placementState) placementState = printerName || feederName || feederSlot ? 'Loaded' : 'Stored';
    if (archivedAt) placementState = 'Stored';

    return {
      ...input,
      id: safeText(input.id, 24),
      brand: safeText(input.brand || 'Unknown', 60) || 'Unknown',
      productLine: safeText(input.productLine, 80),
      material: safeText(input.material || 'Unknown', 80) || 'Unknown',
      colorName: safeText(input.colorName || 'Unknown', 80) || 'Unknown',
      colorHex: validHex(input.colorHex),
      diameterMm: isFiniteNumber(input.diameterMm) && Number(input.diameterMm) > 0 ? Number(input.diameterMm) : null,
      manufacturerSku: safeText(input.manufacturerSku, 80),
      lotBatch: safeText(input.lotBatch, 80),
      spoolType: safeText(input.spoolType || 'Unknown', 40) || 'Unknown',
      startWeight: nominal,
      visualPercent,
      estimatedRemainingGrams,
      gross,
      tare,
      location: safeText(input.location, 80),
      confidence: CONFIDENCE_LEVELS.includes(String(input.confidence)) ? String(input.confidence) : 'Unknown',
      opened: normalizeTriState(input.opened),
      bagged: normalizeTriState(input.bagged),
      purchaseSource: safeText(input.purchaseSource, 100),
      purchasePrice: isFiniteNumber(input.purchasePrice) && Number(input.purchasePrice) >= 0 ? Number(input.purchasePrice) : null,
      purchaseDate: validDate(input.purchaseDate),
      reorderThreshold: isFiniteNumber(input.reorderThreshold) && Number(input.reorderThreshold) >= 0 ? Number(input.reorderThreshold) : DEFAULT_REORDER_GRAMS,
      lastDriedDate: validDate(input.lastDriedDate),
      owner: normalizeOwner(input.owner, owner),
      placementState,
      printerName: placementState === 'Loaded' ? printerName : '',
      feederName: placementState === 'Loaded' ? feederName : '',
      feederSlot: placementState === 'Loaded' ? feederSlot : '',
      loadedAt: placementState === 'Loaded' ? (validIso(input.loadedAt) || null) : null,
      lastUsedAt: validIso(input.lastUsedAt),
      notes: safeText(input.notes, 1000),
      createdAt: validIso(input.createdAt),
      updatedAt: validIso(input.updatedAt),
      archivedAt,
    };
  }

  function measurement(spool = {}) {
    const nominal = isFiniteNumber(spool.startWeight) && Number(spool.startWeight) > 0
      ? Number(spool.startWeight)
      : DEFAULT_NOMINAL_GRAMS;
    if (isFiniteNumber(spool.gross) && isFiniteNumber(spool.tare) && Number(spool.gross) >= Number(spool.tare)) {
      const grams = Math.max(0, Number(spool.gross) - Number(spool.tare));
      return {
        grams,
        percent: Math.round(clamp(grams / nominal * 100, 0, 100) * 10) / 10,
        source: 'Measured',
        evidence: 'scale',
        measured: true,
      };
    }
    if (isFiniteNumber(spool.estimatedRemainingGrams)) {
      const grams = Math.max(0, Number(spool.estimatedRemainingGrams));
      return {
        grams,
        percent: Math.round(clamp(grams / nominal * 100, 0, 100) * 10) / 10,
        source: 'Estimated',
        evidence: 'usage',
        measured: false,
      };
    }
    if (isFiniteNumber(spool.visualPercent)) {
      const percent = clamp(Number(spool.visualPercent), 0, 100);
      return {
        grams: Math.round(nominal * percent / 100),
        percent,
        source: 'Estimated',
        evidence: 'visual',
        measured: false,
      };
    }
    return {grams:null, percent:null, source:'Unknown', evidence:'none', measured:false};
  }

  function lifecycle(spool = {}) {
    if (spool.archivedAt) return 'Archived';
    const remaining = measurement(spool);
    if (remaining.grams === 0) return 'Empty';
    if (String(spool.placementState) === 'Loaded') return 'Loaded';
    const threshold = isFiniteNumber(spool.reorderThreshold) ? Number(spool.reorderThreshold) : DEFAULT_REORDER_GRAMS;
    if (remaining.grams !== null && remaining.grams <= threshold) return 'Low';
    return 'Available';
  }

  function reorderNeeded(spool = {}) {
    return lifecycle(spool) === 'Low' || lifecycle(spool) === 'Empty';
  }

  function productLabel(spool = {}) {
    return [spool.brand, spool.productLine, spool.material]
      .map(value => safeText(value, 80))
      .filter(value => value && value !== 'Unknown')
      .join(' · ') || 'Unknown filament';
  }

  function validateSpool(input = {}, options = {}) {
    const spool = normalizeSpool(input, options);
    const errors = [];
    const warnings = [];
    if (!spool.id) errors.push({code:'id-required', field:'id', message:'Spool ID is required.'});
    if (spool.gross !== null && spool.tare !== null && spool.gross < spool.tare) {
      errors.push({code:'gross-below-tare', field:'gross', message:'Gross weight cannot be less than tare weight.'});
    }
    const remaining = measurement(spool);
    if (remaining.measured && remaining.grams > spool.startWeight) {
      warnings.push({code:'remaining-above-nominal', field:'gross', message:'Measured filament remaining exceeds the nominal filament weight; verify tare and nominal weight.'});
    }
    if (spool.diameterMm !== null && (spool.diameterMm < 1 || spool.diameterMm > 3)) {
      warnings.push({code:'diameter-unusual', field:'diameterMm', message:'Filament diameter is outside the typical 1–3 mm range.'});
    }
    if (spool.placementState === 'Loaded' && !spool.printerName) {
      warnings.push({code:'loaded-without-printer', field:'printerName', message:'Loaded spool does not identify a printer.'});
    }
    return {spool, errors, warnings, valid:errors.length === 0};
  }

  function normalizeState(input = {}, {owner} = {}) {
    const profile = normalizeOwner(owner || input.profile, owner || 'Bill');
    const spools = Array.isArray(input.spools)
      ? input.spools.map(spool => normalizeSpool(spool, {owner:profile})).filter(spool => spool.id)
      : [];
    return {...input, profile, spools};
  }

  function validateState(input = {}, options = {}) {
    const state = normalizeState(input, options);
    const errors = [];
    const warnings = [];
    const ids = new Map();
    const assignments = new Map();

    for (const spool of state.spools) {
      const result = validateSpool(spool, {owner:state.profile});
      result.errors.forEach(issue => errors.push({...issue, spoolId:spool.id}));
      result.warnings.forEach(issue => warnings.push({...issue, spoolId:spool.id}));
      const id = lowerId(spool.id);
      if (ids.has(id)) errors.push({code:'duplicate-id', spoolId:spool.id, message:`Duplicate spool ID: ${spool.id}.`});
      else ids.set(id, spool.id);
      if (!spool.archivedAt && spool.placementState === 'Loaded') {
        const key = [spool.printerName, spool.feederName, spool.feederSlot].map(value => safeText(value).toLowerCase()).join('|');
        if (key !== '||') {
          if (assignments.has(key)) {
            errors.push({code:'slot-conflict', spoolId:spool.id, message:`${spool.id} conflicts with ${assignments.get(key)} in the same printer/feeder/slot assignment.`});
          } else assignments.set(key, spool.id);
        }
      }
    }
    return {state, errors, warnings, valid:errors.length === 0};
  }

  return Object.freeze({
    DEFAULT_NOMINAL_GRAMS,
    DEFAULT_REORDER_GRAMS,
    OWNERS,
    PLACEMENT_STATES,
    LIFECYCLE_STATES,
    CONFIDENCE_LEVELS,
    isFiniteNumber,
    numberOrNull,
    normalizeOwner,
    normalizeSpool,
    normalizeState,
    measurement,
    lifecycle,
    reorderNeeded,
    productLabel,
    validateSpool,
    validateState,
  });
});
