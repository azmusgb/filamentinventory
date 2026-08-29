(() => {
  'use strict';

  const STORAGE_KEY = 'filament-inventory-v1';
  const CURRENT_USER_KEY = 'filament-current-user-v1';
  const $ = id => document.getElementById(id);
  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];
  let queued = false;
  let observer = null;

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
    || 'Current profile';

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
  }

  function activeFilterCount() {
    return [
      $('lifecycleFilter')?.value && $('lifecycleFilter').value !== 'active',
      $('materialFilter')?.value,
      $('statusFilter')?.value,
      $('locationFilter')?.value,
      $('ownerFilterV8')?.value,
      $('sortSelect')?.value && $('sortSelect').value !== 'id',
    ].filter(Boolean).length;
  }

  function updateFilterBadge() {
    const badge = qs('[data-filter-count]');
    const opener = qs('[data-filter-open]');
    if (!badge || !opener) return;
    const count = activeFilterCount();
    badge.textContent = String(count);
    opener.classList.toggle('has-filters', count > 0);
    opener.setAttribute('aria-label', count ? `Filters, ${count} active` : 'Filters');
  }

  function enhanceInventoryCards() {
    qsa('#inventoryGrid .spool-card').forEach(card => {
      const details = qs('.spool-card-more', card);
      if (details && details.dataset.cohesionLabel !== '1') {
        details.dataset.cohesionLabel = '1';
        details.title = 'Open spool details';
        details.classList.add('fi-spool-details-action');
      }
      if (card.dataset.cohesionOpen === '1') return;
      card.dataset.cohesionOpen = '1';
      card.addEventListener('click', event => {
        if (event.target.closest('button, a, input, select, textarea, label, summary, [role="button"]')) return;
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
    enhanceInventoryCards();
    updateFilterBadge();
  }

  function moveFieldToAdvanced(id, advancedGrid) {
    const field = $(id)?.closest('.form-field');
    if (field && advancedGrid && field.parentElement !== advancedGrid) advancedGrid.appendChild(field);
  }

  function enhanceSpoolForm() {
    const dialog = $('spoolDialog');
    if (!dialog) return;
    const advanced = qs('.spool-form-advanced', dialog);
    const advancedGrid = qs('.v10-advanced-grid', advanced || dialog);
    if (advancedGrid) {
      ['ownerV8','placementV8','printerV8','feederV8','slotV8'].forEach(id => moveFieldToAdvanced(id, advancedGrid));
      const summaryCopy = qs('.spool-form-advanced summary small', dialog);
      if (summaryCopy) summaryCopy.textContent = 'Weight evidence, storage, printer placement, purchase details and notes';
    }
    const startLabel = qs('label[for="startWeight"]', dialog);
    if (startLabel) startLabel.textContent = 'Nominal full filament (g)';
    const visual = $('visualPercent')?.closest('.form-field');
    if (visual && !qs('.fi-field-help', visual)) {
      const help = document.createElement('small');
      help.className = 'fi-field-help';
      help.textContent = 'Estimate only. A measured gross − tare value takes precedence.';
      visual.appendChild(help);
    }
  }

  function enhanceWeigh() {
    const form = $('weighForm');
    if (!form) return;
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
  }

  function enhanceSync() {
    const generate = $('syncGenerateBtn');
    if (generate) generate.textContent = 'Set up private sync';
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
    if (copy) copy.textContent = 'Replaces this profile’s local spool data on this device with the starter inventory. A later sync can propagate the change.';
    reset.textContent = 'Reset local inventory';
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
      if (copy) copy.textContent = 'Changes preview immediately and stay with this private profile.';
    }
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
    enhancePreferences();
    document.documentElement.classList.add('fi-cohesion-release');
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
      }
    });
    document.addEventListener('input', event => {
      if (['lifecycleFilter','materialFilter','statusFilter','locationFilter','ownerFilterV8','sortSelect'].includes(event.target?.id)) updateFilterBadge();
      if (event.target?.id === 'labelSelectionCount') updateLabelActions();
    });
    document.addEventListener('change', event => {
      if (['lifecycleFilter','materialFilter','statusFilter','locationFilter','ownerFilterV8','sortSelect'].includes(event.target?.id)) updateFilterBadge();
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
      const watchedTargets = new Set(['inventoryGrid','printerRegistry','auditPanel','auditList','labelPreviewGrid','labelSelectionCount','calcRemaining','preferencesView']);
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
