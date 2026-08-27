(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FilamentInventoryScan = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const OWNERS = Object.freeze(['Bill', 'Aimee']);
  const ID_RE = /^[A-Za-z0-9._-]{1,32}$/;

  const strictOwner = value => OWNERS.includes(String(value)) ? String(value) : null;
  const validId = value => ID_RE.test(String(value || '').trim());

  function profileFromUrl(url) {
    const hash = new URLSearchParams(String(url.hash || '').replace(/^#/, ''));
    return strictOwner(hash.get('filament-user')) || strictOwner(url.searchParams.get('profile'));
  }

  function parseScanValue(value, expectedOrigin) {
    const raw = String(value || '').trim();
    if (!raw) return {ok:false, reason:'empty'};
    if (validId(raw)) return {ok:true, spoolId:raw, profile:null, source:'id'};

    let url;
    try { url = new URL(raw, expectedOrigin); }
    catch { return {ok:false, reason:'invalid'}; }

    if (expectedOrigin && url.origin !== new URL(expectedOrigin).origin) return {ok:false, reason:'foreign-origin'};
    const spoolId = String(url.searchParams.get('spool') || '').trim();
    if (!validId(spoolId)) return {ok:false, reason:'missing-spool'};
    return {ok:true, spoolId, profile:profileFromUrl(url), source:'url', url:url.toString()};
  }

  function buildSpoolTarget({spoolId, profile}, origin) {
    if (!validId(spoolId)) throw new Error('Invalid spool ID');
    const url = new URL('/', origin);
    url.searchParams.set('spool', String(spoolId).trim());
    url.searchParams.set('scan', '1');
    const owner = strictOwner(profile);
    if (owner) url.hash = new URLSearchParams({'filament-user':owner}).toString();
    return url.toString();
  }

  function stateHasSpool(state, spoolId) {
    const id = String(spoolId || '').trim().toLowerCase();
    return Boolean(id && Array.isArray(state?.spools) && state.spools.some(spool => String(spool?.id || '').trim().toLowerCase() === id));
  }

  function resolveProfile(spoolId, currentProfile, states = {}) {
    const current = strictOwner(currentProfile) || 'Bill';
    if (stateHasSpool(states[current], spoolId)) return current;
    return OWNERS.find(owner => owner !== current && stateHasSpool(states[owner], spoolId)) || null;
  }

  return Object.freeze({OWNERS, ID_RE, strictOwner, validId, profileFromUrl, parseScanValue, buildSpoolTarget, stateHasSpool, resolveProfile});
});
