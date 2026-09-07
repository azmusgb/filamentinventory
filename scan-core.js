(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.FilamentInventoryScan = api;
    if (root.location && root.history) api.sanitizeIncomingScanUrl(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const OWNERS = Object.freeze(['Bill', 'Aimee']);
  const ID_RE = /^[A-Za-z0-9._-]{1,32}$/;

  const strictOwner = value => OWNERS.includes(String(value)) ? String(value) : null;
  const validId = value => ID_RE.test(String(value || '').trim());

  function profileFromUrl(url) {
    const hash = new URLSearchParams(String(url?.hash || '').replace(/^#/, ''));
    return strictOwner(hash.get('filament-user')) || strictOwner(url?.searchParams?.get('profile'));
  }

  function stripProfileHints(url) {
    const clean = new URL(url.toString());
    clean.searchParams.delete('profile');
    const hash = new URLSearchParams(String(clean.hash || '').replace(/^#/, ''));
    hash.delete('filament-user');
    clean.hash = hash.toString();
    return clean;
  }

  function sanitizeIncomingScanUrl(host) {
    try {
      const current = new URL(host.location.href);
      if (current.searchParams.get('scan') !== '1') return false;
      const clean = stripProfileHints(current);
      if (clean.toString() === current.toString()) return false;
      host.history.replaceState(host.history.state, '', clean.pathname + clean.search + clean.hash);
      return true;
    } catch {
      return false;
    }
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
    const canonical = stripProfileHints(url);
    return {ok:true, spoolId, profile:null, source:'url', url:canonical.toString()};
  }

  function buildSpoolTarget({spoolId}, origin) {
    if (!validId(spoolId)) throw new Error('Invalid spool ID');
    const url = new URL('/', origin);
    url.searchParams.set('spool', String(spoolId).trim());
    url.searchParams.set('scan', '1');
    return url.toString();
  }

  function stateHasSpool(state, spoolId) {
    const id = String(spoolId || '').trim().toLowerCase();
    return Boolean(id && Array.isArray(state?.spools) && state.spools.some(spool => String(spool?.id || '').trim().toLowerCase() === id));
  }

  function resolveProfile(spoolId, currentProfile, states = {}) {
    const current = strictOwner(currentProfile) || 'Bill';
    return stateHasSpool(states[current], spoolId) ? current : null;
  }

  return Object.freeze({OWNERS, ID_RE, strictOwner, validId, profileFromUrl, sanitizeIncomingScanUrl, parseScanValue, buildSpoolTarget, stateHasSpool, resolveProfile});
});