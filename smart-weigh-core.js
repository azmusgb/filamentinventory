(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FilamentInventorySmartWeigh = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const finite = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
  const text = value => String(value || '').trim().toLowerCase();
  const archived = spool => Boolean(spool?.archivedAt);
  const loaded = spool => !archived(spool) && spool?.placementState === 'Loaded';

  function latestMeasurementAt(spool = {}, weighLog = []) {
    const matches = weighLog.filter(row => text(row?.id) === text(spool?.id) && row?.at).map(row => Date.parse(row.at)).filter(Number.isFinite);
    if (matches.length) return Math.max(...matches);
    const fallback = Date.parse(spool.updatedAt || '');
    return Number.isFinite(fallback) && finite(spool.gross) && finite(spool.tare) ? fallback : 0;
  }

  function hasKnownRemaining(spool = {}) {
    return (finite(spool.gross) && finite(spool.tare) && Number(spool.gross) >= Number(spool.tare)) || finite(spool.visualPercent);
  }

  function rankSpools(spools = [], weighLog = [], preferredId = '') {
    const preferred = text(preferredId);
    return spools.filter(spool => spool?.id && !archived(spool)).map((spool, index) => {
      const last = latestMeasurementAt(spool, weighLog);
      const unknown = !hasKnownRemaining(spool);
      let tier = 5;
      if (preferred && text(spool.id) === preferred) tier = 0;
      else if (loaded(spool) && unknown) tier = 1;
      else if (loaded(spool)) tier = 2;
      else if (unknown) tier = 3;
      else tier = 4;
      return {spool, tier, last, index};
    }).sort((a,b) => a.tier - b.tier || a.last - b.last || a.index - b.index).map(row => row.spool);
  }

  function tareSuggestion(spool = {}, spools = [], weighLog = []) {
    if (finite(spool.tare) && Number(spool.tare) > 0) return {grams:Number(spool.tare), source:'confirmed', count:1, confidence:'authoritative'};
    const prior = weighLog.filter(row => text(row?.id) === text(spool.id) && finite(row?.tare) && Number(row.tare) > 0).sort((a,b) => Date.parse(b.at || 0) - Date.parse(a.at || 0));
    if (prior.length) return {grams:Number(prior[0].tare), source:'previous', count:prior.length, confidence:'strong'};
    const same = spools.filter(other => other?.id !== spool?.id && !archived(other) && finite(other?.tare) && Number(other.tare) > 0);
    const strong = same.filter(other => text(other.brand) === text(spool.brand) && text(other.material) === text(spool.material) && text(other.spoolType) === text(spool.spoolType));
    const general = same.filter(other => text(other.brand) === text(spool.brand) && text(other.spoolType) === text(spool.spoolType));
    const pool = strong.length >= 2 ? strong : general.length >= 3 ? general : [];
    if (!pool.length) return null;
    const values = pool.map(other => Number(other.tare)).sort((a,b) => a-b);
    const mid = Math.floor(values.length / 2);
    const median = values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
    return {grams:Math.round(median), source:strong.length >= 2 ? 'similar-strong' : 'similar-general', count:pool.length, confidence:strong.length >= 2 ? 'strong' : 'moderate'};
  }

  function preview(spool = {}, gross, tare) {
    if (!finite(gross) || !finite(tare)) return null;
    const g = Number(gross); const t = Number(tare);
    if (g < 0 || t < 0 || g < t) return {valid:false, reason:'Gross weight must be greater than or equal to tare.'};
    const start = finite(spool.startWeight) && Number(spool.startWeight) > 0 ? Number(spool.startWeight) : 1000;
    const grams = Math.min(start, Math.max(0, g - t));
    const percent = Math.round((grams / start) * 1000) / 10;
    const threshold = finite(spool.reorderThreshold) ? Number(spool.reorderThreshold) : 250;
    return {valid:true, grams, percent, threshold, delta:grams - threshold, reorder:grams <= threshold};
  }

  return Object.freeze({rankSpools, tareSuggestion, preview, latestMeasurementAt, hasKnownRemaining});
});
