(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FilamentInventoryEvents = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const listeners = new Map();

  function on(name, handler) {
    if (typeof handler !== 'function') throw new TypeError('Event handler must be a function.');
    const key = String(name || '').trim();
    if (!key) throw new TypeError('Event name is required.');
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(handler);
    return () => off(key, handler);
  }

  function off(name, handler) {
    const set = listeners.get(String(name || '').trim());
    if (!set) return false;
    const removed = set.delete(handler);
    if (!set.size) listeners.delete(String(name || '').trim());
    return removed;
  }

  function emit(name, detail = {}) {
    const key = String(name || '').trim();
    if (!key) return 0;
    const event = Object.freeze({name:key, detail:Object.freeze({...detail}), at:new Date().toISOString()});
    const handlers = [...(listeners.get(key) || [])];
    handlers.forEach(handler => {
      try { handler(event); } catch (error) { console.error(`FilamentInventoryEvents handler failed for ${key}`, error); }
    });
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(`filament:${key}`, {detail:event.detail}));
    }
    return handlers.length;
  }

  return Object.freeze({on, off, emit});
});
