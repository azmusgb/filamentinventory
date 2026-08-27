(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FilamentInventoryPersonal = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const OWNERS = ['Bill','Aimee'];
  const text = value => String(value ?? '').trim();
  const timestamp = value => {
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const numeric = value => {
    if (value === '' || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };

  function ownerOf(spool) {
    const owner = text(spool?.owner);
    return OWNERS.includes(owner) ? owner : 'Bill';
  }

  function remaining(spool) {
    const gross = numeric(spool?.gross);
    const tare = numeric(spool?.tare);
    const start = numeric(spool?.startWeight);
    const visual = numeric(spool?.visualPercent);
    if (gross !== null && tare !== null) {
      const grams = Math.max(0, gross - tare);
      return {grams, percent:start && start > 0 ? Math.max(0, Math.min(100, grams / start * 100)) : null, source:'measured'};
    }
    if (start !== null && start > 0 && visual !== null) {
      return {grams:Math.max(0, start * Math.max(0, Math.min(100, visual)) / 100), percent:Math.max(0, Math.min(100, visual)), source:'visual'};
    }
    return {grams:null, percent:null, source:'unknown'};
  }

  function isReorder(spool) {
    if (spool?.archivedAt) return false;
    const measurement = remaining(spool);
    const threshold = numeric(spool?.reorderThreshold) ?? 250;
    return measurement.grams !== null && measurement.grams <= threshold;
  }

  function activeForOwner(state, owner) {
    const resolved = OWNERS.includes(owner) ? owner : 'Bill';
    return (Array.isArray(state?.spools) ? state.spools : []).filter(spool => !spool?.archivedAt && ownerOf(spool) === resolved);
  }

  function loadedLabel(spool) {
    if (spool?.placementState !== 'Loaded') return 'Stored';
    return [text(spool.printerName) || 'Printer', text(spool.feederName), text(spool.feederSlot) ? `Slot ${text(spool.feederSlot)}` : ''].filter(Boolean).join(' · ');
  }

  function summarizeOwner(state, owner) {
    const active = activeForOwner(state, owner);
    const known = active.map(spool => ({spool, ...remaining(spool)})).filter(row => row.grams !== null);
    const loaded = active.filter(spool => spool?.placementState === 'Loaded');
    const reorder = active.filter(isReorder);
    const unknown = active.filter(spool => remaining(spool).grams === null);
    const knownGrams = known.reduce((sum,row) => sum + row.grams, 0);

    const lowStock = known.slice().sort((a,b) => a.grams - b.grams || text(a.spool.id).localeCompare(text(b.spool.id), undefined, {numeric:true})).slice(0,4);
    const needsMeasurement = unknown.slice().sort((a,b) => timestamp(a.updatedAt) - timestamp(b.updatedAt) || text(a.id).localeCompare(text(b.id), undefined, {numeric:true})).slice(0,4);
    const loadedSpools = loaded.slice().sort((a,b) => loadedLabel(a).localeCompare(loadedLabel(b), undefined, {numeric:true})).slice(0,6);

    return {
      owner:OWNERS.includes(owner) ? owner : 'Bill',
      activeCount:active.length,
      knownGrams,
      loadedCount:loaded.length,
      reorderCount:reorder.length,
      unknownCount:unknown.length,
      active,
      reorder,
      unknown,
      lowStock,
      needsMeasurement,
      loadedSpools,
    };
  }

  function recentActivity(state, owner, limit = 5) {
    const resolved = OWNERS.includes(owner) ? owner : 'Bill';
    return (Array.isArray(state?.auditLog) ? state.auditLog : [])
      .filter(row => row && (text(row.actor) === resolved || text(row.owner) === resolved))
      .sort((a,b) => timestamp(b.at) - timestamp(a.at))
      .slice(0, Math.max(1, Number(limit) || 5));
  }

  function recommendedActions(state, owner) {
    const summary = summarizeOwner(state, owner);
    const actions = [];
    if (summary.reorder.length) {
      const next = summary.reorder.slice().sort((a,b) => (remaining(a).grams ?? Infinity) - (remaining(b).grams ?? Infinity))[0];
      actions.push({kind:'reorder', title:`${summary.reorder.length} spool${summary.reorder.length === 1 ? '' : 's'} at reorder level`, detail:`${text(next.id)} · ${Math.round(remaining(next).grams)} g remaining`, spoolId:text(next.id), view:'inventory'});
    }
    if (summary.unknown.length) {
      const next = summary.needsMeasurement[0];
      actions.push({kind:'measure', title:`Measure ${summary.unknown.length} unknown spool${summary.unknown.length === 1 ? '' : 's'}`, detail:next ? `${text(next.id)} · ${text(next.brand)} ${text(next.material)}`.trim() : 'Record a scale reading', spoolId:text(next?.id), view:'weigh'});
    }
    if (summary.loadedSpools.length) {
      const next = summary.loadedSpools[0];
      actions.push({kind:'loaded', title:`${summary.loadedCount} spool${summary.loadedCount === 1 ? '' : 's'} loaded now`, detail:`${text(next.id)} · ${loadedLabel(next)}`, spoolId:text(next.id), view:'household'});
    }
    if (!actions.length) actions.push({kind:'healthy', title:'Your inventory is in good shape', detail:'No reorder or unknown-quantity items need attention.', spoolId:'', view:'inventory'});
    return actions.slice(0,3);
  }

  return Object.freeze({OWNERS, activeForOwner, isReorder, loadedLabel, ownerOf, recentActivity, recommendedActions, remaining, summarizeOwner});
});