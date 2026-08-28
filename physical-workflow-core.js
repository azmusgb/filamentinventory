(function(root, factory) {
  const resolveContract = () => {
    if (typeof module === 'object' && module.exports) return require('./spool-contract-core.js');
    return root?.FilamentInventorySpoolContract || null;
  };
  const api = factory(resolveContract);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FilamentInventoryPhysicalWorkflow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(resolveContract) {
  'use strict';

  const text = value => String(value ?? '').trim();
  const validIso = value => value && !Number.isNaN(Date.parse(String(value))) ? String(value) : null;

  function contract() {
    const value = resolveContract?.();
    if (!value) throw new Error('Canonical spool contract is unavailable.');
    return value;
  }

  function evidenceTone(measurement = {}) {
    if (measurement.source === 'Measured') return 'success';
    if (measurement.source === 'Estimated') return 'warning';
    return 'muted';
  }

  function remainingLabel(measurement = {}) {
    return measurement.grams === null || measurement.grams === undefined
      ? 'Unknown'
      : `${Math.round(Number(measurement.grams))} g`;
  }

  function percentLabel(measurement = {}) {
    return measurement.percent === null || measurement.percent === undefined
      ? '—'
      : `${Math.round(Number(measurement.percent))}%`;
  }

  function recommendation(input = {}) {
    const c = contract();
    const summary = c.workflowSummary(input);
    const {spool, measurement, stock, loaded, archived} = summary;

    if (archived) return Object.freeze({key:'restore', label:'Restore spool', reason:'Archived spools must be restored before physical use.'});
    if (stock === 'Empty') return Object.freeze({key:'archive', label:'Archive empty spool', reason:'No filament remains on this spool.'});
    if (measurement.source !== 'Measured') {
      return Object.freeze({
        key:'weigh',
        label:'Verify on scale',
        reason:measurement.source === 'Estimated'
          ? 'The remaining amount is estimated. A scale measurement will replace the estimate with authoritative evidence.'
          : 'The remaining amount is unknown. Weigh the spool before relying on it for a print.',
      });
    }
    if (loaded) return Object.freeze({key:'use', label:'Mark used now', reason:'This spool is measured and already loaded.'});
    return Object.freeze({key:'placement', label:'Load / move spool', reason:'This spool is measured and ready to assign to a printer or AMS slot.'});
  }

  function steps(input = {}) {
    const c = contract();
    const summary = c.workflowSummary(input);
    const {spool, measurement, loaded, archived, stock} = summary;
    return Object.freeze([
      Object.freeze({
        key:'identify',
        label:'Identify',
        state:'complete',
        detail:`${spool.id || 'Spool'} · ${summary.productLabel}`,
      }),
      Object.freeze({
        key:'verify',
        label:'Verify remaining',
        state:measurement.source === 'Measured' ? 'complete' : 'attention',
        detail:`${summary.evidenceLabel} · ${remainingLabel(measurement)}`,
      }),
      Object.freeze({
        key:'placement',
        label:'Place',
        state:archived || stock === 'Empty' ? 'blocked' : loaded ? 'complete' : 'ready',
        detail:summary.placementLabel,
      }),
      Object.freeze({
        key:'use',
        label:'Use',
        state:validIso(spool.lastUsedAt) ? 'complete' : loaded && measurement.source === 'Measured' ? 'ready' : 'pending',
        detail:validIso(spool.lastUsedAt) ? `Last used ${spool.lastUsedAt}` : 'No use recorded yet',
      }),
    ]);
  }

  function productDetails(input = {}) {
    const c = contract();
    const spool = c.normalizeSpool(input);
    return Object.freeze([
      spool.productLine ? Object.freeze({label:'Product line', value:spool.productLine}) : null,
      spool.diameterMm !== null ? Object.freeze({label:'Diameter', value:`${spool.diameterMm} mm`}) : null,
      spool.manufacturerSku ? Object.freeze({label:'Manufacturer SKU', value:spool.manufacturerSku}) : null,
      spool.lotBatch ? Object.freeze({label:'Lot / batch', value:spool.lotBatch}) : null,
      spool.spoolType && spool.spoolType !== 'Unknown' ? Object.freeze({label:'Spool format', value:spool.spoolType}) : null,
      spool.owner ? Object.freeze({label:'Owner', value:spool.owner}) : null,
    ].filter(Boolean));
  }

  function summary(input = {}) {
    const c = contract();
    const canonical = c.workflowSummary(input);
    const rec = recommendation(canonical.spool);
    return Object.freeze({
      id:canonical.spool.id,
      productLabel:canonical.productLabel,
      colorName:canonical.spool.colorName,
      colorHex:canonical.spool.colorHex,
      lifecycle:canonical.lifecycle,
      stock:canonical.stock,
      placement:canonical.placementLabel,
      loaded:canonical.loaded,
      archived:canonical.archived,
      reorderNeeded:canonical.reorderNeeded,
      measurement:canonical.measurement,
      remainingLabel:remainingLabel(canonical.measurement),
      percentLabel:percentLabel(canonical.measurement),
      evidenceLabel:canonical.evidenceLabel,
      evidenceTone:evidenceTone(canonical.measurement),
      recommendation:rec,
      steps:steps(canonical.spool),
      details:productDetails(canonical.spool),
      lastUsedAt:canonical.spool.lastUsedAt || null,
      updatedAt:canonical.spool.updatedAt || null,
    });
  }

  function findSpool(state = {}, spoolId = '') {
    const wanted = text(spoolId).toLowerCase();
    return Array.isArray(state?.spools)
      ? state.spools.find(spool => text(spool?.id).toLowerCase() === wanted) || null
      : null;
  }

  function markUsed(state = {}, spoolId = '', at = new Date().toISOString()) {
    const c = contract();
    const source = state && Array.isArray(state.spools) ? state : {spools:[]};
    const target = findSpool(source, spoolId);
    if (!target) return {state:source, changed:false, reason:'not-found', spool:null};
    const canonical = c.normalizeSpool(target, {owner:source.profile || target.owner});
    if (canonical.archivedAt) return {state:source, changed:false, reason:'archived', spool:canonical};
    if (canonical.placementState !== 'Loaded') return {state:source, changed:false, reason:'not-loaded', spool:canonical};
    if (c.measurement(canonical).source !== 'Measured') return {state:source, changed:false, reason:'not-measured', spool:canonical};
    const when = validIso(at) || new Date().toISOString();
    const updated = c.normalizeSpool({...canonical, lastUsedAt:when, updatedAt:when}, {owner:source.profile || canonical.owner});
    const next = {
      ...source,
      savedAt:when,
      spools:source.spools.map(spool => text(spool?.id).toLowerCase() === text(updated.id).toLowerCase() ? updated : spool),
    };
    return {state:next, changed:true, reason:'used', spool:updated};
  }

  return Object.freeze({
    evidenceTone,
    remainingLabel,
    percentLabel,
    recommendation,
    steps,
    productDetails,
    summary,
    findSpool,
    markUsed,
  });
});
