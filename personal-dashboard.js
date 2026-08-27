(() => {
  'use strict';

  const STORAGE_KEY = 'filament-inventory-v1';
  const CURRENT_USER_KEY = 'filament-current-user-v1';
  const priorGetItem = Storage.prototype.getItem;
  const priorSetItem = Storage.prototype.setItem;
  let renderQueued = false;

  const parse = (value, fallback = null) => { try { return JSON.parse(value); } catch { return fallback; } };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const currentUser = () => ['Bill','Aimee'].includes(String(priorGetItem.call(localStorage, CURRENT_USER_KEY))) ? String(priorGetItem.call(localStorage, CURRENT_USER_KEY)) : 'Bill';
  const state = () => parse(priorGetItem.call(localStorage, STORAGE_KEY), {spools:[],weighLog:[],auditLog:[]}) || {spools:[],weighLog:[],auditLog:[]};
  const api = () => globalThis.FilamentInventoryPersonal;

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

  function injectStyles() {
    if (document.getElementById('personalCommandStyles')) return;
    const style = document.createElement('style');
    style.id = 'personalCommandStyles';
    style.textContent = `
      .personal-command{position:relative;overflow:hidden;margin:16px 0;padding:0}.personal-command::before{content:"";position:absolute;inset:-80px auto auto -80px;width:280px;height:280px;border-radius:50%;background:color-mix(in srgb,var(--ux-accent,var(--cyan)) 12%,transparent);filter:blur(22px);pointer-events:none}.personal-head{position:relative;display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:20px 20px 16px;border-bottom:1px solid var(--line)}.personal-title h3{margin:5px 0 4px;font-size:24px;letter-spacing:-.035em}.personal-profile{display:flex;align-items:center;gap:9px;color:var(--muted);font-size:11px;white-space:nowrap}.personal-profile .select{min-width:118px}.personal-metrics{position:relative;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;padding:16px 20px}.personal-metric{padding:13px;border:1px solid var(--line);border-radius:14px;background:rgba(3,10,18,.24)}.personal-metric span{display:block;color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.07em}.personal-metric strong{display:block;margin-top:5px;font-size:20px}.personal-layout{position:relative;display:grid;grid-template-columns:1.15fr .85fr;gap:14px;padding:0 20px 20px}.personal-block{padding:14px;border:1px solid var(--line);border-radius:15px;background:rgba(3,10,18,.2)}.personal-block-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.personal-block-head h4{margin:0;font-size:12px}.personal-block-head span{color:var(--muted);font-size:9px}.personal-actions,.personal-loaded,.personal-activity{display:grid;gap:7px}.personal-action{display:grid;grid-template-columns:10px minmax(0,1fr) auto;gap:9px;align-items:center;padding:9px 10px;border:1px solid var(--line);border-radius:12px;background:rgba(3,10,18,.25)}.personal-action-dot{width:8px;height:8px;border-radius:50%;background:var(--ux-accent,var(--cyan))}.personal-action[data-kind="reorder"] .personal-action-dot{background:#fb7185}.personal-action[data-kind="measure"] .personal-action-dot{background:#f59e0b}.personal-action[data-kind="loaded"] .personal-action-dot{background:#84cc16}.personal-action strong,.personal-loaded strong,.personal-activity strong{display:block;font-size:10px;line-height:1.4}.personal-action small,.personal-loaded small,.personal-activity small{display:block;margin-top:2px;color:var(--muted);font-size:9px;line-height:1.4}.personal-action .btn{min-height:30px;padding:5px 8px;font-size:9px}.personal-mini-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.personal-loaded>div,.personal-activity>div{padding:9px 10px;border:1px solid var(--line);border-radius:12px;background:rgba(3,10,18,.2)}.personal-empty{padding:15px;border:1px dashed var(--line);border-radius:12px;color:var(--muted);font-size:10px;text-align:center}.personal-footer{display:flex;gap:8px;flex-wrap:wrap;padding:0 20px 20px}.personal-footer .btn{flex:1;min-width:130px}.personal-reorder{color:#fb7185}.personal-unknown{color:#f59e0b}.personal-loaded-value{color:#bef264}
      @media(max-width:980px){.personal-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.personal-layout{grid-template-columns:1fr}.personal-mini-grid{grid-template-columns:1fr 1fr}}
      @media(max-width:650px){.personal-head{flex-direction:column}.personal-profile{width:100%;justify-content:space-between}.personal-profile .select{flex:1}.personal-metrics{grid-template-columns:1fr 1fr}.personal-layout{padding-left:14px;padding-right:14px}.personal-head,.personal-metrics{padding-left:14px;padding-right:14px}.personal-footer{padding-left:14px;padding-right:14px}.personal-mini-grid{grid-template-columns:1fr}.personal-action{grid-template-columns:9px 1fr}.personal-action .btn{grid-column:2}.personal-footer .btn{min-width:100%}}
    `;
    document.head.appendChild(style);
  }

  function injectPanel() {
    if (document.getElementById('personalCommandCenter')) return;
    const hero = document.querySelector('#dashboardView .hero');
    if (!hero) return;
    const panel = document.createElement('section');
    panel.className = 'panel personal-command';
    panel.id = 'personalCommandCenter';
    panel.setAttribute('aria-labelledby','personalCommandTitle');
    panel.innerHTML = `
      <div class="personal-head"><div class="personal-title"><span class="eyebrow">Personal command center</span><h3 id="personalCommandTitle">Your filament focus.</h3><p class="muted" id="personalCommandSubtitle">Shared household inventory, prioritized for the current profile.</p></div><label class="personal-profile">Working as <select class="select" id="personalUser"><option>Bill</option><option>Aimee</option></select></label></div>
      <div class="personal-metrics" id="personalMetrics"></div>
      <div class="personal-layout"><section class="personal-block"><div class="personal-block-head"><h4>Next moves</h4><span id="personalAttentionLabel"></span></div><div class="personal-actions" id="personalActions"></div></section><div class="personal-mini-grid"><section class="personal-block"><div class="personal-block-head"><h4>Loaded now</h4><span>Printer / AMS</span></div><div class="personal-loaded" id="personalLoaded"></div></section><section class="personal-block"><div class="personal-block-head"><h4>Recent for you</h4><span>Shared activity</span></div><div class="personal-activity" id="personalActivity"></div></section></div></div>
      <div class="personal-footer"><button class="btn btn-primary" id="personalInventoryBtn" type="button">My inventory</button><button class="btn" id="personalWeighBtn" type="button">Weigh next</button><button class="btn" id="personalAddBtn" type="button">Add my spool</button><button class="btn btn-ghost" id="personalHouseholdBtn" type="button">Printer / AMS</button></div>`;
    hero.insertAdjacentElement('afterend', panel);
  }

  const formatKg = grams => grams > 0 ? `${(grams / 1000).toFixed(2)} kg` : '0 kg';
  const relative = value => {
    const at = Date.parse(String(value || ''));
    if (!Number.isFinite(at)) return '';
    const mins = Math.floor((Date.now() - at) / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };

  function renderMetrics(summary) {
    const values = [
      ['My active spools',summary.activeCount,''],
      ['Known filament',formatKg(summary.knownGrams),''],
      ['Loaded',summary.loadedCount,'personal-loaded-value'],
      ['Reorder',summary.reorderCount,'personal-reorder'],
      ['Needs measurement',summary.unknownCount,'personal-unknown'],
    ];
    const el = document.getElementById('personalMetrics');
    if (el) el.innerHTML = values.map(([label,value,className]) => `<div class="personal-metric"><span>${esc(label)}</span><strong class="${className}">${esc(value)}</strong></div>`).join('');
  }

  function renderActions(summary) {
    const actions = api()?.recommendedActions(state(), summary.owner) || [];
    const el = document.getElementById('personalActions');
    const label = document.getElementById('personalAttentionLabel');
    const attention = summary.reorderCount + summary.unknownCount;
    if (label) label.textContent = attention ? `${attention} item${attention === 1 ? '' : 's'} need attention` : 'No urgent items';
    if (!el) return;
    el.innerHTML = actions.map(action => `<div class="personal-action" data-kind="${esc(action.kind)}"><span class="personal-action-dot"></span><div><strong>${esc(action.title)}</strong><small>${esc(action.detail)}</small></div><button class="btn" type="button" data-personal-action="${esc(action.view)}" data-spool="${esc(action.spoolId)}">Open</button></div>`).join('');
  }

  function renderLoaded(summary) {
    const el = document.getElementById('personalLoaded');
    if (!el) return;
    if (!summary.loadedSpools.length) { el.innerHTML = '<div class="personal-empty">Nothing loaded for this profile.</div>'; return; }
    el.innerHTML = summary.loadedSpools.slice(0,4).map(spool => {
      const rem = api().remaining(spool);
      return `<div><strong>${esc(spool.id)} · ${esc(spool.material || 'Unknown')} · ${esc(spool.colorName || 'Unknown')}</strong><small>${esc(api().loadedLabel(spool))}${rem.grams === null ? ' · amount unknown' : ` · ${Math.round(rem.grams)} g`}</small></div>`;
    }).join('');
  }

  function renderActivity(owner) {
    const el = document.getElementById('personalActivity');
    if (!el) return;
    const rows = api()?.recentActivity(state(), owner, 4) || [];
    if (!rows.length) { el.innerHTML = '<div class="personal-empty">No profile-specific activity yet.</div>'; return; }
    el.innerHTML = rows.map(row => `<div><strong>${esc(row.summary)}</strong><small>${esc(row.actor || owner)}${row.device ? ` · ${esc(row.device)}` : ''}${row.at ? ` · ${esc(relative(row.at))}` : ''}</small></div>`).join('');
  }

  function render() {
    const core = api();
    if (!core || !document.getElementById('personalCommandCenter')) return;
    const owner = currentUser();
    const summary = core.summarizeOwner(state(), owner);
    const select = document.getElementById('personalUser');
    if (select && select.value !== owner) select.value = owner;
    const title = document.getElementById('personalCommandTitle');
    if (title) title.textContent = `${owner}'s filament command center.`;
    const subtitle = document.getElementById('personalCommandSubtitle');
    if (subtitle) subtitle.textContent = `${summary.activeCount} active spool${summary.activeCount === 1 ? '' : 's'} · ${formatKg(summary.knownGrams)} known · shared household data, personal priorities.`;
    renderMetrics(summary);
    renderActions(summary);
    renderLoaded(summary);
    renderActivity(owner);
    const weigh = document.getElementById('personalWeighBtn');
    if (weigh) weigh.disabled = !summary.activeCount;
  }

  function switchProfile(owner) {
    if (!['Bill','Aimee'].includes(owner) || owner === currentUser()) return;
    const householdSelect = document.getElementById('currentUserV8');
    if (householdSelect) {
      householdSelect.value = owner;
      householdSelect.dispatchEvent(new Event('change',{bubbles:true}));
    } else {
      localStorage.setItem(CURRENT_USER_KEY, owner);
    }
    scheduleRender();
  }

  function openInventory(owner = currentUser(), spoolId = '') {
    document.querySelector('.tab[data-view="inventory"]')?.click();
    setTimeout(() => {
      const ownerFilter = document.getElementById('ownerFilterV8');
      const lifecycle = document.getElementById('lifecycleFilter');
      const search = document.getElementById('searchInput');
      if (ownerFilter) { ownerFilter.value = owner; ownerFilter.dispatchEvent(new Event('change',{bubbles:true})); }
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

  function openHousehold() { document.querySelector('.tab[data-view="household"]')?.click(); }
  function addSpool() { const button = document.getElementById('addTopBtn') || document.getElementById('heroAddBtn'); button?.click(); }

  function handleAction(view, spoolId) {
    if (view === 'weigh') return openWeigh(spoolId);
    if (view === 'household') return openHousehold();
    return openInventory(currentUser(), spoolId);
  }

  function bind() {
    document.getElementById('personalUser')?.addEventListener('change', event => switchProfile(event.target.value));
    document.getElementById('personalInventoryBtn')?.addEventListener('click', () => openInventory());
    document.getElementById('personalWeighBtn')?.addEventListener('click', () => openWeigh());
    document.getElementById('personalAddBtn')?.addEventListener('click', addSpool);
    document.getElementById('personalHouseholdBtn')?.addEventListener('click', openHousehold);
    document.getElementById('personalActions')?.addEventListener('click', event => {
      const button = event.target.closest('[data-personal-action]');
      if (button) handleAction(button.dataset.personalAction, button.dataset.spool || '');
    });
    document.getElementById('currentUserV8')?.addEventListener('change', () => setTimeout(render, 0));
    document.addEventListener('click', event => { if (event.target.closest('.tab[data-view="dashboard"]')) setTimeout(render,0); });
    window.addEventListener('storage', event => { if (event.key === STORAGE_KEY || event.key === CURRENT_USER_KEY) render(); });
  }

  function init() {
    injectStyles();
    injectPanel();
    bind();
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();