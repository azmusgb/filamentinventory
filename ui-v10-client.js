(() => {
  'use strict';

  // V11 owns navigation, profile switching, page hierarchy, filters, dialogs,
  // Activity presentation and responsive shell behavior. This file remains as
  // a compatibility bridge for older cached documents and as the bootstrap for
  // presentation-only cohesion assets shared by the current shell.
  const isNativeV11Document = () => Boolean(document.querySelector('link[href="/css/components/v11.css"]'));

  function ensureStyle(href, datasetKey) {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset[datasetKey] = '1';
    document.head.appendChild(link);
  }

  function ensureScript(src, datasetKey) {
    if (document.querySelector(`script[src="${src}"]`)) return;
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.dataset[datasetKey] = '1';
    document.head.appendChild(script);
  }

  function ensureWorkflowStyles() {
    ensureStyle('/css/components/v11-workflows.css', 'fiV11WorkflowStyles');
  }

  function ensureCohesionAssets() {
    ensureStyle('/css/components/ux-cohesion.css', 'fiCohesionStyles');
    ensureStyle('/css/components/preferences-v12.css', 'fiPreferencesV12Styles');
    ensureScript('/ux-cohesion-client.js', 'fiCohesionClient');
    ensureScript('/preferences-v12-client.js', 'fiPreferencesV12Client');
  }

  function init() {
    ensureCohesionAssets();
    if (isNativeV11Document()) return;
    ensureWorkflowStyles();
    document.documentElement.classList.remove('fi-v10');
    document.documentElement.classList.add('fi-v11');
    globalThis.FilamentInventoryNavigation?.sync?.();
  }

  globalThis.FilamentInventoryUIV10 = Object.freeze({
    retired:true,
    active:() => !isNativeV11Document(),
    sync:() => globalThis.FilamentInventoryNavigation?.sync?.(),
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
