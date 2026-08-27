(() => {
  'use strict';

  const STORAGE_KEY = 'filament-inventory-v1';
  const CURRENT_USER_KEY = 'filament-current-user-v1';
  const OWNERS = ['Bill', 'Aimee'];
  const priorGetItem = Storage.prototype.getItem;
  const priorSetItem = Storage.prototype.setItem;
  let renderQueued = false;
  let rendering = false;
  let dashboardObserver = null;

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
    queueMicrotask(() => { renderQueued = false; render(); });
  }

  Storage.prototype.setItem = function(key, value) {
    const result = priorSetItem.call(this, key, value);
    if (this === localStorage && (key === STORAGE_KEY || key === CURRENT_USER_KEY)) scheduleRender();
    return result;
  };

  function setHtml(node, html) { if (node && node.innerHTML !== html) node.innerHTML = html; }
  function setText(node, text) { if (node && node.textContent !== text) node.textContent = text; }

  function addRestoreAction() {
    const actions = document.querySelector('.dashboard-view .hero-actions');
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
    if (!summary.activeCount) return '<div class="empty"><strong>Add your first spool</strong>Scan a label or add a spool to begin.</div>';
    if (!actions.length || (!summary.reorderCount && !summary.unknownCount)) return '<div class="empty"><strong>All caught up</strong>No measurement or reorder items need attention.</div>';
    return actions.slice(0,3).map(action => `<button class="quick-item quick-button" type="button" data-dashboard-action="${esc(action.view)}" data-spool="${esc(action.spoolId)}"><span class="dot" data-kind="${esc(action.kind)}"></span><span><strong>${esc(action.title)}</strong><small>${esc(action.detail)}</small></span><span>›</span></button>`).join('');
  }

  function composeHero(summary) {
    const owner = summary.owner;
    const empty = summary.activeCount === 0;
    const view = document.getElementById('dashboardView');
    if (view) {
      view.dataset.empty = String(empty);
      view.classList.add('dashboard-view');
    }

    setText(document.querySelector('.dashboard-view .hero-copy .eyebrow'), 'Home');
    setText(document.getElementById('dashboardTitle'), empty ? `${owner}'s Inventory` : `${owner}'s filament`);
    const lead = empty
      ? 'Add or scan a spool to start tracking what is available and where it is.'
      : `${summary.activeCount} active · ${formatKg(summary.knownGrams)} known · ${summary.loadedCount} loaded`;
    setText(document.querySelector('.dashboard-view .hero .lead'), lead);

    const add = document.getElementById('heroAddBtn');
    setText(add, empty ? '+ Add first spool' : '+ Add spool');
    add?.classList.add('btn-primary');
    setText(document.querySelector('.dashboard-view [data-jump="weigh"]'), 'Weigh');
    setText(document.querySelector('.dashboard-view [data-jump="inventory"]'), 'Inventory');
    setText(document.querySelector('.dashboard-view [data-jump="household"]'), 'Printer / AMS');
    addRestoreAction();

    const quick = document.querySelector('.dashboard-view .quick-panel');
    if (quick) {
      const attentionCount = summary.reorderCount + summary.unknownCount;
      setText(quick.querySelector('.eyebrow'), 'Needs attention');
      setText(quick.querySelector('h3'), attentionCount ? `${attentionCount} item${attentionCount === 1 ? '' : 's'}` : 'All caught up');
      setHtml(document.getElementById('priorityList'), actionHtml(summary));
      setText(quick.querySelector(':scope > p'), attentionCount ? 'Open an item to resolve it.' : 'No action required right now.');
    }
  }

  function composeMetrics(summary) { setHtml(document.getElementById('metrics'), canonicalMetrics(summary)); }

  function composeSecondary() {
    const view = document.getElementById('dashboardView');
    if (!view) return;
    const grid = [...view.children].find(node => node.classList?.contains('grid-2'));
    if (grid) grid.classList.add('dashboard-secondary');
    const audit = document.getElementById('auditDashboardCard');
    if (audit) audit.classList.add('dashboard-recent');
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
      setText(auditCard.querySelector('.panel-head p'), 'Latest changes.');
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
    }
    const prefsCopy = document.querySelector('.ux-profile-head p');
    if (prefsCopy && /shared inventory/i.test(prefsCopy.textContent)) setText(prefsCopy, 'Preferences are stored locally per user.');
    document.querySelectorAll('[data-jump="household"]').forEach(node => setText(node, 'Printer / AMS'));
  }

  function removeLegacyPersonalPanel() { document.getElementById('personalCommandCenter')?.remove(); }

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
      composeSecondary();
      cleanPrivateLanguage(summary);
    } finally { rendering = false; }
  }

  function bind() {
    document.addEventListener('click', event => {
      const dashboardAction = event.target.closest('[data-dashboard-action]');
      if (dashboardAction) { handleDashboardAction(dashboardAction.dataset.dashboardAction, dashboardAction.dataset.spool || ''); return; }
      if (event.target.closest('.tab[data-view]')) setTimeout(scheduleRender, 0);
    });
    window.addEventListener('storage', event => { if (event.key === STORAGE_KEY || event.key === CURRENT_USER_KEY) scheduleRender(); });
  }

  function observe() {
    const dashboard = document.getElementById('dashboardView');
    if (dashboard && !dashboardObserver) {
      dashboardObserver = new MutationObserver(() => { if (!rendering) scheduleRender(); });
      dashboardObserver.observe(dashboard, {subtree:true, childList:true, characterData:true});
    }
  }

  function init() { bind(); render(); observe(); setTimeout(render, 0); setTimeout(render, 120); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();