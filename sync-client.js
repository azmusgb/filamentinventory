(() => {
  'use strict';

  const STORAGE_KEY = 'filament-inventory-v1';
  const SYNC_KEY_STORAGE = 'filament-sync-key-v1';
  const SYNC_SETTINGS_STORAGE = 'filament-sync-settings-v1';
  const API = '/api/sync';
  const VERSION = 4;

  const nativeSetItem = Storage.prototype.setItem;
  const nativeGetItem = Storage.prototype.getItem;
  let syncTimer = null;
  let syncInFlight = false;
  let applyingRemote = false;

  const parse = (text, fallback = null) => {
    try { return JSON.parse(text); } catch { return fallback; }
  };
  const nowIso = () => new Date().toISOString();
  const validKey = key => /^[A-Za-z0-9_-]{32,128}$/.test(String(key || '').trim());

  function readSettings() {
    const parsed = parse(nativeGetItem.call(localStorage, SYNC_SETTINGS_STORAGE), {});
    return {
      enabled: Boolean(parsed?.enabled),
      auto: parsed?.auto !== false,
      lastSyncedAt: parsed?.lastSyncedAt || null,
    };
  }

  function writeSettings(next) {
    nativeSetItem.call(localStorage, SYNC_SETTINGS_STORAGE, JSON.stringify({...readSettings(), ...next}));
  }

  function readKey() {
    return String(nativeGetItem.call(localStorage, SYNC_KEY_STORAGE) || '').trim();
  }

  function writeKey(key) {
    const clean = String(key || '').trim();
    if (clean) nativeSetItem.call(localStorage, SYNC_KEY_STORAGE, clean);
    else localStorage.removeItem(SYNC_KEY_STORAGE);
  }

  function normalizeTombstones(value) {
    const out = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
    Object.entries(value).forEach(([id, at]) => {
      const key = String(id || '').trim().toLowerCase();
      if (key && at && !Number.isNaN(Date.parse(String(at)))) out[key] = String(at);
    });
    return out;
  }

  function readLocal() {
    const state = parse(nativeGetItem.call(localStorage, STORAGE_KEY), null);
    if (!state || !Array.isArray(state.spools)) return null;
    return state;
  }

  function augmentState(previous, next) {
    if (!next || !Array.isArray(next.spools)) return next;
    const tombstones = {...normalizeTombstones(previous?.tombstones), ...normalizeTombstones(next.tombstones)};
    const nextIds = new Set(next.spools.map(s => String(s?.id || '').trim().toLowerCase()).filter(Boolean));
    for (const spool of previous?.spools || []) {
      const id = String(spool?.id || '').trim().toLowerCase();
      if (id && !nextIds.has(id)) tombstones[id] = nowIso();
    }
    next.version = Math.max(Number(next.version) || 0, VERSION);
    next.tombstones = tombstones;
    return next;
  }

  Storage.prototype.setItem = function(key, value) {
    if (!applyingRemote && this === localStorage && key === STORAGE_KEY) {
      const previous = readLocal();
      const next = parse(String(value), null);
      if (next && Array.isArray(next.spools)) value = JSON.stringify(augmentState(previous, next));
      nativeSetItem.call(this, key, value);
      scheduleSync();
      return;
    }
    nativeSetItem.call(this, key, value);
  };

  function cloudState() {
    const local = readLocal();
    if (!local) return null;
    return {
      version:VERSION,
      spools:Array.isArray(local.spools) ? local.spools : [],
      weighLog:Array.isArray(local.weighLog) ? local.weighLog : [],
      tombstones:normalizeTombstones(local.tombstones),
    };
  }

  function cloudFingerprint(state) {
    if (!state) return '';
    return JSON.stringify({spools:state.spools || [], weighLog:state.weighLog || [], tombstones:state.tombstones || {}});
  }

  function applyRemoteState(remote) {
    if (!remote || !Array.isArray(remote.spools)) return false;
    const current = readLocal() || {};
    const currentCloud = cloudState();
    if (cloudFingerprint(currentCloud) === cloudFingerprint(remote)) return false;
    const next = {
      ...current,
      version:VERSION,
      savedAt:nowIso(),
      spools:remote.spools,
      weighLog:Array.isArray(remote.weighLog) ? remote.weighLog : [],
      tombstones:normalizeTombstones(remote.tombstones),
    };
    applyingRemote = true;
    nativeSetItem.call(localStorage, STORAGE_KEY, JSON.stringify(next));
    applyingRemote = false;
    return true;
  }

  function scheduleSync() {
    const settings = readSettings();
    const key = readKey();
    if (!settings.enabled || !settings.auto || !validKey(key) || !navigator.onLine) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncNow({silent:true}), 1400);
  }

  function toast(message) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3200);
  }

  function setStatus(state, title, detail) {
    const box = document.getElementById('syncStatusBox');
    if (!box) return;
    box.dataset.state = state;
    const t = document.getElementById('syncStatusTitle');
    const d = document.getElementById('syncStatusDetail');
    if (t) t.textContent = title;
    if (d) d.textContent = detail;
  }

  function renderSync() {
    const key = readKey();
    const settings = readSettings();
    const connected = validKey(key);
    const login = document.getElementById('syncLoginForm');
    const controls = document.getElementById('syncControls');
    if (login) login.hidden = connected;
    if (controls) controls.hidden = !connected;
    const auto = document.getElementById('autoSyncToggle');
    if (auto) auto.checked = settings.auto;
    const now = document.getElementById('syncNowBtn');
    if (now) now.disabled = syncInFlight || !connected || !navigator.onLine;
    const copy = document.getElementById('copySyncKeyBtn');
    if (copy) copy.disabled = !connected;
    const last = document.getElementById('lastSyncText');
    if (last) last.textContent = settings.lastSyncedAt ? `Last successful sync: ${new Date(settings.lastSyncedAt).toLocaleString()}` : 'Not synced yet on this device.';

    if (!navigator.onLine) setStatus('offline', 'Offline', 'Local inventory remains available. Sync resumes when this device reconnects.');
    else if (syncInFlight) setStatus('working', 'Syncing…', 'Merging this device with the private cloud inventory.');
    else if (connected) setStatus('ready', 'Cloud sync connected', settings.auto ? 'Automatic merge sync is enabled.' : 'Automatic sync is off; use Sync now when needed.');
    else setStatus('locked', 'Cloud sync is not connected', 'Paste the private key from another device, or create a new one here.');
  }

  async function apiRequest(method, key, body) {
    const response = await fetch(API, {
      method,
      headers:{
        Accept:'application/json',
        'X-Filament-Sync-Key':key,
        ...(body ? {'Content-Type':'application/json'} : {}),
      },
      body:body ? JSON.stringify(body) : undefined,
      cache:'no-store',
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Sync failed (${response.status}).`);
    return result;
  }

  async function syncNow({silent=false} = {}) {
    const key = readKey();
    const state = cloudState();
    if (syncInFlight || !validKey(key) || !state || !navigator.onLine) return false;
    syncInFlight = true;
    renderSync();
    try {
      const result = await apiRequest('POST', key, {state});
      const changed = applyRemoteState(result.state);
      writeSettings({enabled:true, lastSyncedAt:nowIso()});
      renderSync();
      updateHealthBadge();
      if (changed) {
        if (!silent) toast('Cloud changes merged. Refreshing inventory…');
        setTimeout(() => location.reload(), 450);
      } else if (!silent) toast('Cloud sync complete.');
      return true;
    } catch (error) {
      console.warn('Cloud sync failed', error);
      setStatus('error', 'Sync needs attention', error.message || 'Try again when online.');
      if (!silent) toast(error.message || 'Cloud sync failed.');
      return false;
    } finally {
      syncInFlight = false;
      renderSync();
    }
  }

  async function connectExisting(event) {
    event.preventDefault();
    const input = document.getElementById('syncKeyInput');
    const key = String(input?.value || '').trim();
    if (!validKey(key)) return setStatus('error', 'Invalid sync key', 'Paste the complete key created by this app.');
    setStatus('working', 'Connecting…', 'Checking for an existing private cloud inventory.');
    try {
      const result = await apiRequest('GET', key);
      if (!result.exists) throw new Error('No cloud inventory exists for that key. Check for a typo, or create a new key on the first device.');
      writeKey(key);
      writeSettings({enabled:true});
      if (input) input.value = '';
      renderSync();
      await syncNow();
    } catch (error) {
      setStatus('error', 'Could not connect', error.message || 'Check the key and try again.');
    }
  }

  function generateKey() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }

  async function createNewKey() {
    if (!crypto?.getRandomValues) return toast('Secure key generation is not supported in this browser.');
    const key = generateKey();
    writeKey(key);
    writeSettings({enabled:true});
    renderSync();
    const ok = await syncNow();
    if (!ok) {
      writeKey('');
      writeSettings({enabled:false});
      renderSync();
      return;
    }
    try {
      await navigator.clipboard.writeText(key);
      toast('New sync key created and copied. Save it in your password manager.');
    } catch {
      prompt('Save this sync key. You will need it on your other devices:', key);
    }
  }

  async function copyKey() {
    const key = readKey();
    if (!key) return;
    try { await navigator.clipboard.writeText(key); toast('Sync key copied.'); }
    catch { prompt('Copy your sync key:', key); }
  }

  function forgetKey() {
    if (!confirm('Forget the private sync key on this device? The cloud inventory will not be deleted.')) return;
    writeKey('');
    writeSettings({enabled:false});
    clearTimeout(syncTimer);
    renderSync();
    updateHealthBadge();
    toast('Sync key removed from this device.');
  }

  function injectStyle() {
    const style = document.createElement('style');
    style.textContent = `
      .sync-layout{display:grid;grid-template-columns:1.05fr .95fr;gap:18px}.sync-card{padding:22px}.sync-status{margin-top:18px;display:grid;grid-template-columns:auto 1fr;align-items:center;gap:12px;padding:14px;border:1px solid var(--line);border-radius:16px;background:rgba(3,10,18,.34)}.sync-status strong{display:block;font-size:14px}.sync-status span{display:block;margin-top:3px;color:var(--muted);font-size:12px;line-height:1.45}.sync-dot{width:12px;height:12px;border-radius:50%;background:#64748b;box-shadow:0 0 18px currentColor}.sync-status[data-state=ready] .sync-dot{color:#84cc16;background:#84cc16}.sync-status[data-state=working] .sync-dot{color:#38bdf8;background:#38bdf8;animation:syncPulse 1.1s ease-in-out infinite}.sync-status[data-state=offline] .sync-dot{color:#f59e0b;background:#f59e0b}.sync-status[data-state=error] .sync-dot{color:#ef4444;background:#ef4444}.sync-options{margin-top:18px}.toggle-row{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:14px;border:1px solid var(--line);border-radius:16px;background:rgba(3,10,18,.28);text-transform:none;letter-spacing:0}.toggle-row span{min-width:0}.toggle-row strong{display:block;color:var(--text);font-size:13px}.toggle-row small{display:block;margin-top:4px;color:var(--muted);font-size:11px;line-height:1.45}.toggle-row input{width:22px;height:22px;accent-color:var(--cyan);flex:0 0 auto}.sync-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}.sync-actions .btn{flex:1}.sync-notes{display:grid;gap:11px;margin-top:18px}.sync-notes>div{padding:14px;border:1px solid var(--line);border-radius:15px;background:rgba(3,10,18,.28)}.sync-notes strong{display:block;font-size:13px}.sync-notes span{display:block;margin-top:4px;color:var(--muted);font-size:12px;line-height:1.5}@keyframes syncPulse{0%,100%{opacity:.55;transform:scale(.85)}50%{opacity:1;transform:scale(1.15)}}@media(max-width:900px){.sync-layout{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function syncMarkup() {
    return `<div class="sync-layout">
      <section class="panel sync-card">
        <span class="eyebrow">Secure cross-device sync</span>
        <h2 id="syncTitle" style="margin:8px 0 6px;font-size:30px;letter-spacing:-.04em">Keep iPhone, iPad and desktop together.</h2>
        <p class="muted" style="line-height:1.6">A random 256-bit sync key acts as the credential. The raw key stays on your devices; the Netlify Function hashes it to locate your private Blob and never stores the raw key.</p>
        <div class="sync-status" id="syncStatusBox"><i class="sync-dot"></i><div><strong id="syncStatusTitle">Checking sync…</strong><span id="syncStatusDetail">Checking this device for a private key.</span></div></div>
        <form class="form-grid" id="syncLoginForm" style="margin-top:18px">
          <div class="form-field full"><label for="syncKeyInput">Private sync key</label><input autocomplete="off" autocapitalize="none" class="field" id="syncKeyInput" placeholder="Paste the key from another device" spellcheck="false" type="password"/></div>
          <div class="form-field full sync-actions"><button class="btn btn-primary" type="submit">Connect existing key</button><button class="btn" id="syncGenerateBtn" type="button">Create new sync key</button></div>
        </form>
        <div id="syncControls" hidden>
          <div class="sync-options"><label class="toggle-row" for="autoSyncToggle"><span><strong>Automatic sync</strong><small>Merge changes after inventory edits and whenever this device comes back online.</small></span><input id="autoSyncToggle" type="checkbox" checked/></label></div>
          <div class="sync-actions"><button class="btn btn-primary" id="syncNowBtn" type="button">Sync now</button><button class="btn" id="copySyncKeyBtn" type="button">Copy sync key</button><button class="btn" id="syncForgetBtn" type="button">Forget key on this device</button></div>
          <p class="muted" id="lastSyncText" style="font-size:12px;margin:14px 0 0">Not synced yet.</p>
        </div>
      </section>
      <aside class="panel sync-card"><span class="eyebrow">Merge behavior</span><h3 style="margin-top:8px">Built for one-person, multi-device inventory</h3><div class="sync-notes">
        <div><strong>Newest spool edit wins</strong><span>Spools merge by update timestamp instead of replacing the whole inventory.</span></div>
        <div><strong>History is unioned</strong><span>Measurements from different devices are combined and deduplicated.</span></div>
        <div><strong>Deletes propagate</strong><span>Tombstones prevent permanently deleted spools from reappearing.</span></div>
        <div><strong>Offline still works</strong><span>Local storage stays usable and catches up when the connection returns.</span></div>
      </div></aside>
    </div>`;
  }

  function showView(view) {
    document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.id === `${view}View`));
    document.querySelectorAll('.tab').forEach(el => el.setAttribute('aria-selected', String(el.dataset.view === view)));
    window.scrollTo({top:0, behavior:'smooth'});
  }

  function injectUi() {
    injectStyle();
    const tabs = document.querySelector('.tabs');
    const dataTab = tabs?.querySelector('[data-view="data"]');
    let syncTab = tabs?.querySelector('[data-view="sync"]');
    if (tabs && dataTab && !syncTab) {
      syncTab = document.createElement('button');
      syncTab.className = 'tab'; syncTab.dataset.view = 'sync'; syncTab.setAttribute('aria-selected','false'); syncTab.textContent = 'Sync';
      tabs.insertBefore(syncTab, dataTab);
    }
    syncTab?.addEventListener('click', () => showView('sync'));
    const dataView = document.getElementById('dataView');
    if (dataView && !document.getElementById('syncView')) {
      const section = document.createElement('section');
      section.id = 'syncView'; section.className = 'view'; section.setAttribute('aria-labelledby','syncTitle'); section.innerHTML = syncMarkup();
      dataView.parentNode.insertBefore(section, dataView);
    }
    const eyebrow = document.querySelector('#dashboardView .hero-copy .eyebrow');
    if (eyebrow) eyebrow.textContent = 'Inventory control center · v4';
    const heroActions = document.querySelector('#dashboardView .hero-actions');
    let syncJump = heroActions?.querySelector('[data-jump="sync"]');
    if (heroActions && !syncJump) {
      syncJump = document.createElement('button'); syncJump.className='btn'; syncJump.type='button'; syncJump.dataset.jump='sync'; syncJump.textContent='Sync devices'; heroActions.insertBefore(syncJump, heroActions.lastElementChild);
    }
    syncJump?.addEventListener('click', () => showView('sync'));
    const dataTitle = document.getElementById('dataTitle');
    if (dataTitle) dataTitle.textContent = 'Data, backup & install · v4';

    document.getElementById('syncLoginForm')?.addEventListener('submit', connectExisting);
    document.getElementById('syncGenerateBtn')?.addEventListener('click', createNewKey);
    document.getElementById('syncNowBtn')?.addEventListener('click', () => syncNow());
    document.getElementById('copySyncKeyBtn')?.addEventListener('click', copyKey);
    document.getElementById('syncForgetBtn')?.addEventListener('click', forgetKey);
    document.getElementById('autoSyncToggle')?.addEventListener('change', event => {
      writeSettings({auto:event.target.checked});
      renderSync();
      if (event.target.checked) scheduleSync();
    });
    renderSync();
  }

  function updateHealthBadge() {
    const grid = document.getElementById('dataHealth');
    if (!grid) return;
    const versionStat = [...grid.querySelectorAll('.health-stat')].find(el => el.querySelector('span')?.textContent === 'App version');
    if (versionStat && versionStat.querySelector('strong')?.textContent !== 'v4') versionStat.querySelector('strong').textContent = 'v4';
    let cloud = grid.querySelector('[data-sync-health]');
    if (!cloud) {
      cloud = document.createElement('div'); cloud.className='health-stat'; cloud.dataset.syncHealth='true'; cloud.innerHTML='<span>Cloud sync</span><strong>Off</strong>'; grid.appendChild(cloud);
    }
    const settings = readSettings();
    const label = validKey(readKey()) && settings.enabled ? 'Connected' : 'Off';
    if (cloud.querySelector('strong')?.textContent !== label) cloud.querySelector('strong').textContent = label;
  }

  function observeHealth() {
    const grid = document.getElementById('dataHealth');
    if (!grid) return;
    let scheduled = false;
    new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => { scheduled=false; updateHealthBadge(); });
    }).observe(grid, {childList:true, subtree:true});
    updateHealthBadge();
  }

  document.addEventListener('DOMContentLoaded', () => {
    injectUi();
    setTimeout(() => { observeHealth(); renderSync(); if (readSettings().enabled && validKey(readKey()) && navigator.onLine) syncNow({silent:true}); }, 0);
    window.addEventListener('online', () => { renderSync(); scheduleSync(); });
    window.addEventListener('offline', renderSync);
  });
})();
