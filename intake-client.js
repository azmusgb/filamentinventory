(() => {
  'use strict';

  const STORAGE_KEY = 'filament-inventory-v1';
  const CURRENT_USER_KEY = 'filament-current-user-v1';
  const FIELD_MAP = {
    brand:'brands',
    material:'materials',
    colorName:'colors',
    location:'locations',
    purchaseSource:'purchaseSources',
    printerV8:'printers',
    feederV8:'feeders',
  };
  let dialogObserver = null;
  let lastSavedSnapshot = null;

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const parse = (value, fallback = null) => { try { return JSON.parse(value); } catch { return fallback; } };
  const api = () => globalThis.FilamentInventoryIntake;
  const currentUser = () => globalThis.FilamentInventoryUsers?.currentUser?.() || String(localStorage.getItem(CURRENT_USER_KEY) || 'Bill');
  const state = () => parse(localStorage.getItem(STORAGE_KEY), {spools:[],weighLog:[],auditLog:[]}) || {spools:[],weighLog:[],auditLog:[]};
  const cssEscape = value => globalThis.CSS?.escape ? CSS.escape(String(value)) : String(value).replace(/["\\]/g, '\\$&');

  function ensureDatalist(fieldId) {
    const input = $(fieldId);
    if (!input || input.tagName !== 'INPUT') return null;
    const id = `intakeList-${fieldId}`;
    let list = $(id);
    if (!list) {
      list = document.createElement('datalist');
      list.id = id;
      document.body.appendChild(list);
    }
    input.setAttribute('list', id);
    return list;
  }

  function ensureSuggestionRow(fieldId) {
    const input = $(fieldId);
    const holder = input?.closest('.form-field');
    if (!holder) return null;
    const id = `intakeSuggestions-${fieldId}`;
    let row = $(id);
    if (!row) {
      row = document.createElement('div');
      row.id = id;
      row.className = 'intake-suggestions';
      row.setAttribute('aria-label', `Suggestions for ${fieldId}`);
      holder.appendChild(row);
    }
    return row;
  }

  function suggestions() {
    return api()?.suggestions(state(), 8) || {brands:[],materials:[],colors:[],locations:[],purchaseSources:[],printers:[],feeders:[]};
  }

  function renderSuggestionField(fieldId, values) {
    const input = $(fieldId);
    if (!input) return;
    const list = ensureDatalist(fieldId);
    if (list) list.innerHTML = values.map(value => `<option value="${esc(value)}"></option>`).join('');
    const row = ensureSuggestionRow(fieldId);
    if (!row) return;
    const visible = values.slice(0,4);
    row.hidden = !visible.length;
    row.innerHTML = visible.map(value => `<button class="intake-chip" type="button" data-intake-fill="${esc(fieldId)}" data-value="${esc(value)}">${esc(value)}</button>`).join('');
  }

  function renderSuggestions() {
    const all = suggestions();
    Object.entries(FIELD_MAP).forEach(([fieldId, group]) => renderSuggestionField(fieldId, all[group] || []));
  }

  function renderRecentPresets() {
    const row = $('intakeRecentPresets');
    if (!row) return;
    const presets = api()?.recentPresets(state(), 4) || [];
    row.hidden = !presets.length;
    row.innerHTML = presets.map(preset => `<button class="intake-chip" type="button" data-intake-preset-id="${esc(preset.id)}" title="Reuse settings from ${esc(preset.id)}"><strong>${esc(preset.brand)}</strong> · ${esc(preset.material)}</button>`).join('');
  }

  function draft() {
    return {
      id:$('spoolId')?.value,
      originalId:$('editOriginalId')?.value,
      brand:$('brand')?.value,
      material:$('material')?.value,
      colorName:$('colorName')?.value,
      spoolType:$('spoolType')?.value,
      startWeight:$('startWeight')?.value,
      location:$('location')?.value,
      confidence:$('confidence')?.value,
      opened:$('opened')?.value,
      bagged:$('bagged')?.value,
      purchaseSource:$('purchaseSource')?.value,
      purchaseDate:$('purchaseDate')?.value,
      reorderThreshold:$('reorderThreshold')?.value,
      placementState:$('placementV8')?.value,
      printerName:$('printerV8')?.value,
      feederName:$('feederV8')?.value,
      feederSlot:$('slotV8')?.value,
    };
  }

  function renderDuplicateWarning() {
    const warning = $('intakeDuplicateWarning');
    if (!warning) return;
    const matches = api()?.duplicateCandidates(state(), draft(), $('editOriginalId')?.value || '') || [];
    if (!matches.length) {
      warning.classList.remove('show');
      warning.innerHTML = '';
      return;
    }
    const ids = matches.slice(0,4).map(spool => spool.id).join(', ');
    warning.innerHTML = `<strong>Possible duplicate:</strong> ${esc(ids)} already matches this brand, material and color. Multiple identical spools are fine; this is only a check before saving.`;
    warning.classList.add('show');
  }

  function renderTareHint() {
    const hint = $('intakeTareHint');
    if (!hint) return;
    if (String($('tareEdit')?.value || '').trim()) {
      hint.classList.remove('show');
      return;
    }
    const inferred = api()?.inferredTare(state(), draft());
    if (!inferred) {
      hint.classList.remove('show');
      hint.innerHTML = '';
      return;
    }
    hint.innerHTML = `Suggested empty-spool tare: <strong>${esc(inferred.grams)} g</strong> from ${esc(inferred.samples)} similar spool${inferred.samples === 1 ? '' : 's'}. Verify the spool type before using it.<br><button class="btn intake-tare-use" type="button" data-intake-tare="${esc(inferred.grams)}">Use ${esc(inferred.grams)} g</button>`;
    hint.classList.add('show');
  }

  function renderStartWeightHint() {
    const hint = $('intakeStartWeightHint');
    if (!hint) return;
    const inferred = api()?.inferredStartWeight(state(), draft());
    const current = Number($('startWeight')?.value);
    if (!inferred || (Number.isFinite(current) && current === inferred.grams)) {
      hint.classList.remove('show');
      hint.innerHTML = '';
      return;
    }
    hint.innerHTML = `Typical starting amount for similar spools: <strong>${esc(inferred.grams)} g</strong> from ${esc(inferred.samples)} example${inferred.samples === 1 ? '' : 's'}. <button class="btn intake-tare-use" type="button" data-intake-start-weight="${esc(inferred.grams)}">Use ${esc(inferred.grams)} g</button>`;
    hint.classList.add('show');
  }

  function syncPlacementButtons() {
    const value = $('placementV8')?.value === 'Loaded' ? 'Loaded' : 'Stored';
    document.querySelectorAll('[data-intake-placement]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.intakePlacement === value)));
  }

  function ensurePlacementButtons() {
    const select = $('placementV8');
    const holder = select?.closest('.form-field');
    if (!select || !holder || $('intakePlacement')) return;
    const controls = document.createElement('div');
    controls.id = 'intakePlacement';
    controls.className = 'intake-placement';
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', 'Spool placement');
    controls.innerHTML = `<button class="intake-placement-btn" type="button" data-intake-placement="Stored">Stored</button><button class="intake-placement-btn" type="button" data-intake-placement="Loaded">Loaded now</button>`;
    holder.appendChild(controls);
    const label = holder.querySelector('label');
    if (label) label.textContent = 'Placement';
    select.hidden = true;
    syncPlacementButtons();
  }

  function ensureBanner() {
    const body = document.querySelector('#spoolDialog .dialog-body');
    if (!body || $('intakeBanner')) return;
    const banner = document.createElement('section');
    banner.id = 'intakeBanner';
    banner.className = 'intake-banner';
    banner.innerHTML = `<div><strong id="intakeBannerTitle">Smart Add Spool</strong><p>Use your private inventory to speed up repeat entry. Measured values are never invented or applied without your action.</p><div class="intake-flow"><span class="intake-step">Identify</span><span class="intake-step">Place</span><span class="intake-step">Save</span><span class="intake-step">Next action</span></div><div id="intakeRecentPresets" class="intake-suggestions" aria-label="Recent spool presets"></div></div><span class="intake-owner" id="intakeOwner"></span>`;
    body.insertBefore(banner, body.firstElementChild?.nextSibling || body.firstChild);
    const warning = document.createElement('div');
    warning.id = 'intakeDuplicateWarning';
    warning.className = 'intake-duplicate';
    banner.insertAdjacentElement('afterend', warning);
  }

  function ensureTareHint() {
    const holder = $('tareEdit')?.closest('.form-field');
    if (!holder || $('intakeTareHint')) return;
    const hint = document.createElement('div');
    hint.id = 'intakeTareHint';
    hint.className = 'intake-tare-hint';
    holder.appendChild(hint);
  }

  function ensureStartWeightHint() {
    const holder = $('startWeight')?.closest('.form-field');
    if (!holder || $('intakeStartWeightHint')) return;
    const hint = document.createElement('div');
    hint.id = 'intakeStartWeightHint';
    hint.className = 'intake-tare-hint';
    holder.appendChild(hint);
  }

  function ensurePrimaryAction() {
    const actions = document.querySelector('#spoolDialog .dialog-actions');
    if (!actions) return;
    $('intakeSaveWeigh')?.remove();
    $('intakeSaveAnother')?.remove();
    const primary = actions.querySelector('.btn-primary');
    if (primary && !String($('editOriginalId')?.value || '').trim()) primary.textContent = 'Save spool';
  }

  function ensureNextDialog() {
    let dialog = $('intakeNextDialog');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'intakeNextDialog';
    dialog.className = 'spool-action-dialog intake-next-dialog';
    dialog.setAttribute('aria-labelledby', 'intakeNextTitle');
    dialog.innerHTML = `<div class="spool-action-shell"><div class="spool-action-head"><div><span class="eyebrow">Spool added</span><h2 id="intakeNextTitle">What next?</h2></div><button class="btn icon-btn" type="button" data-intake-next="done" aria-label="Close">×</button></div><div class="spool-action-body" id="intakeNextBody"></div></div>`;
    document.body.appendChild(dialog);
    dialog.addEventListener('click', event => {
      if (event.target === dialog) return dialog.close();
      const action = event.target.closest('[data-intake-next]')?.dataset.intakeNext;
      if (!action) return;
      runNextAction(action);
    });
    return dialog;
  }

  function ensureEnhancements() {
    ensureBanner();
    ensurePlacementButtons();
    ensureTareHint();
    ensureStartWeightHint();
    ensurePrimaryAction();
    ensureNextDialog();
    Object.keys(FIELD_MAP).forEach(ensureSuggestionRow);
  }

  function dispatchInput(node, type = 'input') {
    node?.dispatchEvent(new Event(type, {bubbles:true}));
  }

  function applyRememberedDefaults(dialog) {
    if (!dialog || dialog.dataset.intakeDefaultsApplied === '1') return;
    dialog.dataset.intakeDefaultsApplied = '1';
    const defaults = api()?.preferredDefaults(state()) || {};
    const location = $('location');
    if (location && !String(location.value || '').trim() && defaults.location) {
      location.value = defaults.location;
      dispatchInput(location);
    }
  }

  function prepareDialog() {
    const dialog = $('spoolDialog');
    if (!dialog?.open) return;
    ensureEnhancements();
    const owner = currentUser();
    const editing = Boolean(String($('editOriginalId')?.value || '').trim());
    if (!editing) applyRememberedDefaults(dialog);
    const ownerBadge = $('intakeOwner');
    if (ownerBadge) ownerBadge.textContent = `${owner} · private`;
    const title = $('dialogTitle');
    if (title && !editing) title.textContent = `Add to ${owner}'s inventory`;
    const bannerTitle = $('intakeBannerTitle');
    if (bannerTitle) bannerTitle.textContent = editing ? 'Smart spool editor' : 'Smart Add Spool';
    ensurePrimaryAction();
    renderSuggestions();
    renderRecentPresets();
    renderDuplicateWarning();
    renderTareHint();
    renderStartWeightHint();
    syncPlacementButtons();
  }

  function applyTemplate(template, {preservePurchaseDate = true} = {}) {
    const fields = {
      brand:template.brand,
      material:template.material,
      spoolType:template.spoolType,
      startWeight:template.startWeight,
      location:template.location,
      confidence:template.confidence,
      opened:template.opened,
      bagged:template.bagged,
      purchaseSource:template.purchaseSource,
      reorderThreshold:template.reorderThreshold,
      placementV8:'Stored',
      printerV8:'', feederV8:'', slotV8:'',
    };
    if (preservePurchaseDate) fields.purchaseDate = template.purchaseDate;
    for (const [id, value] of Object.entries(fields)) {
      const node = $(id);
      if (!node) continue;
      node.value = value ?? '';
      dispatchInput(node, node.tagName === 'SELECT' ? 'change' : 'input');
    }
    if ($('colorName')) $('colorName').value = '';
    if ($('grossEdit')) $('grossEdit').value = '';
    if ($('tareEdit')) $('tareEdit').value = '';
    syncPlacementButtons();
    renderDuplicateWarning();
    renderTareHint();
    renderStartWeightHint();
    $('colorName')?.focus();
  }

  function applyPreset(id) {
    const spool = (state().spools || []).find(row => String(row?.id || '') === String(id || ''));
    if (!spool) return;
    const template = api()?.templateFromDraft(spool) || spool;
    applyTemplate(template, {preservePurchaseDate:false});
  }

  function navigate(view) {
    if (globalThis.FilamentInventoryNavigation?.navigate?.(view,{historyMode:'push',focus:true})) return true;
    const tab = document.querySelector(`.tab[data-view="${view}"]`);
    if (!tab) return false;
    tab.click();
    return true;
  }

  function navigateToWeigh(id) {
    if (!navigate('weigh')) return;
    setTimeout(() => {
      const select = $('weighSpool');
      if (select) {
        select.value = id;
        dispatchInput(select, 'change');
      }
      $('grossWeight')?.focus();
    }, 90);
  }

  function navigateToLabels(id) {
    if (!navigate('labels')) return;
    setTimeout(() => {
      $('clearLabelsBtn')?.click();
      const search = $('labelSearch');
      if (search) {
        search.value = id;
        dispatchInput(search);
      }
      setTimeout(() => {
        const checkbox = document.querySelector(`#spoolPickList [data-label-id="${cssEscape(id)}"]`);
        if (!checkbox) return;
        checkbox.checked = true;
        dispatchInput(checkbox, 'change');
        $('labelPreviewGrid')?.scrollIntoView({behavior:'smooth', block:'start'});
        $('printLabelsBtn')?.focus({preventScroll:true});
      }, 80);
    }, 80);
  }

  function navigateToPrinter(id) {
    if (!navigate('household')) return;
    setTimeout(() => {
      const select = $('moveSpoolV8');
      if (!select) return;
      const option = [...select.options].find(row => String(row.value).toLowerCase() === String(id).toLowerCase());
      if (option) {
        select.value = option.value;
        dispatchInput(select, 'change');
      }
      $('movePrinterV8')?.focus({preventScroll:true});
      select.scrollIntoView({behavior:'smooth', block:'center'});
    }, 100);
  }

  function openAnother(snapshot) {
    const template = api()?.templateFromDraft(snapshot) || snapshot;
    template.placementState = 'Stored';
    template.printerName = '';
    template.feederName = '';
    template.feederSlot = '';
    const addButton = $('inventoryAddBtn') || $('heroAddBtn') || $('addTopBtn');
    addButton?.click();
    setTimeout(() => applyTemplate(template), 90);
  }

  function showNext(saved, snapshot) {
    const dialog = ensureNextDialog();
    lastSavedSnapshot = snapshot;
    dialog.dataset.spoolId = saved.id;
    const body = $('intakeNextBody');
    const title = $('intakeNextTitle');
    if (title) title.textContent = `${saved.id} added`;
    if (body) body.innerHTML = `<section class="spool-action-summary"><div class="spool-action-ident"><i class="spool-action-swatch" style="background:${esc(saved.colorHex || '#94a3b8')}"></i><div><strong>${esc(saved.id)}</strong><span>${esc(saved.brand || 'Unknown')} · ${esc(saved.material || 'Unknown')} · ${esc(saved.colorName || 'Unknown')}</span></div></div></section><section class="spool-action-grid" aria-label="Next actions"><button class="btn btn-primary" type="button" data-intake-next="weigh">Weigh now</button><button class="btn" type="button" data-intake-next="labels">Print QR label</button><button class="btn" type="button" data-intake-next="printer">Load into Printer / AMS</button><button class="btn" type="button" data-intake-next="another">Add another like this</button><button class="btn" type="button" data-intake-next="done">Done</button></section><p class="spool-action-note">The spool is already saved. These actions route into the existing measurement, label, and placement workflows.</p>`;
    if (!dialog.open) dialog.showModal();
  }

  function runNextAction(action) {
    const dialog = $('intakeNextDialog');
    const id = dialog?.dataset.spoolId || '';
    if (action === 'done') return dialog?.close();
    dialog?.close();
    if (action === 'weigh') return navigateToWeigh(id);
    if (action === 'labels') return navigateToLabels(id);
    if (action === 'printer') return navigateToPrinter(id);
    if (action === 'another' && lastSavedSnapshot) return openAnother(lastSavedSnapshot);
  }

  function afterSubmit(snapshot) {
    const dialog = $('spoolDialog');
    if (dialog?.open) return;
    if (String(snapshot.originalId || '').trim()) return;
    const saved = (state().spools || []).find(spool => String(spool.id) === String(snapshot.id));
    if (!saved) return;
    showNext(saved, snapshot);
  }

  function bind() {
    const dialog = $('spoolDialog');
    const form = $('spoolForm');
    if (!dialog || !form || form.dataset.smartIntakeBound === 'true') return;
    form.dataset.smartIntakeBound = 'true';

    form.addEventListener('click', event => {
      const fill = event.target.closest('[data-intake-fill]');
      if (fill) {
        const node = $(fill.dataset.intakeFill);
        if (node) {
          node.value = fill.dataset.value || '';
          dispatchInput(node, node.tagName === 'SELECT' ? 'change' : 'input');
          renderDuplicateWarning();
          renderTareHint();
          renderStartWeightHint();
        }
        return;
      }
      const preset = event.target.closest('[data-intake-preset-id]');
      if (preset) {
        applyPreset(preset.dataset.intakePresetId);
        return;
      }
      const tare = event.target.closest('[data-intake-tare]');
      if (tare) {
        $('tareEdit').value = tare.dataset.intakeTare;
        dispatchInput($('tareEdit'));
        renderTareHint();
        return;
      }
      const start = event.target.closest('[data-intake-start-weight]');
      if (start) {
        $('startWeight').value = start.dataset.intakeStartWeight;
        dispatchInput($('startWeight'));
        renderStartWeightHint();
        return;
      }
      const placement = event.target.closest('[data-intake-placement]');
      if (placement) {
        const select = $('placementV8');
        if (select) {
          select.value = placement.dataset.intakePlacement;
          dispatchInput(select, 'change');
          syncPlacementButtons();
        }
      }
    });

    ['brand','material','colorName','spoolType','tareEdit','startWeight'].forEach(id => $(id)?.addEventListener(id === 'spoolType' ? 'change' : 'input', () => {
      renderDuplicateWarning();
      renderTareHint();
      renderStartWeightHint();
    }));
    $('placementV8')?.addEventListener('change', syncPlacementButtons);

    form.addEventListener('submit', () => {
      const snapshot = draft();
      setTimeout(() => afterSubmit(snapshot), 70);
    });

    dialogObserver = new MutationObserver(() => {
      if (dialog.open) setTimeout(prepareDialog, 0);
      else delete dialog.dataset.intakeDefaultsApplied;
    });
    dialogObserver.observe(dialog, {attributes:true, attributeFilter:['open']});
  }

  function init() {
    ensureEnhancements();
    bind();
    if ($('spoolDialog')?.open) prepareDialog();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();