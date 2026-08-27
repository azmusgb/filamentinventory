(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FilamentInventoryPrinter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const validNum = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
  const text = value => String(value || '').trim();

  function measurement(spool = {}) {
    const start = validNum(spool.startWeight) && Number(spool.startWeight) > 0 ? Number(spool.startWeight) : 1000;
    if (validNum(spool.gross) && validNum(spool.tare) && Number(spool.gross) >= Number(spool.tare)) {
      const grams = Math.min(start, Math.max(0, Number(spool.gross) - Number(spool.tare)));
      return {grams, percent:Math.round((grams / start) * 1000) / 10, source:'Measured'};
    }
    if (validNum(spool.visualPercent)) {
      const percent = Math.max(0, Math.min(100, Number(spool.visualPercent)));
      return {grams:Math.round(start * percent / 100), percent, source:'Visual'};
    }
    return {grams:null, percent:null, source:'Unknown'};
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
    const low = loaded.filter(spool => {
      const m = measurement(spool);
      return m.grams !== null && m.grams <= Number(spool.reorderThreshold ?? 250);
    });
    const unknown = loaded.filter(spool => measurement(spool).grams === null);
    return {
      active:active.length,
      loaded:loaded.length,
      printers:new Set(loaded.map(spool => text(spool.printerName)).filter(Boolean)).size,
      knownLoadedGrams:known.reduce((sum,m) => sum + m.grams, 0),
      lowLoaded:low,
      unknownLoaded:unknown,
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
    if (m.grams === null) score -= 4;
    if (m.grams !== null && m.grams <= Number(spool.reorderThreshold ?? 250)) score -= 12;
    return score;
  }

  function rankedCandidates(state = {}, context = {}) {
    return activeSpools(state)
      .map(spool => ({spool, score:candidateScore(spool, context), measurement:measurement(spool)}))
      .sort((a,b) => b.score - a.score || String(a.spool.id).localeCompare(String(b.spool.id), undefined, {numeric:true}));
  }

  return Object.freeze({measurement, slotKey, activeSpools, loadedSpools, printerGroups, slotConflicts, summary, candidateScore, rankedCandidates});
});
