(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FilamentInventoryPrintReadiness = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const finite = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
  const text = value => String(value || '').trim().toLowerCase();
  const normalizeColor = value => text(value).replace(/\b(matte|silk|basic|sparkle|glossy|translucent)\b/g, '').replace(/\s+/g, ' ').trim();
  const normalizeMaterial = value => text(value).replace(/\s+/g, ' ').trim();
  const active = spool => spool && !spool.archivedAt;
  function remaining(spool) {
    if (finite(spool?.gross) && finite(spool?.tare) && Number(spool.gross) >= Number(spool.tare)) return Math.max(0, Number(spool.gross) - Number(spool.tare));
    if (finite(spool?.visualPercent) && finite(spool?.startWeight)) return Math.max(0, Number(spool.startWeight) * Number(spool.visualPercent) / 100);
    return null;
  }
  function freshness(spool, now = Date.now()) {
    const stamp = Date.parse(spool?.updatedAt || '');
    if (!Number.isFinite(stamp)) return null;
    return Math.max(0, Math.floor((now - stamp) / 86400000));
  }
  function matches(spool, query) {
    const material = normalizeMaterial(query.material);
    const color = normalizeColor(query.color);
    const spoolMaterial = normalizeMaterial(spool?.material);
    const spoolColor = normalizeColor(spool?.colorName);
    return active(spool)
      && (!material || spoolMaterial === material)
      && (!color || spoolColor.includes(color) || color.includes(spoolColor));
  }
  function evaluate(spools = [], query = {}, now = Date.now()) {
    const needed = Math.max(0, Number(query.grams) || 0);
    const margin = Math.max(0, Number(query.safetyMargin) || 0);
    const required = Math.ceil(needed * (1 + margin / 100));
    const candidates = spools.filter(spool => matches(spool, query)).map(spool => {
      const grams = remaining(spool);
      const loaded = spool.placementState === 'Loaded';
      const ageDays = freshness(spool, now);
      const known = grams !== null;
      const enough = known && grams >= required;
      const reorder = finite(spool.reorderThreshold) ? Number(spool.reorderThreshold) : 250;
      const after = known ? grams - required : null;
      let score = 0;
      if (enough) score += 10000;
      if (known) score += 2500;
      if (loaded) score += 1200;
      if (ageDays !== null) score += Math.max(0, 365 - Math.min(365, ageDays));
      if (enough && after >= reorder) score += 600;
      if (known) score += Math.min(500, grams / 10);
      return {spool, grams, required, after, known, enough, loaded, ageDays, reorder, score};
    }).sort((a,b) => b.score - a.score || String(a.spool.id).localeCompare(String(b.spool.id)));
    const ready = candidates.find(row => row.enough) || null;
    const unknown = candidates.find(row => !row.known) || null;
    const bestKnown = candidates.find(row => row.known) || null;
    const status = ready ? 'ready' : unknown ? 'measurement-needed' : candidates.length ? 'not-enough' : 'no-match';
    const recommended = ready || unknown || bestKnown;
    return Object.freeze({status, needed, safetyMargin:margin, required, recommended, alternatives:candidates.filter(row => row !== recommended), candidates});
  }
  return Object.freeze({evaluate, remaining, matches, freshness});
});
