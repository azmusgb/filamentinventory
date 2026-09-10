(() => {
  'use strict';

  const PRIMARY_VIEWS = new Set(['dashboard', 'inventory', 'household', 'assistant', 'history']);
  const $ = id => document.getElementById(id);
  const qs = selector => document.querySelector(selector);
  let observer = null;
  let scheduled = false;

  function ensurePresentationAssets() {
    const stylesheets = ['/css/components/inventory-mobile.css', '/css/components/llm.css', '/css/components/workshop-device-link.css', '/css/components/mobile-shell.css'];
    for (const stylesheet of stylesheets) {
      if (document.querySelector(`link[href="${stylesheet}"]`)) continue;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = stylesheet;
      link.dataset.fiPresentation = stylesheet.includes('llm') ? 'llm' : (stylesheet.includes('workshop-device-link') ? 'workshop-device-link' : (stylesheet.includes('mobile-shell') ? 'mobile-shell' : 'inventory-mobile'));
      document.head.appendChild(link);
    }

    const scripts = ['/inventory-card-client.js', '/llm-core.js', '/llm-transport-client.js', '/llm-client.js', '/workshop-device-link-client.js'];
    for (const script of scripts) {
      if (document.querySelector(`script[src="${script}"]`)) continue;
      const node = document.createElement('script');
      node.src = script;
      node.async = false;
      node.dataset.fiPresentation = script.includes('llm') ? 'llm' : (script.includes('workshop-device-link') ? 'workshop-device-link' : 'inventory-cards');
      document.head.appendChild(node);
    }
  }

  function shellButton({view, action, icon, label, className = ''}) {
    const route = view ? ` data-shell-view="${view}"` : '';
    const task = action ? ` data-shell-action="${action}"` : '';
    const classes = className ? ` class="${className}"` : '';
    return `<button type="button"${classes}${route}${task}><span class="fi-nav-icon" aria-hidden="true">${icon}</span><span>${label}</span></button>`;
  }

  function moreAction({view, action, label, hint = ''}) {
    const route = view ? ` data-shell-view="${view}"` : '';
    const task = action ? ` data-shell-action="${action}"` : '';
    const sub = hint ? `<small>${hint}</small>` : '';
    return `<button class="fi-more-action" type="button"${route}${task}><span><strong>${label}</strong>${sub}</span><b aria-hidden="true">›</b></button>`;
  }

  function activeViewFromDom() {
    return document.querySelector('.view.active[id$="View"]')?.id.replace(/View$/, '') || '';
  }

  function currentView() {
    const domView = activeViewFromDom();
    if (domView === 'assistant') return 'assistant';
    return globalThis.FilamentInventoryNavigation?.current?.()
      || domView
      || document.documentElement.dataset.currentView
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
    document.querySelectorAll('[data-shell-action="assistant"]').forEach(control => {
      control.setAttribute('aria-current', view === 'assistant' ? 'page' : 'false');
    });
    document.querySelectorAll('[data-v12-more]').forEach(control => {
      control.setAttribute('aria-current', PRIMARY_VIEWS.has(view) ? 'false' : 'page');
    });
  }

  function refineSidebar() {
    const sidebar = $('fiDesktopSidebar');
    if (!sidebar || sidebar.dataset.navigationArchitecture === '4') return;
    sidebar.dataset.navigationArchitecture = '4';
    sidebar.innerHTML = `
      <div class="fi-sidebar-group-label">Workspace</div>
      <nav class="fi-secondary-nav" aria-label="Primary destinations">
        ${shellButton({view:'dashboard', icon:'⌂', label:'Home'})}
        ${shellButton({view:'inventory', icon:'▦', label:'Inventory'})}
        ${shellButton({view:'household', icon:'◉', label:'Printer'})}
        ${shellButton({action:'assistant', icon:'✦', label:'Assistant'})}
        ${shellButton({view:'history', icon:'↺', label:'Activity'})}
      </nav>
      <div class="fi-sidebar-spacer"></div>
      <div class="fi-sidebar-group-label">Quick actions</div>
      <nav class="fi-secondary-nav fi-quick-actions" aria-label="Quick actions">
        ${shellButton({action:'print', icon:'✓', label:'Print readiness'})}
        ${shellButton({action:'scan', icon:'⌁', label:'Scan spool'})}
        ${shellButton({action:'add', icon:'＋', label:'Add spool', className:'fi-sidebar-primary-action'})}
      </nav>
      <nav class="fi-secondary-nav fi-sidebar-more" aria-label="More tools">
        <button type="button" data-bottom-more data-v12-more aria-haspopup="dialog" aria-controls="fiMoreSheet"><span class="fi-nav-icon" aria-hidden="true">•••</span><span>Tools & settings</span></button>
      </nav>`;
  }

  function preserveBottomNav() {
    const nav = qs('.mobile-bottom-nav');
    if (!nav) return;
    nav.dataset.navigationArchitecture = '4';
    const required = [
      '[data-bottom-view="dashboard"]',
      '[data-bottom-view="inventory"]',
      '[data-bottom-view="household"]',
      '[data-shell-action="assistant"]',
      '[data-bottom-view="history"]',
    ];
    const hasLegacy = nav.querySelector('[data-bottom-scan], [data-bottom-more]');
    if (!hasLegacy && required.every(selector => nav.querySelector(selector))) return;
    nav.innerHTML = `
      <button type="button" data-bottom-view="dashboard"><span aria-hidden="true">⌂</span><small>Home</small></button>
      <button type="button" data-bottom-view="inventory"><span aria-hidden="true">▦</span><small>Inventory</small></button>
      <button type="button" data-bottom-view="household"><span aria-hidden="true">◉</span><small>Printer</small></button>
      <button type="button" data-shell-action="assistant"><span aria-hidden="true">✦</span><small>Assistant</small></button>
      <button type="button" data-bottom-view="history"><span aria-hidden="true">↺</span><small>Activity</small></button>`;
  }

  function ensureHeaderTools() {
    const topActions = qs('.top-actions');
    if (!topActions || topActions.querySelector('[data-v12-more]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn icon-btn header-tools-launch';
    button.dataset.bottomMore = '';
    button.dataset.v12More = '';
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-controls', 'fiMoreSheet');
    button.setAttribute('aria-label', 'Open tools and settings');
    button.innerHTML = '<span aria-hidden="true">•••</span>';
    topActions.appendChild(button);
  }

  function refineMoreSheet() {
    const dialog = qs('.fi-more-sheet');
    if (!dialog || dialog.dataset.navigationArchitecture === '4') return;
    dialog.dataset.navigationArchitecture = '4';
    if (!dialog.id) dialog.id = 'fiMoreSheet';
    dialog.setAttribute('aria-labelledby', 'fiMoreSheetTitle');
    dialog.innerHTML = `
      <div class="dialog-head">
        <div><span class="eyebrow">Workshop tools</span><h3 id="fiMoreSheetTitle">Tools & settings</h3></div>
        <button class="btn icon-btn" type="button" data-dialog-close aria-label="Close">×</button>
      </div>
      <div class="dialog-body">
        <div class="fi-more-groups">
          <section class="fi-more-group">
            <h4>Physical filament</h4>
            <div class="fi-more-actions">
              ${moreAction({action:'add', label:'Add spool', hint:'Create a spool in this private workspace'})}
              ${moreAction({action:'scan', label:'Scan spool', hint:'Resolve a durable spool ID'})}
              ${moreAction({view:'weigh', label:'Weigh spool', hint:'Record measured quantity evidence'})}
              ${moreAction({action:'print', label:'Print readiness', hint:'Can I print this now?'})}
              ${moreAction({view:'labels', label:'QR labels', hint:'Identity only — no mutable state'})}
            </div>
          </section>
          <section class="fi-more-group">
            <h4>Devices & data</h4>
            <div class="fi-more-actions">
              ${moreAction({view:'sync', label:'Sync devices', hint:'Profile-scoped cloud state'})}
              ${moreAction({view:'data', label:'Backup & data', hint:'Export, restore and install'})}
            </div>
          </section>
          <section class="fi-more-group">
            <h4>Workspace</h4>
            <div class="fi-more-actions">
              ${moreAction({view:'preferences', label:'Preferences', hint:'Personalize this private workspace'})}
            </div>
          </section>
        </div>
      </div>`;
    document.querySelectorAll('[data-v12-more]').forEach(more => {
      more.setAttribute('aria-haspopup', 'dialog');
      more.setAttribute('aria-controls', dialog.id);
    });
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
    if (copy) copy.textContent = 'Private workshop inventory';
  }

  function apply() {
    scheduled = false;
    refineSidebar();
    preserveBottomNav();
    ensureHeaderTools();
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
    document.addEventListener('fi:profile-updated', scheduleApply);
    globalThis.FilamentInventoryEvents?.on?.('navigation:changed', () => scheduleApply());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0), {once:true});
  } else {
    setTimeout(init, 0);
  }
})();