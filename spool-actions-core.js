(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FilamentInventorySpoolActionCore = api;
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

  function isArchived(spool = {}) {
    return Boolean(spool.archivedAt);
  }

  function isLoaded(spool = {}) {
    return !isArchived(spool) && spool.placementState === 'Loaded';
  }

  function placementLabel(spool = {}) {
    if (isArchived(spool)) return 'Archived';
    if (!isLoaded(spool)) return text(spool.location) || 'Stored / unassigned';
    const parts = [text(spool.printerName) || 'Loaded', text(spool.feederName), text(spool.feederSlot) ? `Slot ${text(spool.feederSlot)}` : ''].filter(Boolean);
    return parts.join(' · ');
  }

  function stockLabel(spool = {}) {
    if (isArchived(spool)) return 'Archived';
    const m = measurement(spool);
    if (m.grams === null) return 'Needs measurement';
    if (m.grams <= Number(spool.reorderThreshold ?? 250)) return 'Reorder';
    const p = Number(m.percent);
    if (p >= 85) return 'Nearly full';
    if (p >= 70) return 'High';
    if (p >= 55) return 'Good';
    if (p >= 40) return 'Medium';
    if (p >= 20) return 'Low';
    return 'Very low';
  }

  function actionsFor(spool = {}) {
    if (isArchived(spool)) return Object.freeze([
      {key:'restore', label:'Restore', kind:'primary'},
      {key:'edit', label:'Edit details', kind:'default'},
      {key:'label', label:'QR label', kind:'default'},
      {key:'link', label:'Copy link', kind:'default'},
      {key:'delete', label:'Delete permanently', kind:'danger'},
    ]);
    return Object.freeze([
      {key:'weigh', label:'Weigh now', kind:'primary'},
      {key:'placement', label:isLoaded(spool) ? 'Move / unload' : 'Load / move', kind:'default'},
      {key:'edit', label:'Edit details', kind:'default'},
      {key:'label', label:'QR label', kind:'default'},
      {key:'link', label:'Copy link', kind:'default'},
      {key:'archive', label:'Archive', kind:'danger'},
    ]);
  }

  function attentionFor(spool = {}) {
    if (isArchived(spool)) return Object.freeze({
      key:'archived',
      label:'Archived spool',
      detail:'Restore this spool before weighing or loading it.',
      tone:'muted',
      action:'restore',
    });

    const m = measurement(spool);
    if (m.grams === null) return Object.freeze({
      key:'measure',
      label:'Measurement needed',
      detail:'Remaining filament is unknown. Weigh this spool for a reliable amount.',
      tone:'warning',
      action:'weigh',
    });

    const threshold = Number(spool.reorderThreshold ?? 250);
    if (m.grams <= threshold) return Object.freeze({
      key:'reorder',
      label:'Low filament',
      detail:`${Math.round(m.grams)} g remaining · reorder threshold ${Math.round(threshold)} g`,
      tone:'danger',
      action:'weigh',
    });

    if (isLoaded(spool)) return Object.freeze({
      key:'loaded',
      label:'Loaded now',
      detail:placementLabel(spool),
      tone:'info',
      action:'placement',
    });

    return null;
  }

  function primaryActionFor(spool = {}) {
    const actions = actionsFor(spool);
    const preferred = attentionFor(spool)?.action || (isArchived(spool) ? 'restore' : 'weigh');
    return actions.find(action => action.key === preferred) || actions[0] || null;
  }

  function remainingLabel(spool = {}) {
    const m = measurement(spool);
    return m.grams === null ? 'Unknown' : `${Math.round(m.grams)} g`;
  }

  function percentLabel(spool = {}) {
    const m = measurement(spool);
    return m.percent === null ? '—' : `${Math.round(m.percent)}%`;
  }

  function summary(spool = {}) {
    const m = measurement(spool);
    return Object.freeze({
      id:text(spool.id),
      brand:text(spool.brand) || 'Unknown',
      material:text(spool.material) || 'Unknown',
      colorName:text(spool.colorName) || 'Unknown',
      colorHex:/^#[0-9a-f]{6}$/i.test(text(spool.colorHex)) ? text(spool.colorHex) : '#64748b',
      grams:m.grams,
      percent:m.percent,
      remainingLabel:remainingLabel(spool),
      percentLabel:percentLabel(spool),
      measurementSource:m.source,
      stock:stockLabel(spool),
      placement:placementLabel(spool),
      loaded:isLoaded(spool),
      archived:isArchived(spool),
      attention:attentionFor(spool),
      primaryAction:primaryActionFor(spool),
      updatedAt:spool.updatedAt || null,
      actions:actionsFor(spool),
    });
  }

  return Object.freeze({measurement, isArchived, isLoaded, placementLabel, stockLabel, actionsFor, attentionFor, primaryActionFor, remainingLabel, percentLabel, summary});
});
