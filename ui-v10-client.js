(() => {
  'use strict';

  const CURRENT_USER_KEY = 'filament-current-user-v1';
  const ESSENTIAL_FIELD_IDS = new Set(['spoolId','brand','material','colorName','colorHex','startWeight','location','placementV8','printerV8','feederV8','slotV8']);
  const SECONDARY_VIEWS = [
    ['weigh','Weigh'],
    ['history','Activity'],
    ['labels','Labels'],
    ['sync','Sync devices'],
    ['data','Data & backup'],
    ['preferences','Preferences'],
  ];
  let scheduled = false;

  const $ = id => document.getElementById(id);
  const currentUser = () => globalThis.FilamentInventoryUsers?.currentUser?.() || String(localStorage.getItem(CURRENT_USER_KEY) || 'Bill');
  const initials = owner => owner === 'Aimee' ? 'AR' : 'BR';

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enhance();
    });
  }

  function switchView(view) {
    document.querySelector(`.tab[data-view="${CSS.escape(view)}"]`)?.click();
    syncBottomNav();
  }

  function createDialog(id, className, html) {
    let dialog = $(id);
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = id;
    dialog.className = className;
    dialog.innerHTML = html;
    document.body.appendChild(dialog);
    return dialog;
  }

  function ensureProfileMenu() {
    const topActions = document.querySelector('.top-actions');
    if (!topActions) return;
    let button = $('profileMenuButton');
    if (!button) {
      button = document.createElement('button');
      button.id = 'profileMenuButton';
      button.className = 'profile-chip';
      button.type = 'button';
      button.setAttribute('aria-haspopup', 'dialog');
      topActions.prepend(button);
      button.addEventListener('click', () => {
        const dialog = $('profileSwitchDialog');
        if (dialog && !dialog.open) dialog.showModal();
      });
    }

    const owner = currentUser();
    button.innerHTML = `<span class="profile-avatar" aria-hidden="true">${initials(owner)}</span><span class="profile-chip-copy"><strong>${owner}</strong><small>Private inventory</small></span><span aria-hidden="true">⌄</span>`;
    button.setAttribute('aria-label', `Switch private inventory. Current: ${owner}`);

    const dialog = createDialog('profileSwitchDialog', 'profile-switch-dialog', `<div class="dialog-head"><div><span class="eyebrow">Private inventories</span><h3>Switch workspace</h3></div><button class="btn icon-btn" type="button" data-profile-close aria-label="Close">×</button></div><div class="dialog-body"><p class="profile-privacy-note">Bill and Aimee have separate spools, history, backups and cloud sync.</p><div class="profile-options"><button class="profile-option" type="button" data-profile-owner="Bill"><span class="profile-avatar">BR</span><span><strong>Bill</strong><small>Open Bill's private inventory</small></span><span aria-hidden="true">›</span></button><button class="profile-option" type="button" data-profile-owner="Aimee"><span class="profile-avatar">AR</span><span><strong>Aimee</strong><small>Open Aimee's private inventory</small></span><span aria-hidden="true">›</span></button></div></div>`);
    dialog.querySelectorAll('[data-profile-owner]').forEach(option => option.setAttribute('aria-current', option.dataset.profileOwner === owner ? 'true' : 'false'));
    if (!dialog.dataset.bound) {
      dialog.dataset.bound = '1';
      dialog.addEventListener('click', event => {
        if (event.target.closest('[data-profile-close]')) return dialog.close();
        const option = event.target.closest('[data-profile-owner]');
        if (!option) return;
        localStorage.setItem(CURRENT_USER_KEY, option.dataset.profileOwner);
      });
    }

    const boundary = $('userBoundary');
    if (boundary) boundary.hidden = true;

    const scan = document.querySelector('.scan-launch');
    if (scan && !topActions.contains(scan)) {
      scan.classList.add('header-scan-launch');
      topActions.insertBefore(scan, button);
    }
  }

  function ensureBottomNav() {
    let nav = $('mobileBottomNav');
    if (!nav) {
      nav = document.createElement('nav');
      nav.id = 'mobileBottomNav';
      nav.className = 'mobile-bottom-nav';
      nav.setAttribute('aria-label', 'Primary navigation');
      nav.innerHTML = `<button type="button" data-bottom-view="dashboard"><span aria-hidden="true">⌂</span><small>Home</small></button><button type="button" data-bottom-view="inventory"><span aria-hidden="true">▦</span><small>Spools</small></button><button class="mobile-bottom-add" type="button" data-bottom-add><span aria-hidden="true">＋</span><small>Add</small></button><button type="button" data-bottom-view="household"><span aria-hidden="true">◉</span><small>Printer</small></button><button type="button" data-bottom-more><span aria-hidden="true">•••</span><small>More</small></button>`;
      document.body.appendChild(nav);
      nav.addEventListener('click', event => {
        const viewButton = event.target.closest('[data-bottom-view]');
        if (viewButton) return switchView(viewButton.dataset.bottomView);
        if (event.target.closest('[data-bottom-add]')) return ($('addTopBtn') || $('heroAddBtn') || $('inventoryAddBtn'))?.click();
        if (event.target.closest('[data-bottom-more]')) {
          const dialog = $('mobileMoreSheetV10');
          if (dialog && !dialog.open) dialog.showModal();
        }
      });
    }

    const more = createDialog('mobileMoreSheetV10', 'mobile-more-sheet-v10', `<div class="dialog-head"><div><span class="eyebrow">More</span><h3>Tools & activity</h3></div><button class="btn icon-btn" type="button" data-more-close aria-label="Close">×</button></div><div class="dialog-body"><div class="mobile-more-grid-v10">${SECONDARY_VIEWS.map(([view,label]) => `<button class="mobile-more-action-v10" type="button" data-more-view="${view}"><strong>${label}</strong><span>Open</span></button>`).join('')}</div></div>`);
    if (!more.dataset.bound) {
      more.dataset.bound = '1';
      more.addEventListener('click', event => {
        if (event.target.closest('[data-more-close]')) return more.close();
        const action = event.target.closest('[data-more-view]');
        if (!action) return;
        more.close();
        switchView(action.dataset.moreView);
      });
    }
    syncBottomNav();
  }

  function syncBottomNav() {
    const active = document.querySelector('.tab[aria-selected="true"]')?.dataset.view || 'dashboard';
    document.querySelectorAll('[data-bottom-view]').forEach(button => button.setAttribute('aria-current', button.dataset.bottomView === active ? 'page' : 'false'));
    const more = document.querySelector('[data-bottom-more]');
    if (more) more.setAttribute('aria-current', SECONDARY_VIEWS.some(([view]) => view === active) ? 'page' : 'false');
  }

  function ensureInventoryFilters() {
    const view = $('inventoryView');
    const toolbar = view?.querySelector('.toolbar-v3');
    if (!view || !toolbar) return;
    if (view.dataset.v10Filters === '1') return updateFilterCount();
    view.dataset.v10Filters = '1';

    const panel = toolbar.closest('.panel');
    const grid = $('inventoryGrid');
    const command = $('inventoryCommand');
    const searchWrap = toolbar.querySelector('.search-wrap');
    if (!panel || !grid || !searchWrap) return;

    const controls = document.createElement('div');
    controls.className = 'inventory-compact-controls';
    controls.innerHTML = `<div class="inventory-search-slot"></div><button class="btn inventory-filter-open" id="inventoryFilterOpen" type="button"><span>Filters</span><strong id="inventoryFilterCount">0</strong></button>`;
    controls.querySelector('.inventory-search-slot').appendChild(searchWrap);
    (command || grid).insertAdjacentElement('beforebegin', controls);

    const dialog = createDialog('inventoryFilterDialog', 'inventory-filter-dialog', `<div class="dialog-head"><div><span class="eyebrow">Inventory</span><h3>Filters & sort</h3></div><button class="btn icon-btn" type="button" data-filter-close aria-label="Close">×</button></div><div class="dialog-body"><div id="inventoryFilterMount"></div></div><div class="dialog-actions"><button class="btn" type="button" data-filter-reset>Reset</button><button class="btn btn-primary" type="button" data-filter-apply>Show inventory</button></div>`);
    dialog.querySelector('#inventoryFilterMount').appendChild(toolbar);
    $('inventoryFilterOpen')?.addEventListener('click', () => dialog.showModal());
    dialog.addEventListener('click', event => {
      if (event.target.closest('[data-filter-close]') || event.target.closest('[data-filter-apply]')) return dialog.close();
      if (event.target.closest('[data-filter-reset]')) $('clearFiltersBtn')?.click();
    });
    toolbar.addEventListener('input', updateFilterCount);
    toolbar.addEventListener('change', updateFilterCount);
    updateFilterCount();
  }

  function updateFilterCount() {
    const values = [
      $('lifecycleFilter')?.value && $('lifecycleFilter')?.value !== 'active',
      $('materialFilter')?.value,
      $('statusFilter')?.value,
      $('locationFilter')?.value,
      $('sortSelect')?.value && $('sortSelect')?.value !== 'id',
    ];
    const count = values.filter(Boolean).length;
    const badge = $('inventoryFilterCount');
    if (badge) badge.textContent = String(count);
    $('inventoryFilterOpen')?.classList.toggle('has-filters', count > 0);
  }

  function fieldForId(id) {
    const element = $(id);
    return element?.closest('.form-field') || null;
  }

  function ensureSpoolFormSections() {
    const formGrid = document.querySelector('#spoolDialog .dialog-body > .form-grid');
    if (!formGrid || formGrid.dataset.v10Structured === '1') return;
    formGrid.dataset.v10Structured = '1';
    formGrid.classList.add('v10-form-root');

    const essentials = document.createElement('section');
    essentials.className = 'spool-form-section spool-form-essentials';
    essentials.innerHTML = `<div class="spool-form-section-head"><span class="eyebrow">Essentials</span><strong>Identify and place the spool</strong></div><div class="form-grid v10-essential-grid"></div>`;

    const advanced = document.createElement('details');
    advanced.className = 'spool-form-advanced';
    advanced.innerHTML = `<summary><span><strong>More details</strong><small>Weight evidence, drying, purchase, storage and notes</small></span><span aria-hidden="true">＋</span></summary><div class="form-grid v10-advanced-grid"></div>`;

    const fields = [...formGrid.children].filter(node => node.classList?.contains('form-field'));
    formGrid.append(essentials, advanced);
    for (const holder of fields) {
      const control = holder.querySelector('input,select,textarea');
      (ESSENTIAL_FIELD_IDS.has(control?.id) ? essentials.querySelector('.v10-essential-grid') : advanced.querySelector('.v10-advanced-grid')).appendChild(holder);
    }
  }

  function placeLateSpoolFields() {
    const essentials = document.querySelector('.v10-essential-grid');
    if (!essentials) return;
    for (const id of ESSENTIAL_FIELD_IDS) {
      const holder = fieldForId(id);
      if (holder && !essentials.contains(holder)) essentials.appendChild(holder);
    }
  }

  function ensureActivitySwitcher() {
    const view = $('historyView');
    const auditPanel = $('auditPanel');
    if (!view || !auditPanel) return;
    const measurementPanel = [...view.children].find(node => node.classList?.contains('panel') && node.id !== 'auditPanel');
    if (!measurementPanel) return;
    measurementPanel.classList.add('measurement-history-panel');
    if (!$('activitySwitcherV10')) {
      const switcher = document.createElement('div');
      switcher.id = 'activitySwitcherV10';
      switcher.className = 'activity-switcher-v10';
      switcher.innerHTML = `<div><span class="eyebrow">Activity</span><h2>What changed</h2><p>Inventory, measurements and Printer / AMS history in one place.</p></div><div class="activity-segments" role="group" aria-label="Activity view"><button type="button" data-activity-mode="activity" aria-pressed="true">Activity</button><button type="button" data-activity-mode="measurements" aria-pressed="false">Measurements</button></div>`;
      view.insertBefore(switcher, view.firstElementChild);
      switcher.addEventListener('click', event => {
        const button = event.target.closest('[data-activity-mode]');
        if (button) setActivityMode(button.dataset.activityMode);
      });
    }
    setActivityMode(view.dataset.activityMode || 'activity');
  }

  function setActivityMode(mode) {
    const view = $('historyView');
    const audit = $('auditPanel');
    const measurements = view?.querySelector('.measurement-history-panel');
    if (!view || !audit || !measurements) return;
    const next = mode === 'measurements' ? 'measurements' : 'activity';
    view.dataset.activityMode = next;
    audit.hidden = next !== 'activity';
    measurements.hidden = next !== 'measurements';
    view.querySelectorAll('[data-activity-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.activityMode === next)));
  }

  function ensureDataHierarchy() {
    const view = $('dataView');
    const actions = view?.querySelector('.data-actions');
    if (!view || !actions || actions.dataset.v10Grouped === '1') return;
    actions.dataset.v10Grouped = '1';
    const boxes = [...actions.querySelectorAll(':scope > .data-box')];
    const byButton = id => boxes.find(box => box.querySelector(`#${id}`));
    const exportJson = byButton('exportJsonBtn');
    const exportCsv = byButton('exportCsvBtn');
    const importJson = byButton('importJsonBtn');
    const importCsv = byButton('importCsvBtn');
    const reset = byButton('resetBtn');
    const install = boxes.find(box => /Install on iPhone/i.test(box.textContent || ''));

    const group = (className, title, copy, items) => {
      const valid = items.filter(Boolean);
      if (!valid.length) return null;
      const section = document.createElement('section');
      section.className = `data-group-v10 ${className}`;
      section.innerHTML = `<div class="data-group-head"><h4>${title}</h4><p>${copy}</p></div><div class="data-group-grid"></div>`;
      valid.forEach(item => section.querySelector('.data-group-grid').appendChild(item));
      return section;
    };

    actions.replaceChildren(...[
      group('data-group-featured','Backup','Keep a full-fidelity copy of this private inventory.',[exportJson]),
      group('data-group-transfer','Transfer & spreadsheets','Move data between this app, JSON backups, Google Sheets or Excel.',[importJson,exportCsv,importCsv]),
      group('data-group-install','Install','Use Filament Inventory like an app on this device.',[install]),
      group('data-group-danger','Danger zone','Destructive actions are intentionally separated from backup and transfer tools.',[reset]),
    ].filter(Boolean));
    if ($('dataTitle')) $('dataTitle').textContent = 'Backup & data';
  }

  function enhance() {
    document.documentElement.classList.add('fi-v10');
    ensureProfileMenu();
    ensureBottomNav();
    ensureInventoryFilters();
    ensureSpoolFormSections();
    placeLateSpoolFields();
    ensureActivitySwitcher();
    ensureDataHierarchy();
    syncBottomNav();
  }

  function init() {
    document.addEventListener('click', event => {
      if (event.target.closest('.tab[data-view]')) setTimeout(syncBottomNav, 0);
    });
    window.addEventListener('storage', event => {
      if (event.key === CURRENT_USER_KEY) schedule();
    });
    window.addEventListener('resize', schedule, {passive:true});
    enhance();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {childList:true, subtree:true});
    setTimeout(enhance, 80);
    setTimeout(enhance, 220);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
