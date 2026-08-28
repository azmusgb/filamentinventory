(() => {
  'use strict';

  const ROUTES = Object.freeze({
    dashboard:{label:'Home', icon:'⌂', group:'workspace', width:'standard', title:'Home', description:'What needs attention, what is loaded, and what can print now.'},
    inventory:{label:'Inventory', icon:'▦', group:'workspace', width:'workbench', title:'Inventory', description:'Find, filter and manage physical spools.'},
    household:{label:'Printer', icon:'◉', group:'workspace', width:'workbench', title:'Printer', description:'See what is loaded and manage Printer / AMS placement.'},
    weigh:{label:'Weigh spool', icon:'◌', group:'workflow', width:'focus', title:'Weigh spool', description:'Record an authoritative remaining amount from a scale.'},
    history:{label:'Activity', icon:'↺', group:'manage', width:'standard', title:'Activity', description:'Review inventory, measurement and Printer / AMS changes.'},
    labels:{label:'QR labels', icon:'◇', group:'manage', width:'standard', title:'QR labels', description:'Create and print labels for physical spools.'},
    sync:{label:'Sync devices', icon:'⇄', group:'devices', width:'standard', title:'Sync devices', description:'Keep this private inventory available on your other devices.'},
    data:{label:'Backup & data', icon:'⇩', group:'data', width:'standard', title:'Backup & data', description:'Protect, restore and transfer this private inventory.'},
    preferences:{label:'Preferences', icon:'⚙', group:'settings', width:'standard', title:'Preferences', description:'Personalize this private workspace and printing defaults.'},
  });

  const GROUPS = Object.freeze([
    ['Workspace','workspace'],
    ['Workflow','workflow'],
    ['Manage','manage'],
    ['Devices & data','devices,data'],
    ['Settings','settings'],
  ]);

  const PAGE_ACTIONS = Object.freeze({inventory:['inventoryAddBtn'], history:['exportHistoryBtn'], data:['installBtn']});
  const ESSENTIAL_FIELDS = new Set(['spoolId','brand','material','colorName','colorHex','startWeight','location','placementV8','printerV8','feederV8','slotV8']);
  const $ = id => document.getElementById(id);
  const qs = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const scriptLoads = new Map();
  const observedViews = new WeakSet();
  let currentRoute = 'dashboard';
  let syncingRoute = false;

  function loadStylesheet(href) {
    if (document.querySelector(`link[data-fi-v11-style="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.fiV11Style = href;
    document.head.appendChild(link);
  }

  function loadScript(src) {
    if (scriptLoads.has(src)) return scriptLoads.get(src);
    const promise = new Promise((resolve,reject) => {
      const found = document.querySelector(`script[data-fi-v11-script="${src}"]`);
      if (found?.dataset.loaded === '1') return resolve();
      if (found) {
        found.addEventListener('load',resolve,{once:true});
        found.addEventListener('error',reject,{once:true});
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
      script.dataset.fiV11Script = src;
      script.addEventListener('load',() => { script.dataset.loaded='1'; resolve(); },{once:true});
      script.addEventListener('error',() => reject(new Error(`Failed to load ${src}`)),{once:true});
      document.head.appendChild(script);
    });
    scriptLoads.set(src,promise);
    return promise;
  }

  async function ensurePrintReadiness() {
    if (globalThis.FilamentInventoryPrintReadinessUI) return true;
    try {
      if (!globalThis.FilamentInventoryPrintReadiness) await loadScript('/print-readiness-core.js');
      if (!globalThis.FilamentInventoryPrintReadinessUI) await loadScript('/print-readiness-client.js');
      return Boolean(globalThis.FilamentInventoryPrintReadinessUI);
    } catch (error) {
      console.error('Print readiness failed to initialize.',error);
      return false;
    }
  }

  async function ensureProfilePreferences() {
    if (globalThis.FilamentInventoryProfileUI) return true;
    try {
      loadStylesheet('/css/components/profile-preferences.css');
      if (!globalThis.FilamentInventoryProfilePreferences) await loadScript('/profile-preferences-core.js');
      if (!globalThis.FilamentInventoryProfileUI) await loadScript('/profile-preferences-client.js');
      return Boolean(globalThis.FilamentInventoryProfileUI);
    } catch (error) {
      console.error('Profile preferences failed to initialize.',error);
      return false;
    }
  }

  function ensureSkipLink() {
    let main = document.querySelector('.app-shell > main');
    if (!main) return;
    if (!main.id) main.id = 'mainContent';
    if (document.querySelector('.fi-skip-link')) return;
    const link = document.createElement('a');
    link.className = 'fi-skip-link';
    link.href = `#${main.id}`;
    link.textContent = 'Skip to content';
    document.body.prepend(link);
  }

  function setSurfaceAccessibility(surface, active) {
    if (!surface) return;
    surface.setAttribute('aria-hidden', active ? 'false' : 'true');
    if (active) surface.removeAttribute('inert');
    else surface.setAttribute('inert','');
  }

  function syncSurfaceAccessibility(activeView = activeFromDom()) {
    document.querySelectorAll('.view[id$="View"]').forEach(surface => setSurfaceAccessibility(surface, surface.id === `${activeView}View`));
  }

  function annotateDialogSemantics() {
    const spoolDialog = $('spoolDialog');
    if (spoolDialog) spoolDialog.setAttribute('aria-labelledby','dialogTitle');
    const bindings = [
      ['#inventoryAddBtn, #heroAddBtn, #addTopBtn, #mobileAddBtn','spoolDialog'],
      ['[data-shell-action="add"]','spoolDialog'],
      ['[data-shell-action="print"], [data-print-readiness]','printReadinessDialog'],
      ['[data-bottom-more]','fiMoreSheet'],
      ['[data-profile-menu]','fiProfileSwitchDialog'],
      ['[data-filter-open]','fiInventoryFilterDialog'],
    ];
    for (const [selector,id] of bindings) document.querySelectorAll(selector).forEach(control => {
      control.setAttribute('aria-haspopup','dialog');
      control.setAttribute('aria-controls',id);
    });
  }

  function activeFromDom() {
    const active = document.querySelector('.view.active[id$="View"]');
    return active?.id.replace(/View$/,'') || document.querySelector('.tab[aria-selected="true"]')?.dataset.view || 'dashboard';
  }

  function routeFromLocation() {
    const requested = new URLSearchParams(location.hash.replace(/^#/,'')).get('view');
    return requested && ROUTES[requested] ? requested : 'dashboard';
  }

  function routeUrl(view) {
    const url = new URL(location.href);
    const hash = new URLSearchParams(url.hash.replace(/^#/,''));
    hash.delete('spool');
    hash.delete('scan');
    if (view === 'dashboard') hash.delete('view'); else hash.set('view',view);
    const nextHash = hash.toString();
    return `${url.pathname}${url.search}${nextHash ? `#${nextHash}` : ''}`;
  }

  function syncNavigation(view = activeFromDom()) {
    if (!ROUTES[view]) view = 'dashboard';
    currentRoute = view;
    document.documentElement.dataset.currentView = view;
    document.querySelectorAll('[data-shell-view]').forEach(button => button.setAttribute('aria-current',button.dataset.shellView === view ? 'page' : 'false'));
    document.querySelectorAll('[data-bottom-view]').forEach(button => button.setAttribute('aria-current',button.dataset.bottomView === view ? 'page' : 'false'));
    const more = document.querySelector('[data-bottom-more]');
    if (more) more.setAttribute('aria-current',['dashboard','inventory','household'].includes(view) ? 'false' : 'page');
    syncSurfaceAccessibility(view);
  }

  function focusRouteHeading(view) {
    const surface = $(`${view}View`);
    const heading = surface?.querySelector(':scope > .fi-page-header h2, h1, h2, h3');
    if (!heading) return;
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex','-1');
    requestAnimationFrame(() => heading.focus({preventScroll:true}));
  }

  function navigate(view,{historyMode='replace',focus=true}={}) {
    if (!ROUTES[view]) return false;
    const surface = $(`${view}View`);
    if (!surface) return false;
    syncingRoute = true;
    document.querySelectorAll('.view[id$="View"]').forEach(node => {
      const active = node === surface;
      node.classList.toggle('active',active);
      setSurfaceAccessibility(node,active);
    });
    document.querySelectorAll('.tab[data-view]').forEach(tab => tab.setAttribute('aria-selected',String(tab.dataset.view === view)));
    syncingRoute = false;
    syncNavigation(view);
    if (historyMode !== 'none') {
      const target = routeUrl(view);
      const current = `${location.pathname}${location.search}${location.hash}`;
      if (target !== current) history[historyMode === 'push' ? 'pushState' : 'replaceState'](null,'',target);
    }
    window.scrollTo({top:0,behavior:'auto'});
    if (focus) focusRouteHeading(view);
    globalThis.FilamentInventoryEvents?.emit?.('navigation:changed',{view});
    document.dispatchEvent(new CustomEvent('fi:navigation',{detail:{view}}));
    return true;
  }

  function restoreRouteFromHistory() {
    const view = routeFromLocation();
    if (!$(`${view}View`)) return false;
    if (activeFromDom() !== view) return navigate(view,{historyMode:'none',focus:false});
    syncNavigation(view);
    return true;
  }

  function reconcileLegacyRoute() {
    if (syncingRoute) return;
    const view = activeFromDom();
    if (view !== currentRoute) syncNavigation(view);
  }

  function observeRoute(surface) {
    if (!surface || observedViews.has(surface)) return;
    observedViews.add(surface);
    new MutationObserver(reconcileLegacyRoute).observe(surface,{attributes:true,attributeFilter:['class']});
  }

  function registerSurface(view) {
    const meta = ROUTES[view];
    const surface = $(`${view}View`);
    if (!meta || !surface) return false;
    surface.classList.add('fi-page',`fi-page-${view}`);
    surface.dataset.pageWidth = meta.width;
    setSurfaceAccessibility(surface,surface.classList.contains('active'));
    observeRoute(surface);
    ensurePageHeader(view,surface,meta);
    return true;
  }

  function ensurePageHeader(view,surface,meta) {
    if (view === 'dashboard' || surface.querySelector(':scope > .fi-page-header')) return;
    const header = document.createElement('header');
    header.className = 'fi-page-header';
    header.innerHTML = `<div class="fi-page-header-copy"><h2>${meta.title}</h2><p>${meta.description}</p></div><div class="fi-page-header-actions" aria-label="Page actions"></div>`;
    surface.prepend(header);
  }

  function navMarkup(groupKeys) {
    const allowed = new Set(groupKeys.split(','));
    return Object.entries(ROUTES)
      .filter(([,meta]) => allowed.has(meta.group))
      .map(([view,meta]) => `<button type="button" data-shell-view="${view}"><span class="fi-nav-icon" aria-hidden="true">${meta.icon}</span><span>${meta.label}</span></button>`)
      .join('');
  }

  function ensureSidebar() {
    const shell = document.querySelector('.app-shell');
    if (!shell || $('fiDesktopSidebar')) return;
    const aside = document.createElement('aside');
    aside.id = 'fiDesktopSidebar';
    aside.className = 'fi-desktop-sidebar';
    aside.setAttribute('aria-label','Application navigation');
    aside.innerHTML = GROUPS.map(([label,keys]) => `<div class="fi-sidebar-group-label">${label}</div><nav class="fi-secondary-nav">${navMarkup(keys)}</nav>`).join('') + `<div class="fi-sidebar-spacer"></div><div class="fi-sidebar-group-label">Quick actions</div><nav class="fi-secondary-nav fi-quick-actions"><button type="button" data-shell-action="print"><span class="fi-nav-icon" aria-hidden="true">✓</span><span>Can I print this?</span></button><button type="button" data-shell-action="scan"><span class="fi-nav-icon" aria-hidden="true">⌁</span><span>Scan spool</span></button><button type="button" data-shell-action="add"><span class="fi-nav-icon" aria-hidden="true">＋</span><span>Add spool</span></button></nav>`;
    shell.insertBefore(aside,shell.querySelector('main'));
  }

  function ensureBottomNav() {
    let nav = qs('.mobile-bottom-nav');
    if (!nav) {
      nav = document.createElement('nav');
      nav.className = 'mobile-bottom-nav';
      nav.setAttribute('aria-label','Primary navigation');
      document.body.appendChild(nav);
    }
    nav.innerHTML = `<button type="button" data-bottom-view="dashboard"><span aria-hidden="true">⌂</span><small>Home</small></button><button type="button" data-bottom-view="inventory"><span aria-hidden="true">▦</span><small>Inventory</small></button><button type="button" data-bottom-scan><span aria-hidden="true">⌁</span><small>Scan</small></button><button type="button" data-bottom-view="household"><span aria-hidden="true">◉</span><small>Printer</small></button><button type="button" data-bottom-more aria-haspopup="dialog" aria-controls="fiMoreSheet"><span aria-hidden="true">•••</span><small>More</small></button>`;
  }

  function ensureMoreSheet() {
    let dialog = qs('.fi-more-sheet');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'fiMoreSheet';
    dialog.className = 'fi-more-sheet';
    dialog.setAttribute('aria-labelledby','fiMoreSheetTitle');
    const groups = [
      ['Workflow',[['weigh','Weigh spool'],['print','Can I print this?']]],
      ['Manage',[['history','Activity'],['labels','QR labels']]],
      ['Devices & data',[['sync','Sync devices'],['data','Backup & data']]],
      ['Settings',[['preferences','Preferences']]],
    ];
    dialog.innerHTML = `<div class="dialog-head"><div><span class="eyebrow">More</span><h3 id="fiMoreSheetTitle">Tools & settings</h3></div><button class="btn icon-btn" type="button" data-dialog-close aria-label="Close">×</button></div><div class="dialog-body"><div class="fi-more-groups">${groups.map(([label,items]) => `<section class="fi-more-group"><h4>${label}</h4><div class="fi-more-actions">${items.map(([key,text]) => key === 'print' ? `<button class="fi-more-action" type="button" data-shell-action="print"><span>${text}</span><b aria-hidden="true">›</b></button>` : `<button class="fi-more-action" type="button" data-shell-view="${key}"><span>${text}</span><b aria-hidden="true">›</b></button>`).join('')}</div></section>`).join('')}</div></div>`;
    document.body.appendChild(dialog);
    return dialog;
  }

  function owner() {
    return globalThis.FilamentInventoryUsers?.currentUser?.() || localStorage.getItem('filament-current-user-v1') || 'Bill';
  }

  function fallbackInitials(name) {
    const parts=String(name||'').trim().split(/\s+/).filter(Boolean);
    if(!parts.length) return 'FI';
    return (parts.length===1?parts[0].slice(0,2):`${parts[0][0]}${parts.at(-1)[0]}`).toUpperCase();
  }

  function profileIdentity(forOwner=owner()) {
    const value = globalThis.FilamentInventoryProfileUI?.readFor?.(forOwner) || (forOwner === owner() ? globalThis.FilamentInventoryProfileUI?.read?.() : null);
    return {displayName:value?.identity?.displayName || forOwner, initials:value?.identity?.initials || fallbackInitials(forOwner)};
  }

  function ensureProfileMenu() {
    const topActions = document.querySelector('.top-actions');
    if (!topActions) return;
    let button = qs('.profile-chip');
    if (!button) {
      button = document.createElement('button');
      button.className = 'profile-chip';
      button.type = 'button';
      button.dataset.profileMenu = '';
      button.setAttribute('aria-haspopup','dialog');
      button.setAttribute('aria-controls','fiProfileSwitchDialog');
      topActions.prepend(button);
    }
    const currentOwner=owner();
    const identity = profileIdentity(currentOwner);
    button.innerHTML = `<span class="profile-avatar" aria-hidden="true">${esc(identity.initials)}</span><span class="profile-chip-copy"><strong>${esc(identity.displayName)}</strong><small>Private inventory</small></span><span aria-hidden="true">⌄</span>`;
    button.setAttribute('aria-label',`Switch private inventory. Current: ${identity.displayName}`);

    let dialog = qs('.profile-switch-dialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'fiProfileSwitchDialog';
      dialog.className = 'profile-switch-dialog';
      dialog.setAttribute('aria-labelledby','fiProfileSwitchTitle');
      document.body.appendChild(dialog);
    }
    const owners = globalThis.FilamentInventoryUsers?.OWNERS || ['Bill','Aimee'];
    dialog.innerHTML = `<div class="dialog-head"><div><span class="eyebrow">Private inventories</span><h3 id="fiProfileSwitchTitle">Switch workspace</h3></div><button class="btn icon-btn" type="button" data-dialog-close aria-label="Close">×</button></div><div class="dialog-body"><p class="muted">Each profile has separate spools, activity, backups and cloud sync.</p><div class="profile-options">${owners.map(name => {const option=profileIdentity(name);const current=name===currentOwner;return `<button class="profile-option" type="button" data-profile-owner="${esc(name)}" aria-current="${String(current)}"><span class="profile-avatar">${esc(option.initials)}</span><span><strong>${esc(option.displayName)}</strong><small>${current?'Current private inventory':`Open ${esc(option.displayName)}'s private inventory`}</small></span><span aria-hidden="true">›</span></button>`;}).join('')}</div></div>`;
  }

  function adoptPageActions() {
    for (const [view,ids] of Object.entries(PAGE_ACTIONS)) {
      const actions = $(`${view}View`)?.querySelector(':scope > .fi-page-header .fi-page-header-actions');
      if (!actions) continue;
      ids.forEach(id => {
        const button = $(id);
        if (button && !actions.contains(button)) { button.classList.add('fi-page-action'); actions.appendChild(button); }
      });
    }
  }

  function suppressLegacyPageHeads() {
    ['inventoryTitle','historyTitle','dataTitle'].forEach(id => {
      const title = $(id);
      const head = title?.closest('.panel-head');
      if (head) head.classList.add('fi-legacy-page-head');
    });
  }

  function structureSpoolForm() {
    const root = document.querySelector('.spool-action-dialog .v10-form-root, .spool-form-section');
    if (root) return;
    const grid = document.querySelector('#spoolDialog .dialog-body > .form-grid');
    if (!grid || grid.dataset.fiStructured === '1') return;
    grid.dataset.fiStructured = '1';
    grid.classList.add('v10-form-root');
    const fields = [...grid.children].filter(node => node.classList?.contains('form-field'));
    const essentials = document.createElement('section');
    essentials.className = 'spool-form-section spool-form-essentials';
    essentials.innerHTML = `<div class="spool-form-section-head"><span class="eyebrow">Essentials</span><strong>Identify the spool and where it is</strong></div><div class="form-grid v10-essential-grid"></div>`;
    const advanced = document.createElement('details');
    advanced.className = 'spool-form-advanced';
    advanced.innerHTML = `<summary><span><strong>More details</strong><small>Weight evidence, drying, purchase and notes</small></span><span aria-hidden="true">＋</span></summary><div class="form-grid v10-advanced-grid"></div>`;
    grid.append(essentials,advanced);
    for (const holder of fields) {
      const control = holder.querySelector('input,select,textarea');
      (ESSENTIAL_FIELDS.has(control?.id) ? essentials.querySelector('.v10-essential-grid') : advanced.querySelector('.v10-advanced-grid')).appendChild(holder);
    }
  }

  function compactInventoryFilters() {
    const surface = $('inventoryView');
    const toolbar = surface?.querySelector('.toolbar-v3');
    if (!surface || !toolbar || surface.dataset.fiFilters === '1') return;
    surface.dataset.fiFilters = '1';
    const search = toolbar.querySelector('.search-wrap');
    const grid = $('inventoryGrid');
    if (!search || !grid) return;
    const controls = document.createElement('div');
    controls.className = 'inventory-compact-controls';
    controls.innerHTML = `<div class="inventory-search-slot"></div><button class="btn inventory-filter-open" type="button" data-filter-open><span>Filters</span><strong data-filter-count>0</strong></button>`;
    controls.querySelector('.inventory-search-slot').appendChild(search);
    grid.insertAdjacentElement('beforebegin',controls);
    const dialog = document.createElement('dialog');
    dialog.id = 'fiInventoryFilterDialog';
    dialog.className = 'inventory-filter-dialog';
    dialog.setAttribute('aria-labelledby','fiInventoryFilterTitle');
    dialog.innerHTML = `<div class="dialog-head"><div><span class="eyebrow">Inventory</span><h3 id="fiInventoryFilterTitle">Filters & sort</h3></div><button class="btn icon-btn" type="button" data-dialog-close aria-label="Close">×</button></div><div class="dialog-body"><div class="inventory-filter-mount"></div><div class="dialog-actions"><button class="btn" type="button" data-filter-reset>Reset</button><button class="btn btn-primary" type="button" data-filter-apply>Show inventory</button></div></div>`;
    dialog.querySelector('.inventory-filter-mount').appendChild(toolbar);
    document.body.appendChild(dialog);
    const updateCount = () => {
      const active = [
        $('lifecycleFilter')?.value && $('lifecycleFilter')?.value !== 'active',
        $('materialFilter')?.value,
        $('statusFilter')?.value,
        $('locationFilter')?.value,
        $('sortSelect')?.value && $('sortSelect')?.value !== 'id',
      ].filter(Boolean).length;
      controls.querySelector('[data-filter-count]').textContent = String(active);
      controls.querySelector('[data-filter-open]').classList.toggle('has-filters',active > 0);
    };
    toolbar.addEventListener('input',updateCount);
    toolbar.addEventListener('change',updateCount);
    const filterOpen = controls.querySelector('[data-filter-open]');
    filterOpen.setAttribute('aria-haspopup','dialog');
    filterOpen.setAttribute('aria-controls','fiInventoryFilterDialog');
    filterOpen.addEventListener('click',() => dialog.showModal());
    dialog.querySelector('[data-filter-reset]').addEventListener('click',() => { $('clearFiltersBtn')?.click(); updateCount(); });
    dialog.querySelector('[data-filter-apply]').addEventListener('click',() => dialog.close());
    updateCount();
  }

  function groupDataPage() {
    const surface = $('dataView');
    const actions = surface?.querySelector('.data-actions');
    if (!actions || actions.dataset.fiGrouped === '1') return;
    actions.dataset.fiGrouped = '1';
    const boxes = [...actions.querySelectorAll(':scope > .data-box')];
    const byButton = id => boxes.find(box => box.querySelector(`#${CSS.escape(id)}`));
    const install = boxes.find(box => /Install on iPhone/i.test(box.textContent || ''));
    const groups = [
      ['data-group-featured','Backup','Keep a full-fidelity copy of this private inventory.',[byButton('exportJsonBtn')]],
      ['data-group-transfer','Transfer & spreadsheets','Move data between this app, JSON backups, Excel or Google Sheets.',[byButton('importJsonBtn'),byButton('exportCsvBtn'),byButton('importCsvBtn')]],
      ['data-group-install','Install','Use Filament Inventory like an app on this device.',[install]],
      ['data-group-danger','Danger zone','Destructive actions are separated from backup and transfer tools.',[byButton('resetBtn')]],
    ];
    actions.replaceChildren(...groups.map(([className,title,copy,items]) => {
      const section = document.createElement('section');
      section.className = `data-group-v10 ${className}`;
      section.innerHTML = `<div class="data-group-head"><h4>${title}</h4><p>${copy}</p></div><div class="data-group-grid"></div>`;
      items.filter(Boolean).forEach(item => section.querySelector('.data-group-grid').appendChild(item));
      return section;
    }));
  }

  function harmonizeActivity() {
    const switcher = qs('.activity-switcher-v10');
    const actions = $('historyView')?.querySelector(':scope > .fi-page-header .fi-page-header-actions');
    if (!switcher || !actions || actions.contains(switcher)) return;
    const segments = switcher.querySelector('.activity-segments');
    if (segments) actions.prepend(segments);
    switcher.remove();
  }

  function updateShell() {
    Object.keys(ROUTES).forEach(registerSurface);
    adoptPageActions();
    suppressLegacyPageHeads();
    structureSpoolForm();
    compactInventoryFilters();
    groupDataPage();
    harmonizeActivity();
    ensureProfileMenu();
    annotateDialogSemantics();
    syncNavigation(activeFromDom());
  }

  async function runAction(action) {
    if (action === 'scan') {
      if (globalThis.FilamentInventoryScanner?.open) return globalThis.FilamentInventoryScanner.open();
      return qs('.scan-launch')?.click();
    }
    if (action === 'add') return ($('inventoryAddBtn') || $('heroAddBtn') || $('addTopBtn'))?.click();
    if (action === 'print' && await ensurePrintReadiness()) return globalThis.FilamentInventoryPrintReadinessUI.open();
  }

  function bindShell() {
    document.addEventListener('click',event => {
      const close = event.target.closest('[data-dialog-close]');
      if (close) { close.closest('dialog')?.close(); return; }
      const profile = event.target.closest('[data-profile-menu]');
      if (profile) { const dialog = qs('.profile-switch-dialog'); if (dialog && !dialog.open) dialog.showModal(); return; }
      const ownerButton = event.target.closest('[data-profile-owner]');
      if (ownerButton) { ownerButton.closest('dialog')?.close(); localStorage.setItem('filament-current-user-v1',ownerButton.dataset.profileOwner); return; }
      const more = event.target.closest('[data-bottom-more]');
      if (more) { const dialog = ensureMoreSheet(); if (!dialog.open) dialog.showModal(); return; }
      if (event.target.closest('[data-bottom-scan]')) { runAction('scan'); return; }
      const route = event.target.closest('[data-shell-view],[data-bottom-view]');
      if (route) {
        event.preventDefault();
        const view = route.dataset.shellView || route.dataset.bottomView;
        route.closest('dialog')?.close();
        navigate(view,{historyMode:'push',focus:true});
        return;
      }
      const action = event.target.closest('[data-shell-action]');
      if (action) { action.closest('dialog')?.close(); runAction(action.dataset.shellAction); return; }
      if (event.target.closest('.tab[data-view]')) setTimeout(reconcileLegacyRoute,0);
    });

    const restore = () => restoreRouteFromHistory();
    window.addEventListener('popstate',restore);
    window.addEventListener('hashchange',restore);
    document.addEventListener('fi:profile-updated',ensureProfileMenu);
  }

  function observeLateSurfaces() {
    const main = document.querySelector('.app-shell > main');
    if (!main) return;
    new MutationObserver(records => {
      if (!records.some(record => [...record.addedNodes].some(node => node.nodeType === 1 && (node.matches?.('.view') || node.querySelector?.('.view'))))) return;
      updateShell();
      restoreRouteFromHistory();
    }).observe(main,{childList:true});
  }

  async function init() {
    document.documentElement.classList.add('fi-app-frame','fi-v11');
    loadStylesheet('/css/tokens.css');
    loadStylesheet('/css/components/v11.css');
    ensureSkipLink();
    const tabs = document.querySelector('.tabs');
    if (tabs) {
      tabs.setAttribute('aria-hidden','true');
      tabs.setAttribute('inert','');
      tabs.hidden = true;
    }
    ['exportTopBtn','addTopBtn'].forEach(id => $(id)?.classList.add('fi-global-duplicate'));
    const brandCopy = document.querySelector('.brand p');
    if (brandCopy) brandCopy.textContent = 'Private filament workspace';
    ensureSidebar();
    ensureBottomNav();
    ensureMoreSheet();
    updateShell();
    bindShell();
    observeLateSurfaces();
    await Promise.all([ensurePrintReadiness(),ensureProfilePreferences()]);
    updateShell();
    annotateDialogSemantics();
    restoreRouteFromHistory();
  }

  globalThis.FilamentInventoryNavigation = Object.freeze({
    navigate,
    current:() => currentRoute,
    register:view => { const ok=registerSurface(view); if(ok) { updateShell(); restoreRouteFromHistory(); } return ok; },
    routes:ROUTES,
    action:runAction,
    sync:reconcileLegacyRoute,
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',() => setTimeout(init,0),{once:true});
  else setTimeout(init,0);
})();