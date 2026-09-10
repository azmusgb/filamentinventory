(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FilamentInventorySpoolContract = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const DEFAULT_REORDER_GRAMS = 250;
  const OWNERS = Object.freeze(['Bill', 'Aimee']);
  const PLACEMENT_STATES = Object.freeze(['Stored', 'Loaded']);
  const LIFECYCLE_STATES = Object.freeze(['Available', 'Loaded', 'Low', 'Empty', 'Archived']);
  const STOCK_STATES = Object.freeze(['Unknown', 'Available', 'Low', 'Empty', 'Archived']);
  const CONFIDENCE_LEVELS = Object.freeze(['Confirmed', 'High', 'Medium', 'Low', 'Unknown']);
  const TRI_STATES = Object.freeze(['Yes', 'No', 'Unknown']);
  const QUANTITY_EVIDENCE_METHODS = Object.freeze([
    'Measured',
    'Calculated from measured',
    'Printer-estimated usage',
    'Visual estimate',
    'Imported estimate',
    'Unknown',
  ]);
  const QUANTITY_EVIDENCE_PRIORITY = Object.freeze({
    'Measured': 600,
    'Calculated from measured': 500,
    'Printer-estimated usage': 400,
    'Visual estimate': 300,
    'Imported estimate': 200,
    'Unknown': 0,
  });
  const QUANTITY_CONFLICT_WINDOW_MS = 5 * 60 * 1000;
  const QUANTITY_CONFLICT_MIN_GRAMS = 10;

  const isFiniteNumber = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
  const numberOrNull = value => isFiniteNumber(value) ? Number(value) : null;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const safeText = (value, max = 120) => String(value ?? '').trim().slice(0, max);
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '';
  const validIso = value => value && !Number.isNaN(Date.parse(String(value))) ? String(value) : null;
  const validHex = value => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : '#64748b';
  const normalizeTriState = value => TRI_STATES.includes(String(value)) ? String(value) : 'Unknown';
  const normalizeOwner = (value, fallback = 'Bill') => OWNERS.includes(String(value)) ? String(value) : (OWNERS.includes(String(fallback)) ? String(fallback) : 'Bill');
  const lowerId = value => safeText(value, 64).toLowerCase();

  function normalizeQuantityEvidence(input = {}, {spoolId = ''} = {}) {
    const method = QUANTITY_EVIDENCE_METHODS.includes(String(input.method)) ? String(input.method) : 'Unknown';
    const grossGrams = isFiniteNumber(input.grossGrams) ? Math.max(0, Number(input.grossGrams)) : null;
    const tareGrams = isFiniteNumber(input.tareGrams) ? Math.max(0, Number(input.tareGrams)) : null;
    let remainingGrams = isFiniteNumber(input.remainingGrams) ? Math.max(0, Number(input.remainingGrams)) : null;
    if (method === 'Measured' && grossGrams !== null && tareGrams !== null && grossGrams >= tareGrams) remainingGrams = Math.max(0, grossGrams - tareGrams);
    if (method === 'Unknown') remainingGrams = null;
    return Object.freeze({
      evidenceId:safeText(input.evidenceId, 120),
      spoolId:safeText(input.spoolId || spoolId, 64),
      method,
      grossGrams,
      tareGrams,
      remainingGrams,
      source:safeText(input.source, 120),
      observedAt:validIso(input.observedAt),
      confidence:CONFIDENCE_LEVELS.includes(String(input.confidence)) ? String(input.confidence) : 'Unknown',
      staleAfter:validIso(input.staleAfter),
      derivedFromEvidenceId:safeText(input.derivedFromEvidenceId, 120),
    });
  }

  function normalizeQuantityEvidenceList(value, {spoolId = ''} = {}) {
    if (!Array.isArray(value)) return [];
    return value.map(row => normalizeQuantityEvidence(row, {spoolId}));
  }

  function legacyQuantityEvidence(spool = {}) {
    const spoolId = safeText(spool.id, 64);
    if (isFiniteNumber(spool.gross) && isFiniteNumber(spool.tare) && Number(spool.gross) >= Number(spool.tare)) {
      return normalizeQuantityEvidence({evidenceId:'',spoolId,method:'Measured',grossGrams:Number(spool.gross),tareGrams:Number(spool.tare),remainingGrams:Number(spool.gross)-Number(spool.tare),source:'legacy-scale',observedAt:spool.remainingEvidenceAt || spool.updatedAt,confidence:'Confirmed'}, {spoolId});
    }
    if (isFiniteNumber(spool.estimatedRemainingGrams)) {
      return normalizeQuantityEvidence({evidenceId:'',spoolId,method:'Printer-estimated usage',remainingGrams:Number(spool.estimatedRemainingGrams),source:'legacy-usage',observedAt:spool.remainingEvidenceAt || spool.updatedAt,confidence:spool.confidence}, {spoolId});
    }
    if (isFiniteNumber(spool.visualPercent)) {
      const nominal = isFiniteNumber(spool.startWeight) && Number(spool.startWeight) > 0 ? Number(spool.startWeight) : null;
      const percent = clamp(Number(spool.visualPercent), 0, 100);
      return normalizeQuantityEvidence({evidenceId:'',spoolId,method:'Visual estimate',remainingGrams:nominal === null ? null : Math.round(nominal * percent / 100),source:'legacy-visual',observedAt:spool.remainingEvidenceAt || spool.updatedAt,confidence:spool.confidence}, {spoolId});
    }
    return normalizeQuantityEvidence({spoolId,method:'Unknown',source:'legacy-unknown'}, {spoolId});
  }

  function evidenceTimestamp(evidence = {}) {
    const stamp = Date.parse(evidence.observedAt || '');
    return Number.isFinite(stamp) ? stamp : 0;
  }

  function strongestQuantityEvidence(spool = {}) {
    const explicit = normalizeQuantityEvidenceList(spool.quantityEvidence, {spoolId:spool.id});
    if (!explicit.length) return legacyQuantityEvidence(spool);
    return explicit.slice().sort((a,b) => {
      const priority = (QUANTITY_EVIDENCE_PRIORITY[b.method] || 0) - (QUANTITY_EVIDENCE_PRIORITY[a.method] || 0);
      if (priority) return priority;
      return evidenceTimestamp(b) - evidenceTimestamp(a);
    })[0] || normalizeQuantityEvidence({spoolId:spool.id,method:'Unknown'}, {spoolId:spool.id});
  }

  function evidenceAgeDays(evidence = {}, now = Date.now()) {
    const stamp = evidenceTimestamp(evidence);
    if (!stamp) return null;
    return Math.max(0, Math.floor((Number(now) - stamp) / 86400000));
  }

  function isEvidenceStale(evidence = {}, now = Date.now()) {
    const staleAt = Date.parse(evidence.staleAfter || '');
    return Number.isFinite(staleAt) ? Number(now) > staleAt : false;
  }

  function quantityEvidenceAssessment(spool = {}, now = Date.now()) {
    const explicit = normalizeQuantityEvidenceList(spool.quantityEvidence, {spoolId:spool.id});
    const selected = strongestQuantityEvidence(spool);
    const known = explicit.filter(evidence => evidence.remainingGrams !== null && evidence.method !== 'Unknown' && evidenceTimestamp(evidence));
    const conflicts = [];
    for (let firstIndex = 0; firstIndex < known.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < known.length; secondIndex += 1) {
        const first = known[firstIndex];
        const second = known[secondIndex];
        if (first.derivedFromEvidenceId && lowerId(first.derivedFromEvidenceId) === lowerId(second.evidenceId)) continue;
        if (second.derivedFromEvidenceId && lowerId(second.derivedFromEvidenceId) === lowerId(first.evidenceId)) continue;
        const timeDelta = Math.abs(evidenceTimestamp(first) - evidenceTimestamp(second));
        if (timeDelta > QUANTITY_CONFLICT_WINDOW_MS) continue;
        const largest = Math.max(first.remainingGrams, second.remainingGrams, 1);
        const tolerance = Math.max(QUANTITY_CONFLICT_MIN_GRAMS, largest * 0.02);
        if (Math.abs(first.remainingGrams - second.remainingGrams) <= tolerance) continue;
        conflicts.push(Object.freeze({evidenceIds:Object.freeze([first.evidenceId || null,second.evidenceId || null]),remainingGrams:Object.freeze([first.remainingGrams,second.remainingGrams]),observedAt:Object.freeze([first.observedAt,second.observedAt]),differenceGrams:Math.round(Math.abs(first.remainingGrams-second.remainingGrams)*10)/10}));
      }
    }
    const stale = isEvidenceStale(selected, now);
    const conflictEvidenceIds = [...new Set(conflicts.flatMap(conflict => conflict.evidenceIds).filter(Boolean))];
    const status = selected.method === 'Unknown' || selected.remainingGrams === null ? 'unknown' : conflicts.length ? 'conflict' : stale ? 'stale' : 'current';
    return Object.freeze({status,selected,explicit:explicit.length>0,evidenceCount:explicit.length,ageDays:evidenceAgeDays(selected,now),stale,conflict:conflicts.length>0,conflicts:Object.freeze(conflicts),conflictEvidenceIds:Object.freeze(conflictEvidenceIds),verificationRequired:status !== 'current'});
  }

  function normalizeSpool(input = {}, {owner = 'Bill'} = {}) {
    const id = safeText(input.id, 64);
    const nominal = isFiniteNumber(input.startWeight) && Number(input.startWeight) > 0 ? Number(input.startWeight) : null;
    const gross = isFiniteNumber(input.gross) ? Math.max(0, Number(input.gross)) : null;
    const tare = isFiniteNumber(input.tare) ? Math.max(0, Number(input.tare)) : null;
    const visualPercent = isFiniteNumber(input.visualPercent) ? clamp(Number(input.visualPercent), 0, 100) : null;
    const estimatedRemainingGrams = isFiniteNumber(input.estimatedRemainingGrams) ? Math.max(0, Number(input.estimatedRemainingGrams)) : null;
    const archivedAt = validIso(input.archivedAt);
    let placementState = PLACEMENT_STATES.includes(String(input.placementState)) ? String(input.placementState) : '';
    const printerName = safeText(input.printerName, 60);
    const feederName = safeText(input.feederName, 60);
    const feederSlot = safeText(input.feederSlot, 24);
    if (!placementState) placementState = printerName || feederName || feederSlot ? 'Loaded' : 'Stored';
    if (archivedAt) placementState = 'Stored';
    return {
      ...input,id,
      brand:safeText(input.brand || 'Unknown',60) || 'Unknown',productLine:safeText(input.productLine,80),material:safeText(input.material || 'Unknown',80) || 'Unknown',colorName:safeText(input.colorName || 'Unknown',80) || 'Unknown',colorHex:validHex(input.colorHex),diameterMm:isFiniteNumber(input.diameterMm) && Number(input.diameterMm)>0 ? Number(input.diameterMm) : null,manufacturerSku:safeText(input.manufacturerSku,80),lotBatch:safeText(input.lotBatch,80),spoolType:safeText(input.spoolType || 'Unknown',40) || 'Unknown',startWeight:nominal,visualPercent,estimatedRemainingGrams,gross,tare,quantityEvidence:normalizeQuantityEvidenceList(input.quantityEvidence,{spoolId:id}),location:safeText(input.location,80),confidence:CONFIDENCE_LEVELS.includes(String(input.confidence)) ? String(input.confidence) : 'Unknown',opened:normalizeTriState(input.opened),bagged:normalizeTriState(input.bagged),purchaseSource:safeText(input.purchaseSource,100),purchasePrice:isFiniteNumber(input.purchasePrice) && Number(input.purchasePrice)>=0 ? Number(input.purchasePrice) : null,purchaseDate:validDate(input.purchaseDate),reorderThreshold:isFiniteNumber(input.reorderThreshold) && Number(input.reorderThreshold)>=0 ? Number(input.reorderThreshold) : DEFAULT_REORDER_GRAMS,lastDriedDate:validDate(input.lastDriedDate),owner:normalizeOwner(input.owner,owner),placementState,printerName:placementState==='Loaded' ? printerName : '',feederName:placementState==='Loaded' ? feederName : '',feederSlot:placementState==='Loaded' ? feederSlot : '',loadedAt:placementState==='Loaded' ? (validIso(input.loadedAt) || null) : null,lastUsedAt:validIso(input.lastUsedAt),notes:safeText(input.notes,1000),createdAt:validIso(input.createdAt),updatedAt:validIso(input.updatedAt),archivedAt,
    };
  }

  function measurement(spool = {}, now = Date.now()) {
    const nominal = isFiniteNumber(spool.startWeight) && Number(spool.startWeight)>0 ? Number(spool.startWeight) : null;
    const explicit = Array.isArray(spool.quantityEvidence) && spool.quantityEvidence.length>0;
    if (explicit) {
      const assessment = quantityEvidenceAssessment(spool, now);
      const evidence = assessment.selected;
      const grams = evidence.remainingGrams;
      const percent = grams !== null && nominal ? Math.round(clamp(grams/nominal*100,0,100)*10)/10 : null;
      const base = {evidence:'quantity-evidence',evidenceId:evidence.evidenceId || null,method:evidence.method,observedAt:evidence.observedAt,staleAfter:evidence.staleAfter,stale:assessment.stale,conflict:assessment.conflict,evidenceStatus:assessment.status,verificationRequired:assessment.verificationRequired};
      if (evidence.method === 'Measured' || evidence.method === 'Calculated from measured') return {...base,grams,percent,source:'Measured',measured:true};
      if (evidence.method !== 'Unknown') return {...base,grams,percent,source:'Estimated',measured:false};
      return {...base,grams:null,percent:null,source:'Unknown',measured:false};
    }
    if (isFiniteNumber(spool.gross) && isFiniteNumber(spool.tare) && Number(spool.gross)>=Number(spool.tare)) {
      const grams = Math.max(0,Number(spool.gross)-Number(spool.tare));
      return {grams,percent:nominal ? Math.round(clamp(grams/nominal*100,0,100)*10)/10 : null,source:'Measured',evidence:'scale',measured:true};
    }
    if (isFiniteNumber(spool.estimatedRemainingGrams)) {
      const grams = Math.max(0,Number(spool.estimatedRemainingGrams));
      return {grams,percent:nominal ? Math.round(clamp(grams/nominal*100,0,100)*10)/10 : null,source:'Estimated',evidence:'usage',measured:false};
    }
    if (isFiniteNumber(spool.visualPercent)) {
      const percent = clamp(Number(spool.visualPercent),0,100);
      return {grams:nominal ? Math.round(nominal*percent/100) : null,percent,source:'Estimated',evidence:'visual',measured:false};
    }
    return {grams:null,percent:null,source:'Unknown',evidence:'none',measured:false};
  }

  function stockState(spool = {}) {
    if (spool.archivedAt) return 'Archived';
    const remaining = measurement(spool);
    if (remaining.grams === null) return 'Unknown';
    if (remaining.grams === 0) return 'Empty';
    const threshold = isFiniteNumber(spool.reorderThreshold) ? Number(spool.reorderThreshold) : DEFAULT_REORDER_GRAMS;
    if (remaining.grams <= threshold) return 'Low';
    return 'Available';
  }
  function lifecycle(spool = {}) { if (spool.archivedAt) return 'Archived'; const stock=stockState(spool); if (stock==='Empty') return 'Empty'; if (String(spool.placementState)==='Loaded') return 'Loaded'; if (stock==='Low') return 'Low'; return 'Available'; }
  function reorderNeeded(spool = {}) { const stock=stockState(spool); return stock==='Low' || stock==='Empty'; }
  function productLabel(spool = {}) { return [spool.brand,spool.productLine,spool.material].map(value=>safeText(value,80)).filter(value=>value && value!=='Unknown').join(' · ') || 'Unknown filament'; }
  function placementLabel(spool = {}) { if (spool.archivedAt) return 'Archived'; if (String(spool.placementState)!=='Loaded') return safeText(spool.location,80) || 'Stored / unassigned'; return [safeText(spool.printerName,60) || 'Loaded',safeText(spool.feederName,60),safeText(spool.feederSlot,24) ? `Slot ${safeText(spool.feederSlot,24)}` : ''].filter(Boolean).join(' · '); }
  function evidenceLabel(spool = {}) { const remaining=measurement(spool); const caveat=remaining.conflict ? ' · conflict' : remaining.stale ? ' · stale' : ''; if (remaining.source==='Measured') return remaining.method ? `${remaining.method} · evidence${caveat}` : 'Measured · scale'; if (remaining.evidence==='quantity-evidence' && remaining.method) return `${remaining.method}${remaining.grams===null ? ' · amount unknown' : ''}${caveat}`; if (remaining.evidence==='usage') return remaining.grams===null ? 'Estimated · usage · amount unknown' : 'Estimated · usage'; if (remaining.evidence==='visual') return remaining.grams===null ? 'Estimated · visual · nominal unknown' : 'Estimated · visual'; return 'Unknown · verify'; }
  function workflowSummary(input = {}, options = {}) { const spool=normalizeSpool(input,options); const remaining=measurement(spool); const stock=stockState(spool); const life=lifecycle(spool); return Object.freeze({spool,productLabel:productLabel(spool),placementLabel:placementLabel(spool),lifecycle:life,stock,measurement:remaining,evidenceLabel:evidenceLabel(spool),reorderNeeded:reorderNeeded(spool),needsMeasurement:remaining.grams===null || remaining.source!=='Measured' || Boolean(remaining.verificationRequired),loaded:spool.placementState==='Loaded' && !spool.archivedAt,archived:Boolean(spool.archivedAt)}); }

  function validateSpool(input = {}, options = {}) {
    const spool=normalizeSpool(input,options); const errors=[]; const warnings=[];
    if (!spool.id) errors.push({code:'id-required',field:'id',message:'Spool ID is required.'});
    if (spool.gross!==null && spool.tare!==null && spool.gross<spool.tare) errors.push({code:'gross-below-tare',field:'gross',message:'Gross weight cannot be less than tare weight.'});
    const evidenceIds=new Set();
    for (const evidence of spool.quantityEvidence) {
      if (evidence.spoolId && lowerId(evidence.spoolId)!==lowerId(spool.id)) errors.push({code:'quantity-evidence-spool-mismatch',field:'quantityEvidence',evidenceId:evidence.evidenceId,message:'Quantity evidence belongs to a different spool.'});
      if (evidence.evidenceId) { const evidenceKey=lowerId(evidence.evidenceId); if (evidenceIds.has(evidenceKey)) errors.push({code:'duplicate-quantity-evidence-id',field:'quantityEvidence',evidenceId:evidence.evidenceId,message:`Duplicate quantity evidence ID: ${evidence.evidenceId}.`}); else evidenceIds.add(evidenceKey); }
      if (evidence.grossGrams!==null && evidence.tareGrams!==null && evidence.grossGrams<evidence.tareGrams) errors.push({code:'quantity-evidence-gross-below-tare',field:'quantityEvidence',evidenceId:evidence.evidenceId,message:'Quantity evidence gross weight cannot be less than tare weight.'});
      if (evidence.method==='Measured' && (evidence.grossGrams===null || evidence.tareGrams===null)) warnings.push({code:'measured-evidence-missing-gross-or-tare',field:'quantityEvidence',evidenceId:evidence.evidenceId,message:'Measured quantity evidence should preserve both gross and tare grams.'});
      if (evidence.method==='Calculated from measured' && !evidence.derivedFromEvidenceId) warnings.push({code:'derived-evidence-missing-source',field:'quantityEvidence',evidenceId:evidence.evidenceId,message:'Calculated quantity evidence should identify its source evidence.'});
    }
    const assessment=quantityEvidenceAssessment(spool);
    if (assessment.conflict) warnings.push({code:'quantity-evidence-conflict',field:'quantityEvidence',evidenceIds:assessment.conflictEvidenceIds,message:'Quantity evidence contains contemporaneous conflicting remaining-weight values; verify before relying on one value.'});
    const remaining=measurement(spool);
    if (remaining.measured && spool.startWeight!==null && remaining.grams!==null && remaining.grams>spool.startWeight) warnings.push({code:'remaining-above-nominal',field:'gross',message:'Measured filament remaining exceeds the nominal filament weight; verify tare and nominal weight.'});
    if (spool.diameterMm!==null && (spool.diameterMm<1 || spool.diameterMm>3)) warnings.push({code:'diameter-unusual',field:'diameterMm',message:'Filament diameter is outside the typical 1–3 mm range.'});
    if (spool.placementState==='Loaded' && !spool.printerName) warnings.push({code:'loaded-without-printer',field:'printerName',message:'Loaded spool does not identify a printer.'});
    return {spool,errors,warnings,valid:errors.length===0};
  }

  function normalizeState(input = {}, {owner} = {}) { const profile=normalizeOwner(owner || input.profile,owner || 'Bill'); const spools=Array.isArray(input.spools) ? input.spools.map(spool=>normalizeSpool(spool,{owner:profile})).filter(spool=>spool.id) : []; return {...input,profile,spools}; }
  function validateState(input = {}, options = {}) { const state=normalizeState(input,options); const errors=[]; const warnings=[]; const ids=new Map(); const assignments=new Map(); for (const spool of state.spools) { const result=validateSpool(spool,{owner:state.profile}); result.errors.forEach(issue=>errors.push({...issue,spoolId:spool.id})); result.warnings.forEach(issue=>warnings.push({...issue,spoolId:spool.id})); const id=lowerId(spool.id); if (ids.has(id)) errors.push({code:'duplicate-id',spoolId:spool.id,message:`Duplicate spool ID: ${spool.id}.`}); else ids.set(id,spool.id); if (!spool.archivedAt && spool.placementState==='Loaded') { const key=[spool.printerName,spool.feederName,spool.feederSlot].map(value=>safeText(value).toLowerCase()).join('|'); if (key!=='||') { if (assignments.has(key)) errors.push({code:'slot-conflict',spoolId:spool.id,message:`${spool.id} conflicts with ${assignments.get(key)} in the same printer/feeder/slot assignment.`}); else assignments.set(key,spool.id); } } } return {state,errors,warnings,valid:errors.length===0}; }

  return Object.freeze({DEFAULT_REORDER_GRAMS,OWNERS,PLACEMENT_STATES,LIFECYCLE_STATES,STOCK_STATES,CONFIDENCE_LEVELS,QUANTITY_EVIDENCE_METHODS,QUANTITY_CONFLICT_WINDOW_MS,QUANTITY_CONFLICT_MIN_GRAMS,isFiniteNumber,numberOrNull,normalizeOwner,normalizeQuantityEvidence,normalizeQuantityEvidenceList,strongestQuantityEvidence,evidenceAgeDays,isEvidenceStale,quantityEvidenceAssessment,normalizeSpool,normalizeState,measurement,stockState,lifecycle,reorderNeeded,productLabel,placementLabel,evidenceLabel,workflowSummary,validateSpool,validateState});
});