(() => {
  'use strict';

  const STORAGE_KEY = 'filament-inventory-v1';
  const CURRENT_USER_KEY = 'filament-current-user-v1';
  const priorSetItem = Storage.prototype.setItem;
  let renderQueued = false;
  let rendering = false;
  let dashboardObserver = null;

  const $ = id => document.getElementById(id);
  const parse = (value,fallback=null) => { try { return JSON.parse(value); } catch { return fallback; } };
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const currentUser = () => globalThis.FilamentInventoryUsers?.currentUser?.() || String(localStorage.getItem(CURRENT_USER_KEY) || 'Bill');
  const state = () => parse(localStorage.getItem(STORAGE_KEY),{spools:[],weighLog:[],auditLog:[]}) || {spools:[],weighLog:[],auditLog:[]};
  const core = () => globalThis.FilamentInventoryPersonal;

  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued=false; render(); });
  }

  Storage.prototype.setItem = function(key,value) {
    const result = priorSetItem.call(this,key,value);
    if (this === localStorage && (key === STORAGE_KEY || key === CURRENT_USER_KEY)) scheduleRender();
    return result;
  };

  function identity(owner) {
    const prefs = globalThis.FilamentInventoryProfileUI?.read?.();
    return {displayName:prefs?.identity?.displayName || owner};
  }

  function greeting(name) {
    const hour = new Date().getHours();
    const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    return `${part}, ${name}`;
  }

  function ensureLayout() {
    const view = $('dashboardView');
    if (!view || view.dataset.fiHome === '1') return Boolean(view);
    view.dataset.fiHome = '1';
    view.classList.add('fi-home-compact','fi-page','fi-page-dashboard');
    view.dataset.pageWidth = 'standard';
    view.innerHTML = `<div class="fi-home-dashboard">
      <section class="fi-home-intro">
        <div class="fi-home-heading-row">
          <div>
            <p class="fi-home-kicker">Workshop command center</p>
            <h2 id="dashboardTitle">Filament Inventory</h2>
            <p class="lead fi-home-subtitle">Your physical inventory, placement and next actions in one trusted view.</p>
          </div>
          <span class="fi-home-status-pill" data-home-status-pill>READY</span>
        </div>

        <div class="fi-workshop-status" data-home-status="ready">
          <div class="fi-workshop-status-copy">
            <p class="fi-home-decision-label">Workshop status</p>
            <p class="fi-home-decision" data-home-status-title></p>
            <p class="fi-home-decision-detail" data-home-status-detail></p>
          </div>
          <div class="fi-workshop-metrics" aria-label="Workshop summary">
            <div><strong data-home-metric="spools">0</strong><span>Spools</span></div>
            <div><strong data-home-metric="loaded">0</strong><span>Loaded</span></div>
            <div><strong data-home-metric="known">0 kg</strong><span>Known</span></div>
            <div><strong data-home-metric="attention">0</strong><span>Attention</span></div>
          </div>
        </div>

        <div class="fi-home-actions" aria-label="Quick actions">
          <button class="btn btn-primary" type="button" data-print-readiness>Check a print</button>
          <button class="btn" type="button" data-shell-action="scan">Scan spool</button>
          <button class="btn" id="heroAddBtn" type="button">Add spool</button>
          <button class="btn" type="button" data-home-action="weigh">Weigh spool</button>
        </div>
      </section>

      <section class="fi-home-section fi-home-attention">
        <div class="fi-home-section-head">
          <div><p class="fi-home-section-kicker">Action queue</p><h3>Workshop Inbox</h3></div>
          <span class="fi-section-count" data-home-attention-count>0</span>
        </div>
        <p class="fi-home-section-copy">Only evidence-backed exceptions appear here. Unknown stays unknown until you resolve it.</p>
        <div class="fi-home-list" id="priorityList"></div>
      </section>

      <section class="fi-home-section fi-home-secondary">
        <div class="fi-home-section-head">
          <div><p class="fi-home-section-kicker">Placement</p><h3>Loaded now</h3></div>
          <span class="fi-section-count" data-home-loaded-count>0</span>
        </div>
        <div class="fi-home-list" data-home-loaded></div>
      </section>

      <div class="fi-home-legacy-sinks" aria-hidden="true">
        <div id="metrics"></div><div id="statusBars"></div><div id="materialGrid"></div>
      </div>
    </div>`;
    return true;
  }

  function measurementLabel(spool) {
    const value = core()?.remaining(spool);
    if (!value || value.grams === null) return 'Quantity unknown';
    const percent = value.percent === null ? '' : ` · ${Math.round(value.percent)}%`;
    return `${Math.round(value.grams)} g${percent}`;
  }

  function inboxMarkup(snapshot, owner, summary) {
    if (!summary.activeCount) return `<div class="empty"><strong>No inventory yet</strong>Add or scan a spool to establish your first authoritative record.</div>`;
    const inbox = core().workshopInbox(snapshot, owner, 6);
    if (!inbox.length) return `<div class="empty"><strong>All caught up</strong>No low-stock or unknown-quantity items need attention.</div>`;
    return inbox.map(item => {
      const spool = summary.active.find(row => String(row.id) === String(item.spoolId));
      const swatch = spool?.colorHex || '#666d7d';
      const state = item.kind === 'low' ? 'danger' : 'warning';
      const chip = item.kind === 'low' ? 'LOW' : 'UNKNOWN';
      return `<div class="fi-home-row fi-inbox-row">
        <button class="fi-inbox-main" type="button" data-home-action="${esc(item.action)}" data-spool="${esc(item.spoolId)}">
          <i class="fi-spool-swatch" style="background:${esc(swatch)}"></i>
          <span class="fi-row-copy"><strong>${esc(item.title)}</strong><small>${esc(item.detail)}</small></span>
          <span class="fi-status-chip" data-state="${state}">${chip}</span>
        </button>
        <button class="btn fi-inbox-action" type="button" data-home-action="${esc(item.action)}" data-spool="${esc(item.spoolId)}">${esc(item.actionLabel)}</button>
      </div>`;
    }).join('');
  }

  function loadedMarkup(summary) {
    if (!summary.loadedSpools.length) return `<div class="empty"><strong>Nothing loaded</strong>Printer placement will appear here only after an explicit inventory load state exists.</div>`;
    return summary.loadedSpools.slice(0,4).map(spool => {
      const evidence = core().evidenceLabel(spool);
      return `<button class="fi-home-row" type="button" data-home-action="printer" data-spool="${esc(spool.id)}"><i class="fi-spool-swatch" style="background:${esc(spool.colorHex || '#666d7d')}"></i><span class="fi-row-copy"><strong>${esc(spool.material || 'Unknown material')} · ${esc(spool.colorName || 'Unknown color')}</strong><small>${esc(measurementLabel(spool))} · ${esc(evidence)} · ${esc(core().loadedLabel(spool))}</small></span><span class="fi-status-chip" data-state="success">LOADED</span></button>`;
    }).join('');
  }

  function render() {
    if (rendering || !ensureLayout() || !core()) return;
    rendering = true;
    try {
      const owner = currentUser();
      const snapshot = state();
      const summary = core().summarizeOwner(snapshot,owner);
      const status = core().workshopStatus(snapshot,owner);
      const name = identity(owner).displayName;
      const view = $('dashboardView');
      const empty = summary.activeCount === 0;
      const inbox = core().workshopInbox(snapshot,owner,99);

      view.classList.toggle('fi-home-empty',empty);
      view.dataset.empty = String(empty);
      view.dataset.homeStatus = status.state;

      const title = $('dashboardTitle');
      const statusBlock = view.querySelector('.fi-workshop-status');
      const statusPill = view.querySelector('[data-home-status-pill]');
      const statusTitle = view.querySelector('[data-home-status-title]');
      const statusDetail = view.querySelector('[data-home-status-detail]');
      const add = $('heroAddBtn');
      const print = view.querySelector('[data-print-readiness]');

      if (title) title.textContent = empty ? `${name}'s Workshop` : greeting(name);
      if (statusBlock) statusBlock.dataset.homeStatus = status.state;
      if (statusPill) statusPill.textContent = status.label;
      if (statusTitle) statusTitle.textContent = status.title;
      if (statusDetail) statusDetail.textContent = status.detail;

      const metrics = {
        spools:String(summary.activeCount),
        loaded:String(summary.loadedCount),
        known:`${(summary.knownGrams/1000).toFixed(2)} kg`,
        attention:String(inbox.length),
      };
      for (const [key,value] of Object.entries(metrics)) {
        const node = view.querySelector(`[data-home-metric="${key}"]`);
        if (node) node.textContent = value;
      }

      if (print) print.hidden = empty;
      if (add) {
        add.textContent = empty ? 'Add first spool' : 'Add spool';
        add.classList.toggle('btn-primary',empty);
      }

      const attention = view.querySelector('[data-home-attention-count]');
      const loadedCount = view.querySelector('[data-home-loaded-count]');
      const priority = $('priorityList');
      const loaded = view.querySelector('[data-home-loaded]');
      if (attention) attention.textContent = String(inbox.length);
      if (loadedCount) loadedCount.textContent = String(summary.loadedCount);
      const inboxHtml = inboxMarkup(snapshot,owner,summary);
      const loadedHtml = loadedMarkup(summary);
      if (priority && priority.innerHTML !== inboxHtml) priority.innerHTML = inboxHtml;
      if (loaded && loaded.innerHTML !== loadedHtml) loaded.innerHTML = loadedHtml;
    } finally {
      rendering = false;
    }
  }

  function navigate(view) {
    if (globalThis.FilamentInventoryNavigation?.navigate?.(view,{historyMode:'replace',focus:true})) return;
    document.querySelector(`.tab[data-view="${CSS.escape(view)}"]`)?.click();
  }

  function openInventory(id) {
    if (id && globalThis.FilamentInventoryWorkflows?.open) return globalThis.FilamentInventoryWorkflows.open(id,{source:'home'});
    navigate('inventory');
    if (!id) return;
    setTimeout(() => {
      const search = $('searchInput');
      if (search) { search.value=id; search.dispatchEvent(new Event('input',{bubbles:true})); }
    },40);
  }

  function weigh(id) {
    if (id && globalThis.FilamentInventoryWorkflows?.weigh) return globalThis.FilamentInventoryWorkflows.weigh(id);
    navigate('weigh');
    setTimeout(() => {
      const select = $('weighSpool');
      if (select && id) { select.value=id; select.dispatchEvent(new Event('change',{bubbles:true})); }
      $('grossWeight')?.focus();
    },40);
  }

  function bind() {
    document.addEventListener('click',event => {
      const row = event.target.closest('[data-home-action]');
      if (!row) return;
      const action = row.dataset.homeAction;
      const id = row.dataset.spool || '';
      if (action === 'weigh') weigh(id);
      else if (action === 'printer') navigate('household');
      else openInventory(id);
    });
    document.addEventListener('fi:navigation',event => { if (event.detail?.view === 'dashboard') scheduleRender(); });
    globalThis.FilamentInventoryEvents?.on?.('profile:preferences-changed',scheduleRender);
    globalThis.FilamentInventoryEvents?.on?.('inventory:changed',scheduleRender);
    globalThis.FilamentInventoryEvents?.on?.('measurement:saved',scheduleRender);
    window.addEventListener('storage',event => { if (event.key === STORAGE_KEY || event.key === CURRENT_USER_KEY) scheduleRender(); });
  }

  function observeLegacyWrites() {
    const dashboard = $('dashboardView');
    if (!dashboard || dashboardObserver) return;
    dashboardObserver = new MutationObserver(() => { if (!rendering) scheduleRender(); });
    const priority = $('priorityList');
    if (priority) dashboardObserver.observe(priority,{childList:true});
  }

  function init() {
    ensureLayout();
    bind();
    observeLegacyWrites();
    render();
    setTimeout(render,0);
    setTimeout(render,160);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();