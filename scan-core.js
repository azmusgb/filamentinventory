(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.FilamentInventoryScan = api;
    if (root.location && root.history?.replaceState) {
      const sanitized = api.neutralizeLegacyProfileHint(root.location.href);
      if (sanitized.changed) root.history.replaceState(null, '', sanitized.url.pathname + sanitized.url.search + sanitized.url.hash);
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const OWNERS = Object.freeze(['Bill', 'Aimee']);
  const ID_RE = /^[A-Za-z0-9._-]{1,32}$/;

  const strictOwner = value => OWNERS.includes(String(value)) ? String(value) : null;
  const validId = value => ID_RE.test(String(value || '').trim());

  // Transitional compatibility only: older links may contain a profile hint.
  // The hint is never authoritative and is never used to discover or switch
  // into another private workspace.
  function profileFromUrl(url) {
    const hash = new URLSearchParams(String(url.hash || '').replace(/^#/, ''));
    return strictOwner(hash.get('filament-user')) || strictOwner(url.searchParams.get('profile'));
  }

  // scan-core loads before user-isolation.js in the browser. Strip only the
  // legacy scan-time profile hint before isolation bootstraps so an old QR
  // cannot silently change the active private workspace. Non-scan profile
  // deep links are left untouched.
  function neutralizeLegacyProfileHint(value) {
    const url = value instanceof URL ? new URL(value.toString()) : new URL(String(value));
    if (url.searchParams.get('scan') !== '1') return {url, changed:false};
    const hash = new URLSearchParams(String(url.hash || '').replace(/^#/, ''));
    if (!hash.has('filament-user')) return {url, changed:false};
    hash.delete('filament-user');
    const nextHash = hash.toString();
    url.hash = nextHash ? `#${nextHash}` : '';
    return {url, changed:true};
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

  // Canonical physical-spool links contain only stable identity + scan intent.
  // Owner/profile, placement, quantity and other mutable state are intentionally
  // excluded from the durable QR contract.
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

  // A scan resolves only inside the already-active private workspace. It must
  // never disclose that another private member has the same durable ID.
  function resolveProfile(spoolId, currentProfile, states = {}) {
    const current = strictOwner(currentProfile) || 'Bill';
    return stateHasSpool(states[current], spoolId) ? current : null;
  }

  return Object.freeze({OWNERS, ID_RE, strictOwner, validId, profileFromUrl, neutralizeLegacyProfileHint, parseScanValue, buildSpoolTarget, stateHasSpool, resolveProfile});
});