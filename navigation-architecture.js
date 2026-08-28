(() => {
  'use strict';

  const PRIMARY_VIEWS = new Set(['dashboard', 'inventory', 'household', 'history']);
  const $ = id => document.getElementById(id);
  const qs = selector => document.querySelector(selector);
  let observer = null;
  let scheduled = false;

  function shellButton({view, action, icon, label}) {
    const route = view ? ` data-shell-view="${view}"` : '';
    const task = action ? ` data-shell-action="${action}"` : '';
    return `<button type="button"${route}${task}><span class="fi-nav-icon" aria-hidden="true">${icon}</span><span>${label}</span></button>`;
  }

  function moreAction({view, action, label}) {
    const route = view ? ` data-shell-view="${view}"` : '';
    const task = action ? ` data-shell-action="${action}"` : '';
    return `<button class="fi-more-action" type="button"${route}${task}><span>${label}</span><b aria-hidden="true">›</b></button>`;
  }

  function currentView() {
    return globalThis.FilamentInventoryNavigation?.current?.()
      || document.querySelector('.view.active[id$="View"]')?.id.replace(/View$/, '')
      || 'dashboard';
  }

  function syncViewVisibility() {
    document.querySelectorAll('.view[id$="View"]').forEach(view => {
      const active = view.classList.contains('active');
      view.hidden = !active;
      view.setAttribute('aria-hidden', active ? 'false' : 'true');
      if (active) view.removeAttribute('inert');
      else view.setAttribute('inert', '');
    });
  }

  function syncCurrentState(view = currentView()) {
    document.querySelectorAll('[data-shell-view]').forEach(control => {
      if (control.dataset.shellView === view) control.setAttribute('aria-current', 'page');
      else control.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-bottom-view]').forEach(control => {
      if (control.dataset.bottomView === view) control.setAttribute('aria-current', 'page');
      else control.removeAttribute('aria-current');
    });
    const more = qs('[data-bottom-more]');
    if (more) {
      if (PRIMARY_VIEWS.has(view)) more.removeAttribute('aria-current');
      else more.setAttribute('aria-current', 'page');
    }
  }

  function refineSidebar() {
    const sidebar = $('fiDesktopSidebar');
    if (!sidebar || sidebar.dataset.navigationArchitecture === '1') return;
    sidebar.dataset.navigationArchitecture = '1';
    sidebar.innerHTML = `
      <div class="fi-sidebar-group-label">Workspace</div>
      <nav class="fi-secondary-nav" aria-label="Primary destinations">
        ${shellButton({view:'dashboard', icon:'⌂', label:'Overview'})}
        ${shellButton({view:'inventory', icon:'▦', label:'Inventory'})}
        ${shellButton({view:'household', icon:'◉', label:'Printer & AMS'})}
        ${shellButton({view:'history', icon:'↺', label:'Activity'})}
      </nav>
      <div class="fi-sidebar-group-label">Tools</div>
      <nav class="fi-secondary-nav" aria-label="Inventory tools">
        ${shellButton({view:'labels', icon:'◇', label:'QR labels'})}
      </nav>
      <div class="fi-sidebar-spacer"></div>
      <div class="fi-sidebar-group-label">Quick actions</div>
      <nav class="fi-secondary-nav fi-quick-actions" aria-label="Quick actions">
        ${shellButton({action:'print', icon:'✓', label:'Can I print this?'})}
        ${shellButton({action:'add', icon:'＋', label:'Add spool'})}
        ${shellButton({view:'weigh', icon:'◌', label:'Weigh spool'})}
        ${shellButton({action:'scan', icon:'⌁', label:'Scan spool'})}
      </nav>
      <div class="fi-sidebar-group-label">Settings</div>
      <nav class="fi-secondary-nav" aria-label="Settings and data">
        ${shellButton({view:'preferences', icon:'⚙', label:'Preferences'})}
        ${shellButton({view:'data', icon:'⇩', label:'Backup & data'})}
        ${shellButton({view:'sync', icon:'⇄', label:'Sync devices'})}
      </nav>`;
  }

  function refineBottomNav() {
    const nav = qs('.mobile-bottom-nav');
    if (!nav || nav.dataset.navigationArchitecture === '1') return;
    nav.dataset.navigationArchitecture = '1';
    nav.innerHTML = `
      <button type="button" data-bottom-view="dashboard"><span aria-hidden="true">⌂</span><small>Overview</small></button>
      <button type="button" data-bottom-view="inventory"><span aria-hidden="true">▦</span><small>Inventory</small></button>
      <button type="button" data-bottom-view="household"><span aria-hidden="true">◉</span><small>Printer</small></button>
      <button type="button" data-bottom-view="history"><span aria-hidden="true">↺</span><small>Activity</small></button>
      <button type="button" data-bottom-more aria-haspopup="dialog" aria-controls="fiMoreSheet"><span aria-hidden="true">•••</span><small>More</small></button>`;
  }

  function refineMoreSheet() {
    const dialog = $('fiMoreSheet');
    if (!dialog || dialog.dataset.navigationArchitecture === '1') return;
    dialog.dataset.navigationArchitecture = '1';
    dialog.setAttribute('aria-labelledby', 'fiMoreSheetTitle');
    dialog.innerHTML = `
      <div class="dialog-head">
        <div><span class="eyebrow">More</span><h3 id="fiMoreSheetTitle">Tools & settings</h3></div>
        <button class="btn icon-btn" type="button" data-dialog-close aria-label="Close">×</button>
      </div>
      <div class="dialog-body">
        <div class="fi-more-groups">
          <section class="fi-more-group">
            <h4>Workflows</h4>
            <div class="fi-more-actions">
              ${moreAction({view:'weigh', label:'Weigh spool'})}
              ${moreAction({action:'print', label:'Can I print this?'})}
              ${moreAction({action:'scan', label:'Scan spool'})}
              ${moreAction({action:'add', label:'Add spool'})}
            </div>
          </section>
          <section class="fi-more-group">
            <h4>Tools</h4>
            <div class="fi-more-actions">
              ${moreAction({view:'labels', label:'QR labels'})}
            </div>
          </section>
          <section class="fi-more-group">
            <h4>Settings & data</h4>
            <div class="fi-more-actions">
              ${moreAction({view:'preferences', label:'Preferences'})}
              ${moreAction({view:'data', label:'Backup & data'})}
              ${moreAction({view:'sync', label:'Sync devices'})}
            </div>
          </section>
        </div>
      </div>`;
  }

  function ensureGlobalAddAction() {
    const actions = qs('.top-actions');
    if (!actions || $('fiGlobalAddBtn')) return;
    const button = document.createElement('button');
    button.id = 'fiGlobalAddBtn';
    button.type = 'button';
    button.className = 'btn btn-primary fi-global-add';
    button.dataset.shellAction = 'add';
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-controls', 'spoolDialog');
    button.textContent = '+ Add';
    const profile = qs('.profile-chip');
    actions.insertBefore(button, profile || actions.firstChild);
  }

  function reduceDuplicateActions() {
    const inventoryAdd = $('inventoryAddBtn');
    if (inventoryAdd) inventoryAdd.hidden = true;

    const dashboard = $('dashboardView');
    const heroAdd = $('heroAddBtn');
    if (dashboard && heroAdd) heroAdd.hidden = dashboard.dataset.empty !== 'true';
  }

  function removeLegacyNavigation() {
    qs('.tabs')?.remove();
    $('mobileAddBtn')?.remove();
    $('addTopBtn')?.remove();
  }

  function refineLabels() {
    const brand = qs('.brand h1');
    if (brand) brand.textContent = 'Filament Inventory';
    const copy = qs('.brand p');
    if (copy) copy.textContent = 'Private filament workspace';
  }

  function apply() {
    scheduled = false;
    refineSidebar();
    refineBottomNav();
    refineMoreSheet();
    ensureGlobalAddAction();
    reduceDuplicateActions();
    removeLegacyNavigation();
    refineLabels();
    syncViewVisibility();
    syncCurrentState();
  }

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(apply);
  }

  function observe() {
    if (observer) return;
    const root = document.body;
    if (!root) return;
    observer = new MutationObserver(records => {
      const relevant = records.some(record => {
        if (record.type === 'attributes') return record.target.classList?.contains('view') || record.target.id === 'dashboardView';
        return [...record.addedNodes].some(node => node.nodeType === Node.ELEMENT_NODE);
      });
      if (relevant) scheduleApply();
    });
    observer.observe(root, {subtree:true, childList:true, attributes:true, attributeFilter:['class','data-empty']});
  }

  function init() {
    scheduleApply();
    observe();
    document.addEventListener('fi:navigation', event => {
      syncViewVisibility();
      syncCurrentState(event.detail?.view || currentView());
      reduceDuplicateActions();
    });
    globalThis.FilamentInventoryEvents?.on?.('navigation:changed', () => scheduleApply());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0), {once:true});
  } else {
    setTimeout(init, 0);
  }
})();