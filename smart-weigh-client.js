(() => {
  'use strict';
  const core = globalThis.FilamentInventorySmartWeigh;
  if (!core) return;
  const STORAGE_KEY = 'filament-inventory-v1';
  const PHYSICAL_KEY = /^filament-user-v1:(bill|aimee):inventory$/i;
  const $ = id => document.getElementById(id);
  let pendingMeasurement = null;
  let pendingNominalEdit = null;

  const parse = (value, fallback = null) => { try { return JSON.parse(String(value)); } catch { return fallback; } };
  const numeric = value => value === '' || value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value);
  const readState = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; } };
  const currentSpool = () => {
    const state = readState();
    return (state.spools || []).find(spool => String(spool.id) === String($('weighSpool')?.value));
  };
  const inventoryKey = key => key === STORAGE_KEY || PHYSICAL_KEY.test(String(key || ''));
  const evidenceKey = evidence => String(evidence?.evidenceId || '').trim();
  const sameSpool = (first, second) => String(first || '').trim().toLowerCase() === String(second || '').trim().toLowerCase();

  function makeEvidenceId(spoolId, observedAt) {
    const stamp = String(observedAt || new Date().toISOString()).replace(/[^0-9]/g, '').slice(0, 17);
    const suffix = globalThis.crypto?.randomUUID?.().slice(0, 8) || Math.random().toString(36).slice(2, 10);
    return `qe-${String(spoolId || 'spool').trim().toLowerCase()}-${stamp}-${suffix}`;
  }

  function captureMeasurement(event) {
    if (event.target?.id !== 'weighForm') return;
    const spool = currentSpool();
    const gross = $('grossWeight')?.value;
    const tare = $('tareWeight')?.value;
    if (!spool) return;
    const observedAt = new Date().toISOString();
    const evidence = core.measuredEvidence(spool, gross, tare, {
      evidenceId:makeEvidenceId(spool.id, observedAt),
      observedAt,
      source:'smart-weigh',
    });
    if (!evidence) return;
    pendingMeasurement = {spoolId:spool.id, evidence};
  }

  function captureNominalEdit(event) {
    if (event.target?.id !== 'spoolForm') return;
    const id = String($('spoolId')?.value || '').trim();
    if (!id) return;
    pendingNominalEdit = {spoolId:id, value:numeric($('startWeight')?.value)};
  }

  function protectUnknownNominal(incoming, previous) {
    if (!incoming?.spools) return;
    const previousById = new Map((previous?.spools || []).map(spool => [String(spool?.id || '').trim().toLowerCase(), spool]));
    incoming.spools.forEach(spool => {
      const id = String(spool?.id || '').trim().toLowerCase();
      if (!id) return;
      const explicit = pendingNominalEdit && sameSpool(pendingNominalEdit.spoolId, spool.id);
      if (explicit) {
        spool.startWeight = pendingNominalEdit.value;
        return;
      }
      const prior = previousById.get(id);
      if (prior && numeric(prior.startWeight) === null && Number(spool.startWeight) === 1000) spool.startWeight = null;
    });
  }

  function appendPendingEvidence(incoming, previous) {
    if (!pendingMeasurement || !incoming?.spools) return false;
    const target = incoming.spools.find(spool => sameSpool(spool?.id, pendingMeasurement.spoolId));
    if (!target) return false;
    if (Number(target.gross) !== Number(pendingMeasurement.evidence.grossGrams) || Number(target.tare) !== Number(pendingMeasurement.evidence.tareGrams)) return false;

    const priorSpool = previous?.spools?.find(spool => sameSpool(spool?.id, pendingMeasurement.spoolId));
    const priorEvidence = Array.isArray(priorSpool?.quantityEvidence) ? priorSpool.quantityEvidence : [];
    const incomingEvidence = Array.isArray(target.quantityEvidence) ? target.quantityEvidence : [];
    const byId = new Map();
    [...priorEvidence, ...incomingEvidence].forEach(evidence => {
      const id = evidenceKey(evidence);
      if (id) byId.set(id, evidence);
    });
    byId.set(pendingMeasurement.evidence.evidenceId, pendingMeasurement.evidence);
    target.quantityEvidence = [...byId.values()];
    target.remainingEvidenceAt = pendingMeasurement.evidence.observedAt;
    return true;
  }

  function installMeasurementPersistence() {
    if (!globalThis.Storage || globalThis.__filamentSmartWeighEvidenceStorageInstalled) return;
    globalThis.__filamentSmartWeighEvidenceStorageInstalled = true;
    const proto = Storage.prototype;
    const priorSet = proto.setItem;

    proto.setItem = function(key, value) {
      if (this !== localStorage || !inventoryKey(key)) return priorSet.call(this, key, value);
      const incoming = parse(value, null);
      if (!incoming?.spools) return priorSet.call(this, key, value);
      const previous = parse(localStorage.getItem(key), null);

      protectUnknownNominal(incoming, previous);
      const evidenceApplied = appendPendingEvidence(incoming, previous);
      const applied = evidenceApplied ? pendingMeasurement : null;
      if (evidenceApplied) pendingMeasurement = null;
      if (pendingNominalEdit && incoming.spools.some(spool => sameSpool(spool?.id, pendingNominalEdit.spoolId))) pendingNominalEdit = null;

      const result = priorSet.call(this, key, JSON.stringify(incoming));
      if (applied) {
        queueMicrotask(() => {
          globalThis.FilamentInventoryEvents?.emit('quantity-evidence:saved', {
            spoolId:applied.spoolId,
            evidenceId:applied.evidence.evidenceId,
            method:applied.evidence.method,
            observedAt:applied.evidence.observedAt,
          });
        });
      }
      return result;
    };
  }

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

  function reconcilePreview() {
    const spool = currentSpool();
    const gross = $('grossWeight')?.value;
    const tare = $('tareWeight')?.value;
    const result = spool ? core.preview(spool, gross, tare) : null;
    if (!result?.valid) return;
    const percent = $('calcPercent');
    const status = $('calcStatus');
    if (percent) percent.textContent = result.percent === null ? 'Unknown · nominal weight needed' : `${result.percent.toFixed(1)}%`;
    if (status && result.percent === null) status.textContent = result.reorder ? 'REORDER · measured grams' : 'Quantity known · level unknown';
  }

  function schedulePreviewReconcile() { queueMicrotask(reconcilePreview); }
  function refresh(preferredId = '') { rankOptions(preferredId); renderSuggestion(); schedulePreviewReconcile(); }

  installMeasurementPersistence();
  document.addEventListener('submit', captureMeasurement, true);
  document.addEventListener('submit', captureNominalEdit, true);

  document.addEventListener('DOMContentLoaded', () => {
    structureWeigh();
    const select = $('weighSpool');
    if (!select) return;
    setTimeout(() => refresh(), 0);
    select.addEventListener('change', renderSuggestion);
    ['grossWeight','tareWeight','weighSpool'].forEach(id => $(id)?.addEventListener(id === 'weighSpool' ? 'change' : 'input', schedulePreviewReconcile));
    globalThis.FilamentInventoryEvents?.on('inventory:changed', () => refresh());
    globalThis.FilamentInventoryEvents?.on('measurement:saved', event => refresh(event.detail.spoolId));
    globalThis.FilamentInventoryEvents?.on('quantity-evidence:saved', event => refresh(event.detail.spoolId));
    window.addEventListener('storage', event => { if (event.key === STORAGE_KEY) refresh(); });
  });
})();