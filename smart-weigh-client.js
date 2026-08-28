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
    if (suggestion.source === 'confirmed') return `Confirmed empty-spool weight: ${suggestion.grams} g`;
    if (suggestion.source === 'previous') return `Previously used empty-spool weight: ${suggestion.grams} g`;
    return `Suggested empty-spool weight: ${suggestion.grams} g · based on ${suggestion.count} similar spools`;
  }

  function renderSuggestion() {
    const host = $('tareSuggestion');
    const spool = currentSpool();
    if (!host || !spool) return;
    const state = readState();
    const suggestion = core.tareSuggestion(spool, state.spools || [], state.weighLog || []);
    host.replaceChildren();
    if (!suggestion) { host.textContent = 'No reliable empty-spool weight is known yet. Enter the value printed on the spool or a verified tare.'; return; }
    const text = document.createElement('span');
    text.textContent = suggestionText(suggestion);
    host.append(text);
    if (suggestion.source !== 'confirmed') {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-ghost weigh-use-tare';
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
      const option = document.createElement('option');
      option.value = spool.id;
      option.textContent = labels.get(spool.id) || `${spool.id} — ${spool.brand || 'Unknown'} ${spool.material || ''} — ${spool.colorName || ''}`;
      return option;
    }));
    if ([...select.options].some(option => option.value === current)) select.value = current;
  }

  function makeStep(number, title, copy, holder) {
    const section = document.createElement('section');
    section.className = 'weigh-step';
    section.innerHTML = `<div class="weigh-step-marker" aria-hidden="true">${number}</div><div class="weigh-step-content"><div class="weigh-step-head"><strong>${title}</strong><span>${copy}</span></div></div>`;
    if (holder) section.querySelector('.weigh-step-content').appendChild(holder);
    return section;
  }

  function structureWeigh() {
    const view = $('weighView');
    const form = $('weighForm');
    if (!view || !form || view.dataset.v11Weigh === '1') return;
    view.dataset.v11Weigh = '1';
    view.classList.add('weigh-workflow-v11');
    form.classList.remove('form-grid');
    form.classList.add('weigh-guided-form');

    const workflowCard = form.closest('.weigh-card');
    workflowCard?.classList.add('weigh-workflow-card');
    const previewCard = $('calcPreview')?.closest('.weigh-card');
    previewCard?.classList.add('weigh-result-card');

    const title = $('weighTitle');
    if (title) title.classList.add('weigh-legacy-title');
    const cardEyebrow = workflowCard?.querySelector(':scope > .eyebrow');
    if (cardEyebrow) cardEyebrow.classList.add('weigh-legacy-title');
    const intro = workflowCard?.querySelector(':scope > p.muted');
    if (intro) intro.textContent = 'Put the selected spool on a scale. The app subtracts the verified empty-spool weight and saves the result as the authoritative remaining amount.';

    const spoolHolder = $('weighSpool')?.closest('.form-field');
    const grossHolder = $('grossWeight')?.closest('.form-field');
    const tareHolder = $('tareWeight')?.closest('.form-field');
    const locationHolder = $('weighLocation')?.closest('.form-field');
    const notesHolder = $('weighNotes')?.closest('.form-field');
    const submitHolder = form.querySelector('.form-field:has(button[type="submit"])');

    const grossLabel = grossHolder?.querySelector('label');
    if (grossLabel) grossLabel.textContent = 'Scale weight — spool + filament (g)';
    const tareLabel = tareHolder?.querySelector('label');
    if (tareLabel) tareLabel.textContent = 'Verified empty-spool weight (g)';

    const steps = document.createElement('div');
    steps.className = 'weigh-steps';
    steps.append(
      makeStep('1','Choose the spool','Start with the physical spool you are weighing.',spoolHolder),
      makeStep('2','Read the scale','Enter the total weight shown with filament still on the spool.',grossHolder),
      makeStep('3','Verify the empty spool','Use a confirmed tare, a prior value, or enter the verified empty-spool weight.',tareHolder),
    );

    const optional = document.createElement('details');
    optional.className = 'weigh-optional';
    optional.innerHTML = '<summary><span><strong>Add location or note</strong><small>Optional context for this measurement</small></span><span aria-hidden="true">＋</span></summary><div class="weigh-optional-fields"></div>';
    const optionalFields = optional.querySelector('.weigh-optional-fields');
    if (locationHolder) optionalFields.appendChild(locationHolder);
    if (notesHolder) optionalFields.appendChild(notesHolder);

    const actions = document.createElement('div');
    actions.className = 'weigh-save-actions';
    if (submitHolder) {
      submitHolder.classList.remove('full');
      const button = submitHolder.querySelector('button[type="submit"]');
      if (button) button.textContent = 'Save measurement';
      actions.appendChild(submitHolder);
    }

    form.replaceChildren(steps, optional, actions);

    const previewEyebrow = previewCard?.querySelector(':scope > .eyebrow');
    if (previewEyebrow) previewEyebrow.textContent = 'Result';
    const previewTitle = previewCard?.querySelector(':scope > h3');
    if (previewTitle) previewTitle.textContent = 'Remaining filament';
  }

  function refresh(preferredId = '') { rankOptions(preferredId); renderSuggestion(); }

  document.addEventListener('DOMContentLoaded', () => {
    structureWeigh();
    const select = $('weighSpool');
    if (!select) return;
    setTimeout(() => refresh(), 0);
    select.addEventListener('change', renderSuggestion);
    globalThis.FilamentInventoryEvents?.on('inventory:changed', () => refresh());
    globalThis.FilamentInventoryEvents?.on('measurement:saved', event => refresh(event.detail.spoolId));
    window.addEventListener('storage', event => { if (event.key === STORAGE_KEY) refresh(); });
  });
})();
