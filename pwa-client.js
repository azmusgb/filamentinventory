(() => {
  'use strict';

  const SW_URL = '/sw.js';
  const LOCAL_HOSTS = new Set(['localhost','127.0.0.1','[::1]']);

  function canRegister() {
    if (!('serviceWorker' in navigator)) return false;
    return location.protocol === 'https:' || LOCAL_HOSTS.has(location.hostname);
  }

  async function register() {
    if (!canRegister()) return null;
    try {
      const registration = await navigator.serviceWorker.register(SW_URL, {scope:'/'});
      registration.update().catch(() => {});
      document.documentElement.dataset.pwa = 'registered';
      document.dispatchEvent(new CustomEvent('fi:pwa-ready', {detail:{scope:registration.scope}}));
      return registration;
    } catch (error) {
      document.documentElement.dataset.pwa = 'registration-failed';
      console.warn('Filament Inventory service worker registration failed.', error);
      return null;
    }
  }

  const ready = register();
  globalThis.FilamentInventoryPWA = Object.freeze({
    ready,
    register,
    supported:canRegister(),
  });
})();
