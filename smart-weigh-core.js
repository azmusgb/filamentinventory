(function(root, factory) {
  const resolveContract = () => {
    if (typeof module === 'object' && module.exports) return require('./spool-contract-core.js');
    return root?.FilamentInventorySpoolContract || null;
  };
  const api = factory(resolveContract);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FilamentInventorySmartWeigh = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(resolveContract) {
  'use strict';

  const finite = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
  const text = value => String(value || '').trim().toLowerCase();
  const archived = spool => Boolean(spool?.archivedAt);
  const loaded = spool => !archived(spool) && spool?.placementState === 'Loaded';
  const contract = () => resolveContract?.() || null;

  function canonicalMeasurement(spool = {}) {
    const result = contract()?.measurement?.(spool);
    if (result) return result;
    if (finite(spool.gross) && finite(spool.tare) && Number(spool.gross) >= Number(spool.tare)) {
      const start = finite(spool.startWeight) && Number(spool.startWeight) > 0 ? Number(spool.startWeight) : 1000;
      const grams = Math.max(0, Number(spool.gross) - Number(spool.tare));
      return {grams, percent:Math.round(Math.min(100, grams / start * 100) * 10) / 10, source:'Measured', evidence:'scale', measured:true};
    }
    if (finite(spool.estimatedRemainingGrams)) {
      const start = finite(spool.startWeight) && Number(spool.startWeight) > 0 ? Number(spool.startWeight) : 1000;
      const grams = Math.max(0, Number(spool.estimatedRemainingGrams));
      return {grams, percent:Math.round(Math.min(100, grams / start * 100) * 10) / 10, source:'Estimated', evidence:'usage', measured:false};
    }
    if (finite(spool.visualPercent)) {
      const percent = Math.max(0, Math.min(100, Number(spool.visualPercent)));
      const start = finite(spool.startWeight) && Number(spool.startWeight) > 0 ? Number(spool.startWeight) : 1000;
      return {grams:Math.round(start * percent / 100), percent, source:'Estimated', evidence:'visual', measured:false};
    }
    return {grams:null, percent:null, source:'Unknown', evidence:'none', measured:false};
  }

  function latestMeasurementAt(spool = {}, weighLog = []) {
    const matches = weighLog.filter(row => text(row?.id) === text(spool?.id) && row?.at).map(row => Date.parse(row.at)).filter(Number.isFinite);
    if (matches.length) return Math.max(...matches);
    const fallback = Date.parse(spool.updatedAt || '');
    return Number.isFinite(fallback) && canonicalMeasurement(spool).source === 'Measured' ? fallback : 0;
  }

  function hasKnownRemaining(spool = {}) {
    return canonicalMeasurement(spool).grams !== null;
  }

  function rankSpools(spools = [], weighLog = [], preferredId = '') {
    const preferred = text(preferredId);
    return spools.filter(spool => spool?.id && !archived(spool)).map((spool, index) => {
      const last = latestMeasurementAt(spool, weighLog);
      const m = canonicalMeasurement(spool);
      let tier = 7;
      if (preferred && text(spool.id) === preferred) tier = 0;
      else if (loaded(spool) && m.source === 'Unknown') tier = 1;
      else if (loaded(spool) && m.source === 'Estimated') tier = 2;
      else if (loaded(spool)) tier = 3;
      else if (m.source === 'Unknown') tier = 4;
      else if (m.source === 'Estimated') tier = 5;
      else tier = 6;
      return {spool, tier, last, index};
    }).sort((a,b) => a.tier - b.tier || a.last - b.last || a.index - b.index).map(row => row.spool);
  }

  function tareSuggestion(spool = {}, spools = [], weighLog = []) {
    if (finite(spool.tare) && Number(spool.tare) > 0) return {grams:Number(spool.tare), source:'confirmed', count:1, confidence:'authoritative'};
    const prior = weighLog.filter(row => text(row?.id) === text(spool.id) && finite(row?.tare) && Number(row.tare) > 0).sort((a,b) => Date.parse(b.at || 0) - Date.parse(a.at || 0));
    if (prior.length) return {grams:Number(prior[0].tare), source:'previous', count:prior.length, confidence:'strong'};
    const same = spools.filter(other => other?.id !== spool?.id && !archived(other) && finite(other?.tare) && Number(other.tare) > 0);
    const strong = same.filter(other => text(other.brand) === text(spool.brand) && text(other.productLine) === text(spool.productLine) && text(other.material) === text(spool.material) && text(other.spoolType) === text(spool.spoolType));
    const materialPeers = same.filter(other => text(other.brand) === text(spool.brand) && text(other.material) === text(spool.material) && text(other.spoolType) === text(spool.spoolType));
    const general = same.filter(other => text(other.brand) === text(spool.brand) && text(other.spoolType) === text(spool.spoolType));
    const pool = strong.length >= 2 ? strong : materialPeers.length >= 2 ? materialPeers : general.length >= 3 ? general : [];
    if (!pool.length) return null;
    const values = pool.map(other => Number(other.tare)).sort((a,b) => a-b);
    const mid = Math.floor(values.length / 2);
    const median = values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
    const source = strong.length >= 2 ? 'similar-strong' : materialPeers.length >= 2 ? 'similar-material' : 'similar-general';
    return {grams:Math.round(median), source, count:pool.length, confidence:source === 'similar-general' ? 'moderate' : 'strong'};
  }

  function preview(spool = {}, gross, tare) {
    if (!finite(gross) || !finite(tare)) return null;
    const g = Number(gross); const t = Number(tare);
    if (g < 0 || t < 0 || g < t) return {valid:false, reason:'Gross weight must be greater than or equal to tare.'};
    const start = finite(spool.startWeight) && Number(spool.startWeight) > 0 ? Number(spool.startWeight) : 1000;
    const grams = Math.max(0, g - t);
    const percent = Math.round(Math.min(100, grams / start * 100) * 10) / 10;
    const threshold = finite(spool.reorderThreshold) ? Number(spool.reorderThreshold) : 250;
    return {valid:true, grams, percent, threshold, delta:grams - threshold, reorder:grams <= threshold};
  }

  return Object.freeze({rankSpools, tareSuggestion, preview, latestMeasurementAt, hasKnownRemaining, canonicalMeasurement});
});
