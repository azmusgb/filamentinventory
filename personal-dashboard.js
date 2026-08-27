(() => {
  'use strict';

  const STORAGE_KEY = 'filament-inventory-v1';
  const CURRENT_USER_KEY = 'filament-current-user-v1';
  const OWNERS = ['Bill', 'Aimee'];
  const PRIMARY_MOBILE_VIEWS = new Set(['dashboard', 'inventory', 'weigh', 'household']);
  const priorGetItem = Storage.prototype.getItem;
  const priorSetItem = Storage.prototype.setItem;
  let renderQueued = false;
  let rendering = false;
  let dashboardObserver = null;
  let tabsObserver = null;

  const parse = (value, fallback = null) => { try { return JSON.parse(value); } catch { return fallback; } };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const currentUser = () => {
    const value = String(priorGetItem.call(localStorage, CURRENT_USER_KEY) || '');
    return OWNERS.includes(value) ? value : 'Bill';
  };
  const state = () => parse(priorGetItem.call(localStorage, STORAGE_KEY), {spools:[],weighLog:[],auditLog:[]}) || {spools:[],weighLog:[],auditLog:[]};
  const api = () => globalThis.FilamentInventoryPersonal;
  const formatKg = grams => grams > 0 ? `${(grams / 1000).toFixed(2)} kg` : '0 kg';

  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    queueMicrotask(() => {
      renderQueued = false;
      render();
    });
  }

  Storage.prototype.setItem = function(key, value) {
    const result = priorSetItem.call(this, key, value);
    if (this === localStorage && (key === STORAGE_KEY || key === CURRENT_USER_KEY)) scheduleRender();
    return result;
  };

  function setHtml(node, html) {
    if (node && node.innerHTML !== html) node.innerHTML = html;
  }

  function setText(node, text) {
    if (node && node.textContent !== text) node.textContent = text;
  }

  function setHidden(node, hidden) {
    if (node && node.hidden !== hidden) node.hidden = hidden;
  }


  function addRestoreAction() {
    const actions = document.querySelector('#dashboardView .hero-actions');
    if (!actions || actions.querySelector('.dashboard-restore-btn')) return;
    const button = document.createElement('button');
    button.className = 'btn btn-ghost dashboard-restore-btn';
    button.type = 'button';
    button.textContent = 'Restore backup';
    button.addEventListener('click', () => {
      document.querySelector('.tab[data-view="data"]')?.click();
      setTimeout(() => document.getElementById('importJsonBtn')?.focus(), 80);
    });
    actions.appendChild(button);
  }

  function canonicalMetrics(summary) {
    const values = [
      ['Active', summary.activeCount, 'usable spools'],
      ['Filament', formatKg(summary.knownGrams), 'known remaining'],
      ['Loaded', summary.loadedCount, 'Printer / AMS'],
      ['Reorder', summary.reorderCount, 'at threshold'],
      ['Measure', summary.unknownCount, 'amount unknown'],
    ];
    return values.map(([label,value,note]) => `<article class="metric"><span class="metric-label">${esc(label)}</span><strong class="metric-value">${esc(value)}</strong><div class="metric-sub">${esc(note)}</div></article>`).join('');
  }

  function actionHtml(summary) {
    const actions = api()?.recommendedActions(state(), summary.owner) || [];
    if (!summary.activeCount) return '<div class="empty"><strong>Start with your first spool</strong>Add a spool to unlock measurements, material mix, loaded status, activity, and reorder guidance.</div>';
    if (!actions.length || (!summary.reorderCount && !summary.unknownCount)) return '<div class="empty"><strong>No urgent items</strong>Your inventory has no reorder or measurement items right now.</div>';
    return actions.slice(0,3).map(action => `<button class="quick-item quick-button" type="button" data-dashboard-action="${esc(action.view)}" data-spool="${esc(action.spoolId)}"><span class="dot" style="color:${action.kind === 'reorder' ? '#fb7185' : action.kind === 'measure' ? '#f59e0b' : '#84cc16'}"></span><span><strong>${esc(action.title)}</strong><small>${esc(action.detail)}</small></span><span>›</span></button>`).join('');
  }

  function composeHero(summary) {
    const owner = summary.owner;
    const empty = summary.activeCount === 0;
    const view = document.getElementById('dashboardView');
    if (view) view.dataset.empty = String(empty);

    setText(document.querySelector('#dashboardView .hero-copy .eyebrow'), 'Private inventory');
    setText(document.getElementById('dashboardTitle'), `${owner}'s Inventory`);
    const lead = empty
      ? `No spools yet. Add ${owner}'s first spool to start tracking filament, measurements, storage and Printer / AMS placement.`
      : `${summary.activeCount} active spool${summary.activeCount === 1 ? '' : 's'} · ${formatKg(summary.knownGrams)} known · ${summary.loadedCount} loaded · ${summary.reorderCount} reorder.`;
    setText(document.querySelector('#dashboardView .hero .lead'), lead);

    const add = document.getElementById('heroAddBtn');
    setText(add, empty ? '+ Add first spool' : '+ Add spool');
    add?.classList.add('btn-primary');
    setText(document.querySelector('#dashboardView [data-jump="weigh"]'), 'Weigh');
    setText(document.querySelector('#dashboardView [data-jump="inventory"]'), 'Inventory');
    setText(document.querySelector('#dashboardView [data-jump="household"]'), 'Printer / AMS');
    addRestoreAction();

    const quick = document.querySelector('#dashboardView .quick-panel');
    if (quick) {
      setText(quick.querySelector('.eyebrow'), 'Needs attention');
      setText(quick.querySelector('h3'), summary.reorderCount + summary.unknownCount ? `${summary.reorderCount + summary.unknownCount} item${summary.reorderCount + summary.unknownCount === 1 ? '' : 's'} need attention` : `You're all caught up`);
      setHtml(document.getElementById('priorityList'), actionHtml(summary));
      setText(quick.querySelector(':scope > p'), 'Measured gross − tare is authoritative. Unknown stays unknown until verified.');
    }
  }

  function composeMetrics(summary) {
    setHtml(document.getElementById('metrics'), canonicalMetrics(summary));
  }

  function cleanPrivateLanguage(summary) {
    const owner = summary.owner;
    const boundary = document.getElementById('userBoundary');
    if (boundary) {
      setText(boundary.querySelector('.user-boundary-kicker'), 'Private inventory');
      setText(boundary.querySelector('.user-boundary-title'), `${owner}'s Inventory`);
      setText(boundary.querySelector('.user-boundary-note'), 'Separate spools · separate history · separate sync & backups');
    }

    const householdTab = document.querySelector('.tab[data-view="household"]');
    setText(householdTab, 'Printer');
    setText(document.querySelector('#householdView .v8-hero .eyebrow'), `${owner}'s private inventory`);
    setText(document.getElementById('householdTitle'), `${owner}'s Printer / AMS`);

    const auditCard = document.getElementById('auditDashboardCard');
    if (auditCard) {
      setText(auditCard.querySelector('h3'), 'Recent activity');
      setText(auditCard.querySelector('.panel-head p'), 'Latest inventory, measurements and Printer / AMS changes.');
      auditCard.querySelectorAll('.audit-empty').forEach(node => {
        if (/household/i.test(node.textContent)) setText(node, 'No activity recorded yet.');
      });
    }

    const auditPanel = document.getElementById('auditPanel');
    if (auditPanel) {
      setText(auditPanel.querySelector('.eyebrow'), 'Private activity ledger');
      setText(auditPanel.querySelector('.panel-head h3'), 'Activity history');
      const search = document.getElementById('auditSearch');
      if (search) search.placeholder = 'Search spool, action, device…';
      const ownerFilter = document.getElementById('auditOwner');
      if (ownerFilter && ownerFilter.value !== owner) {
        ownerFilter.value = owner;
        ownerFilter.dispatchEvent(new Event('change', {bubbles:true}));
      }
      auditPanel.querySelectorAll('.audit-empty').forEach(node => {
        if (/household/i.test(node.textContent)) setText(node, 'Activity will appear here as inventory changes are made.');
      });
    }

    const prefsCopy = document.querySelector('.ux-profile-head p');
    if (prefsCopy && /shared inventory/i.test(prefsCopy.textContent)) {
      setText(prefsCopy, 'Preferences are stored locally per user. Each private inventory can use its own layout, theme, landing page and defaults.');
    }

    document.querySelectorAll('[data-jump="household"]').forEach(node => setText(node, 'Printer / AMS'));
  }

  function removeLegacyPersonalPanel() {
    document.getElementById('personalCommandCenter')?.remove();
  }

  function moreLabel(view, fallback) {
    return ({history:'Activity',labels:'Labels',sync:'Sync',data:'Data & backup',preferences:'Preferences'}[view] || fallback || view);
  }

  function ensureMobileMore() {
    const tabs = document.querySelector('.tabs');
    if (!tabs) return;
    let more = tabs.querySelector('.mobile-more-tab');
    if (!more) {
      more = document.createElement('button');
      more.type = 'button';
      more.className = 'mobile-more-tab';
      more.textContent = 'More';
      more.setAttribute('aria-selected', 'false');
      more.setAttribute('aria-expanded', 'false');
      tabs.appendChild(more);
    }
    let menu = document.getElementById('mobileMoreMenu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'mobileMoreMenu';
      menu.className = 'mobile-more-menu';
      menu.hidden = true;
      tabs.insertAdjacentElement('afterend', menu);
    }

    const secondary = [...tabs.querySelectorAll('.tab[data-view]')].filter(tab => !PRIMARY_MOBILE_VIEWS.has(tab.dataset.view));
    const html = secondary.map(tab => `<button class="mobile-more-item" type="button" data-mobile-more-view="${esc(tab.dataset.view)}">${esc(moreLabel(tab.dataset.view, tab.textContent.trim()))}</button>`).join('');
    setHtml(menu, html);
  }

  function syncMoreState() {
    const tabs = document.querySelector('.tabs');
    const more = tabs?.querySelector('.mobile-more-tab');
    const menu = document.getElementById('mobileMoreMenu');
    if (!more || !menu) return;
    const active = tabs.querySelector('.tab[aria-selected="true"]')?.dataset.view || 'dashboard';
    const secondaryActive = !PRIMARY_MOBILE_VIEWS.has(active);
    more.setAttribute('aria-selected', String(secondaryActive));
    menu.querySelectorAll('[data-mobile-more-view]').forEach(button => button.setAttribute('aria-current', button.dataset.mobileMoreView === active ? 'page' : 'false'));
  }

  function openInventory(spoolId = '') {
    document.querySelector('.tab[data-view="inventory"]')?.click();
    setTimeout(() => {
      const lifecycle = document.getElementById('lifecycleFilter');
      const search = document.getElementById('searchInput');
      if (lifecycle) { lifecycle.value = 'active'; lifecycle.dispatchEvent(new Event('change',{bubbles:true})); }
      if (search) { search.value = spoolId; search.dispatchEvent(new Event('input',{bubbles:true})); }
    }, 60);
  }

  function openWeigh(spoolId = '') {
    const summary = api()?.summarizeOwner(state(), currentUser());
    const candidate = spoolId || summary?.needsMeasurement?.[0]?.id || summary?.lowStock?.[0]?.spool?.id || summary?.active?.[0]?.id || '';
    document.querySelector('.tab[data-view="weigh"]')?.click();
    setTimeout(() => {
      const select = document.getElementById('weighSpool');
      if (select && candidate && [...select.options].some(option => option.value === candidate)) {
        select.value = candidate;
        select.dispatchEvent(new Event('change',{bubbles:true}));
      }
      document.getElementById('grossWeight')?.focus();
    }, 70);
  }

  function openPrinter() { document.querySelector('.tab[data-view="household"]')?.click(); }
  function addSpool() { const button = document.getElementById('addTopBtn') || document.getElementById('heroAddBtn'); button?.click(); }

  function handleDashboardAction(view, spoolId) {
    if (view === 'weigh') return openWeigh(spoolId);
    if (view === 'household') return openPrinter();
    return openInventory(spoolId);
  }

  function render() {
    if (rendering) return;
    const core = api();
    if (!core || !document.getElementById('dashboardView')) return;
    rendering = true;
    try {
      removeLegacyPersonalPanel();
      const summary = core.summarizeOwner(state(), currentUser());
      composeHero(summary);
      composeMetrics(summary);
      cleanPrivateLanguage(summary);
    } finally {
      rendering = false;
    }
  }

  function bind() {
    document.addEventListener('click', event => {
      const dashboardAction = event.target.closest('[data-dashboard-action]');
      if (dashboardAction) {
        handleDashboardAction(dashboardAction.dataset.dashboardAction, dashboardAction.dataset.spool || '');
        return;
      }

      const more = event.target.closest('.mobile-more-tab');
      if (more) {
        const menu = document.getElementById('mobileMoreMenu');
        if (menu) {
          menu.hidden = !menu.hidden;
          more.setAttribute('aria-expanded', String(!menu.hidden));
        }
        return;
      }

      const item = event.target.closest('[data-mobile-more-view]');
      if (item) {
        document.querySelector(`.tab[data-view="${CSS.escape(item.dataset.mobileMoreView)}"]`)?.click();
        const menu = document.getElementById('mobileMoreMenu');
        if (menu) menu.hidden = true;
        document.querySelector('.mobile-more-tab')?.setAttribute('aria-expanded', 'false');
        setTimeout(syncMoreState, 0);
        return;
      }

      if (event.target.closest('.tab[data-view]')) {
        const menu = document.getElementById('mobileMoreMenu');
        if (menu) menu.hidden = true;
        setTimeout(() => { syncMoreState(); scheduleRender(); }, 0);
      }
    });

    window.addEventListener('storage', event => {
      if (event.key === STORAGE_KEY || event.key === CURRENT_USER_KEY) scheduleRender();
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 720) {
        const menu = document.getElementById('mobileMoreMenu');
        if (menu) menu.hidden = true;
      }
    }, {passive:true});
  }

  function observe() {
    const dashboard = document.getElementById('dashboardView');
    if (dashboard && !dashboardObserver) {
      dashboardObserver = new MutationObserver(() => { if (!rendering) scheduleRender(); });
      dashboardObserver.observe(dashboard, {subtree:true, childList:true, characterData:true});
    }
    const tabs = document.querySelector('.tabs');
    if (tabs && !tabsObserver) {
      tabsObserver = new MutationObserver(() => { if (!rendering) scheduleRender(); });
      tabsObserver.observe(tabs, {subtree:true, childList:true, attributes:true, attributeFilter:['aria-selected']});
    }
  }

  function init() {
    bind();
    render();
    observe();
    setTimeout(render, 0);
    setTimeout(render, 120);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();