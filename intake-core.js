(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FilamentInventoryIntake = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const text = value => String(value ?? '').trim();
  const key = value => text(value).toLowerCase();
  const validNumber = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
  const active = spools => (Array.isArray(spools) ? spools : []).filter(spool => spool && !spool.archivedAt);
  const timestamp = spool => Date.parse(String(spool?.updatedAt || spool?.createdAt || '')) || 0;

  function rankValues(spools, field, limit = 8) {
    const stats = new Map();
    for (const spool of active(spools)) {
      const value = text(spool?.[field]);
      if (!value || value.toLowerCase() === 'unknown') continue;
      const id = key(value);
      const at = timestamp(spool);
      const prior = stats.get(id) || {value, count:0, at:0};
      prior.count += 1;
      prior.at = Math.max(prior.at, at);
      if (value.length < prior.value.length) prior.value = value;
      stats.set(id, prior);
    }
    return [...stats.values()]
      .sort((a,b) => b.count - a.count || b.at - a.at || a.value.localeCompare(b.value))
      .slice(0, Math.max(0, Number(limit) || 0))
      .map(item => item.value);
  }

  function suggestions(state, limit = 8) {
    const spools = state?.spools || [];
    return {
      brands:rankValues(spools, 'brand', limit),
      materials:rankValues(spools, 'material', limit),
      colors:rankValues(spools, 'colorName', limit),
      locations:rankValues(spools, 'location', limit),
      purchaseSources:rankValues(spools, 'purchaseSource', limit),
      printers:rankValues(spools, 'printerName', limit),
      feeders:rankValues(spools, 'feederName', limit),
    };
  }

  function recentPresets(state, limit = 4) {
    const seen = new Set();
    const rows = [];
    for (const spool of [...active(state?.spools || [])].sort((a,b) => timestamp(b) - timestamp(a))) {
      const brand = text(spool.brand);
      const material = text(spool.material);
      const spoolType = text(spool.spoolType);
      if (!brand || !material || key(brand) === 'unknown' || key(material) === 'unknown') continue;
      const identity = [key(brand), key(material), key(spoolType), key(spool.location)].join('|');
      if (seen.has(identity)) continue;
      seen.add(identity);
      rows.push({
        id:text(spool.id),
        brand,
        material,
        spoolType:spoolType || 'Cardboard',
        startWeight:validNumber(spool.startWeight) ? Number(spool.startWeight) : 1000,
        location:text(spool.location),
        purchaseSource:text(spool.purchaseSource),
        reorderThreshold:validNumber(spool.reorderThreshold) ? Number(spool.reorderThreshold) : 250,
      });
      if (rows.length >= Math.max(0, Number(limit) || 0)) break;
    }
    return rows;
  }

  function preferredDefaults(state) {
    const spools = state?.spools || [];
    return {
      location:rankValues(spools, 'location', 1)[0] || '',
      purchaseSource:rankValues(spools, 'purchaseSource', 1)[0] || '',
    };
  }

  function duplicateCandidates(state, draft, excludeId = '') {
    const brand = key(draft?.brand);
    const material = key(draft?.material);
    const color = key(draft?.colorName);
    if (!brand || !material || !color) return [];
    const excluded = key(excludeId);
    return active(state?.spools || [])
      .filter(spool => key(spool.id) !== excluded && key(spool.brand) === brand && key(spool.material) === material && key(spool.colorName) === color)
      .sort((a,b) => timestamp(b) - timestamp(a));
  }

  function median(values) {
    const nums = values.filter(validNumber).map(Number).sort((a,b) => a-b);
    if (!nums.length) return null;
    const mid = Math.floor(nums.length / 2);
    return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
  }

  function scoredSimilar(state, draft, valueField) {
    const brand = key(draft?.brand);
    const spoolType = key(draft?.spoolType);
    const material = key(draft?.material);
    return active(state?.spools || [])
      .filter(spool => validNumber(spool?.[valueField]))
      .map(spool => {
        let score = 0;
        if (brand && key(spool.brand) === brand) score += 4;
        if (spoolType && key(spool.spoolType) === spoolType) score += 3;
        if (material && key(spool.material) === material) score += 2;
        return {spool, score};
      })
      .filter(item => item.score >= 3)
      .sort((a,b) => b.score - a.score || timestamp(b.spool) - timestamp(a.spool));
  }

  function inferNumber(state, draft, field, label) {
    const scored = scoredSimilar(state, draft, field);
    if (!scored.length) return null;
    const bestScore = scored[0].score;
    const matches = scored.filter(item => item.score === bestScore).map(item => item.spool);
    const value = median(matches.map(spool => spool[field]));
    if (value === null) return null;
    return {[label]:Math.round(value), samples:matches.length, confidence:bestScore >= 7 ? 'high' : bestScore >= 5 ? 'medium' : 'low'};
  }

  function inferredTare(state, draft) {
    return inferNumber(state, draft, 'tare', 'grams');
  }

  function inferredStartWeight(state, draft) {
    return inferNumber(state, draft, 'startWeight', 'grams');
  }

  function templateFromDraft(draft) {
    return {
      brand:text(draft?.brand),
      material:text(draft?.material),
      spoolType:text(draft?.spoolType) || 'Cardboard',
      startWeight:validNumber(draft?.startWeight) ? Number(draft.startWeight) : 1000,
      location:text(draft?.location),
      confidence:text(draft?.confidence) || 'Unknown',
      opened:text(draft?.opened) || 'Unknown',
      bagged:text(draft?.bagged) || 'Unknown',
      purchaseSource:text(draft?.purchaseSource),
      purchaseDate:text(draft?.purchaseDate),
      reorderThreshold:validNumber(draft?.reorderThreshold) ? Number(draft.reorderThreshold) : 250,
      placementState:text(draft?.placementState) === 'Loaded' ? 'Loaded' : 'Stored',
      printerName:text(draft?.printerName),
      feederName:text(draft?.feederName),
      feederSlot:text(draft?.feederSlot),
    };
  }

  return Object.freeze({active, duplicateCandidates, inferredStartWeight, inferredTare, preferredDefaults, rankValues, recentPresets, suggestions, templateFromDraft});
});