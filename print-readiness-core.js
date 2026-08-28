(function(root, factory) {
  let contract = null;
  if (typeof module === 'object' && module.exports) {
    try { contract = require('./spool-contract-core.js'); } catch {}
  } else if (root) contract = root.FilamentInventorySpoolContract;
  const api = factory(contract);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FilamentInventoryPrintReadiness = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(contract) {
  'use strict';

  const MAX_PRINT_JOBS = 250;
  const ACTIVE_JOB_STATUSES = new Set(['planned','in-progress']);
  const finite = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
  const number = value => finite(value) ? Number(value) : null;
  const clean = (value, max = 120) => String(value ?? '').trim().slice(0, max);
  const text = value => clean(value).toLowerCase();
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const iso = value => value && !Number.isNaN(Date.parse(String(value))) ? String(value) : null;
  const normalizeColor = value => text(value).replace(/\b(matte|silk|basic|sparkle|glossy|translucent)\b/g, '').replace(/\s+/g, ' ').trim();
  const normalizeMaterial = value => text(value).replace(/\s+/g, ' ').trim();
  const active = spool => Boolean(spool && clean(spool.id, 64) && !spool.archivedAt);

  function measurement(spool = {}) {
    if (contract?.measurement) return contract.measurement(spool);
    const start = finite(spool.startWeight) && Number(spool.startWeight) > 0 ? Number(spool.startWeight) : 1000;
    if (finite(spool.gross) && finite(spool.tare) && Number(spool.gross) >= Number(spool.tare)) {
      const grams = Math.max(0, Number(spool.gross) - Number(spool.tare));
      return {grams, percent:Math.round(clamp(grams / start * 100, 0, 100) * 10) / 10, source:'Measured', evidence:'scale', measured:true};
    }
    if (finite(spool.estimatedRemainingGrams)) {
      const grams = Math.max(0, Number(spool.estimatedRemainingGrams));
      return {grams, percent:Math.round(clamp(grams / start * 100, 0, 100) * 10) / 10, source:'Estimated', evidence:'usage', measured:false};
    }
    if (finite(spool.visualPercent)) {
      const percent = clamp(Number(spool.visualPercent), 0, 100);
      return {grams:Math.round(start * percent / 100), percent, source:'Estimated', evidence:'visual', measured:false};
    }
    return {grams:null, percent:null, source:'Unknown', evidence:'none', measured:false};
  }

  function remaining(spool) {
    return measurement(spool).grams;
  }

  function freshness(spool, now = Date.now()) {
    const stamp = Date.parse(spool?.remainingEvidenceAt || spool?.updatedAt || '');
    if (!Number.isFinite(stamp)) return null;
    return Math.max(0, Math.floor((now - stamp) / 86400000));
  }

  function normalizeRequirement(query = {}) {
    const needed = Math.max(0, number(query.grams) || 0);
    const safetyMargin = clamp(Math.max(0, number(query.safetyMargin) || 0), 0, 100);
    return Object.freeze({
      jobName:clean(query.jobName, 100),
      material:clean(query.material, 80),
      color:clean(query.color, 80),
      grams:needed,
      safetyMargin,
      required:Math.ceil(needed * (1 + safetyMargin / 100)),
      printer:clean(query.printer, 60),
      feeder:clean(query.feeder, 60),
      slot:clean(query.slot, 24),
    });
  }

  function matches(spool, query = {}) {
    const requirement = normalizeRequirement(query);
    const material = normalizeMaterial(requirement.material);
    const color = normalizeColor(requirement.color);
    const spoolMaterial = normalizeMaterial(spool?.material);
    const spoolColor = normalizeColor(spool?.colorName);
    return active(spool)
      && (!material || spoolMaterial === material)
      && (!color || spoolColor.includes(color) || color.includes(spoolColor));
  }

  function assignment(spool = {}) {
    if (spool.placementState !== 'Loaded') return null;
    return Object.freeze({
      printer:clean(spool.printerName, 60),
      feeder:clean(spool.feederName, 60),
      slot:clean(spool.feederSlot, 24),
    });
  }

  function placementRecommendation(spool = {}, allSpools = [], query = {}) {
    const requirement = normalizeRequirement(query);
    const current = assignment(spool);
    if (current) {
      return Object.freeze({
        status:'already-loaded',
        printer:current.printer,
        feeder:current.feeder,
        slot:current.slot,
        label:[current.printer || 'Printer', current.feeder, current.slot ? `Slot ${current.slot}` : ''].filter(Boolean).join(' · '),
      });
    }

    const loaded = allSpools.filter(row => active(row) && row.placementState === 'Loaded');
    const knownPrinters = [...new Set(loaded.map(row => clean(row.printerName, 60)).filter(Boolean))];
    const printer = requirement.printer || (knownPrinters.length === 1 ? knownPrinters[0] : '');
    if (!printer) return Object.freeze({status:'choose-printer', printer:'', feeder:'', slot:'', label:'Choose a printer / AMS target'});

    const feeders = [...new Set(loaded.filter(row => clean(row.printerName, 60) === printer).map(row => clean(row.feederName, 60)).filter(Boolean))];
    const feeder = requirement.feeder || (feeders.length === 1 ? feeders[0] : '');
    if (!feeder) return Object.freeze({status:'choose-feeder', printer, feeder:'', slot:'', label:`${printer} · choose AMS / feeder`});

    const occupied = new Map();
    for (const row of loaded) {
      if (clean(row.printerName, 60) !== printer || clean(row.feederName, 60) !== feeder) continue;
      const slot = clean(row.feederSlot, 24);
      if (slot) occupied.set(slot, clean(row.id, 64));
    }

    if (requirement.slot) {
      const conflict = occupied.get(requirement.slot) || '';
      return Object.freeze({
        status:conflict ? 'occupied' : 'recommended',
        printer,
        feeder,
        slot:requirement.slot,
        conflictSpoolId:conflict,
        label:`${printer} · ${feeder} · Slot ${requirement.slot}${conflict ? ` · occupied by ${conflict}` : ''}`,
      });
    }

    if (/\bams\b/i.test(feeder)) {
      const free = ['1','2','3','4'].find(slot => !occupied.has(slot)) || '';
      if (free) return Object.freeze({status:'recommended', printer, feeder, slot:free, label:`${printer} · ${feeder} · Slot ${free}`});
      return Object.freeze({status:'full', printer, feeder, slot:'', label:`${printer} · ${feeder} · no open slot`});
    }

    return Object.freeze({status:'recommended', printer, feeder, slot:'', label:`${printer} · ${feeder}`});
  }

  function normalizePrintJob(job = {}) {
    const status = ['planned','in-progress','completed','cancelled'].includes(String(job.status)) ? String(job.status) : 'planned';
    return {
      ...job,
      id:clean(job.id, 120),
      status,
      jobName:clean(job.jobName, 100),
      spoolId:clean(job.spoolId, 64),
      material:clean(job.material, 80),
      color:clean(job.color, 80),
      modelGrams:Math.max(0, number(job.modelGrams) || 0),
      safetyMargin:clamp(Math.max(0, number(job.safetyMargin) || 0), 0, 100),
      requiredGrams:Math.max(0, number(job.requiredGrams) || 0),
      remainingAtPlan:number(job.remainingAtPlan),
      reservedBeforePlan:Math.max(0, number(job.reservedBeforePlan) || 0),
      availableAtPlan:number(job.availableAtPlan),
      remainingAtStart:number(job.remainingAtStart),
      reservedAtStart:Math.max(0, number(job.reservedAtStart) || 0),
      availableAtStart:number(job.availableAtStart),
      remainingAfter:number(job.remainingAfter),
      consumedGrams:number(job.consumedGrams),
      evidenceAtPlan:clean(job.evidenceAtPlan, 24),
      evidenceAtStart:clean(job.evidenceAtStart, 24),
      plannedAt:iso(job.plannedAt),
      startedAt:iso(job.startedAt),
      completedAt:iso(job.completedAt),
      cancelledAt:iso(job.cancelledAt),
      updatedAt:iso(job.updatedAt) || iso(job.completedAt) || iso(job.startedAt) || iso(job.cancelledAt) || iso(job.plannedAt),
      placement:job.placement && typeof job.placement === 'object' ? {...job.placement} : null,
    };
  }

  function normalizePrintJobs(value, limit = MAX_PRINT_JOBS) {
    const map = new Map();
    for (const raw of Array.isArray(value) ? value : []) {
      const job = normalizePrintJob(raw);
      if (!job.id || !job.spoolId || !job.plannedAt) continue;
      const old = map.get(job.id);
      if (!old || Date.parse(job.updatedAt || job.plannedAt) >= Date.parse(old.updatedAt || old.plannedAt)) map.set(job.id, job);
    }
    return [...map.values()].sort((a,b) => Date.parse(a.plannedAt) - Date.parse(b.plannedAt)).slice(-Math.max(1, Number(limit) || MAX_PRINT_JOBS));
  }

  function reservationRows(printJobs = [], spoolId = '', excludeJobId = '') {
    const target = clean(spoolId, 64).toLowerCase();
    const excluded = clean(excludeJobId, 120);
    if (!target) return [];
    return normalizePrintJobs(printJobs).filter(job => ACTIVE_JOB_STATUSES.has(job.status)
      && job.id !== excluded
      && clean(job.spoolId, 64).toLowerCase() === target
      && job.requiredGrams > 0);
  }

  function reservedGramsForSpool(printJobs = [], spoolId = '', excludeJobId = '') {
    return Math.round(reservationRows(printJobs, spoolId, excludeJobId).reduce((sum, job) => sum + job.requiredGrams, 0) * 10) / 10;
  }

  function candidateScore(row, requirement, now) {
    let score = 0;
    if (row.measurement.source === 'Measured' && row.enough) score += 100000;
    else if (row.measurement.source === 'Estimated' && row.enough) score += 70000;
    else if (row.measurement.source === 'Unknown') score += 50000;
    else if (row.known) score += 20000;

    if (row.loaded) score += 5000;
    if (requirement.printer && clean(row.spool.printerName, 60).toLowerCase() === requirement.printer.toLowerCase()) score += 3000;
    if (row.measurement.source === 'Measured') score += 2200;
    if (row.enough && row.after !== null && row.after >= row.reorder) score += 1500;
    if (row.enough && row.after !== null && row.after < row.reorder) score -= 400;
    if (row.known) score += Math.min(800, Math.max(0, row.availableGrams || 0) / 5);
    if (row.reservedGrams > 0) score -= Math.min(1200, row.reservedGrams / 2);
    const ageDays = freshness(row.spool, now);
    if (ageDays !== null) score += Math.max(0, 365 - Math.min(365, ageDays));
    return score;
  }

  function evaluate(spools = [], query = {}, now = Date.now(), options = {}) {
    const requirement = normalizeRequirement(query);
    const printJobs = Array.isArray(options?.printJobs) ? options.printJobs : [];
    const excludeJobId = clean(options?.excludeJobId, 120);
    const candidates = (Array.isArray(spools) ? spools : []).filter(spool => matches(spool, requirement)).map(spool => {
      const current = measurement(spool);
      const grams = current.grams;
      const known = grams !== null;
      const reservedGrams = reservedGramsForSpool(printJobs, spool.id, excludeJobId);
      const availableGrams = known ? Math.max(0, Math.round((grams - reservedGrams) * 10) / 10) : null;
      const enough = known && availableGrams >= requirement.required;
      const reorder = finite(spool.reorderThreshold) ? Math.max(0, Number(spool.reorderThreshold)) : 250;
      const after = known ? Math.round((availableGrams - requirement.required) * 10) / 10 : null;
      const loaded = spool.placementState === 'Loaded';
      const row = {
        spool,
        measurement:current,
        grams,
        reservedGrams,
        availableGrams,
        reservedJobs:reservationRows(printJobs, spool.id, excludeJobId).length,
        required:requirement.required,
        after,
        known,
        enough,
        loaded,
        ageDays:freshness(spool, now),
        reorder,
        quantityConfidence:current.source === 'Measured' ? 'authoritative' : current.source === 'Estimated' ? 'provisional' : 'unknown',
        verificationRequired:current.source !== 'Measured',
      };
      row.placement = placementRecommendation(spool, spools, requirement);
      row.score = candidateScore(row, requirement, now);
      return row;
    }).sort((a,b) => b.score - a.score || String(a.spool.id).localeCompare(String(b.spool.id), undefined, {numeric:true}));

    const measuredReady = candidates.find(row => row.enough && row.measurement.source === 'Measured') || null;
    const estimatedReady = candidates.find(row => row.enough && row.measurement.source === 'Estimated') || null;
    const unknown = candidates.find(row => row.measurement.source === 'Unknown') || null;
    const bestKnown = candidates.find(row => row.known) || null;
    const status = measuredReady ? 'ready' : estimatedReady ? 'estimate-ready' : unknown ? 'measurement-needed' : candidates.length ? 'not-enough' : 'no-match';
    const recommended = measuredReady || estimatedReady || unknown || bestKnown;

    return Object.freeze({
      status,
      needed:requirement.grams,
      safetyMargin:requirement.safetyMargin,
      required:requirement.required,
      requirement,
      recommended,
      alternatives:candidates.filter(row => row !== recommended),
      candidates,
      counts:Object.freeze({
        matches:candidates.length,
        measuredReady:candidates.filter(row => row.enough && row.measurement.source === 'Measured').length,
        estimatedReady:candidates.filter(row => row.enough && row.measurement.source === 'Estimated').length,
        unknown:candidates.filter(row => row.measurement.source === 'Unknown').length,
        reserved:candidates.filter(row => row.reservedGrams > 0).length,
      }),
    });
  }

  function cloneState(state = {}) {
    return {
      ...state,
      spools:(Array.isArray(state.spools) ? state.spools : []).map(spool => ({...spool})),
      printJobs:normalizePrintJobs(state.printJobs).map(job => ({...job, placement:job.placement ? {...job.placement} : null})),
    };
  }

  function makeJobId(state, spoolId, at) {
    const stamp = String(at || new Date().toISOString()).replace(/\D/g, '').slice(0, 14);
    const base = `print-${stamp}-${clean(spoolId, 32).toLowerCase() || 'spool'}`;
    const used = new Set(normalizePrintJobs(state?.printJobs).map(job => job.id));
    if (!used.has(base)) return base;
    let index = 2;
    while (used.has(`${base}-${index}`)) index += 1;
    return `${base}-${index}`;
  }

  function findSpool(state, spoolId) {
    const id = clean(spoolId, 64).toLowerCase();
    return (Array.isArray(state?.spools) ? state.spools : []).find(spool => clean(spool?.id, 64).toLowerCase() === id) || null;
  }

  function findJob(state, jobId) {
    const id = clean(jobId, 120);
    return normalizePrintJobs(state?.printJobs).find(job => job.id === id) || null;
  }

  function planJob(stateRaw = {}, query = {}, spoolId = '', at = new Date().toISOString()) {
    const state = cloneState(stateRaw);
    const requirement = normalizeRequirement(query);
    if (requirement.grams <= 0) return {changed:false, reason:'grams-required', state};
    const result = evaluate(state.spools, requirement, Date.parse(at) || Date.now(), {printJobs:state.printJobs});
    const row = result.candidates.find(candidate => clean(candidate.spool.id, 64).toLowerCase() === clean(spoolId, 64).toLowerCase()) || null;
    if (!row) return {changed:false, reason:'spool-not-matching', state, result};
    if (row.known && !row.enough) {
      const reservationConflict = row.reservedGrams > 0 && row.grams >= requirement.required;
      return {changed:false, reason:reservationConflict ? 'reserved' : 'not-enough', state, result, candidate:row};
    }

    const job = normalizePrintJob({
      id:makeJobId(state, row.spool.id, at),
      status:'planned',
      jobName:requirement.jobName || [requirement.material || row.spool.material || 'Print', requirement.color || row.spool.colorName || ''].filter(Boolean).join(' · '),
      spoolId:row.spool.id,
      material:requirement.material || row.spool.material || '',
      color:requirement.color || row.spool.colorName || '',
      modelGrams:requirement.grams,
      safetyMargin:requirement.safetyMargin,
      requiredGrams:requirement.required,
      remainingAtPlan:row.grams,
      reservedBeforePlan:row.reservedGrams,
      availableAtPlan:row.availableGrams,
      evidenceAtPlan:row.measurement.source,
      readinessAtPlan:result.status,
      verificationRequired:row.measurement.source !== 'Measured',
      placement:row.placement,
      plannedAt:at,
      updatedAt:at,
    });
    state.printJobs = normalizePrintJobs([...state.printJobs, job]);
    return {changed:true, state, job, result, candidate:row};
  }

  function activeJobs(state = {}) {
    return normalizePrintJobs(state.printJobs).filter(job => ACTIVE_JOB_STATUSES.has(job.status)).sort((a,b) => Date.parse(b.updatedAt || b.plannedAt) - Date.parse(a.updatedAt || a.plannedAt));
  }

  function runningJobForSpool(state = {}, spoolId = '', excludeJobId = '') {
    const target = clean(spoolId, 64).toLowerCase();
    const excluded = clean(excludeJobId, 120);
    return normalizePrintJobs(state.printJobs).find(job => job.status === 'in-progress'
      && job.id !== excluded
      && clean(job.spoolId, 64).toLowerCase() === target) || null;
  }

  function runningJobForPrinter(state = {}, printer = '', excludeJobId = '') {
    const target = clean(printer, 60).toLowerCase();
    const excluded = clean(excludeJobId, 120);
    if (!target) return null;
    for (const job of normalizePrintJobs(state.printJobs)) {
      if (job.status !== 'in-progress' || job.id === excluded) continue;
      const spool = findSpool(state, job.spoolId);
      if (clean(spool?.printerName, 60).toLowerCase() === target) return job;
    }
    return null;
  }

  function startEligibility(stateRaw = {}, jobId = '') {
    const state = cloneState(stateRaw);
    const job = state.printJobs.find(row => row.id === clean(jobId, 120));
    if (!job) return {ok:false, reason:'job-not-found', state};
    if (job.status !== 'planned') return {ok:false, reason:'job-not-planned', state, job};
    const spool = findSpool(state, job.spoolId);
    if (!spool || spool.archivedAt) return {ok:false, reason:'spool-unavailable', state, job};
    if (spool.placementState !== 'Loaded') return {ok:false, reason:'not-loaded', state, job, spool};
    const current = measurement(spool);
    if (current.source !== 'Measured') return {ok:false, reason:'verification-required', state, job, spool, measurement:current};
    const spoolBusy = runningJobForSpool(state, job.spoolId, job.id);
    if (spoolBusy) return {ok:false, reason:'spool-busy', state, job, spool, measurement:current, conflictJob:spoolBusy};
    const printerBusy = runningJobForPrinter(state, spool.printerName, job.id);
    if (printerBusy) return {ok:false, reason:'printer-busy', state, job, spool, measurement:current, conflictJob:printerBusy};
    const reservedOther = reservedGramsForSpool(state.printJobs, job.spoolId, job.id);
    const availableForJob = Math.max(0, Math.round((current.grams - reservedOther) * 10) / 10);
    if (availableForJob < job.requiredGrams) return {ok:false, reason:reservedOther > 0 ? 'reservation-conflict' : 'not-enough', state, job, spool, measurement:current, reservedOther, availableForJob};
    return {ok:true, reason:'ready', state, job, spool, measurement:current, reservedOther, availableForJob};
  }

  function startJob(stateRaw = {}, jobId = '', at = new Date().toISOString()) {
    const check = startEligibility(stateRaw, jobId);
    if (!check.ok) return {changed:false, ...check};
    const {state, job, spool, measurement:current, reservedOther, availableForJob} = check;
    job.status = 'in-progress';
    job.startedAt = at;
    job.updatedAt = at;
    job.remainingAtStart = current.grams;
    job.reservedAtStart = reservedOther;
    job.availableAtStart = availableForJob;
    job.evidenceAtStart = current.source;
    job.verificationRequired = false;
    job.placement = placementRecommendation(spool, state.spools, {printer:spool.printerName, feeder:spool.feederName, slot:spool.feederSlot});
    state.printJobs = normalizePrintJobs(state.printJobs);
    return {changed:true, state, job, spool, measurement:current, reservedOther, availableForJob};
  }

  function completeJob(stateRaw = {}, jobId = '', consumedGrams, at = new Date().toISOString()) {
    const state = cloneState(stateRaw);
    const job = state.printJobs.find(row => row.id === clean(jobId, 120));
    if (!job) return {changed:false, reason:'job-not-found', state};
    if (job.status !== 'in-progress') return {changed:false, reason:'job-not-running', state, job};
    const spool = findSpool(state, job.spoolId);
    if (!spool || spool.archivedAt) return {changed:false, reason:'spool-unavailable', state, job};
    const consumed = number(consumedGrams);
    if (consumed === null || consumed <= 0) return {changed:false, reason:'consumption-required', state, job, spool};
    const base = number(job.remainingAtStart);
    if (base === null) return {changed:false, reason:'start-remaining-unknown', state, job, spool};
    if (consumed > base) return {changed:false, reason:'consumption-exceeds-start', state, job, spool};

    const remainingAfter = Math.max(0, Math.round((base - consumed) * 10) / 10);
    const completedAt = at;
    spool.estimatedRemainingGrams = remainingAfter;
    spool.gross = null;
    spool.visualPercent = null;
    spool.remainingEvidenceSource = 'print-job';
    spool.remainingEvidenceAt = completedAt;
    spool.lastUsedAt = completedAt;
    spool.lastPrintJobId = job.id;
    spool.lastPrintConsumptionGrams = Math.round(consumed * 10) / 10;
    spool.updatedAt = completedAt;

    job.status = 'completed';
    job.completedAt = completedAt;
    job.updatedAt = completedAt;
    job.consumedGrams = Math.round(consumed * 10) / 10;
    job.consumptionSource = 'reported';
    job.remainingAfter = remainingAfter;
    state.printJobs = normalizePrintJobs(state.printJobs);

    const reservedAfter = reservedGramsForSpool(state.printJobs, spool.id);
    const reservationShortfall = Math.max(0, Math.round((reservedAfter - remainingAfter) * 10) / 10);
    const reorder = finite(spool.reorderThreshold) ? Math.max(0, Number(spool.reorderThreshold)) : 250;
    return {changed:true, state, job, spool, remainingAfter, reservedAfter, reservationShortfall, reorderNeeded:remainingAfter <= reorder};
  }

  function cancelJob(stateRaw = {}, jobId = '', at = new Date().toISOString()) {
    const state = cloneState(stateRaw);
    const job = state.printJobs.find(row => row.id === clean(jobId, 120));
    if (!job) return {changed:false, reason:'job-not-found', state};
    if (job.status === 'completed' || job.status === 'cancelled') return {changed:false, reason:'job-final', state, job};
    job.status = 'cancelled';
    job.cancelledAt = at;
    job.updatedAt = at;
    state.printJobs = normalizePrintJobs(state.printJobs);
    return {changed:true, state, job};
  }

  function recentJobs(state = {}, limit = 5) {
    return normalizePrintJobs(state.printJobs).slice().sort((a,b) => Date.parse(b.updatedAt || b.plannedAt) - Date.parse(a.updatedAt || a.plannedAt)).slice(0, Math.max(1, Number(limit) || 5));
  }

  return Object.freeze({
    MAX_PRINT_JOBS,
    active,
    measurement,
    remaining,
    freshness,
    normalizeRequirement,
    normalizeColor,
    normalizeMaterial,
    matches,
    placementRecommendation,
    evaluate,
    normalizePrintJob,
    normalizePrintJobs,
    reservationRows,
    reservedGramsForSpool,
    findSpool,
    findJob,
    planJob,
    startEligibility,
    startJob,
    completeJob,
    cancelJob,
    activeJobs,
    runningJobForSpool,
    runningJobForPrinter,
    recentJobs,
  });
});