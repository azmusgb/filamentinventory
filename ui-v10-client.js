(() => {
  'use strict';

  // V11 owns navigation, profile switching, page hierarchy, filters, dialogs,
  // Activity presentation and responsive shell behavior. This file remains as
  // a compatibility bridge for older cached documents and as the bootstrap for
  // presentation-only cohesion assets shared by the current shell.
  const isNativeV11Document = () => Boolean(document.querySelector('link[href="/css/components/v11.css"]'));

  function ensureWorkflowStyles() {
    const href = '/css/components/v11-workflows.css';
    if (document.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.fiV11WorkflowStyles = '1';
    document.head.appendChild(link);
  }

  function ensureCohesionAssets() {
    const href = '/css/components/ux-cohesion.css';
    if (!document.querySelector(`link[href="${href}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset.fiCohesionStyles = '1';
      document.head.appendChild(link);
    }

    const src = '/ux-cohesion-client.js';
    if (!document.querySelector(`script[src="${src}"]`)) {
      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
      script.dataset.fiCohesionClient = '1';
      document.head.appendChild(script);
    }
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
