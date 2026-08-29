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
    const ensureComponentStyles = () => {
      if (!root.document) return;
      const styles = [
        ['/css/components/printer.css','printer'],
        ['/css/components/printer-ams.css','printer-ams'],
        ['/css/components/spool-intake.css','spool-intake'],
      ];
      for (const [href,name] of styles) {
        if (root.document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) continue;
        const link = root.document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.dataset.fiComponent = name;
        root.document.head.append(link);
      }
    };
    const loadRuntimeScript = src => new Promise((resolve, reject) => {
      if (!root.document) return resolve();
      const existing = root.document.querySelector(`script[src="${src}"]`);
      if (existing?.dataset.loaded === '1') return resolve();
      if (existing) {
        existing.addEventListener('load', resolve, {once:true});
        existing.addEventListener('error', reject, {once:true});
        return;
      }
      const script = root.document.createElement('script');
      script.src = src;
      script.async = false;
      script.dataset.fiRuntime = '1';
      script.addEventListener('load', () => {
        script.dataset.loaded = '1';
        resolve();
      }, {once:true});
      script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), {once:true});
      root.document.head.append(script);
    });
    const ensureSpoolContractRuntime = () => {
      if (!root.document || root.FilamentInventorySpoolContractUI) return;
      const coreReady = root.FilamentInventorySpoolContract
        ? Promise.resolve()
        : loadRuntimeScript('/spool-contract-core.js');
      coreReady
        .then(() => root.FilamentInventorySpoolContractUI ? undefined : loadRuntimeScript('/spool-contract-client.js'))
        .catch(error => console.error('Canonical spool contract failed to initialize.', error));
    };
    const ensurePhysicalWorkflowRuntime = () => {
      if (!root.document || root.FilamentInventoryPhysicalWorkflowUI) return;
      const contractReady = root.FilamentInventorySpoolContract
        ? Promise.resolve()
        : loadRuntimeScript('/spool-contract-core.js');
      contractReady
        .then(() => root.FilamentInventoryPhysicalWorkflow ? undefined : loadRuntimeScript('/physical-workflow-core.js'))
        .then(() => root.FilamentInventoryPhysicalWorkflowUI ? undefined : loadRuntimeScript('/physical-workflow-client.js'))
        .catch(error => console.error('Physical spool workflow failed to initialize.', error));
    };
    const ensureSpoolIntakeRuntime = () => {
      if (!root.document || root.FilamentInventorySpoolIntakeUI) return;
      loadRuntimeScript('/spool-intake-client.js')
        .catch(error => console.error('Guided spool intake failed to initialize.', error));
    };
    const ensurePwaRuntime = () => {
      if (!root.document || root.FilamentInventoryPWA) return;
      const src = '/pwa-client.js';
      if (root.document.querySelector(`script[src="${src}"]`)) return;
      const script = root.document.createElement('script');
      script.src = src;
      script.defer = true;
      script.dataset.fiPwaRuntime = '1';
      root.document.head.appendChild(script);
    };
    const bindAmsStorageReconcile = () => {
      if (!root.Storage || root.__fiAmsStorageReconcile) return;
      const priorSetItem = root.Storage.prototype.setItem;
      root.Storage.prototype.setItem = function(key, value) {
        const result = priorSetItem.call(this, key, value);
        if (this === root.localStorage && String(key || '').includes('inventory')) root.FilamentInventoryAMSUI?.refresh?.();
        return result;
      };
      root.__fiAmsStorageReconcile = true;
    };
    const ensureAmsPrinterRuntime = () => {
      if (!root.document) return;
      const ready = root.FilamentInventoryAMSUI
        ? Promise.resolve()
        : loadRuntimeScript('/printer-ams-ui.js');
      ready
        .then(bindAmsStorageReconcile)
        .catch(error => console.error('AMS-first Printer UI failed to initialize.', error));
    };
    const afterDocumentReady = () => {
      applyLabels();
      ensureAmsPrinterRuntime();
    };
    ensureComponentStyles();
    ensureSpoolContractRuntime();
    ensurePhysicalWorkflowRuntime();
    ensureSpoolIntakeRuntime();
    ensurePwaRuntime();
    if (root.document?.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', afterDocumentReady, {once:true});
    else afterDocumentReady();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const APP_VERSION = '10.3.0';
  const DATA_SCHEMA_VERSION = 10;
  const DISPLAY_VERSION = `v${APP_VERSION}`;

  return Object.freeze({
    APP_VERSION,
    DATA_SCHEMA_VERSION,
    DISPLAY_VERSION,
  });
});
