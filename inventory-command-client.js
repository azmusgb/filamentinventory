(() => {
  'use strict';

  const STORAGE_KEY = 'filament-inventory-v1';
  const core = globalThis.FilamentInventoryCommand;
  if (!core) return;

  let mode = 'all';
  let gridObserver = null;
  let renderQueued = false;
  let applying = false;

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const parse = (text, fallback = null) => { try { return JSON.parse(text); } catch { return fallback; } };
  const state = () => parse(localStorage.getItem(STORAGE_KEY) || '{}', {spools:[]}) || {spools:[]};
  const currentUser = () => globalThis.FilamentInventoryUsers?.currentUser?.() || 'Bill';
  const formatKg = grams => `${(Number(grams || 0) / 1000).toFixed(2)} kg`;

  function filters() {
    return {
      search:$('searchInput')?.value || '',
      material:$('materialFilter')?.value || '',
      status:$('statusFilter')?.value || '',
      location:$('locationFilter')?.value || '',
      lifecycle:$('lifecycleFilter')?.value || 'active',
      sort:$('sortSelect')?.value || 'id',
    };
  }

  function commandMarkup(summary, counts) {
    const modes = [
      ['all','All',counts.all],
      ['reorder','Low',counts.reorder],
      ['measure','Measure',counts.measure],
      ['loaded','Loaded',counts.loaded],
      ['recent','Recent',counts.recent],
    ];
    return `<section class="inventory-command" id="inventoryCommand" aria-label="Inventory command surface">
      <div class="inventory-command-head">
        <div class="inventory-command-copy">
          <span class="eyebrow">${esc(currentUser())}'s inventory command</span>
          <strong>${summary.activeCount} active · ${formatKg(summary.knownGrams)} known</strong>
          <span>${summary.reorderCount} low · ${summary.measurementCount} need measurement · ${summary.loadedCount} loaded</span>
        </div>
        <div class="inventory-command-shortcut" aria-hidden="true"><kbd>⌘K</kbd><span>Find spool</span></div>
      </div>
      <div class="inventory-command-modes" role="group" aria-label="Quick inventory views">
        ${modes.map(([key,label,count]) => `<button class="inventory-command-mode" type="button" data-command-mode="${key}" aria-pressed="${String(mode === key)}"><span>${label}</span><strong>${count}</strong></button>`).join('')}
      </div>
      <div class="inventory-command-filters" id="inventoryCommandFilters"></div>
      <div class="inventory-command-recent" id="inventoryCommandRecent"></div>
    </section>`;
  }

  function inject() {
    if ($('inventoryCommand')) return true;
    const toolbar = document.querySelector('#inventoryView .toolbar-v3');
    if (!toolbar) return false;
    const holder = document.createElement('div');
    const summary = core.summarize(state());
    holder.innerHTML = commandMarkup(summary, core.modeCounts(state()));
    toolbar.insertAdjacentElement('beforebegin', holder.firstElementChild);
    return true;
  }

  function renderSummary() {
    const root = $('inventoryCommand');
    if (!root) return;
    const summary = core.summarize(state());
    const counts = core.modeCounts(state());
    const copy = root.querySelector('.inventory-command-copy');
    if (copy) copy.innerHTML = `<span class="eyebrow">${esc(currentUser())}'s inventory command</span><strong>${summary.activeCount} active · ${formatKg(summary.knownGrams)} known</strong><span>${summary.reorderCount} low · ${summary.measurementCount} need measurement · ${summary.loadedCount} loaded</span>`;
    root.querySelectorAll('[data-command-mode]').forEach(button => {
      const key = button.dataset.commandMode;
      button.setAttribute('aria-pressed', String(key === mode));
      const count = button.querySelector('strong');
      if (count) count.textContent = String(counts[key] ?? 0);
    });
  }

  function renderFilterTokens() {
    const holder = $('inventoryCommandFilters');
    if (!holder) return;
    const tokens = core.filterTokens(filters());
    const modeToken = mode !== 'all' ? `<button class="inventory-filter-token inventory-filter-token-mode" type="button" data-command-mode="all"><span>View</span>${esc(mode)}</button>` : '';
    const tokenHtml = tokens.map(token => `<button class="inventory-filter-token" type="button" data-clear-filter="${esc(token.key)}"><span>${esc(token.label)}</span>${esc(token.value)}<b aria-hidden="true">×</b></button>`).join('');
    holder.innerHTML = modeToken || tokenHtml ? `${modeToken}${tokenHtml}<button class="inventory-command-clear" type="button" data-command-clear-all>Clear all</button>` : '<span class="inventory-command-hint">Quick views reset detailed filters. Use the toolbar below for precise filtering.</span>';
  }

  function renderRecent() {
    const holder = $('inventoryCommandRecent');
    if (!holder) return;
    const rows = core.selectMode(state(), 'recent', 4);
    if (!rows.length) {
      holder.innerHTML = '<div class="inventory-command-empty"><strong>No spools yet.</strong><span>Add your first spool to start the command surface.</span><button class="btn btn-primary" type="button" data-command-add>Add spool</button></div>';
      return;
    }
    holder.innerHTML = `<span class="inventory-command-recent-label">Recently touched</span><div class="inventory-command-recent-list">${rows.map(spool => {
      const m = core.measurement(spool);
      const amount = m.grams === null ? 'Unknown' : `${Math.round(m.grams)} g`;
      const placement = core.isLoaded(spool) ? 'Loaded' : (spool.location || 'Stored');
      return `<article class="inventory-command-spool"><button type="button" data-command-open="${esc(spool.id)}"><i style="background:${esc(spool.colorHex || '#64748b')}"></i><span><strong>${esc(spool.id)} · ${esc(spool.colorName || 'Unknown')}</strong><small>${esc(spool.brand || 'Unknown')} · ${esc(spool.material || 'Unknown')}</small></span><b>${esc(amount)}</b></button><button class="inventory-command-weigh" type="button" data-command-weigh="${esc(spool.id)}">Weigh</button><small>${esc(placement)}</small></article>`;
    }).join('')}</div>`;
  }

  function nativeRenderTrigger() {
    const search = $('searchInput');
    if (search) search.dispatchEvent(new Event('input', {bubbles:true}));
    ['materialFilter','statusFilter','locationFilter','lifecycleFilter','sortSelect'].forEach(id => $(id)?.dispatchEvent(new Event('change', {bubbles:true})));
  }

  function resetDetailedFilters() {
    if ($('searchInput')) $('searchInput').value = '';
    if ($('materialFilter')) $('materialFilter').value = '';
    if ($('statusFilter')) $('statusFilter').value = '';
    if ($('locationFilter')) $('locationFilter').value = '';
    if ($('lifecycleFilter')) $('lifecycleFilter').value = 'active';
    if ($('sortSelect')) $('sortSelect').value = 'id';
  }

  function setMode(nextMode) {
    mode = core.MODES.includes(nextMode) ? nextMode : 'all';
    applying = true;
    resetDetailedFilters();
    if (mode === 'reorder' && $('statusFilter')) $('statusFilter').value = 'Reorder needed';
    if (mode === 'measure' && $('statusFilter')) $('statusFilter').value = 'Unknown';
    if (mode === 'recent' && $('sortSelect')) $('sortSelect').value = 'updated';
    nativeRenderTrigger();
    applying = false;
    queueRender();
  }

  function clearFilter(key) {
    const map = {search:'searchInput', material:'materialFilter', status:'statusFilter', location:'locationFilter', lifecycle:'lifecycleFilter', sort:'sortSelect'};
    const node = $(map[key]);
    if (!node) return;
    node.value = key === 'lifecycle' ? 'active' : key === 'sort' ? 'id' : '';
    node.dispatchEvent(new Event(key === 'search' ? 'input' : 'change', {bubbles:true}));
    if ((key === 'status' && ['reorder','measure'].includes(mode)) || (key === 'sort' && mode === 'recent')) mode = 'all';
    queueRender();
  }

  function applyModeToCards() {
    const grid = $('inventoryGrid');
    if (!grid) return;
    const rows = core.selectMode(state(), mode, 8);
    const allowed = new Set(rows.map(spool => String(spool.id)));
    let visible = 0;
    grid.querySelectorAll('.spool-card').forEach(card => {
      const commandScoped = mode === 'loaded' || mode === 'recent';
      card.classList.toggle('inventory-command-hidden', commandScoped && !allowed.has(String(card.dataset.id)));
      if (!card.hidden && !card.classList.contains('inventory-command-hidden')) visible++;
    });
    if ((mode === 'loaded' || mode === 'recent') && $('inventoryCountText')) {
      const summary = core.summarize(state());
      $('inventoryCountText').textContent = `${visible} shown · ${summary.activeCount} active · command view: ${mode}`;
    }
  }

  function focusSearch() {
    document.querySelector('.tab[data-view="inventory"]')?.click();
    setTimeout(() => {
      const search = $('searchInput');
      search?.focus({preventScroll:false});
      search?.select();
    }, 40);
  }

  function focusSpool(id) {
    document.querySelector('.tab[data-view="inventory"]')?.click();
    setTimeout(() => {
      mode = 'all';
      resetDetailedFilters();
      if ($('lifecycleFilter')) $('lifecycleFilter').value = 'all';
      if ($('searchInput')) $('searchInput').value = id;
      nativeRenderTrigger();
      setTimeout(() => document.querySelector(`#inventoryGrid .spool-card[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({behavior:'smooth', block:'center'}), 40);
      queueRender();
    }, 20);
  }

  function weighSpool(id) {
    mode = 'all';
    resetDetailedFilters();
    if ($('searchInput')) $('searchInput').value = id;
    nativeRenderTrigger();
    setTimeout(() => {
      const button = [...document.querySelectorAll('#inventoryGrid [data-action="weigh"]')].find(node => node.dataset.id === id);
      if (button) button.click();
      else focusSpool(id);
    }, 40);
  }

  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      if (!inject()) return;
      renderSummary();
      renderFilterTokens();
      renderRecent();
      applyModeToCards();
    });
  }

  function bind() {
    document.addEventListener('click', event => {
      const modeButton = event.target.closest('[data-command-mode]');
      if (modeButton) { setMode(modeButton.dataset.commandMode); return; }
      const clear = event.target.closest('[data-clear-filter]');
      if (clear) { clearFilter(clear.dataset.clearFilter); return; }
      if (event.target.closest('[data-command-clear-all]')) { mode = 'all'; resetDetailedFilters(); nativeRenderTrigger(); queueRender(); return; }
      if (event.target.closest('[data-command-add]')) { $('inventoryAddBtn')?.click(); return; }
      const open = event.target.closest('[data-command-open]');
      if (open) { focusSpool(open.dataset.commandOpen); return; }
      const weigh = event.target.closest('[data-command-weigh]');
      if (weigh) { weighSpool(weigh.dataset.commandWeigh); }
    });

    ['searchInput','materialFilter','statusFilter','locationFilter','lifecycleFilter','sortSelect'].forEach(id => {
      const node = $(id);
      if (!node) return;
      node.addEventListener(id === 'searchInput' ? 'input' : 'change', () => {
        if (!applying && mode !== 'loaded' && mode !== 'recent') {
          if (id === 'statusFilter' && mode === 'reorder' && node.value !== 'Reorder needed') mode = 'all';
          if (id === 'statusFilter' && mode === 'measure' && node.value !== 'Unknown') mode = 'all';
        }
        queueRender();
      });
    });

    document.addEventListener('keydown', event => {
      const typing = event.target instanceof HTMLElement && (event.target.matches('input, textarea, select') || event.target.isContentEditable);
      const commandFind = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      const slashFind = event.key === '/' && !typing && !event.metaKey && !event.ctrlKey && !event.altKey;
      if (commandFind || slashFind) { event.preventDefault(); focusSearch(); return; }
      if (event.key === 'Escape' && document.activeElement === $('searchInput') && $('searchInput')?.value) {
        $('searchInput').value = '';
        $('searchInput').dispatchEvent(new Event('input', {bubbles:true}));
      }
    });

    window.addEventListener('storage', event => { if (event.key === STORAGE_KEY) queueRender(); });
  }

  function watchGrid() {
    const grid = $('inventoryGrid');
    if (!grid || gridObserver) return;
    gridObserver = new MutationObserver(queueRender);
    gridObserver.observe(grid, {childList:true, subtree:false});
  }

  function init() {
    inject();
    bind();
    watchGrid();
    queueRender();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
