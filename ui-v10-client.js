(() => {
  'use strict';

  // V11 owns navigation, profile switching, page hierarchy, filters, dialogs,
  // Activity presentation and responsive shell behavior. This file remains as
  // a compatibility bridge for older cached documents that still reference it.
  function init() {
    document.documentElement.classList.remove('fi-v10');
    document.documentElement.classList.add('fi-v11');
    globalThis.FilamentInventoryNavigation?.sync?.();
  }

  globalThis.FilamentInventoryUIV10 = Object.freeze({
    retired:true,
    sync:() => globalThis.FilamentInventoryNavigation?.sync?.(),
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
