(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FilamentInventoryAudit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const MAX_AUDIT_ENTRIES = 1500;
  const SPECIAL_FIELDS = new Set([
    'id','createdAt','updatedAt','owner','placementState','printerName','feederName','feederSlot','loadedAt','archivedAt','gross','tare'
  ]);
  const PRINT_USAGE_FIELDS = new Set([
    'estimatedRemainingGrams','visualPercent','remainingEvidenceSource','remainingEvidenceAt','lastUsedAt','lastPrintJobId','lastPrintConsumptionGrams'
  ]);
  const FIELD_LABELS = {
    brand:'brand', material:'material', colorName:'color', colorHex:'color swatch', spoolType:'spool format',
    startWeight:'starting weight', visualPercent:'visual estimate', estimatedRemainingGrams:'estimated remaining', location:'location', confidence:'confidence',
    opened:'opened state', bagged:'storage state', purchaseSource:'purchase source', purchasePrice:'purchase price',
    purchaseDate:'purchase date', reorderThreshold:'reorder threshold', lastDriedDate:'last dried date', notes:'notes', lastUsedAt:'last used'
  };

  const text = (value, max = 160) => String(value ?? '').trim().slice(0, max);
  const finite = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
  const timestamp = value => {
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const canonical = value => {
    if (Array.isArray(value)) return value.map(canonical);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  };
  const same = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
  const byId = state => new Map((Array.isArray(state?.spools) ? state.spools : [])
    .filter(row => row && text(row.id, 64))
    .map(row => [text(row.id, 64).toLowerCase(), row]));
  const jobsById = state => new Map((Array.isArray(state?.printJobs) ? state.printJobs : [])
    .filter(row => row && text(row.id,120) && text(row.spoolId,64))
    .map(row => [text(row.id,120), row]));
  const measurementKey = row => [text(row?.id,64).toLowerCase(), text(row?.at,64), String(row?.gross ?? ''), String(row?.tare ?? ''), text(row?.note,160)].join('|');
  const placementText = spool => {
    if (spool?.placementState !== 'Loaded') return spool?.location ? `storage · ${text(spool.location,60)}` : 'storage';
    return [text(spool.printerName,60) || 'printer', text(spool.feederName,60), text(spool.feederSlot,24) ? `slot ${text(spool.feederSlot,24)}` : ''].filter(Boolean).join(' · ');
  };
  const displaySpool = spool => [text(spool?.id,64), text(spool?.brand,60), text(spool?.material,60), text(spool?.colorName,60)].filter(Boolean).join(' · ');
  const displayJob = job => text(job?.jobName,100) || [text(job?.material,60),text(job?.color,60)].filter(Boolean).join(' · ') || 'Print';

  function normalizeAuditEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const id = text(entry.id, 120);
    const at = text(entry.at, 40);
    const type = text(entry.type, 50);
    const summary = text(entry.summary, 240);
    if (!id || !timestamp(at) || !type || !summary) return null;
    const changes = Array.isArray(entry.changes) ? entry.changes.slice(0, 12).map(change => ({
      field:text(change?.field, 60),
      from:text(change?.from, 120),
      to:text(change?.to, 120),
    })).filter(change => change.field) : [];
    return {
      id,
      at,
      type,
      summary,
      actor:text(entry.actor, 40) || 'Unknown',
      device:text(entry.device, 60),
      spoolId:text(entry.spoolId, 64),
      owner:text(entry.owner, 40),
      changes,
    };
  }

  function normalizeAuditLog(value, limit = MAX_AUDIT_ENTRIES) {
    const rows = Array.isArray(value) ? value : [];
    const map = new Map();
    for (const row of rows) {
      const normalized = normalizeAuditEntry(row);
      if (!normalized) continue;
      const existing = map.get(normalized.id);
      if (!existing || timestamp(normalized.at) >= timestamp(existing.at)) map.set(normalized.id, normalized);
    }
    return [...map.values()].sort((a,b) => timestamp(a.at) - timestamp(b.at)).slice(-Math.max(1, Number(limit) || MAX_AUDIT_ENTRIES));
  }

  function mergeAuditLogs(left, right, limit = MAX_AUDIT_ENTRIES) {
    return normalizeAuditLog([...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])], limit);
  }

  function buildAuditEvents(previousRaw, nextRaw, context = {}) {
    const previous = previousRaw || {};
    const next = nextRaw || {};
    const actor = text(context.actor, 40) || 'Unknown';
    const device = text(context.device, 60);
    const now = typeof context.now === 'function' ? context.now : () => new Date().toISOString();
    const makeId = typeof context.makeId === 'function' ? context.makeId : () => `audit-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
    const events = [];
    const emit = (type, summary, spool, changes = []) => events.push(normalizeAuditEntry({
      id:makeId(), at:now(), type, summary, actor, device,
      spoolId:text(spool?.id,64), owner:text(spool?.owner,40), changes,
    }));

    const previousLogs = new Set((Array.isArray(previous.weighLog) ? previous.weighLog : []).map(measurementKey));
    const addedMeasurements = (Array.isArray(next.weighLog) ? next.weighLog : []).filter(row => !previousLogs.has(measurementKey(row)));
    const measurementSpools = new Set();
    for (const row of addedMeasurements) {
      const key = text(row?.id,64).toLowerCase();
      if (!key) continue;
      measurementSpools.add(key);
      const spool = (Array.isArray(next.spools) ? next.spools : []).find(item => text(item?.id,64).toLowerCase() === key) || {id:row.id};
      const remaining = finite(row.remaining) ? `${Math.round(Number(row.remaining))} g remaining` : 'measurement recorded';
      emit('measurement.saved', `${text(row.id,64)} · ${remaining}${row.note ? ` · ${text(row.note,100)}` : ''}`, spool);
    }

    const before = byId(previous);
    const after = byId(next);
    const previousJobs = jobsById(previous);
    const nextJobs = jobsById(next);
    const completedSpools = new Set();

    for (const [jobId, newJob] of nextJobs) {
      const oldJob = previousJobs.get(jobId);
      const spoolKey = text(newJob.spoolId,64).toLowerCase();
      const spool = after.get(spoolKey) || before.get(spoolKey) || {id:newJob.spoolId};
      if (!oldJob) {
        const model = finite(newJob.modelGrams) ? `${Math.round(Number(newJob.modelGrams))} g` : 'quantity unknown';
        emit('usage.print-planned', `Planned ${displayJob(newJob)} · ${model} · ${text(newJob.spoolId,64)}`, spool);
        continue;
      }
      if (text(oldJob.status,24) === text(newJob.status,24)) continue;
      if (newJob.status === 'in-progress') {
        emit('usage.print-started', `Started ${displayJob(newJob)} · ${text(newJob.spoolId,64)}`, spool);
      } else if (newJob.status === 'completed') {
        completedSpools.add(spoolKey);
        const consumed = finite(newJob.consumedGrams) ? `${Math.round(Number(newJob.consumedGrams))} g consumed` : 'consumption recorded';
        const remaining = finite(newJob.remainingAfter) ? `${Math.round(Number(newJob.remainingAfter))} g projected remaining` : 'remaining projection unavailable';
        emit('usage.print-completed', `Completed ${displayJob(newJob)} · ${consumed} · ${remaining}`, spool);
      } else if (newJob.status === 'cancelled') {
        emit('usage.print-cancelled', `Cancelled ${displayJob(newJob)} · ${text(newJob.spoolId,64)}`, spool);
      }
    }

    const ids = new Set([...before.keys(), ...after.keys()]);
    for (const id of ids) {
      const oldSpool = before.get(id);
      const newSpool = after.get(id);
      if (!oldSpool && newSpool) {
        emit('inventory.added', `Added ${displaySpool(newSpool)}`, newSpool);
        continue;
      }
      if (oldSpool && !newSpool) {
        emit('inventory.deleted', `Deleted ${displaySpool(oldSpool)}`, oldSpool);
        continue;
      }
      if (!oldSpool || !newSpool) continue;

      if (!oldSpool.archivedAt && newSpool.archivedAt) emit('lifecycle.archived', `Archived ${text(newSpool.id,64)}`, newSpool);
      else if (oldSpool.archivedAt && !newSpool.archivedAt) emit('lifecycle.restored', `Restored ${text(newSpool.id,64)}`, newSpool);

      if (text(oldSpool.owner,40) !== text(newSpool.owner,40)) {
        emit('ownership.transferred', `${text(newSpool.id,64)} · ${text(oldSpool.owner,40) || 'Unassigned'} → ${text(newSpool.owner,40) || 'Unassigned'}`, newSpool,
          [{field:'owner',from:text(oldSpool.owner,40),to:text(newSpool.owner,40)}]);
      }

      const oldPlacement = [oldSpool.placementState,oldSpool.printerName,oldSpool.feederName,oldSpool.feederSlot,oldSpool.loadedAt];
      const newPlacement = [newSpool.placementState,newSpool.printerName,newSpool.feederName,newSpool.feederSlot,newSpool.loadedAt];
      if (!same(oldPlacement,newPlacement)) {
        let type = 'placement.moved';
        if (oldSpool.placementState !== 'Loaded' && newSpool.placementState === 'Loaded') type = 'placement.loaded';
        if (oldSpool.placementState === 'Loaded' && newSpool.placementState !== 'Loaded') type = 'placement.unloaded';
        emit(type, `${text(newSpool.id,64)} · ${placementText(oldSpool)} → ${placementText(newSpool)}`, newSpool);
      }

      const changes = [];
      const keys = new Set([...Object.keys(oldSpool), ...Object.keys(newSpool)]);
      for (const field of keys) {
        if (SPECIAL_FIELDS.has(field)) continue;
        if (measurementSpools.has(id) && field === 'location') continue;
        if (completedSpools.has(id) && PRINT_USAGE_FIELDS.has(field)) continue;
        if (same(oldSpool[field], newSpool[field])) continue;
        changes.push({field:FIELD_LABELS[field] || field, from:text(oldSpool[field],120), to:text(newSpool[field],120)});
      }
      if (changes.length) {
        const names = changes.slice(0,3).map(change => change.field).join(', ');
        emit('inventory.updated', `Updated ${text(newSpool.id,64)} · ${names}${changes.length > 3 ? ` +${changes.length - 3}` : ''}`, newSpool, changes);
      }
    }

    return events.filter(Boolean);
  }

  return { MAX_AUDIT_ENTRIES, normalizeAuditEntry, normalizeAuditLog, mergeAuditLogs, buildAuditEvents };
});
