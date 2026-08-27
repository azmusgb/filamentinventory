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
  let pendingAction = 'save';
  let dialogObserver = null;

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const parse = (value, fallback = null) => { try { return JSON.parse(value); } catch { return fallback; } };
  const api = () => globalThis.FilamentInventoryIntake;
  const currentUser = () => globalThis.FilamentInventoryUsers?.currentUser?.() || String(localStorage.getItem(CURRENT_USER_KEY) || 'Bill');
  const state = () => parse(localStorage.getItem(STORAGE_KEY), {spools:[],weighLog:[],auditLog:[]}) || {spools:[],weighLog:[],auditLog:[]};


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

  function draft() {
    return {
      id:$('spoolId')?.value,
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
    banner.innerHTML = `<div><strong id="intakeBannerTitle">Fast filament intake</strong><p>Use your existing inventory as a private suggestion library. Nothing is auto-filled into measured values without your action.</p><div class="intake-flow"><span class="intake-step">Identify</span><span class="intake-step">Amount</span><span class="intake-step">Placement</span><span class="intake-step">Save</span></div></div><span class="intake-owner" id="intakeOwner"></span>`;
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

  function ensureActions() {
    const actions = document.querySelector('#spoolDialog .dialog-actions');
    if (!actions || $('intakeSaveWeigh')) return;
    const weigh = document.createElement('button');
    weigh.id = 'intakeSaveWeigh';
    weigh.className = 'btn intake-action intake-action-secondary';
    weigh.type = 'submit';
    weigh.value = 'default';
    weigh.dataset.intakeAction = 'weigh';
    weigh.textContent = 'Save & weigh';
    const another = document.createElement('button');
    another.id = 'intakeSaveAnother';
    another.className = 'btn intake-action';
    another.type = 'submit';
    another.value = 'default';
    another.dataset.intakeAction = 'another';
    another.textContent = 'Save + another';
    const primary = actions.querySelector('.btn-primary');
    actions.insertBefore(weigh, primary);
    actions.insertBefore(another, primary);
  }

  function ensureEnhancements() {
    ensureBanner();
    ensurePlacementButtons();
    ensureTareHint();
    ensureActions();
    Object.keys(FIELD_MAP).forEach(ensureSuggestionRow);
  }

  function prepareDialog() {
    const dialog = $('spoolDialog');
    if (!dialog?.open) return;
    ensureEnhancements();
    const owner = currentUser();
    const editing = Boolean(String($('editOriginalId')?.value || '').trim());
    const ownerBadge = $('intakeOwner');
    if (ownerBadge) ownerBadge.textContent = `${owner} · private`;
    const title = $('dialogTitle');
    if (title && !editing) title.textContent = `Add to ${owner}'s inventory`;
    const bannerTitle = $('intakeBannerTitle');
    if (bannerTitle) bannerTitle.textContent = editing ? 'Smart spool editor' : 'Fast filament intake';
    const another = $('intakeSaveAnother');
    if (another) another.hidden = editing;
    renderSuggestions();
    renderDuplicateWarning();
    renderTareHint();
    syncPlacementButtons();
  }

  function dispatchInput(node, type = 'input') {
    node?.dispatchEvent(new Event(type, {bubbles:true}));
  }

  function applyTemplate(template) {
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
      purchaseDate:template.purchaseDate,
      reorderThreshold:template.reorderThreshold,
      placementV8:'Stored',
      printerV8:'', feederV8:'', slotV8:'',
    };
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
    $('colorName')?.focus();
  }

  function navigateToWeigh(id) {
    document.querySelector('.tab[data-view="weigh"]')?.click();
    setTimeout(() => {
      const select = $('weighSpool');
      if (select) {
        select.value = id;
        dispatchInput(select, 'change');
      }
      $('grossWeight')?.focus();
    }, 90);
  }

  function afterSubmit(snapshot) {
    const dialog = $('spoolDialog');
    if (dialog?.open) {
      pendingAction = 'save';
      return;
    }
    const id = snapshot.id;
    const saved = (state().spools || []).find(spool => String(spool.id) === String(id));
    if (!saved) {
      pendingAction = 'save';
      return;
    }
    const action = pendingAction;
    pendingAction = 'save';
    if (action === 'weigh') {
      navigateToWeigh(id);
      return;
    }
    if (action === 'another') {
      const template = api()?.templateFromDraft(snapshot) || snapshot;
      template.placementState = 'Stored';
      template.printerName = '';
      template.feederName = '';
      template.feederSlot = '';
      const addButton = $('inventoryAddBtn') || $('heroAddBtn') || $('addTopBtn');
      addButton?.click();
      setTimeout(() => applyTemplate(template), 90);
    }
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
        }
        return;
      }
      const tare = event.target.closest('[data-intake-tare]');
      if (tare) {
        $('tareEdit').value = tare.dataset.intakeTare;
        dispatchInput($('tareEdit'));
        renderTareHint();
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
        return;
      }
      const submit = event.target.closest('button[type="submit"]');
      pendingAction = submit?.dataset.intakeAction || 'save';
    });

    ['brand','material','colorName','spoolType','tareEdit'].forEach(id => $(id)?.addEventListener(id === 'spoolType' ? 'change' : 'input', () => {
      renderDuplicateWarning();
      renderTareHint();
    }));
    $('placementV8')?.addEventListener('change', syncPlacementButtons);

    form.addEventListener('submit', () => {
      const snapshot = draft();
      setTimeout(() => afterSubmit(snapshot), 50);
    });

    dialogObserver = new MutationObserver(() => {
      if (dialog.open) setTimeout(prepareDialog, 0);
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
