(() => {
  'use strict';

  const STORAGE_KEY = 'filament-inventory-v1';
  const CURRENT_USER_KEY = 'filament-current-user-v1';
  const FILTER_DEFAULTS = Object.freeze({
    lifecycleFilter:'active',
    materialFilter:'',
    statusFilter:'',
    locationFilter:'',
    ownerFilterV8:'',
    sortSelect:'id',
  });
  const FILTER_IDS = Object.keys(FILTER_DEFAULTS);
  const $ = id => document.getElementById(id);
  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];
  let queued = false;
  let observer = null;
  let spoolDialogObserver = null;

  const safeState = () => {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return value && Array.isArray(value.spools) ? value : {spools:[]};
    } catch {
      return {spools:[]};
    }
  };

  const currentOwner = () => globalThis.FilamentInventoryUsers?.currentUser?.()
    || localStorage.getItem(CURRENT_USER_KEY)
    || 'Current workspace';

  const navigate = view => {
    if (globalThis.FilamentInventoryNavigation?.navigate?.(view, {historyMode:'push', focus:true})) return true;
    const tab = qs(`.tab[data-view="${CSS.escape(view)}"]`);
    if (!tab) return false;
    tab.click();
    return true;
  };

  function makeInlineAction(label, view, className) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `fi-cohesion-inline-action ${className}`;
    button.dataset.cohesionView = view;
    button.textContent = label;
    return button;
  }

  function enhanceHome() {
    const view = $('dashboardView');
    if (!view) return;
    const attentionHead = qs('.fi-home-attention .fi-home-section-head', view);
    if (attentionHead && !qs('[data-cohesion-home-attention]', attentionHead)) {
      const action = makeInlineAction('View inventory', 'inventory', 'fi-home-drilldown');
      action.dataset.cohesionHomeAttention = '';
      attentionHead.appendChild(action);
    }
    const loadedHead = qs('.fi-home-secondary .fi-home-section-head', view);
    if (loadedHead && !qs('[data-cohesion-home-loaded]', loadedHead)) {
      const action = makeInlineAction('Open Printer', 'household', 'fi-home-drilldown');
      action.dataset.cohesionHomeLoaded = '';
      loadedHead.appendChild(action);
    }
    const scan = qs('.fi-home-scan-empty', view);
    if (scan) scan.textContent = 'Scan a spool';
  }

  function filterIsActive(id) {
    const control = $(id);
    if (!control) return false;
    return String(control.value || '') !== FILTER_DEFAULTS[id];
  }

  function activeFilterCount() {
    return FILTER_IDS.filter(filterIsActive).length;
  }

  function filterChipLabel(id) {
    const control = $(id);
    if (!control) return '';
    const option = control instanceof HTMLSelectElement ? control.selectedOptions?.[0]?.textContent?.trim() : '';
    const raw = option || String(control.value || '').trim();
    if (!raw) return '';
    if (id === 'sortSelect') return raw.replace(/^Sort:\s*/i, 'Sort: ');
    if (id === 'lifecycleFilter') return raw === 'Active + archived' ? 'Includes archived' : raw;
    return raw.replace(/^All\s+/i, '');
  }

  function ensureActiveFilterRail() {
    const controls = qs('.inventory-compact-controls');
    if (!controls) return null;
    let rail = qs('.fi-active-filter-rail');
    if (!rail) {
      rail = document.createElement('div');
      rail.className = 'fi-active-filter-rail';
      rail.setAttribute('aria-label', 'Active inventory filters');
      controls.insertAdjacentElement('afterend', rail);
    }
    return rail;
  }

  function renderActiveFilterRail() {
    const rail = ensureActiveFilterRail();
    if (!rail) return;
    const active = FILTER_IDS.filter(filterIsActive);
    rail.hidden = active.length === 0;
    rail.innerHTML = active.map(id => `<button type="button" class="fi-filter-chip" data-filter-chip="${id}" aria-label="Remove ${filterChipLabel(id)} filter"><span>${filterChipLabel(id)}</span><b aria-hidden="true">×</b></button>`).join('');
  }

  function updateFilterBadge() {
    const badge = qs('[data-filter-count]');
    const opener = qs('[data-filter-open]');
    const count = activeFilterCount();
    if (badge) badge.textContent = String(count);
    if (opener) {
      opener.classList.toggle('has-filters', count > 0);
      opener.setAttribute('aria-label', count ? `Filters, ${count} active` : 'Filters');
    }
    renderActiveFilterRail();
  }

  function clearOneFilter(id) {
    const control = $(id);
    if (!control || !(id in FILTER_DEFAULTS)) return;
    control.value = FILTER_DEFAULTS[id];
    control.dispatchEvent(new Event('input', {bubbles:true}));
    control.dispatchEvent(new Event('change', {bubbles:true}));
    updateFilterBadge();
  }

  function enhanceInventoryCards() {
    qsa('#inventoryGrid .spool-card').forEach(card => {
      const details = qs('.spool-card-more', card);
      if (details && details.dataset.cohesionLabel !== '1') {
        details.dataset.cohesionLabel = '1';
        details.title = 'More spool actions';
        details.setAttribute('aria-label', `${details.getAttribute('aria-label') || 'Open'}; more spool actions`);
        details.classList.add('fi-spool-details-action');
      }
      if (card.dataset.cohesionOpen === '1') return;
      card.dataset.cohesionOpen = '1';
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.addEventListener('click', event => {
        if (event.target.closest('button, a, input, select, textarea, label, summary, [role="button"]:not(.spool-card)')) return;
        qs('.spool-card-more', card)?.click();
      });
      card.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (event.target !== card) return;
        event.preventDefault();
        qs('.spool-card-more', card)?.click();
      });
    });
  }

  function enhanceInventory() {
    const clear = $('clearFiltersBtn');
    if (clear) clear.textContent = 'Reset filters';
    const apply = qs('[data-filter-apply]');
    if (apply) apply.textContent = 'Done';
    const filterTitle = $('fiInventoryFilterTitle');
    if (filterTitle) filterTitle.textContent = 'Filters & sort';
    const search = $('searchInput');
    if (search) search.placeholder = 'Search spools…';
    enhanceInventoryCards();
    updateFilterBadge();
  }

  function moveFieldTo(container, id) {
    const field = $(id)?.closest('.form-field');
    if (field && container && field.parentElement !== container) container.appendChild(field);
    return field;
  }

  function quantityModeFromValues() {
    const gross = Number($('grossEdit')?.value || 0);
    const tare = Number($('tareEdit')?.value || 0);
    const visualRaw = $('visualPercent')?.value;
    const visual = visualRaw === '' || visualRaw == null ? null : Number(visualRaw);
    if (gross > 0 || tare > 0) return 'measured';
    if (visual !== null && Number.isFinite(visual) && visual < 99.5) return 'estimate';
    return 'full';
  }

  function setQuantityMode(mode, {userInitiated = false} = {}) {
    const dialog = $('spoolDialog');
    if (!dialog) return;
    const valid = ['full', 'estimate', 'measured'].includes(mode) ? mode : 'full';
    qsa('input[name="fiQuantityMode"]', dialog).forEach(input => { input.checked = input.value === valid; });
    dialog.dataset.quantityMode = valid;

    const visual = $('visualPercent');
    const gross = $('grossEdit');
    const tare = $('tareEdit');
    if (userInitiated) {
      if (valid === 'full') {
        if (visual) visual.value = '100';
        if (gross) gross.value = '';
        if (tare) tare.value = '';
      } else if (valid === 'estimate') {
        if (visual && (!visual.value || Number(visual.value) >= 99.5)) visual.value = '';
        if (gross) gross.value = '';
        if (tare) tare.value = '';
      } else if (valid === 'measured') {
        if (visual) visual.value = '';
      }
    }

    qsa('[data-quantity-field]', dialog).forEach(field => {
      const id = field.dataset.quantityField;
      const visible = id === 'startWeight'
        || (valid === 'estimate' && id === 'visualPercent')
        || (valid === 'measured' && (id === 'grossEdit' || id === 'tareEdit'));
      field.hidden = !visible;
    });
  }

  function ensureQuantitySection(dialog, essentials, advanced) {
    let section = qs('.spool-form-quantity', dialog);
    if (!section) {
      section = document.createElement('section');
      section.className = 'spool-form-section spool-form-quantity';
      section.innerHTML = `
        <div class="spool-form-section-head"><span class="eyebrow">Quantity</span><strong>How much filament is on it?</strong></div>
        <fieldset class="fi-quantity-choice">
          <legend class="sr-only">Quantity method</legend>
          <label><input type="radio" name="fiQuantityMode" value="full"><span><strong>Full / new</strong><small>Start at 100%</small></span></label>
          <label><input type="radio" name="fiQuantityMode" value="estimate"><span><strong>Estimate</strong><small>Enter a visual %</small></span></label>
          <label><input type="radio" name="fiQuantityMode" value="measured"><span><strong>Measured</strong><small>Use scale weights</small></span></label>
        </fieldset>
        <div class="form-grid v12-quantity-grid"></div>`;
      advanced.parentNode.insertBefore(section, advanced);
      qsa('input[name="fiQuantityMode"]', section).forEach(input => input.addEventListener('change', () => {
        if (input.checked) setQuantityMode(input.value, {userInitiated:true});
      }));
    }
    return section;
  }

  function enhanceSpoolForm() {
    const dialog = $('spoolDialog');
    if (!dialog) return;
    const essentials = qs('.spool-form-essentials', dialog);
    const advanced = qs('.spool-form-advanced', dialog);
    const essentialGrid = qs('.v10-essential-grid', essentials || dialog);
    const advancedGrid = qs('.v10-advanced-grid', advanced || dialog);
    if (!essentials || !advanced || !essentialGrid || !advancedGrid) return;

    if (!qs('.fi-spool-form-guidance', dialog)) {
      const guidance = document.createElement('p');
      guidance.className = 'fi-spool-form-guidance';
      guidance.textContent = 'Brand, material, color and location are enough to get started. Add weight or other details only when useful.';
      essentials.parentNode.insertBefore(guidance, essentials);
    }

    const quantity = ensureQuantitySection(dialog, essentials, advanced);
    const quantityGrid = qs('.v12-quantity-grid', quantity);
    ['startWeight', 'visualPercent', 'grossEdit', 'tareEdit'].forEach(id => {
      const field = moveFieldTo(quantityGrid, id);
      if (field) field.dataset.quantityField = id;
    });

    ['spoolId', 'spoolType', 'confidence', 'opened', 'bagged', 'reorderThreshold', 'lastDriedDate', 'purchaseSource', 'purchasePrice', 'purchaseDate', 'notes', 'ownerV8', 'placementV8', 'printerV8', 'feederV8', 'slotV8'].forEach(id => moveFieldTo(advancedGrid, id));

    const summaryCopy = qs('.spool-form-advanced summary small', dialog);
    if (summaryCopy) summaryCopy.textContent = 'Storage, printer placement, purchase details, identification and notes';
    const summaryTitle = qs('.spool-form-advanced summary strong', dialog);
    if (summaryTitle) summaryTitle.textContent = 'Advanced details';

    const startLabel = qs('label[for="startWeight"]', dialog);
    if (startLabel) startLabel.textContent = 'Full spool filament (g)';
    const visualLabel = qs('label[for="visualPercent"]', dialog);
    if (visualLabel) visualLabel.textContent = 'Estimated remaining (%)';
    const confidenceLabel = qs('label[for="confidence"]', dialog);
    if (confidenceLabel) confidenceLabel.textContent = 'Spool identification';

    const visual = $('visualPercent')?.closest('.form-field');
    if (visual && !qs('.fi-field-help', visual)) {
      const help = document.createElement('small');
      help.className = 'fi-field-help';
      help.textContent = 'Use a rough visual estimate. A measured scale value will take precedence later.';
      visual.appendChild(help);
    }

    const activeMode = dialog.open && ['full', 'estimate', 'measured'].includes(dialog.dataset.quantityMode)
      ? dialog.dataset.quantityMode
      : quantityModeFromValues();
    setQuantityMode(activeMode);
    observeSpoolDialog();
  }

  function observeSpoolDialog() {
    const dialog = $('spoolDialog');
    if (!dialog || spoolDialogObserver) return;
    spoolDialogObserver = new MutationObserver(records => {
      if (!records.some(record => record.attributeName === 'open')) return;
      if (!dialog.open) return;
      requestAnimationFrame(() => setQuantityMode(quantityModeFromValues()));
    });
    spoolDialogObserver.observe(dialog, {attributes:true, attributeFilter:['open']});
  }

  function enhanceWeigh() {
    const form = $('weighForm');
    if (!form) return;
    const intro = qs('.weigh-intro');
    if (intro) intro.textContent = "Enter the spool's scale weight. We'll subtract the empty-spool weight to calculate how much filament remains.";
    if (!qs('.weigh-optional', form)) {
      const locationField = $('weighLocation')?.closest('.form-field');
      const notesField = $('weighNotes')?.closest('.form-field');
      if (locationField && notesField) {
        const details = document.createElement('details');
        details.className = 'weigh-optional full';
        details.innerHTML = '<summary><span><strong>Location & note</strong><small>Optional context for this measurement</small></span><span aria-hidden="true">＋</span></summary><div class="weigh-optional-grid"></div>';
        const saveField = qs('button[type="submit"]', form)?.closest('.form-field');
        form.insertBefore(details, saveField || null);
        const mount = qs('.weigh-optional-grid', details);
        mount.append(locationField, notesField);
      }
    }
    const save = qs('#weighForm button[type="submit"]');
    const remaining = $('calcRemaining')?.textContent?.trim() || '';
    if (save) save.textContent = /^\d[\d,.]*\s*g\b/i.test(remaining) ? `Save ${remaining} remaining` : 'Save measurement';
  }

  function enhanceActivity() {
    const clear = $('auditClear');
    if (clear) clear.textContent = 'Reset filters';
    const panel = $('auditPanel');
    const metrics = $('auditMetrics');
    if (panel && metrics && !metrics.closest('.activity-insights')) {
      const details = document.createElement('details');
      details.className = 'activity-insights';
      details.innerHTML = '<summary><span><strong>7-day summary</strong><small>Measurements, printer activity and lifecycle changes</small></span><span aria-hidden="true">＋</span></summary><div class="activity-insights-body"></div>';
      metrics.parentNode.insertBefore(details, metrics);
      qs('.activity-insights-body', details).appendChild(metrics);
    }
  }

  function labelSelectionCount() {
    const source = $('labelSelectionCount')?.textContent || '0';
    const match = source.match(/\d+/);
    return match ? Number(match[0]) : 0;
  }

  function activeSpoolCount() {
    return (safeState().spools || []).filter(row => !row.archivedAt).length;
  }

  function updateLabelActions() {
    const count = labelSelectionCount();
    const print = $('printLabelsBtn');
    if (print) print.textContent = count > 0 ? `Print ${count} label${count === 1 ? '' : 's'}` : 'Print labels';
    const selectAll = $('selectActiveLabelsBtn');
    if (selectAll) {
      const active = activeSpoolCount();
      selectAll.textContent = active ? `Select all ${active} active` : 'Select active';
    }
  }

  function enhanceLabels() {
    const size = $('labelSize');
    const bar = qs('.labels-print-bar');
    if (size && bar && !size.closest('.fi-label-output-control')) {
      const wrapper = document.createElement('label');
      wrapper.className = 'fi-label-output-control';
      wrapper.append('Label size ', size);
      const print = $('printLabelsBtn');
      bar.insertBefore(wrapper, print || null);
    }
    updateLabelActions();
  }

  function enhancePrinter() {
    const hero = qs('.printer-hero');
    const title = qs('.printer-hero h2');
    const copy = qs('.printer-hero p');
    if (title) title.textContent = 'Printer & AMS';
    if (copy) copy.textContent = 'See what is loaded, move spools between slots, and catch low or unknown filament before printing.';
    const heroAdd = qs('.printer-hero [data-printer-add]');
    if (heroAdd) {
      qsa('.printer-panel > .panel-head [data-printer-add]').forEach(button => {
        button.hidden = true;
        button.setAttribute('aria-hidden','true');
      });
    }
    qsa('.printer-registry-card').forEach(card => {
      const specs = qs('.printer-spec-grid', card);
      if (!specs || specs.closest('.printer-details-disclosure')) return;
      const details = document.createElement('details');
      details.className = 'printer-details-disclosure';
      const summary = document.createElement('summary');
      summary.innerHTML = '<span><strong>Printer details</strong><small>Nozzle, build plate, location and filament inputs</small></span><span aria-hidden="true">＋</span>';
      specs.parentNode.insertBefore(details, specs);
      details.append(summary, specs);
    });
    if (hero) hero.classList.add('fi-printer-physical-first');
  }

  function enhanceSync() {
    const generate = $('syncGenerateBtn');
    if (generate) generate.textContent = 'Set up workspace sync';
    const revision = $('cloudRevisionText');
    const advanced = qs('.sync-advanced-body');
    if (revision && advanced && revision.parentElement !== advanced) {
      revision.classList.add('fi-technical-sync-detail');
      advanced.prepend(revision);
    }
  }

  function enhanceData() {
    const reset = $('resetBtn');
    const box = reset?.closest('.data-box');
    if (!reset || !box) return;
    const owner = currentOwner();
    const title = qs('h4', box);
    const copy = qs('p', box);
    if (title) title.textContent = `Reset ${owner}'s local inventory`;
    if (copy) copy.textContent = 'Replaces this workspace’s local spool data on this device with the starter inventory. A later sync can propagate the change.';
    reset.textContent = 'Reset local inventory';
  }

  function enhanceWorkspaceLanguage() {
    const profileChip = qs('.profile-chip-copy small');
    if (profileChip) profileChip.textContent = 'Workspace';

    const switchDialog = qs('.profile-switch-dialog');
    if (switchDialog) {
      const eyebrow = qs('.eyebrow', switchDialog);
      const title = qs('h3', switchDialog);
      const copy = qs('.dialog-body > p', switchDialog);
      if (eyebrow) eyebrow.textContent = 'Workspaces';
      if (title) title.textContent = 'Switch workspace';
      if (copy) copy.textContent = 'Each workspace keeps its spools, activity, backups and sync separate.';
      qsa('.profile-option small', switchDialog).forEach(node => {
        node.textContent = node.closest('.profile-option')?.getAttribute('aria-current') === 'true' ? 'Current workspace' : 'Open workspace';
      });
    }
  }

  function enhancePreferences() {
    const view = $('preferencesView');
    if (!view) return;
    qsa('.profile-section-index', view).forEach(node => node.hidden = true);
    const submit = qs('#profilePreferencesForm button[type="submit"]', view);
    if (submit) submit.remove();
    const rail = qs('.profile-save-rail', view);
    if (rail) {
      const title = qs('strong', rail);
      const copy = qs('div > span', rail);
      if (title) title.textContent = 'Preferences save automatically';
      if (copy) copy.textContent = 'Changes preview immediately and stay with this workspace.';
    }
    const summaryEyebrow = qs('.profile-summary-identity .eyebrow', view);
    const summaryCopy = qs('.profile-summary-identity p', view);
    if (summaryEyebrow) summaryEyebrow.textContent = 'Workspace';
    if (summaryCopy) summaryCopy.textContent = `${currentOwner()}'s filament workspace`;
    const privacy = qs('.profile-privacy-note p', view);
    if (privacy) privacy.innerHTML = '<strong>Inventory stays separate.</strong><br>Spools, activity, backups and sync do not mix between workspaces.';
    const switchCta = qs('.profile-switch-cta', view);
    if (switchCta) switchCta.textContent = 'Switch workspace';
  }

  function apply() {
    queued = false;
    enhanceHome();
    enhanceInventory();
    enhanceSpoolForm();
    enhanceWeigh();
    enhanceActivity();
    enhanceLabels();
    enhancePrinter();
    enhanceSync();
    enhanceData();
    enhanceWorkspaceLanguage();
    enhancePreferences();
    document.documentElement.classList.add('fi-cohesion-release', 'fi-ux-v12');
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(apply);
  }

  function bind() {
    document.addEventListener('click', event => {
      const route = event.target.closest('[data-cohesion-view]');
      if (route) {
        event.preventDefault();
        navigate(route.dataset.cohesionView);
        return;
      }
      const chip = event.target.closest('[data-filter-chip]');
      if (chip) {
        event.preventDefault();
        clearOneFilter(chip.dataset.filterChip);
      }
    });
    document.addEventListener('input', event => {
      if (FILTER_IDS.includes(event.target?.id)) updateFilterBadge();
      if (event.target?.id === 'labelSelectionCount') updateLabelActions();
    });
    document.addEventListener('change', event => {
      if (FILTER_IDS.includes(event.target?.id)) updateFilterBadge();
      schedule();
    });
    document.addEventListener('fi:navigation', schedule);
    globalThis.FilamentInventoryEvents?.on?.('inventory:changed', schedule);
    globalThis.FilamentInventoryEvents?.on?.('measurement:saved', schedule);
    globalThis.FilamentInventoryEvents?.on?.('profile:preferences-changed', schedule);
    window.addEventListener('storage', event => {
      if ([STORAGE_KEY,CURRENT_USER_KEY].includes(event.key)) schedule();
    });
  }

  function observe() {
    if (observer || !document.body) return;
    observer = new MutationObserver(records => {
      const watchedTargets = new Set(['inventoryGrid','printerRegistry','auditPanel','auditList','labelPreviewGrid','labelSelectionCount','calcRemaining','preferencesView','spoolDialog']);
      const relevant = records.some(record => {
        if (record.type === 'characterData') return watchedTargets.has(record.target.parentElement?.id || '');
        if (watchedTargets.has(record.target?.id || '')) return true;
        return [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === Node.ELEMENT_NODE);
      });
      if (relevant) schedule();
    });
    observer.observe(document.body, {subtree:true, childList:true, characterData:true});
  }

  function init() {
    bind();
    observe();
    schedule();
    setTimeout(schedule, 120);
  }

  globalThis.FilamentInventoryCohesion = Object.freeze({refresh:schedule});

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();