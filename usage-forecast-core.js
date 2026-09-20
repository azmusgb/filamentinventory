(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FilamentInventoryUsageForecast = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const MAX_USAGE_EVENTS = 2000;
  const USAGE_SOURCES = Object.freeze(['PrinterReported','PrinterEstimated','MeasuredDelta','Manual','Imported']);
  const CONFIDENCE_LEVELS = Object.freeze(['Confirmed','High','Medium','Low','Unknown']);

  const finite = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
  const numberOrNull = value => finite(value) ? Number(value) : null;
  const clean = (value, max = 120) => String(value ?? '').trim().slice(0, max);
  const iso = value => value && !Number.isNaN(Date.parse(String(value))) ? new Date(String(value)).toISOString() : null;
  const round1 = value => Math.round(Number(value) * 10) / 10;
  const lower = value => clean(value, 120).toLowerCase();

  function normalizeUsageEvent(input = {}) {
    const beforeGrams = numberOrNull(input.beforeGrams);
    const afterGrams = numberOrNull(input.afterGrams);
    let consumedGrams = numberOrNull(input.consumedGrams);
    if (consumedGrams === null && beforeGrams !== null && afterGrams !== null && beforeGrams >= afterGrams) consumedGrams = beforeGrams - afterGrams;
    return Object.freeze({
      usageEventId:clean(input.usageEventId || input.id, 120),
      spoolId:clean(input.spoolId, 64),
      printerId:clean(input.printerId || input.printer, 80),
      projectId:clean(input.projectId || input.jobId, 120),
      beforeGrams:beforeGrams === null ? null : Math.max(0, beforeGrams),
      afterGrams:afterGrams === null ? null : Math.max(0, afterGrams),
      consumedGrams:consumedGrams === null ? null : Math.max(0, consumedGrams),
      source:USAGE_SOURCES.includes(String(input.source)) ? String(input.source) : 'Manual',
      observedAt:iso(input.observedAt || input.timestamp),
      confidence:CONFIDENCE_LEVELS.includes(String(input.confidence)) ? String(input.confidence) : 'Unknown',
      beforeEvidenceId:clean(input.beforeEvidenceId, 120),
      afterEvidenceId:clean(input.afterEvidenceId, 120),
      note:clean(input.note, 240),
    });
  }

  function validateUsageEvent(input = {}) {
    const event = normalizeUsageEvent(input);
    const errors = [];
    const warnings = [];
    if (!event.usageEventId) errors.push({code:'usage-event-id-required', field:'usageEventId', message:'Usage event ID is required.'});
    if (!event.spoolId) errors.push({code:'usage-spool-id-required', field:'spoolId', message:'Usage event spool ID is required.'});
    if (!event.observedAt) errors.push({code:'usage-observed-at-required', field:'observedAt', message:'Usage event timestamp is required.'});
    if (event.consumedGrams === null || event.consumedGrams <= 0) errors.push({code:'usage-consumption-required', field:'consumedGrams', message:'Usage event must record positive consumed grams.'});
    if (event.beforeGrams !== null && event.afterGrams !== null) {
      if (event.afterGrams > event.beforeGrams) errors.push({code:'usage-after-exceeds-before', field:'afterGrams', message:'Usage event after grams cannot exceed before grams.'});
      const derived = Math.max(0, event.beforeGrams - event.afterGrams);
      if (event.consumedGrams !== null && Math.abs(derived - event.consumedGrams) > 1) warnings.push({code:'usage-consumption-mismatch', field:'consumedGrams', message:'Consumed grams differ from the before/after quantity delta.'});
    }
    if (!event.beforeEvidenceId || !event.afterEvidenceId) warnings.push({code:'usage-evidence-link-incomplete', field:'beforeEvidenceId', message:'Usage events should link both before and after quantity evidence.'});
    return {event, errors, warnings, valid:errors.length === 0};
  }

  function normalizeUsageEvents(value, limit = MAX_USAGE_EVENTS) {
    const rows = Array.isArray(value) ? value.map(normalizeUsageEvent) : [];
    return rows.filter(row => row.usageEventId && row.spoolId && row.observedAt)
      .sort((a,b) => Date.parse(a.observedAt) - Date.parse(b.observedAt))
      .slice(-Math.max(1, Number(limit) || MAX_USAGE_EVENTS));
  }

  function appendUsageEvent(stateRaw = {}, eventRaw = {}) {
    const state = {...stateRaw, usageEvents:normalizeUsageEvents(stateRaw.usageEvents)};
    const validation = validateUsageEvent(eventRaw);
    if (!validation.valid) return {changed:false, reason:'usage-event-invalid', state, ...validation};
    const event = validation.event;
    const existing = state.usageEvents.find(row => lower(row.usageEventId) === lower(event.usageEventId));
    if (existing) {
      const same = JSON.stringify(existing) === JSON.stringify(event);
      return {changed:false, reason:same ? 'usage-event-exists' : 'usage-event-id-conflict', state, event:existing, errors:same ? [] : [{code:'usage-event-id-conflict', usageEventId:event.usageEventId, message:'Usage event ID already exists with different evidence.'}], warnings:validation.warnings, valid:same};
    }
    state.usageEvents = normalizeUsageEvents([...state.usageEvents, event]);
    return {changed:true, state, event, errors:[], warnings:validation.warnings, valid:true};
  }

  function usageEventFromCompletedPrint({job = {}, spool = {}, beforeEvidence = {}, afterEvidence = {}, observedAt, source = 'PrinterReported', confidence = 'Medium'} = {}) {
    const beforeGrams = numberOrNull(job.remainingAtStart ?? beforeEvidence.remainingGrams);
    const afterGrams = numberOrNull(job.remainingAfter ?? afterEvidence.remainingGrams);
    const consumedGrams = numberOrNull(job.consumedGrams);
    return normalizeUsageEvent({
      usageEventId:('usage-' + clean(job.id, 108)).slice(0,120),
      spoolId:clean(job.spoolId || spool.id, 64),
      printerId:clean(spool.printerId || spool.printerName, 80),
      projectId:clean(job.id, 120),
      beforeGrams,
      afterGrams,
      consumedGrams,
      source,
      observedAt:observedAt || job.completedAt || job.updatedAt,
      confidence,
      beforeEvidenceId:clean(beforeEvidence.evidenceId || (job.quantityEvidenceAtStart && job.quantityEvidenceAtStart.evidenceId), 120),
      afterEvidenceId:clean(afterEvidence.evidenceId || job.completionEvidenceId, 120),
    });
  }

  function eventsForSpool(events = [], spoolId = '') {
    const target = lower(spoolId);
    if (!target) return [];
    return normalizeUsageEvents(events).filter(event => lower(event.spoolId) === target);
  }

  function confidenceFor(count, spanDays) {
    if (count >= 10 && spanDays >= 30) return 'High';
    if (count >= 5 && spanDays >= 14) return 'Medium';
    return 'Low';
  }

  function forecastDepletion({
    spoolId = '',
    remainingGrams = null,
    remainingEvidenceId = '',
    remainingStatus = 'Current',
    verificationRequired = false,
    usageEvents = [],
    reorderThresholdGrams = 250,
    leadTimeDays = 3,
    now = new Date(),
    minEvents = 3,
    minSpanDays = 7,
  } = {}) {
    const current = numberOrNull(remainingGrams);
    const nowDate = now instanceof Date ? now : new Date(now);
    const nowMs = nowDate.getTime();
    if (current === null) return Object.freeze({status:'unknown-remaining', spoolId:clean(spoolId,64), evidenceEventIds:[], remainingEvidenceId:clean(remainingEvidenceId,120)||null});
    if (verificationRequired || String(remainingStatus) !== 'Current') return Object.freeze({status:'verification-required', spoolId:clean(spoolId,64), remainingGrams:Math.max(0,current), remainingEvidenceId:clean(remainingEvidenceId,120)||null, evidenceEventIds:[]});

    const rows = eventsForSpool(usageEvents, spoolId).filter(event => event.consumedGrams !== null && event.consumedGrams > 0 && event.observedAt);
    if (rows.length < Math.max(1, Number(minEvents) || 1)) return Object.freeze({status:'insufficient-evidence', spoolId:clean(spoolId,64), eventCount:rows.length, requiredEventCount:Math.max(1, Number(minEvents) || 1), evidenceEventIds:rows.map(row=>row.usageEventId), remainingGrams:Math.max(0,current), remainingEvidenceId:clean(remainingEvidenceId,120)||null});

    const firstMs = Date.parse(rows[0].observedAt);
    const lastMs = Date.parse(rows[rows.length - 1].observedAt);
    const spanDays = Math.max(0, (lastMs - firstMs) / 86400000);
    if (spanDays < Math.max(0, Number(minSpanDays) || 0)) return Object.freeze({status:'insufficient-span', spoolId:clean(spoolId,64), eventCount:rows.length, spanDays:round1(spanDays), requiredSpanDays:Math.max(0, Number(minSpanDays) || 0), evidenceEventIds:rows.map(row=>row.usageEventId), remainingGrams:Math.max(0,current), remainingEvidenceId:clean(remainingEvidenceId,120)||null});

    const totalConsumedGrams = rows.reduce((sum,row)=>sum + Number(row.consumedGrams || 0), 0);
    const divisorDays = Math.max(1, spanDays);
    const dailyGrams = totalConsumedGrams / divisorDays;
    if (!(dailyGrams > 0)) return Object.freeze({status:'no-usage-rate', spoolId:clean(spoolId,64), eventCount:rows.length, spanDays:round1(spanDays), evidenceEventIds:rows.map(row=>row.usageEventId), remainingGrams:Math.max(0,current), remainingEvidenceId:clean(remainingEvidenceId,120)||null});

    const remaining = Math.max(0,current);
    const threshold = Math.max(0, Number(reorderThresholdGrams) || 0);
    const daysRemaining = remaining / dailyGrams;
    const daysToThreshold = Math.max(0, remaining - threshold) / dailyGrams;
    const depletionAt = new Date(nowMs + daysRemaining * 86400000).toISOString();
    const thresholdAt = new Date(nowMs + daysToThreshold * 86400000).toISOString();
    const orderByAt = new Date(Math.max(nowMs, Date.parse(thresholdAt) - Math.max(0, Number(leadTimeDays) || 0) * 86400000)).toISOString();

    return Object.freeze({
      status:'forecast',
      method:'historical-usage-rate',
      spoolId:clean(spoolId,64),
      remainingGrams:round1(remaining),
      remainingEvidenceId:clean(remainingEvidenceId,120)||null,
      eventCount:rows.length,
      spanDays:round1(spanDays),
      totalConsumedGrams:round1(totalConsumedGrams),
      dailyGrams:round1(dailyGrams),
      daysRemaining:round1(daysRemaining),
      depletionAt,
      reorderThresholdGrams:round1(threshold),
      thresholdAt,
      leadTimeDays:Math.max(0, Number(leadTimeDays) || 0),
      orderByAt,
      confidence:confidenceFor(rows.length, spanDays),
      evidenceEventIds:Object.freeze(rows.map(row=>row.usageEventId)),
    });
  }

  return Object.freeze({MAX_USAGE_EVENTS,USAGE_SOURCES,CONFIDENCE_LEVELS,normalizeUsageEvent,validateUsageEvent,normalizeUsageEvents,appendUsageEvent,usageEventFromCompletedPrint,eventsForSpool,forecastDepletion});
});
