(() => {
  'use strict';

  const PRIMARY_VIEWS = new Set(['dashboard', 'inventory', 'household']);
  const $ = id => document.getElementById(id);
  const qs = selector => document.querySelector(selector);
  let observer = null;
  let scheduled = false;

  function ensurePresentationAssets() {
    const stylesheets = [
      ['/css/components/inventory-mobile.css', 'inventory-mobile'],
      ['/css/components/printer-ams.css', 'printer-ams'],
    ];
    for (const [stylesheet, key] of stylesheets) {
      if (document.querySelector(`link[href="${stylesheet}"]`)) continue;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = stylesheet;
      link.dataset.fiPresentation = key;
      document.head.appendChild(link);
    }

    const scripts = [
      ['/inventory-card-client.js', 'inventory-cards'],
      ['/printer-ams-client.js', 'printer-ams'],
    ];
    for (const [script, key] of scripts) {
      if (document.querySelector(`script[src="${script}"]`)) continue;
      const node = document.createElement('script');
      node.src = script;
      node.defer = true;
      node.dataset.fiPresentation = key;
      document.head.appendChild(node);
    }
  }

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
      control.setAttribute('aria-current', control.dataset.shellView === view ? 'page' : 'false');
    });
    document.querySelectorAll('[data-bottom-view]').forEach(control => {
      control.setAttribute('aria-current', control.dataset.bottomView === view ? 'page' : 'false');
    });
    const more = qs('[data-bottom-more]');
    if (more) more.setAttribute('aria-current', PRIMARY_VIEWS.has(view) ? 'false' : 'page');
  }

  function refineSidebar() {
    const sidebar = $('fiDesktopSidebar');
    if (!sidebar || sidebar.dataset.navigationArchitecture === '1') return;
    sidebar.dataset.navigationArchitecture = '1';
    sidebar.innerHTML = `
      <div class="fi-sidebar-group-label">Workspace</div>
      <nav class="fi-secondary-nav" aria-label="Primary destinations">
        ${shellButton({view:'dashboard', icon:'⌂', label:'Home'})}
        ${shellButton({view:'inventory', icon:'▦', label:'Inventory'})}
        ${shellButton({view:'household', icon:'◉', label:'Printer'})}
        ${shellButton({view:'history', icon:'↺', label:'Activity'})}
      </nav>
      <div class="fi-sidebar-group-label">Manage</div>
      <nav class="fi-secondary-nav" aria-label="Inventory management">
        ${shellButton({view:'labels', icon:'◇', label:'QR labels'})}
      </nav>
      <div class="fi-sidebar-spacer"></div>
      <div class="fi-sidebar-group-label">Quick actions</div>
      <nav class="fi-secondary-nav fi-quick-actions" aria-label="Quick actions">
        ${shellButton({action:'print', icon:'✓', label:'Can I print this?'})}
        ${shellButton({action:'scan', icon:'⌁', label:'Scan spool'})}
        ${shellButton({action:'add', icon:'＋', label:'Add spool'})}
        ${shellButton({view:'weigh', icon:'◌', label:'Weigh spool'})}
      </nav>
      <div class="fi-sidebar-group-label">Devices & data</div>
      <nav class="fi-secondary-nav" aria-label="Devices and data">
        ${shellButton({view:'sync', icon:'⇄', label:'Sync devices'})}
        ${shellButton({view:'data', icon:'⇩', label:'Backup & data'})}
      </nav>
      <div class="fi-sidebar-group-label">Settings</div>
      <nav class="fi-secondary-nav" aria-label="Settings">
        ${shellButton({view:'preferences', icon:'⚙', label:'Preferences'})}
      </nav>`;
  }

  function preserveBottomNav() {
    const nav = qs('.mobile-bottom-nav');
    if (!nav) return;
    nav.dataset.navigationArchitecture = '1';
    const required = [
      '[data-bottom-view="dashboard"]',
      '[data-bottom-view="inventory"]',
      '[data-bottom-scan]',
      '[data-bottom-view="household"]',
      '[data-bottom-more]',
    ];
    if (required.every(selector => nav.querySelector(selector))) return;
    nav.innerHTML = `
      <button type="button" data-bottom-view="dashboard"><span aria-hidden="true">⌂</span><small>Home</small></button>
      <button type="button" data-bottom-view="inventory"><span aria-hidden="true">▦</span><small>Inventory</small></button>
      <button type="button" data-bottom-scan><span aria-hidden="true">⌁</span><small>Scan</small></button>
      <button type="button" data-bottom-view="household"><span aria-hidden="true">◉</span><small>Printer</small></button>
      <button type="button" data-bottom-more aria-haspopup="dialog"><span aria-hidden="true">•••</span><small>More</small></button>`;
  }

  function refineMoreSheet() {
    const dialog = qs('.fi-more-sheet');
    if (!dialog || dialog.dataset.navigationArchitecture === '1') return;
    dialog.dataset.navigationArchitecture = '1';
    if (!dialog.id) dialog.id = 'fiMoreSheet';
    dialog.setAttribute('aria-labelledby', 'fiMoreSheetTitle');
    dialog.innerHTML = `
      <div class="dialog-head">
        <div><span class="eyebrow">More</span><h3 id="fiMoreSheetTitle">Tools & settings</h3></div>
        <button class="btn icon-btn" type="button" data-dialog-close aria-label="Close">×</button>
      </div>
      <div class="dialog-body">
        <div class="fi-more-groups">
          <section class="fi-more-group">
            <h4>Workflow</h4>
            <div class="fi-more-actions">
              ${moreAction({view:'weigh', label:'Weigh spool'})}
              ${moreAction({action:'print', label:'Can I print this?'})}
            </div>
          </section>
          <section class="fi-more-group">
            <h4>Manage</h4>
            <div class="fi-more-actions">
              ${moreAction({view:'history', label:'Activity'})}
              ${moreAction({view:'labels', label:'QR labels'})}
            </div>
          </section>
          <section class="fi-more-group">
            <h4>Devices & data</h4>
            <div class="fi-more-actions">
              ${moreAction({view:'sync', label:'Sync devices'})}
              ${moreAction({view:'data', label:'Backup & data'})}
            </div>
          </section>
          <section class="fi-more-group">
            <h4>Settings</h4>
            <div class="fi-more-actions">
              ${moreAction({view:'preferences', label:'Preferences'})}
            </div>
          </section>
        </div>
      </div>`;
    const more = qs('[data-bottom-more]');
    if (more) {
      more.setAttribute('aria-haspopup', 'dialog');
      more.setAttribute('aria-controls', dialog.id);
    }
  }

  function retireLegacyNavigation() {
    const tabs = qs('.tabs');
    if (tabs) {
      tabs.hidden = true;
      tabs.setAttribute('aria-hidden', 'true');
      tabs.setAttribute('inert', '');
    }
    const legacyFab = $('mobileAddBtn');
    if (legacyFab) {
      legacyFab.hidden = true;
      legacyFab.setAttribute('aria-hidden', 'true');
      legacyFab.setAttribute('inert', '');
    }
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
    preserveBottomNav();
    refineMoreSheet();
    retireLegacyNavigation();
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
    if (observer || !document.body) return;
    observer = new MutationObserver(records => {
      const relevant = records.some(record => {
        if (record.type === 'attributes') return record.target.classList?.contains('view');
        return [...record.addedNodes].some(node => node.nodeType === Node.ELEMENT_NODE);
      });
      if (relevant) scheduleApply();
    });
    observer.observe(document.body, {subtree:true, childList:true, attributes:true, attributeFilter:['class']});
  }

  function init() {
    ensurePresentationAssets();
    scheduleApply();
    observe();
    document.addEventListener('fi:navigation', event => {
      syncViewVisibility();
      syncCurrentState(event.detail?.view || currentView());
    });
    globalThis.FilamentInventoryEvents?.on?.('navigation:changed', () => scheduleApply());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0), {once:true});
  } else {
    setTimeout(init, 0);
  }
})();