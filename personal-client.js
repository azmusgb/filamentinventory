(() => {
  'use strict';

  const STORAGE_KEY = 'filament-inventory-v1';
  const CURRENT_USER_KEY = 'filament-current-user-v1';
  const OWNERS = ['Bill','Aimee'];
  let renderQueued = false;

  const parse = (value, fallback = null) => { try { return JSON.parse(value); } catch { return fallback; } };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text = value => String(value ?? '').trim();
  const currentUser = () => OWNERS.includes(localStorage.getItem(CURRENT_USER_KEY)) ? localStorage.getItem(CURRENT_USER_KEY) : 'Bill';
  const state = () => parse(localStorage.getItem(STORAGE_KEY), {spools:[], auditLog:[]}) || {spools:[], auditLog:[]};
  const api = () => globalThis.FilamentInventoryPersonal;

  function relative(value) {
    const at = Date.parse(String(value || ''));
    if (!Number.isFinite(at)) return 'Unknown time';
    const mins = Math.max(0, Math.floor((Date.now() - at) / 60000));
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(at).toLocaleDateString();
  }

  function formatMass(grams) {
    const value = Number(grams) || 0;
    return value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 1 : 2)} kg` : `${Math.round(value)} g`;
  }

  function injectStyles() {
    if (document.getElementById('personalCommandStyles')) return;
    const style = document.createElement('style');
    style.id = 'personalCommandStyles';
    style.textContent = `
      .personal-command{margin-bottom:18px;overflow:hidden;position:relative;background:linear-gradient(145deg,color-mix(in srgb,var(--ux-accent,#22d3ee) 11%,var(--panel)),var(--panel))!important}
      .personal-command::before{content:"";position:absolute;inset:-90px auto auto -70px;width:260px;height:260px;border-radius:50%;background:color-mix(in srgb,var(--ux-accent,#22d3ee) 12%,transparent);filter:blur(22px);pointer-events:none}
      .personal-head{position:relative;display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:16px}.personal-head h2{margin:5px 0 5px;font-size:clamp(27px,4vw,39px);letter-spacing:-.05em}.personal-head p{margin:0;max-width:720px;line-height:1.55}.personal-profile{display:flex;align-items:center;gap:8px;min-width:160px}.personal-profile .select{min-width:122px}
      .personal-metrics{position:relative;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.personal-metric{padding:13px 14px;border:1px solid var(--line);border-radius:15px;background:color-mix(in srgb,var(--panel2) 84%,transparent);min-width:0}.personal-metric span{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.09em;font-weight:800}.personal-metric strong{display:block;margin-top:6px;font-size:23px;letter-spacing:-.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.personal-metric[data-alert="true"] strong{color:#fb923c}
      .personal-grid{position:relative;display:grid;grid-template-columns:1.05fr 1fr 1fr;gap:12px;margin-top:12px}.personal-card{border:1px solid var(--line);border-radius:16px;background:color-mix(in srgb,var(--panel2) 80%,transparent);padding:15px;min-width:0}.personal-card-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px}.personal-card h3{margin:0;font-size:14px}.personal-card-sub{color:var(--muted);font-size:11px}
      .personal-list{display:grid;gap:8px}.personal-row{display:flex;gap:10px;align-items:center;width:100%;padding:10px 11px;border:1px solid var(--line);border-radius:13px;background:rgba(3,10,18,.2);text-align:left;color:var(--text)}button.personal-row{cursor:pointer}.personal-row:hover{border-color:var(--line-strong)}.personal-row-main{min-width:0;flex:1}.personal-row strong{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.personal-row span{display:block;color:var(--muted);font-size:10px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.personal-kind{width:8px;height:8px;border-radius:999px;background:var(--ux-accent,#22d3ee);box-shadow:0 0 0 4px color-mix(in srgb,var(--ux-accent,#22d3ee) 12%,transparent);flex:none}.personal-kind[data-kind="reorder"]{background:#fb923c}.personal-kind[data-kind="measure"]{background:#60a5fa}.personal-kind[data-kind="loaded"]{background:#a78bfa}.personal-kind[data-kind="healthy"]{background:#84cc16}.personal-empty{padding:17px 12px;text-align:center;color:var(--muted);font-size:11px;border:1px dashed var(--line);border-radius:13px}.personal-view-btn{font-size:10px;padding:6px 8px;min-height:auto}
      @media(max-width:1050px){.personal-metrics{grid-template-columns:repeat(3,1fr)}.personal-grid{grid-template-columns:1fr 1fr}.personal-grid>.personal-card:last-child{grid-column:1/-1}}
      @media(max-width:720px){.personal-head{flex-direction:column}.personal-profile{width:100%}.personal-profile .select{flex:1}.personal-metrics{grid-template-columns:repeat(2,1fr)}.personal-grid{grid-template-columns:1fr}.personal-grid>.personal-card:last-child{grid-column:auto}.personal-metric:first-child{grid-column:1/-1}}
    `;
    document.head.appendChild(style);
  }

  function injectView() {
    const dashboard = document.getElementById('dashboardView');
    if (!dashboard || document.getElementById('personalCommandCenter')) return;
    const section = document.createElement('section');
    section.id = 'personalCommandCenter';
    section.className = 'panel personal-command';
    section.setAttribute('aria-labelledby','personalCommandTitle');
    section.innerHTML = `
      <div class="personal-head">
        <div><span class="eyebrow">Personal command center</span><h2 id="personalCommandTitle">Your filament workspace</h2><p class="muted" id="personalCommandSubtitle">Shared inventory, prioritized for the person using this device.</p></div>
        <label class="personal-profile"><span class="sr-only">Current profile</span><select class="select" id="personalCommandOwner"><option>Bill</option><option>Aimee</option></select></label>
      </div>
      <div class="personal-metrics" id="personalMetrics"></div>
      <div class="personal-grid">
        <section class="personal-card"><div class="personal-card-head"><div><h3>Do next</h3><div class="personal-card-sub">Highest-value actions for this profile.</div></div></div><div class="personal-list" id="personalActions"></div></section>
        <section class="personal-card"><div class="personal-card-head"><div><h3>Loaded now</h3><div class="personal-card-sub">Printer and AMS assignments.</div></div><button type="button" class="btn personal-view-btn" data-personal-view="household">Manage</button></div><div class="personal-list" id="personalLoaded"></div></section>
        <section class="personal-card"><div class="personal-card-head"><div><h3>My recent activity</h3><div class="personal-card-sub">Changes involving this profile.</div></div><button type="button" class="btn personal-view-btn" data-personal-view="history">History</button></div><div class="personal-list" id="personalActivity"></div></section>
      </div>`;
    dashboard.insertBefore(section, dashboard.firstChild);
  }

  function metric(label, value, alert = false) {
    return `<article class="personal-metric" data-alert="${alert}"><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`;
  }

  function switchView(view) {
    document.querySelector(`.tab[data-view="${CSS.escape(view)}"]`)?.click();
  }

  function setOwner(owner) {
    if (!OWNERS.includes(owner)) return;
    const selector = document.getElementById('currentUserV8');
    if (selector) {
      selector.value = owner;
      selector.dispatchEvent(new Event('change',{bubbles:true}));
    } else {
      localStorage.setItem(CURRENT_USER_KEY, owner);
      render();
    }
  }

  function openSpool(id, view = 'inventory') {
    if (view === 'weigh') {
      switchView('weigh');
      setTimeout(() => {
        const select = document.getElementById('weighSpool');
        if (select && [...select.options].some(option => option.value === id)) {
          select.value = id;
          select.dispatchEvent(new Event('change',{bubbles:true}));
        }
      }, 70);
      return;
    }
    if (view === 'household') {
      switchView('household');
      return;
    }
    switchView('inventory');
    setTimeout(() => {
      const ownerFilter = document.getElementById('ownerFilterV8');
      if (ownerFilter) { ownerFilter.value = currentUser(); ownerFilter.dispatchEvent(new Event('change',{bubbles:true})); }
      const search = document.getElementById('searchInput');
      if (search) { search.value = id; search.dispatchEvent(new Event('input',{bubbles:true})); }
      setTimeout(() => document.querySelector(`.spool-card[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({behavior:'smooth',block:'center'}), 80);
    }, 60);
  }

  function renderActions(rows) {
    const el = document.getElementById('personalActions');
    if (!el) return;
    el.innerHTML = rows.map(row => `<button class="personal-row" type="button" data-personal-spool="${esc(row.spoolId)}" data-personal-target="${esc(row.view)}"><span class="personal-kind" data-kind="${esc(row.kind)}"></span><span class="personal-row-main"><strong>${esc(row.title)}</strong><span>${esc(row.detail)}</span></span></button>`).join('');
  }

  function renderLoaded(rows, personalApi) {
    const el = document.getElementById('personalLoaded');
    if (!el) return;
    if (!rows.length) { el.innerHTML = '<div class="personal-empty">No spools are assigned to a printer or AMS for this profile.</div>'; return; }
    el.innerHTML = rows.map(spool => {
      const remaining = personalApi.remaining(spool);
      const amount = remaining.grams === null ? 'quantity unknown' : `${Math.round(remaining.grams)} g`;
      return `<button class="personal-row" type="button" data-personal-spool="${esc(spool.id)}" data-personal-target="inventory"><span class="personal-kind" data-kind="loaded"></span><span class="personal-row-main"><strong>${esc(spool.id)} · ${esc(spool.colorName || spool.material || 'Filament')}</strong><span>${esc(personalApi.loadedLabel(spool))} · ${esc(amount)}</span></span></button>`;
    }).join('');
  }

  function renderActivity(rows) {
    const el = document.getElementById('personalActivity');
    if (!el) return;
    if (!rows.length) { el.innerHTML = '<div class="personal-empty">No profile-specific activity has been recorded yet.</div>'; return; }
    el.innerHTML = rows.map(row => `<div class="personal-row"><span class="personal-kind"></span><span class="personal-row-main"><strong>${esc(row.summary || row.type || 'Inventory change')}</strong><span>${esc(row.spoolId || 'Household')} · ${esc(relative(row.at))}</span></span></div>`).join('');
  }

  function render() {
    const personalApi = api();
    if (!personalApi) return;
    const owner = currentUser();
    const snapshot = state();
    const summary = personalApi.summarizeOwner(snapshot, owner);
    const actions = personalApi.recommendedActions(snapshot, owner);
    const activity = personalApi.recentActivity(snapshot, owner, 5);

    const title = document.getElementById('personalCommandTitle');
    const subtitle = document.getElementById('personalCommandSubtitle');
    const selector = document.getElementById('personalCommandOwner');
    if (title) title.textContent = `${owner}'s filament command center`;
    if (subtitle) subtitle.textContent = summary.activeCount ? `Focused on ${summary.activeCount} active ${owner} spool${summary.activeCount === 1 ? '' : 's'} while preserving the shared household inventory.` : `No active spools are assigned to ${owner} yet. Shared household inventory remains available.`;
    if (selector && selector.value !== owner) selector.value = owner;

    const metrics = document.getElementById('personalMetrics');
    if (metrics) metrics.innerHTML = [
      metric('Known filament', formatMass(summary.knownGrams)),
      metric('Active spools', summary.activeCount),
      metric('Loaded', summary.loadedCount),
      metric('Reorder', summary.reorderCount, summary.reorderCount > 0),
      metric('Needs measurement', summary.unknownCount, summary.unknownCount > 0),
    ].join('');

    renderActions(actions);
    renderLoaded(summary.loadedSpools, personalApi);
    renderActivity(activity);
  }

  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    queueMicrotask(() => { renderQueued = false; render(); });
  }

  function bind() {
    document.getElementById('personalCommandOwner')?.addEventListener('change', event => setOwner(event.target.value));
    document.getElementById('currentUserV8')?.addEventListener('change', () => setTimeout(render, 0));
    document.addEventListener('click', event => {
      const view = event.target.closest('[data-personal-view]');
      if (view) switchView(view.dataset.personalView);
      const spool = event.target.closest('[data-personal-spool]');
      if (spool) openSpool(spool.dataset.personalSpool, spool.dataset.personalTarget || 'inventory');
      if (event.target.closest('.tab[data-view="dashboard"]')) setTimeout(render, 0);
    });
    window.addEventListener('storage', event => { if (event.key === STORAGE_KEY || event.key === CURRENT_USER_KEY) scheduleRender(); });
  }

  function init() {
    injectStyles();
    injectView();
    bind();
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
