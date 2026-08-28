(() => {
  'use strict';

  /*
   * V11 compatibility bridge.
   *
   * The previous UX layer owned a second Preferences page, a second routing
   * path and a second theme system. V11 deliberately removes those UI
   * responsibilities. This file now performs one safe migration from the old
   * per-browser experience store into the canonical per-profile Preferences
   * store, then gets out of the way.
   */

  const LEGACY_KEY = 'filament-ux-v1';
  const USER_PREFIX = globalThis.FilamentInventoryUsers?.USER_PREFIX || 'filament-user-v1';
  const OWNERS = globalThis.FilamentInventoryUsers?.OWNERS || ['Bill','Aimee'];
  const parse = value => { try { return JSON.parse(value); } catch { return null; } };

  function targetKey(owner) {
    return `${USER_PREFIX}:${String(owner).toLowerCase()}:preferences`;
  }

  function mapTheme(value) {
    if (value === 'light') return 'light';
    if (value === 'system') return 'system';
    return 'dark';
  }

  function mapAccent(value,owner) {
    const aliases = {cyan:'teal', amber:'orange', rose:'violet'};
    const next = aliases[value] || value;
    return ['violet','teal','blue','green','orange'].includes(next) ? next : owner === 'Aimee' ? 'violet' : 'teal';
  }

  function migrate() {
    const legacy = parse(localStorage.getItem(LEGACY_KEY) || '');
    if (!legacy?.profiles) return {migrated:0};
    let migrated = 0;
    for (const owner of OWNERS) {
      const key = targetKey(owner);
      if (localStorage.getItem(key)) continue;
      const source = legacy.profiles?.[owner];
      if (!source) continue;
      const startView = ['dashboard','inventory','household'].includes(source.defaultView) ? source.defaultView : 'dashboard';
      const value = {
        version:2,
        identity:{displayName:owner,initials:owner === 'Aimee' ? 'AR' : 'BR'},
        appearance:{
          theme:mapTheme(source.theme),
          accent:mapAccent(source.accent,owner),
          density:source.density === 'compact' ? 'compact' : 'comfortable',
        },
        workspace:{startView,dashboardDetail:source.dashboardCharts === false ? 'focused' : 'balanced'},
        printing:{safetyMargin:10,defaultReorderGrams:250,defaultStartWeight:1000},
      };
      localStorage.setItem(key,JSON.stringify(value));
      migrated++;
    }
    return {migrated};
  }

  const result = migrate();
  globalThis.FilamentInventoryLegacyUX = Object.freeze({migration:result});
})();
