(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.FilamentInventoryVersion = api;
    const applyLabels = () => {
      if (!root.document) return;
      root.document.querySelectorAll('[data-app-version]').forEach(node => {
        node.textContent = api.DISPLAY_VERSION;
      });
    };
    if (root.document?.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', applyLabels, {once:true});
    else applyLabels();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const APP_VERSION = '9.9.0';
  const DATA_SCHEMA_VERSION = 10;
  const DISPLAY_VERSION = `v${APP_VERSION}`;

  return Object.freeze({
    APP_VERSION,
    DATA_SCHEMA_VERSION,
    DISPLAY_VERSION,
  });
});
