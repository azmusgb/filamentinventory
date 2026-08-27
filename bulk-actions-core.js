(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FilamentInventoryBulk = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const text = value => String(value || '').trim();
  const lower = value => text(value).toLowerCase();
  const ids = values => [...new Set((values || []).map(text).filter(Boolean))];

  function selectedSpools(state = {}, selectedIds = []) {
    const wanted = new Set(ids(selectedIds).map(lower));
    return (state.spools || []).filter(spool => wanted.has(lower(spool?.id)));
  }

  function selectionSummary(state = {}, selectedIds = []) {
    const rows = selectedSpools(state, selectedIds);
    const active = rows.filter(spool => !spool.archivedAt);
    const archived = rows.filter(spool => Boolean(spool.archivedAt));
    const loaded = active.filter(spool => spool.placementState === 'Loaded');
    return {
      count:rows.length,
      activeCount:active.length,
      archivedCount:archived.length,
      loadedCount:loaded.length,
      canMove:active.length > 0,
      canStore:active.length > 0,
      canArchive:active.length > 0,
      canRestore:archived.length > 0,
      canLabel:rows.length > 0,
      ids:rows.map(spool => text(spool.id)),
    };
  }

  function updateSelected(state = {}, selectedIds = [], updater, {activeOnly = false, archivedOnly = false} = {}) {
    const wanted = new Set(ids(selectedIds).map(lower));
    let changed = 0;
    const spools = (state.spools || []).map(spool => {
      if (!wanted.has(lower(spool?.id))) return spool;
      if (activeOnly && spool.archivedAt) return spool;
      if (archivedOnly && !spool.archivedAt) return spool;
      const next = updater({...spool});
      if (!next || JSON.stringify(next) === JSON.stringify(spool)) return spool;
      changed += 1;
      return next;
    });
    return {state:{...state, spools}, changed};
  }

  function moveLocation(state, selectedIds, location, at) {
    const nextLocation = text(location);
    if (!nextLocation) return {state, changed:0};
    return updateSelected(state, selectedIds, spool => ({...spool, location:nextLocation, updatedAt:at}), {activeOnly:true});
  }

  function markStored(state, selectedIds, location, at) {
    const nextLocation = text(location);
    return updateSelected(state, selectedIds, spool => ({
      ...spool,
      location:nextLocation || spool.location || '',
      placementState:'Stored',
      printerName:'',
      feederName:'',
      feederSlot:'',
      loadedAt:null,
      updatedAt:at,
    }), {activeOnly:true});
  }

  function archive(state, selectedIds, at) {
    return updateSelected(state, selectedIds, spool => ({...spool, archivedAt:at, updatedAt:at}), {activeOnly:true});
  }

  function restore(state, selectedIds, at) {
    return updateSelected(state, selectedIds, spool => ({...spool, archivedAt:null, updatedAt:at}), {archivedOnly:true});
  }

  return Object.freeze({ids, selectedSpools, selectionSummary, updateSelected, moveLocation, markStored, archive, restore});
});
