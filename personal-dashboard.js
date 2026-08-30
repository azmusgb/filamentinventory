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
        <h2 id="dashboardTitle">Filament Inventory</h2>
        <p class="fi-home-decision-label" data-home-decision-label>Next decision</p>
        <p class="lead fi-home-decision" data-home-decision></p>
        <p class="fi-home-decision-detail" data-home-decision-detail></p>
        <p class="fi-home-summary" data-home-summary></p>
        <div class="fi-home-actions">
          <button class="btn btn-primary" type="button" data-home-next-action hidden></button>
          <button class="btn" type="button" data-print-readiness>Can I print this?</button>
          <button class="btn" id="heroAddBtn" type="button">+ Add spool</button>
          <button class="btn fi-home-scan-empty" type="button" data-shell-action="scan">Scan spool</button>
        </div>
      </section>
      <section class="fi-home-section fi-home-attention">
        <div class="fi-home-section-head"><h3>Needs attention</h3><span class="fi-section-count" data-home-attention-count>0</span></div>
        <div class="fi-home-list" id="priorityList"></div>
      </section>
      <section class="fi-home-section fi-home-secondary">
        <div class="fi-home-section-head"><h3>Loaded now</h3><span class="fi-section-count" data-home-loaded-count>0</span></div>
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
    if (!value || value.grams === null) return 'Amount unknown';
    return `${Math.round(value.grams)} g · ${Math.round(value.percent ?? 0)}%`;
  }

  function attentionMarkup(summary) {
    if (!summary.activeCount) return `<div class="empty"><strong>No spools yet</strong>Add or scan your first spool to begin.</div>`;
    const rows = [];
    summary.reorder.slice().sort((a,b) => (core().remaining(a).grams ?? Infinity) - (core().remaining(b).grams ?? Infinity)).slice(0,2).forEach(spool => {
      rows.push({spool,state:'danger',chip:'LOW',detail:`${measurementLabel(spool)} · ${spool.location || 'No location'}`,action:'open'});
    });
    const used = new Set(rows.map(row => String(row.spool.id)));
    summary.needsMeasurement.filter(spool => !used.has(String(spool.id))).slice(0,Math.max(0,3-rows.length)).forEach(spool => {
      rows.push({spool,state:'warning',chip:'MEASURE',detail:`Amount unknown · ${spool.location || 'No location'}`,action:'weigh'});
    });
    if (!rows.length) return `<div class="empty"><strong>All caught up</strong>No low-stock or unknown-quantity spools need attention.</div>`;
    return rows.map(({spool,state,chip,detail,action}) => `<button class="fi-home-row" type="button" data-home-action="${action}" data-spool="${esc(spool.id)}"><i class="fi-spool-swatch" style="background:${esc(spool.colorHex || '#666d7d')}"></i><span class="fi-row-copy"><strong>${esc(spool.material || 'Unknown')} · ${esc(spool.colorName || 'Unknown')}</strong><small>${esc(spool.id)} · ${esc(detail)}</small></span><span class="fi-status-chip" data-state="${state}">${chip}</span></button>`).join('');
  }

  function loadedMarkup(summary) {
    if (!summary.loadedSpools.length) return `<div class="empty"><strong>Nothing loaded</strong>Load a spool from Printer when you are ready to print.</div>`;
    return summary.loadedSpools.slice(0,4).map(spool => `<button class="fi-home-row" type="button" data-home-action="printer" data-spool="${esc(spool.id)}"><i class="fi-spool-swatch" style="background:${esc(spool.colorHex || '#666d7d')}"></i><span class="fi-row-copy"><strong>${esc(spool.material || 'Unknown')} · ${esc(spool.colorName || 'Unknown')}</strong><small>${esc(spool.id)} · ${esc(measurementLabel(spool))} · ${esc(core().loadedLabel(spool))}</small></span><span class="fi-status-chip" data-state="success">LOADED</span></button>`).join('');
  }

  function decisionModel(snapshot, owner, summary) {
    if (!summary.activeCount) {
      return {
        label:'Start here',
        title:'Add or scan your first spool.',
        detail:'Start with brand, material, color and location. Add quantity evidence only when it is useful.',
        action:'',
        actionLabel:'',
        spoolId:'',
      };
    }

    const next = core()?.recommendedActions?.(snapshot,owner)?.[0] || {kind:'healthy',title:'Your inventory is in good shape',detail:'No urgent inventory work is waiting.',spoolId:''};
    if (next.kind === 'reorder') {
      return {label:'Next decision', title:next.title, detail:`${next.detail}. Review the lowest spool before the next print.`, action:'open', actionLabel:'Review low spool', spoolId:next.spoolId || ''};
    }
    if (next.kind === 'measure') {
      return {label:'Next decision', title:next.title, detail:`${next.detail}. A scale reading will replace uncertainty with measured evidence.`, action:'weigh', actionLabel:'Measure next spool', spoolId:next.spoolId || ''};
    }
    if (next.kind === 'loaded') {
      return {label:'Ready state', title:next.title, detail:`${next.detail}. Check print readiness when you know what the next job needs.`, action:'', actionLabel:'', spoolId:next.spoolId || ''};
    }
    return {label:'Status', title:next.title, detail:'No low-stock or unknown-quantity spool needs attention. Check print readiness or add inventory when needed.', action:'', actionLabel:'', spoolId:''};
  }

  function render() {
    if (rendering || !ensureLayout() || !core()) return;
    rendering = true;
    try {
      const owner = currentUser();
      const snapshot = state();
      const summary = core().summarizeOwner(snapshot,owner);
      const name = identity(owner).displayName;
      const view = $('dashboardView');
      const empty = summary.activeCount === 0;
      const decision = decisionModel(snapshot,owner,summary);
      view.classList.toggle('fi-home-empty',empty);
      view.dataset.empty = String(empty);
      view.dataset.homeDecision = decision.action || (empty ? 'empty' : 'ready');

      const title = $('dashboardTitle');
      const decisionLabel = view.querySelector('[data-home-decision-label]');
      const decisionCopy = view.querySelector('[data-home-decision]');
      const decisionDetail = view.querySelector('[data-home-decision-detail]');
      const summaryCopy = view.querySelector('[data-home-summary]');
      const nextAction = view.querySelector('[data-home-next-action]');
      const add = $('heroAddBtn');
      const scan = view.querySelector('.fi-home-scan-empty');
      const print = view.querySelector('[data-print-readiness]');

      if (title) title.textContent = empty ? `${name}'s Inventory` : greeting(name);
      if (decisionLabel) decisionLabel.textContent = decision.label;
      if (decisionCopy) decisionCopy.textContent = decision.title;
      if (decisionDetail) decisionDetail.textContent = decision.detail;
      if (summaryCopy) {
        summaryCopy.hidden = empty;
        summaryCopy.textContent = empty ? '' : `${summary.activeCount} active · ${(summary.knownGrams/1000).toFixed(2)} kg known · ${summary.loadedCount} loaded`;
      }

      const hasNextAction = !empty && Boolean(decision.action && decision.actionLabel);
      if (nextAction) {
        nextAction.hidden = !hasNextAction;
        nextAction.textContent = decision.actionLabel;
        if (hasNextAction) {
          nextAction.dataset.homeAction = decision.action;
          nextAction.dataset.spool = decision.spoolId;
        } else {
          delete nextAction.dataset.homeAction;
          delete nextAction.dataset.spool;
        }
      }
      if (print) {
        print.hidden = empty;
        print.classList.toggle('btn-primary',!empty && !hasNextAction);
      }
      if (add) {
        add.textContent = empty ? '+ Add first spool' : '+ Add spool';
        add.classList.toggle('btn-primary',empty);
      }
      if (scan) scan.hidden = !empty;

      const attentionCount = summary.reorderCount + summary.unknownCount;
      const attention = view.querySelector('[data-home-attention-count]');
      const loadedCount = view.querySelector('[data-home-loaded-count]');
      const priority = $('priorityList');
      const loaded = view.querySelector('[data-home-loaded]');
      if (attention) attention.textContent = String(attentionCount);
      if (loadedCount) loadedCount.textContent = String(summary.loadedCount);
      const attentionHtml = attentionMarkup(summary);
      const loadedHtml = loadedMarkup(summary);
      if (priority && priority.innerHTML !== attentionHtml) priority.innerHTML = attentionHtml;
      if (loaded && loaded.innerHTML !== loadedHtml) loaded.innerHTML = loadedHtml;
      view.querySelector('.fi-home-attention')?.toggleAttribute('hidden',empty);
      view.querySelector('.fi-home-secondary')?.toggleAttribute('hidden',empty);
    } finally {
      rendering = false;
    }
  }

  function navigate(view) {
    if (globalThis.FilamentInventoryNavigation?.navigate?.(view,{historyMode:'replace',focus:true})) return;
    document.querySelector(`.tab[data-view="${CSS.escape(view)}"]`)?.click();
  }

  function openInventory(id) {
    if (globalThis.FilamentInventoryWorkflows?.open) return globalThis.FilamentInventoryWorkflows.open(id,{source:'home'});
    navigate('inventory');
    setTimeout(() => {
      const search = $('searchInput');
      if (search) { search.value=id; search.dispatchEvent(new Event('input',{bubbles:true})); }
    },40);
  }

  function weigh(id) {
    if (globalThis.FilamentInventoryWorkflows?.weigh) return globalThis.FilamentInventoryWorkflows.weigh(id);
    navigate('weigh');
    setTimeout(() => {
      const select = $('weighSpool');
      if (select) { select.value=id; select.dispatchEvent(new Event('change',{bubbles:true})); }
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
