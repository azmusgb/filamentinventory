((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.FilamentInventoryTrust = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const safeId = value => String(value ?? '').trim();
  const keyId = value => safeId(value).toLocaleLowerCase('en-US');

  function snapshot(state, reason = 'change') {
    return Object.freeze({reason:String(reason), at:new Date().toISOString(), state:clone(state)});
  }

  function restore(entry) {
    if (!entry?.state || !Array.isArray(entry.state.spools)) throw new Error('Recovery snapshot is invalid.');
    return clone(entry.state);
  }

  function previewMerge(currentSpools = [], incomingSpools = []) {
    const current = new Map(currentSpools.map(spool => [keyId(spool.id), spool]).filter(([id]) => id));
    const seen = new Set();
    const conflicts = [], additions = [], duplicates = [];
    for (const incoming of incomingSpools) {
      const id = safeId(incoming?.id);
      const key = keyId(id);
      if (!key) continue;
      if (seen.has(key)) { duplicates.push({id, incoming:clone(incoming)}); continue; }
      seen.add(key);
      const existing = current.get(key);
      if (!existing) additions.push({id, incoming:clone(incoming)});
      else if (JSON.stringify(existing) !== JSON.stringify(incoming)) conflicts.push({id, existing:clone(existing), incoming:clone(incoming)});
    }
    return Object.freeze({additions, conflicts, duplicates, safe:conflicts.length === 0 && duplicates.length === 0});
  }

  function destructiveConfirmation(action, count = 1) {
    const n = Math.max(1, Number(count) || 1);
    const labels = {
      reset: 'RESET INVENTORY',
      delete: n === 1 ? 'DELETE SPOOL' : `DELETE ${n} SPOOLS`,
      replace: 'REPLACE INVENTORY'
    };
    return labels[action] || 'CONFIRM';
  }

  return Object.freeze({snapshot, restore, previewMerge, destructiveConfirmation});
});
