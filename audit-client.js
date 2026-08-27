(() => {
  'use strict';

  const STORAGE_KEY = 'filament-inventory-v1';
  const CURRENT_USER_KEY = 'filament-current-user-v1';
  const SYNC_SETTINGS_KEY = 'filament-sync-settings-v1';
  const priorGetItem = Storage.prototype.getItem;
  const priorSetItem = Storage.prototype.setItem;
  let writingAudit = false;
  let renderQueued = false;
  let pendingBeforeState = null;

  const parse = (value, fallback = null) => { try { return JSON.parse(value); } catch { return fallback; } };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nowIso = () => new Date().toISOString();
  const currentUser = () => ['Bill','Aimee'].includes(String(priorGetItem.call(localStorage, CURRENT_USER_KEY))) ? String(priorGetItem.call(localStorage, CURRENT_USER_KEY)) : 'Bill';
  const deviceName = () => {
    const settings = parse(priorGetItem.call(localStorage, SYNC_SETTINGS_KEY), {});
    return String(settings?.deviceName || '').trim().slice(0,60) || 'This device';
  };
  const makeId = () => {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    const bytes = new Uint8Array(12);
    globalThis.crypto?.getRandomValues?.(bytes);
    return `audit-${Date.now()}-${[...bytes].map(x => x.toString(16).padStart(2,'0')).join('') || Math.random().toString(36).slice(2)}`;
  };

  function readState() {
    const state = parse(priorGetItem.call(localStorage, STORAGE_KEY), null);
    return state?.spools ? state : null;
  }

  function auditApi() {
    return globalThis.FilamentInventoryAudit;
  }

  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    queueMicrotask(() => { renderQueued = false; renderAll(); });
  }

  Storage.prototype.setItem = function(key, value) {
    if (this !== localStorage || key !== STORAGE_KEY || writingAudit) return priorSetItem.call(this, key, value);

    const before = pendingBeforeState || readState();
    pendingBeforeState = null;
    const result = priorSetItem.call(this, key, value);
    const after = readState();
    const api = auditApi();
    if (!after?.spools || !api) return result;

    const existing = api.mergeAuditLogs(before?.auditLog, after.auditLog);
    const events = before?.spools ? api.buildAuditEvents(before, after, {
      actor:currentUser(),
      device:deviceName(),
      now:nowIso,
      makeId,
    }) : [];
    const auditLog = api.mergeAuditLogs(existing, events);
    if (JSON.stringify(auditLog) !== JSON.stringify(after.auditLog || [])) {
      after.auditLog = auditLog;
      writingAudit = true;
      try { priorSetItem.call(this, key, JSON.stringify(after)); }
      finally { writingAudit = false; }
    }
    scheduleRender();
    return result;
  };

  const categoryFor = type => {
    if (String(type).startsWith('measurement.')) return 'measurement';
    if (String(type).startsWith('ownership.')) return 'ownership';
    if (String(type).startsWith('placement.')) return 'placement';
    if (String(type).startsWith('lifecycle.')) return 'lifecycle';
    return 'inventory';
  };
  const categoryLabel = category => ({inventory:'Inventory',measurement:'Measurement',ownership:'Ownership',placement:'Printer / AMS',lifecycle:'Lifecycle'}[category] || 'Activity');
  const relative = value => {
    const at = Date.parse(String(value || ''));
    if (!Number.isFinite(at)) return 'Unknown time';
    const delta = Date.now() - at;
    const mins = Math.floor(delta / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(at).toLocaleDateString();
  };
  const fullTime = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
  };


  function injectViews() {
    const historyView = document.getElementById('historyView');
    if (historyView && !document.getElementById('auditPanel')) {
      const panel = document.createElement('section');
      panel.className = 'panel audit-panel';
      panel.id = 'auditPanel';
      panel.innerHTML = `
        <div class="panel-head"><div><span class="eyebrow">Private activity</span><h3 style="margin-top:6px">Inventory activity</h3><p id="auditCount">0 events</p></div><div class="audit-head-actions"><button class="btn" id="exportAuditBtn" type="button">Export activity CSV</button></div></div>
        <div class="audit-metrics" id="auditMetrics"></div>
        <div class="audit-toolbar"><input class="field" id="auditSearch" type="search" placeholder="Search spool, action, device…"/><select class="select" id="auditCategory"><option value="">All activity</option><option value="inventory">Inventory</option><option value="measurement">Measurements</option><option value="ownership">Ownership</option><option value="placement">Printer / AMS</option><option value="lifecycle">Lifecycle</option></select><button class="btn" id="auditClear" type="button">Clear filters</button></div>
        <div class="audit-list" id="auditList"></div>`;
      historyView.insertBefore(panel, historyView.firstElementChild);
    }

    const dashboardView = document.getElementById('dashboardView');
    const metrics = dashboardView?.querySelector('.metrics');
    if (dashboardView && metrics && !document.getElementById('auditDashboardCard')) {
      const panel = document.createElement('section');
      panel.className = 'panel audit-dashboard';
      panel.id = 'auditDashboardCard';
      panel.innerHTML = `<div class="panel-head"><div><h3>Recent activity</h3><p>Latest inventory, measurement, lifecycle and Printer / AMS changes.</p></div><button class="btn" id="auditOpenHistory" type="button">View activity</button></div><div class="audit-dashboard-list" id="auditDashboardList"></div>`;
      metrics.insertAdjacentElement('afterend', panel);
    }
  }

  function filteredRows() {
    const api = auditApi();
    const state = readState();
    const rows = api?.normalizeAuditLog(state?.auditLog || []) || [];
    const q = String(document.getElementById('auditSearch')?.value || '').trim().toLowerCase();
    const owner = document.getElementById('auditOwner')?.value || '';
    const category = document.getElementById('auditCategory')?.value || '';
    return rows.slice().reverse().filter(row => {
      const hay = [row.summary,row.spoolId,row.actor,row.device,row.type,row.owner,...(row.changes || []).flatMap(c => [c.field,c.from,c.to])].join(' ').toLowerCase();
      return (!q || hay.includes(q)) && (!owner || row.actor === owner || row.owner === owner) && (!category || categoryFor(row.type) === category);
    });
  }

  function renderMetrics(allRows) {
    const weekAgo = Date.now() - 7 * 86400000;
    const recent = allRows.filter(row => Date.parse(row.at) >= weekAgo);
    const values = [
      ['Last 7 days', recent.length],
      ['Measurements', recent.filter(row => categoryFor(row.type) === 'measurement').length],
      ['Printer / AMS', recent.filter(row => categoryFor(row.type) === 'placement').length],
      ['Lifecycle', recent.filter(row => categoryFor(row.type) === 'lifecycle').length],
    ];
    const el = document.getElementById('auditMetrics');
    if (el) el.innerHTML = values.map(([label,value]) => `<div class="audit-metric"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
  }

  function renderTimeline() {
    const api = auditApi();
    const state = readState();
    const allRows = api?.normalizeAuditLog(state?.auditLog || []) || [];
    renderMetrics(allRows);
    const rows = filteredRows();
    const count = document.getElementById('auditCount');
    if (count) count.textContent = `${rows.length} event${rows.length === 1 ? '' : 's'} · ${allRows.length} retained`;
    const el = document.getElementById('auditList');
    if (!el) return;
    if (!rows.length) {
      el.innerHTML = `<div class="audit-empty">${allRows.length ? 'No activity matches these filters.' : 'Activity will appear here as inventory changes are made.'}</div>`;
      return;
    }
    el.innerHTML = rows.slice(0,250).map(row => {
      const category = categoryFor(row.type);
      const changes = (row.changes || []).length ? `<div class="audit-changes">${row.changes.slice(0,5).map(change => `${esc(change.field)}: ${esc(change.from || '—')} → ${esc(change.to || '—')}`).join('<br>')}</div>` : '';
      return `<article class="audit-row" data-category="${esc(category)}"><span class="audit-dot" aria-hidden="true"></span><div class="audit-main"><strong>${esc(row.summary)}</strong><div class="audit-meta"><span class="audit-chip">${esc(categoryLabel(category))}</span><span>${esc(row.actor)}</span>${row.device ? `<span>· ${esc(row.device)}</span>` : ''}<span title="${esc(fullTime(row.at))}">· ${esc(relative(row.at))}</span></div>${changes}</div>${row.spoolId ? `<button class="btn" type="button" data-audit-spool="${esc(row.spoolId)}">Open ${esc(row.spoolId)}</button>` : ''}</article>`;
    }).join('');
  }

  function renderDashboard() {
    const api = auditApi();
    const rows = api?.normalizeAuditLog(readState()?.auditLog || []).slice().reverse().slice(0,5) || [];
    const el = document.getElementById('auditDashboardList');
    if (!el) return;
    if (!rows.length) { el.innerHTML = '<div class="audit-empty">No activity recorded yet.</div>'; return; }
    el.innerHTML = rows.map(row => `<div class="audit-dashboard-row"><div><strong>${esc(row.summary)}</strong><span>${esc(row.actor)}${row.device ? ` · ${esc(row.device)}` : ''}</span></div><span>${esc(relative(row.at))}</span></div>`).join('');
  }

  function renderAll() {
    renderTimeline();
    renderDashboard();
  }

  function focusSpool(id) {
    document.querySelector('.tab[data-view="inventory"]')?.click();
    setTimeout(() => {
      const search = document.getElementById('searchInput');
      const lifecycle = document.getElementById('lifecycleFilter');
      if (search) { search.value = id; search.dispatchEvent(new Event('input',{bubbles:true})); }
      if (lifecycle) { lifecycle.value = 'all'; lifecycle.dispatchEvent(new Event('change',{bubbles:true})); }
      setTimeout(() => document.querySelector(`.spool-card[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({behavior:'smooth',block:'center'}), 80);
    }, 60);
  }

  function csvCell(value) {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g,'""')}"` : text;
  }

  function exportCsv() {
    const api = auditApi();
    const rows = api?.normalizeAuditLog(readState()?.auditLog || []).slice().reverse() || [];
    const header = ['Timestamp','Actor','Device','Category','Type','Spool ID','Owner','Summary','Changes'];
    const body = rows.map(row => [row.at,row.actor,row.device,categoryLabel(categoryFor(row.type)),row.type,row.spoolId,row.owner,row.summary,(row.changes||[]).map(c => `${c.field}: ${c.from} -> ${c.to}`).join(' | ')]);
    const blob = new Blob([[header,...body].map(row => row.map(csvCell).join(',')).join('\n')], {type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `filament-activity-${nowIso().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url),1000);
  }

  function bind() {
    document.getElementById('spoolForm')?.addEventListener('submit', () => {
      const snapshot = readState();
      pendingBeforeState = snapshot;
      setTimeout(() => { if (pendingBeforeState === snapshot) pendingBeforeState = null; }, 0);
    }, true);
    ['auditSearch'].forEach(id => document.getElementById(id)?.addEventListener('input', renderTimeline));
    ['auditOwner','auditCategory'].forEach(id => document.getElementById(id)?.addEventListener('change', renderTimeline));
    document.getElementById('auditClear')?.addEventListener('click', () => {
      if (document.getElementById('auditSearch')) document.getElementById('auditSearch').value = '';
      if (document.getElementById('auditOwner')) document.getElementById('auditOwner').value = '';
      if (document.getElementById('auditCategory')) document.getElementById('auditCategory').value = '';
      renderTimeline();
    });
    document.getElementById('exportAuditBtn')?.addEventListener('click', exportCsv);
    document.getElementById('auditOpenHistory')?.addEventListener('click', () => document.querySelector('.tab[data-view="history"]')?.click());
    document.addEventListener('click', event => {
      const target = event.target.closest('[data-audit-spool]');
      if (target) focusSpool(target.dataset.auditSpool);
      if (event.target.closest('.tab[data-view="history"],.tab[data-view="dashboard"]')) setTimeout(renderAll,0);
    });
    window.addEventListener('storage', event => { if (event.key === STORAGE_KEY) renderAll(); });
  }

  function init() {
    injectViews();
    bind();
    renderAll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
