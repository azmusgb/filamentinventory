(function(root, factory) {
  let contract = null;
  if (typeof module === 'object' && module.exports) {
    try { contract = require('./spool-contract-core.js'); } catch {}
  } else if (root) contract = root.FilamentInventorySpoolContract;
  const api = factory(contract);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FilamentInventoryAttention = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(contract) {
  'use strict';

  const SEVERITY = Object.freeze(['critical','warning','info']);
  const ACTIONS = Object.freeze(['verify','weigh','reorder','review']);
  const clean = (value, max = 120) => String(value ?? '').trim().slice(0,max);
  const nowMs = value => value instanceof Date ? value.getTime() : Number(value) || Date.now();

  function signal(kind, spoolId, severity, action, message, observedAt = null, extra = {}) {
    return Object.freeze({
      key:(kind + ':' + clean(spoolId,64).toLowerCase()).slice(0,140),
      kind:clean(kind,60),
      spoolId:clean(spoolId,64),
      severity:SEVERITY.includes(severity) ? severity : 'info',
      action:ACTIONS.includes(action) ? action : 'review',
      message:clean(message,240),
      observedAt:observedAt || null,
      ...extra,
    });
  }

  function normalizedSpool(raw = {}, state = {}) {
    if (!contract?.normalizeSpool) return raw || {};
    return contract.normalizeSpool(raw,{
      owner:state?.profile || raw?.owner || 'Bill',
      householdId:state?.householdId || state?.household?.householdId || raw?.householdId || 'default-household',
    });
  }

  function quantityAssessment(spool = {}, at = Date.now()) {
    if (contract?.quantityEvidenceAssessment) return contract.quantityEvidenceAssessment(spool,at);
    const current = contract?.measurement ? contract.measurement(spool,at) : {grams:null,source:'Unknown'};
    return {
      status:current.grams === null ? 'unknown' : 'current',
      selected:{remainingGrams:current.grams,observedAt:current.observedAt || null},
      verificationRequired:current.grams === null,
    };
  }

  function buildAttention(state = {}, options = {}) {
    const at = nowMs(options.now);
    const horizonDays = Math.max(0, Number(options.forecastHorizonDays ?? 7) || 0);
    const leadTimeDays = Math.max(0, Number(options.leadTimeDays ?? 3) || 0);
    const minForecastEvents = Math.max(2, Number(options.minForecastEvents ?? 3) || 3);
    const minForecastSpanDays = Math.max(1, Number(options.minForecastSpanDays ?? 7) || 7);
    const rows = [];
    const rawSpools = Array.isArray(state.spools) ? state.spools : [];
    const usageEvents = Array.isArray(state.usageEvents) ? state.usageEvents : [];

    for (const rawSpool of rawSpools) {
      if (!rawSpool || rawSpool.archivedAt || !clean(rawSpool.spoolId || rawSpool.id,64)) continue;
      const spool = normalizedSpool(rawSpool,state);
      const id = clean(spool.spoolId || spool.id,64);
      const quantity = quantityAssessment(spool,at);
      const selected = quantity.selected || {};
      const observedAt = selected.observedAt || spool.updatedAt || null;

      if (quantity.status === 'unknown') {
        rows.push(signal('quantity-unknown',id,'warning','weigh','Quantity is unknown. Weigh or verify this spool before relying on remaining filament.',observedAt));
      } else if (quantity.status === 'conflict') {
        rows.push(signal('quantity-conflict',id,'critical','verify','Current quantity evidence conflicts. Verify the spool before printing or forecasting.',observedAt));
      } else if (quantity.status === 'invalid-lineage') {
        rows.push(signal('quantity-lineage-invalid',id,'critical','verify','Quantity evidence lineage is invalid and must be repaired before use.',observedAt));
      } else if (quantity.status === 'stale') {
        rows.push(signal('quantity-stale',id,'warning','weigh','Quantity evidence is stale. Re-weigh or verify this spool.',observedAt));
      }

      const placement = spool?.placement || null;
      if (placement?.status === 'Conflict') {
        rows.push(signal('placement-conflict',id,'critical','verify','Placement evidence is incomplete or conflicting. Verify where this spool is physically loaded.',placement.observedAt || spool.loadedAt || spool.updatedAt || null));
      } else if (placement?.status === 'Stale') {
        rows.push(signal('placement-stale',id,'warning','verify','Placement evidence is stale. Confirm the spool is still in the recorded printer or feeder.',placement.observedAt || spool.updatedAt || null));
      }

      if (quantity.status !== 'current' || !contract?.measurement) continue;

      const measured = contract.measurement(spool,at);
      if (measured.grams === null || measured.verificationRequired) continue;

      const threshold = Number.isFinite(Number(spool.reorderThreshold))
        ? Math.max(0,Number(spool.reorderThreshold))
        : Number(contract?.DEFAULT_REORDER_GRAMS || 250);

      if (measured.grams <= 0) {
        rows.push(signal('empty',id,'critical','reorder','Spool is empty based on current quantity evidence.',observedAt,{remainingGrams:0}));
        continue;
      }

      if (measured.grams <= threshold) {
        rows.push(signal('low-stock',id,'warning','reorder','Spool is at or below its reorder threshold.',observedAt,{
          remainingGrams:measured.grams,
          reorderThresholdGrams:threshold,
        }));
        continue;
      }

      if (!contract?.usageForecast) continue;
      const forecast = contract.usageForecast(spool,usageEvents,at,{
        minEvents:minForecastEvents,
        minSpanDays:minForecastSpanDays,
        reorderThresholdGrams:threshold,
        leadTimeDays,
      });
      if (forecast.status !== 'Projected') continue;

      const orderBy = Date.parse(forecast.orderByDate || '');
      const horizon = at + horizonDays * 86400000;
      if (!Number.isFinite(orderBy) || orderBy > horizon) continue;

      rows.push(signal('forecast-reorder',id,'info','reorder','Usage history indicates this spool is approaching its reorder window.',observedAt,{
        orderByDate:forecast.orderByDate,
        depletionDate:forecast.depletionDate,
        dailyGrams:forecast.dailyGrams,
        evidenceEventIds:forecast.eventIds,
        quantityEvidenceId:forecast.quantityEvidenceId,
        forecastConfidence:forecast.confidence,
      }));
    }

    const byKey = new Map();
    const rank = {critical:0,warning:1,info:2};
    for (const row of rows) {
      const old = byKey.get(row.key);
      if (!old || rank[row.severity] < rank[old.severity]) byKey.set(row.key,row);
    }
    return Object.freeze([...byKey.values()].sort(
      (a,b) => rank[a.severity]-rank[b.severity] || a.key.localeCompare(b.key,undefined,{numeric:true})
    ));
  }

  function notificationTransitions(previous = [], current = [], options = {}) {
    const now = nowMs(options.now);
    const suppressions = options.suppressions && typeof options.suppressions === 'object' ? options.suppressions : {};
    const before = new Map((Array.isArray(previous) ? previous : []).map(row => [clean(row?.key,140),row]));
    const out = [];
    for (const row of Array.isArray(current) ? current : []) {
      const key = clean(row?.key,140);
      if (!key) continue;
      const until = Date.parse(String(suppressions[key] || ''));
      if (Number.isFinite(until) && until > now) continue;
      const old = before.get(key);
      if (!old || old.severity !== row.severity || old.action !== row.action || old.message !== row.message) out.push(row);
    }
    return Object.freeze(out);
  }

  function suppressionMap(current = {}, key = '', until = null) {
    const next = {...(current && typeof current === 'object' ? current : {})};
    const cleanKey = clean(key,140);
    if (!cleanKey) return Object.freeze(next);
    if (!until || Number.isNaN(Date.parse(String(until)))) delete next[cleanKey];
    else next[cleanKey] = new Date(String(until)).toISOString();
    return Object.freeze(next);
  }

  return Object.freeze({SEVERITY,ACTIONS,buildAttention,notificationTransitions,suppressionMap});
});
