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

  const validNum = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
  const text = value => String(value || '').trim();
  const contract = () => resolveContract?.() || null;

  function measurement(spool = {}) {
    const api = contract();
    if (api?.measurement) return api.measurement(spool);
    const start = validNum(spool.startWeight) && Number(spool.startWeight) > 0 ? Number(spool.startWeight) : 1000;
    if (validNum(spool.gross) && validNum(spool.tare) && Number(spool.gross) >= Number(spool.tare)) {
      const grams = Math.max(0, Number(spool.gross) - Number(spool.tare));
      return {grams, percent:Math.round(Math.min(100, grams / start * 100) * 10) / 10, source:'Measured', evidence:'scale', measured:true};
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
    if (m.source === 'Estimated') return 'Estimated · visual';
    return 'Unknown · verify';
  }

  function productLabel(spool = {}) {
    const api = contract();
    if (api?.productLabel) return api.productLabel(spool);
    return [spool.brand, spool.productLine, spool.material].map(text).filter(value => value && value !== 'Unknown').join(' · ') || 'Unknown filament';
  }

  function slotKey(spool = {}) {
    if (spool.placementState !== 'Loaded') return '';
    return [text(spool.printerName).toLowerCase(), text(spool.feederName).toLowerCase(), text(spool.feederSlot).toLowerCase()].join('|');
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
      const printer = text(spool.printerName) || 'Unassigned printer';
      if (!groups.has(printer)) groups.set(printer, []);
      groups.get(printer).push(spool);
    });
    return [...groups.entries()].sort((a,b) => a[0].localeCompare(b[0])).map(([printer, rows]) => ({
      printer,
      rows:rows.slice().sort((a,b) => `${text(a.feederName)}|${text(a.feederSlot)}`.localeCompare(`${text(b.feederName)}|${text(b.feederSlot)}`, undefined, {numeric:true})),
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
    const known = loaded.map(measurement).filter(m => m.grams !== null);
    const low = loaded.filter(reorderNeeded);
    const unknown = loaded.filter(spool => measurement(spool).grams === null);
    const estimated = loaded.filter(spool => measurement(spool).source === 'Estimated');
    return {
      active:active.length,
      loaded:loaded.length,
      printers:new Set(loaded.map(spool => text(spool.printerName)).filter(Boolean)).size,
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

  return Object.freeze({measurement, reorderNeeded, stockState, evidenceLabel, productLabel, slotKey, activeSpools, loadedSpools, printerGroups, slotConflicts, summary, candidateScore, rankedCandidates});
});
