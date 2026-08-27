(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FilamentInventoryCommand = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const MODES = Object.freeze(['all','reorder','measure','loaded','recent']);
  const DEFAULT_REORDER_GRAMS = 250;

  const validNum = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
  const active = spool => spool && !spool.archivedAt;

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

  function isReorder(spool) {
    if (!active(spool)) return false;
    const amount = measurement(spool).grams;
    return amount !== null && amount <= Number(spool.reorderThreshold ?? DEFAULT_REORDER_GRAMS);
  }

  function needsMeasurement(spool) {
    return active(spool) && measurement(spool).grams === null;
  }

  function isLoaded(spool) {
    return active(spool) && String(spool.placementState || '') === 'Loaded';
  }

  function touchedAt(spool = {}) {
    const stamp = Date.parse(String(spool.updatedAt || spool.loadedAt || spool.createdAt || ''));
    return Number.isFinite(stamp) ? stamp : 0;
  }

  function summarize(state = {}) {
    const rows = (Array.isArray(state.spools) ? state.spools : []).filter(active);
    let knownGrams = 0;
    let knownCount = 0;
    let reorderCount = 0;
    let measurementCount = 0;
    let loadedCount = 0;
    for (const spool of rows) {
      const m = measurement(spool);
      if (m.grams !== null) { knownGrams += m.grams; knownCount++; }
      if (isReorder(spool)) reorderCount++;
      if (needsMeasurement(spool)) measurementCount++;
      if (isLoaded(spool)) loadedCount++;
    }
    return {
      activeCount:rows.length,
      knownGrams,
      knownCount,
      reorderCount,
      measurementCount,
      loadedCount,
      archivedCount:(Array.isArray(state.spools) ? state.spools : []).filter(spool => spool?.archivedAt).length,
    };
  }

  function selectMode(state = {}, mode = 'all', limit = 8) {
    const selectedMode = MODES.includes(mode) ? mode : 'all';
    const rows = (Array.isArray(state.spools) ? state.spools : []).filter(active);
    let selected = rows;
    if (selectedMode === 'reorder') selected = rows.filter(isReorder).sort((a,b) => (measurement(a).grams ?? Infinity) - (measurement(b).grams ?? Infinity));
    else if (selectedMode === 'measure') selected = rows.filter(needsMeasurement).sort((a,b) => touchedAt(b) - touchedAt(a));
    else if (selectedMode === 'loaded') selected = rows.filter(isLoaded).sort((a,b) => touchedAt(b) - touchedAt(a));
    else if (selectedMode === 'recent') selected = rows.slice().sort((a,b) => touchedAt(b) - touchedAt(a)).slice(0, Math.max(1, Number(limit) || 8));
    else selected = rows.slice().sort((a,b) => String(a.id || '').localeCompare(String(b.id || ''), undefined, {numeric:true}));
    return selected;
  }

  function modeCounts(state = {}) {
    const summary = summarize(state);
    return {
      all:summary.activeCount,
      reorder:summary.reorderCount,
      measure:summary.measurementCount,
      loaded:summary.loadedCount,
      recent:Math.min(summary.activeCount, 8),
    };
  }

  function filterTokens(filters = {}) {
    const tokens = [];
    const values = [
      ['search','Search',filters.search],
      ['material','Material',filters.material],
      ['status','Status',filters.status],
      ['location','Location',filters.location],
      ['lifecycle','Lifecycle',filters.lifecycle && filters.lifecycle !== 'active' ? filters.lifecycle : ''],
      ['sort','Sort',filters.sort && filters.sort !== 'id' ? filters.sort : ''],
    ];
    for (const [key,label,value] of values) if (String(value || '').trim()) tokens.push({key,label,value:String(value)});
    return tokens;
  }

  return Object.freeze({MODES, measurement, isReorder, needsMeasurement, isLoaded, touchedAt, summarize, selectMode, modeCounts, filterTokens});
});
