(() => {
  'use strict';
  const core = globalThis.FilamentInventorySmartWeigh;
  if (!core) return;
  const STORAGE_KEY = 'filament-inventory-v1';
  const $ = id => document.getElementById(id);
  const readState = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; } };
  const currentSpool = () => {
    const state = readState();
    return (state.spools || []).find(spool => String(spool.id) === String($('weighSpool')?.value));
  };

  function suggestionText(suggestion) {
    if (!suggestion) return '';
    if (suggestion.source === 'confirmed') return `Confirmed tare: ${suggestion.grams} g`;
    if (suggestion.source === 'previous') return `Previous tare: ${suggestion.grams} g`;
    return `Suggested empty-spool weight: ${suggestion.grams} g · based on ${suggestion.count} similar spools`;
  }

  function renderSuggestion() {
    const host = $('tareSuggestion');
    const spool = currentSpool();
    if (!host || !spool) return;
    const state = readState();
    const suggestion = core.tareSuggestion(spool, state.spools || [], state.weighLog || []);
    host.replaceChildren();
    if (!suggestion) { host.textContent = 'No reliable tare suggestion yet.'; return; }
    const text = document.createElement('span');
    text.textContent = suggestionText(suggestion);
    host.append(text);
    if (suggestion.source !== 'confirmed') {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'btn btn-ghost'; button.style.marginLeft = '8px';
      button.textContent = `Use ${suggestion.grams} g`;
      button.addEventListener('click', () => {
        const tare = $('tareWeight');
        if (!tare) return;
        tare.value = String(suggestion.grams);
        tare.dispatchEvent(new Event('input', {bubbles:true}));
        globalThis.FilamentInventoryEvents?.emit('weigh:tare-accepted', {spoolId:spool.id, grams:suggestion.grams, source:suggestion.source});
      });
      host.append(button);
    }
  }

  function rankOptions(preferredId = '') {
    const select = $('weighSpool');
    if (!select) return;
    const state = readState();
    const ranked = core.rankSpools(state.spools || [], state.weighLog || [], preferredId || select.value);
    const labels = new Map([...select.options].map(option => [option.value, option.textContent]));
    const current = preferredId || select.value;
    select.replaceChildren(...ranked.map(spool => {
      const option = document.createElement('option'); option.value = spool.id;
      option.textContent = labels.get(spool.id) || `${spool.id} — ${spool.brand || 'Unknown'} ${spool.material || ''} — ${spool.colorName || ''}`;
      return option;
    }));
    if ([...select.options].some(option => option.value === current)) select.value = current;
  }

  function refresh(preferredId = '') { rankOptions(preferredId); renderSuggestion(); }

  document.addEventListener('DOMContentLoaded', () => {
    const select = $('weighSpool');
    if (!select) return;
    setTimeout(() => refresh(), 0);
    select.addEventListener('change', renderSuggestion);
    globalThis.FilamentInventoryEvents?.on('inventory:changed', () => refresh());
    globalThis.FilamentInventoryEvents?.on('measurement:saved', event => refresh(event.detail.spoolId));
    window.addEventListener('storage', event => { if (event.key === STORAGE_KEY) refresh(); });
  });
})();
