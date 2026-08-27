(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FilamentInventoryWeigh = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const validNum = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
  const text = value => String(value || '').trim();
  const time = value => {
    const n = new Date(value || 0).getTime();
    return Number.isFinite(n) ? n : 0;
  };
  const active = spool => Boolean(spool && text(spool.id) && !spool.archivedAt);
  const loaded = spool => active(spool) && spool.placementState === 'Loaded';

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

  function tareSuggestion(spool = {}, inferred = null) {
    if (validNum(spool.tare) && Number(spool.tare) >= 0) {
      return Object.freeze({
        grams:Number(spool.tare),
        source:'confirmed',
        title:'Saved tare',
        detail:'Confirmed on this spool from an earlier measurement.',
        confidence:'confirmed',
        samples:1,
      });
    }
    if (inferred && validNum(inferred.grams) && Number(inferred.grams) >= 0) {
      const samples = Math.max(1, Number(inferred.samples || inferred.sampleCount || 1));
      return Object.freeze({
        grams:Number(inferred.grams),
        source:'inferred',
        title:'Suggested tare',
        detail:`Inferred from ${samples} similar spool${samples === 1 ? '' : 's'}. Confirm before using.`,
        confidence:text(inferred.confidence) || 'inferred',
        samples,
      });
    }
    return null;
  }

  function preview(spool = {}, grossValue, tareValue) {
    const gross = validNum(grossValue) ? Number(grossValue) : null;
    const tare = validNum(tareValue) ? Number(tareValue) : null;
    if (!active(spool)) return Object.freeze({ok:false, reason:'spool'});
    if (gross === null || tare === null) return Object.freeze({ok:false, reason:'weights'});
    if (gross < 0 || tare < 0 || gross < tare) return Object.freeze({ok:false, reason:'invalid'});

    const start = validNum(spool.startWeight) && Number(spool.startWeight) > 0 ? Number(spool.startWeight) : 1000;
    const grams = Math.min(start, Math.max(0, gross - tare));
    const percent = Math.round((grams / start) * 1000) / 10;
    const threshold = validNum(spool.reorderThreshold) && Number(spool.reorderThreshold) >= 0 ? Number(spool.reorderThreshold) : 250;
    const reorder = grams <= threshold;
    const margin = Math.round(grams - threshold);
    const stock = percent >= 85 ? 'Nearly full' : percent >= 70 ? 'High' : percent >= 55 ? 'Good' : percent >= 40 ? 'Medium' : percent >= 20 ? 'Low' : 'Very low';
    const impact = reorder
      ? `${Math.abs(margin)} g ${margin === 0 ? 'at' : 'below'} reorder threshold`
      : `${margin} g above reorder threshold`;
    return Object.freeze({ok:true, gross, tare, grams, percent, threshold, reorder, margin, stock, impact});
  }

  function latestMeasurementById(log = []) {
    const latest = new Map();
    (Array.isArray(log) ? log : []).forEach(entry => {
      const id = text(entry?.id).toLowerCase();
      if (!id) return;
      const at = time(entry?.at);
      if (!latest.has(id) || at > latest.get(id).at) latest.set(id, {at, entry});
    });
    return latest;
  }

  function priorityScore(spool, latest = null, now = Date.now()) {
    if (!active(spool)) return -Infinity;
    const m = measurement(spool);
    const isLoaded = loaded(spool);
    let score = 0;
    if (m.grams === null) score += isLoaded ? 1000 : 700;
    else if (isLoaded) score += 250;
    if (!latest?.at) score += 300;
    else {
      const ageDays = Math.max(0, (now - latest.at) / 86400000);
      score += Math.min(240, Math.floor(ageDays * 4));
    }
    if (m.grams !== null && m.grams <= Number(spool.reorderThreshold ?? 250)) score += 140;
    if (['Low','Unknown'].includes(String(spool.confidence || ''))) score += 35;
    score += Math.min(30, Math.floor(Math.max(0, now - time(spool.updatedAt || spool.createdAt)) / 86400000));
    return score;
  }

  function nextToMeasure(spools = [], weighLog = [], limit = 6, now = Date.now()) {
    const latest = latestMeasurementById(weighLog);
    return (Array.isArray(spools) ? spools : [])
      .filter(active)
      .map(spool => ({spool, score:priorityScore(spool, latest.get(text(spool.id).toLowerCase()), now)}))
      .sort((a,b) => b.score - a.score || text(a.spool.id).localeCompare(text(b.spool.id), undefined, {numeric:true}))
      .slice(0, Math.max(0, limit))
      .map(row => row.spool);
  }

  function quickSpools(spools = [], weighLog = [], limit = 8) {
    const rows = (Array.isArray(spools) ? spools : []).filter(active);
    const byId = new Map(rows.map(spool => [text(spool.id).toLowerCase(), spool]));
    const ranked = [];
    const seen = new Set();
    const push = spool => {
      const id = text(spool?.id).toLowerCase();
      if (!id || seen.has(id)) return;
      seen.add(id); ranked.push(spool);
    };

    rows.filter(loaded)
      .sort((a,b) => time(b.updatedAt) - time(a.updatedAt))
      .forEach(push);

    (Array.isArray(weighLog) ? weighLog : [])
      .slice()
      .sort((a,b) => time(b.at) - time(a.at))
      .forEach(entry => push(byId.get(text(entry?.id).toLowerCase())));

    rows.slice()
      .sort((a,b) => time(b.updatedAt || b.createdAt) - time(a.updatedAt || a.createdAt))
      .forEach(push);

    return ranked.slice(0, Math.max(0, limit));
  }

  function reasonFor(spool = {}, weighLog = [], now = Date.now()) {
    const m = measurement(spool);
    const latest = latestMeasurementById(weighLog).get(text(spool.id).toLowerCase());
    if (loaded(spool) && m.grams === null) return 'Loaded · remaining unknown';
    if (m.grams === null) return 'Remaining unknown';
    if (!latest?.at) return loaded(spool) ? 'Loaded · no measurement history' : 'No measurement history';
    const days = Math.floor(Math.max(0, now - latest.at) / 86400000);
    if (loaded(spool)) return days ? `Loaded · measured ${days}d ago` : 'Loaded · measured today';
    if (m.grams <= Number(spool.reorderThreshold ?? 250)) return `${Math.round(m.grams)} g · verify low stock`;
    return days ? `Measured ${days}d ago` : 'Measured today';
  }

  return Object.freeze({active, loaded, measurement, tareSuggestion, preview, latestMeasurementById, priorityScore, nextToMeasure, quickSpools, reasonFor});
});
