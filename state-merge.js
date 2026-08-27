(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FilamentInventoryStateMerge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function timestamp(value) {
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function recordTime(spool) {
    return Math.max(timestamp(spool?.updatedAt), timestamp(spool?.createdAt));
  }

  function normalizeTombstones(value) {
    const out = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
    for (const [id, at] of Object.entries(value)) {
      const key = String(id || '').trim().toLowerCase();
      const when = String(at || '');
      if (key && timestamp(when)) out[key] = when;
    }
    return out;
  }

  function mergeTombstones(currentValue, incomingValue) {
    const out = normalizeTombstones(currentValue);
    for (const [id, at] of Object.entries(normalizeTombstones(incomingValue))) {
      if (timestamp(at) >= timestamp(out[id])) out[id] = at;
    }
    return out;
  }

  function mergeBackupStates(currentRaw, incomingRaw) {
    const current = currentRaw && typeof currentRaw === 'object' ? currentRaw : {};
    const incoming = incomingRaw && typeof incomingRaw === 'object' ? incomingRaw : {};
    const currentSpools = Array.isArray(current.spools) ? current.spools : [];
    const incomingSpools = Array.isArray(incoming.spools) ? incoming.spools : [];
    const tombstones = mergeTombstones(current.tombstones, incoming.tombstones);
    const byId = new Map();

    for (const spool of currentSpools) {
      const key = String(spool?.id || '').trim().toLowerCase();
      if (key) byId.set(key, spool);
    }
    for (const spool of incomingSpools) {
      const key = String(spool?.id || '').trim().toLowerCase();
      if (!key) continue;
      const old = byId.get(key);
      if (!old || recordTime(spool) >= recordTime(old)) byId.set(key, spool);
    }

    const spools = [...byId.entries()]
      .filter(([id, spool]) => !tombstones[id] || timestamp(tombstones[id]) < recordTime(spool))
      .map(([, spool]) => spool);

    const liveIds = new Set(spools.map(spool => String(spool?.id || '').trim().toLowerCase()).filter(Boolean));
    const deletedIds = new Set(Object.entries(tombstones)
      .filter(([id, at]) => !liveIds.has(id) && timestamp(at) > 0)
      .map(([id]) => id));

    const logs = new Map();
    for (const row of [
      ...(Array.isArray(current.weighLog) ? current.weighLog : []),
      ...(Array.isArray(incoming.weighLog) ? incoming.weighLog : []),
    ]) {
      const id = String(row?.id || '').trim().toLowerCase();
      if (!id || deletedIds.has(id)) continue;
      const key = [id, String(row?.at || ''), String(row?.gross ?? ''), String(row?.tare ?? ''), String(row?.note || '')].join('|');
      logs.set(key, row);
    }

    const weighLog = [...logs.values()].sort((a, b) => timestamp(a?.at) - timestamp(b?.at));
    const version = Math.max(Number(current.version) || 0, Number(incoming.version) || 0);

    return {
      ...current,
      ...incoming,
      version,
      spools,
      weighLog,
      tombstones,
      meta: { ...(current.meta || {}), ...(incoming.meta || {}) },
    };
  }

  return Object.freeze({
    mergeBackupStates,
    mergeTombstones,
    normalizeTombstones,
    recordTime,
    timestamp,
  });
});
