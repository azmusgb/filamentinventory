(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => globalThis.CSS?.escape ? CSS.escape(String(value)) : String(value).replace(/["\\]/g, '\\$&');

  function switchView(view) {
    const navigation = globalThis.FilamentInventoryNavigation;
    if (navigation?.navigate?.(view, {historyMode:'push'})) return true;
    const tab = document.querySelector(`.tab[data-view="${view}"]`);
    if (!tab) return false;
    tab.click();
    return true;
  }

  function inventoryCardAction(id, action) {
    switchView('inventory');
    const lifecycle = $('lifecycleFilter');
    if (lifecycle) { lifecycle.value = 'all'; lifecycle.dispatchEvent(new Event('change', {bubbles:true})); }
    const search = $('searchInput');
    if (search) { search.value = id; search.dispatchEvent(new Event('input', {bubbles:true})); }
    setTimeout(() => document.querySelector(`#inventoryGrid .spool-card[data-id="${esc(id)}"] button[data-action="${action}"]`)?.click(), 80);
    return true;
  }

  function weigh(id) {
    if (!switchView('weigh')) return false;
    setTimeout(() => {
      const select = $('weighSpool');
      if (!select) return;
      const option = [...select.options].find(row => String(row.value).toLowerCase() === String(id).toLowerCase());
      if (option) { select.value = option.value; select.dispatchEvent(new Event('change', {bubbles:true})); }
      $('grossWeight')?.focus({preventScroll:true});
    }, 60);
    return true;
  }

  function edit(id) { return inventoryCardAction(id, 'edit'); }
  function archive(id) { return inventoryCardAction(id, 'archive'); }
  function restore(id) { return inventoryCardAction(id, 'restore'); }
  function deletePermanently(id) { return inventoryCardAction(id, 'delete'); }
  function markEmpty(id) { return inventoryCardAction(id, 'empty'); }

  function place(id) {
    if (!switchView('household')) return false;
    setTimeout(() => {
      const select = $('moveSpoolV8');
      if (!select) return;
      const option = [...select.options].find(row => String(row.value).toLowerCase() === String(id).toLowerCase());
      if (option) { select.value = option.value; select.dispatchEvent(new Event('change', {bubbles:true})); }
      select.scrollIntoView({behavior:'smooth', block:'center'});
      select.focus({preventScroll:true});
    }, 80);
    return true;
  }

  function label(id) {
    if (!switchView('labels')) return false;
    setTimeout(() => {
      $('clearLabelsBtn')?.click();
      const search = $('labelSearch');
      if (search) { search.value = id; search.dispatchEvent(new Event('input', {bubbles:true})); }
      setTimeout(() => {
        const checkbox = document.querySelector(`#spoolPickList [data-label-id="${esc(id)}"]`);
        if (checkbox) { checkbox.checked = true; checkbox.dispatchEvent(new Event('change', {bubbles:true})); }
      }, 60);
    }, 60);
    return true;
  }

  function open(id, options = {}) { return globalThis.FilamentInventorySpoolActions?.open?.(id, options) ?? false; }

  globalThis.FilamentInventoryWorkflows = Object.freeze({open, weigh, edit, place, label, archive, restore, deletePermanently, markEmpty});
})();
