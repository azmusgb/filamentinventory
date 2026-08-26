(() => {
  'use strict';

  const STORAGE_KEY = 'filament-inventory-v1';
  const SYNC_KEY_STORAGE = 'filament-sync-key-v1';
  const SYNC_SETTINGS_STORAGE = 'filament-sync-settings-v1';
  const DEVICE_ID_STORAGE = 'filament-device-id-v1';
  const API = '/api/sync';
  const VERSION = 5;

  const nativeSetItem = Storage.prototype.setItem;
  const nativeGetItem = Storage.prototype.getItem;
  const nativeRemoveItem = Storage.prototype.removeItem;
  let syncTimer = null;
  let syncInFlight = false;
  let applyingRemote = false;
  let cloudMeta = null;
  let snapshotRows = [];

  const parse = (text, fallback = null) => {
    try { return JSON.parse(text); } catch { return fallback; }
  };
  const nowIso = () => new Date().toISOString();
  const validKey = key => /^[A-Za-z0-9_-]{32,128}$/.test(String(key || '').trim());
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  function makeId(bytes = 16) {
    const data = new Uint8Array(bytes);
    crypto.getRandomValues(data);
    return btoa(String.fromCharCode(...data)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }

  function detectDeviceName() {
    const ua = navigator.userAgent || '';
    if (/iPad/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'iPad';
    if (/iPhone/i.test(ua)) return 'iPhone';
    if (/Windows/i.test(ua)) return 'Windows PC';
    if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac';
    if (/Android/i.test(ua)) return 'Android';
    return 'Browser';
  }

  function readSettings() {
    const parsed = parse(nativeGetItem.call(localStorage, SYNC_SETTINGS_STORAGE), {});
    return {
      enabled: Boolean(parsed?.enabled),
      auto: parsed?.auto !== false,
      lastSyncedAt: parsed?.lastSyncedAt || null,
      lastRevision: String(parsed?.lastRevision || ''),
      deviceName: String(parsed?.deviceName || detectDeviceName()).slice(0, 60),
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
    else nativeRemoveItem.call(localStorage, SYNC_KEY_STORAGE);
  }

  function deviceId() {
    let id = String(nativeGetItem.call(localStorage, DEVICE_ID_STORAGE) || '').trim();
    if (!id) {
      id = makeId(12);
      nativeSetItem.call(localStorage, DEVICE_ID_STORAGE, id);
    }
    return id;
  }

  function deviceInfo() {
    const settings = readSettings();
    return { id:deviceId(), name:settings.deviceName || detectDeviceName() };
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

  function fingerprint(state) {
    if (!state) return '';
    return JSON.stringify({spools:state.spools || [], weighLog:state.weighLog || [], tombstones:state.tombstones || {}});
  }

  function applyRemoteState(remote) {
    if (!remote || !Array.isArray(remote.spools)) return false;
    const current = readLocal() || {};
    if (fingerprint(cloudState()) === fingerprint(remote)) return false;
    const next = {
      ...current,
      version:Math.max(Number(current.version) || 0, VERSION),
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
    syncTimer = setTimeout(() => syncNow({silent:true}), 1500);
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

  function formatWhen(value) {
    if (!value) return 'Never';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
  }

  function renderDevices() {
    const el = document.getElementById('syncDevices');
    if (!el) return;
    const devices = Array.isArray(cloudMeta?.devices) ? cloudMeta.devices : [];
    if (!devices.length) {
      el.innerHTML = '<div class="sync-empty">No cloud device activity yet.</div>';
      return;
    }
    const mine = deviceId();
    el.innerHTML = devices.slice().sort((a,b) => Date.parse(b.lastSeenAt||0)-Date.parse(a.lastSeenAt||0)).slice(0,8).map(d =>
      `<div class="sync-row"><div><strong>${esc(d.name || 'Device')}${d.id === mine ? ' · this device' : ''}</strong><span>${esc(formatWhen(d.lastSeenAt))}</span></div><span>${esc(d.lastAction || 'sync')}</span></div>`
    ).join('');
  }

  function renderActivity() {
    const el = document.getElementById('syncActivity');
    if (!el) return;
    const rows = Array.isArray(cloudMeta?.activity) ? cloudMeta.activity : [];
    if (!rows.length) {
      el.innerHTML = '<div class="sync-empty">No cloud activity yet.</div>';
      return;
    }
    el.innerHTML = rows.slice(0,8).map(row =>
      `<div class="sync-row"><div><strong>${esc(row.deviceName || 'Device')} · ${esc(row.type || 'sync')}</strong><span>${esc(formatWhen(row.at))}</span></div><span>${esc(row.summary || '')}</span></div>`
    ).join('');
  }

  function renderSnapshots() {
    const el = document.getElementById('snapshotList');
    if (!el) return;
    if (!snapshotRows.length) {
      el.innerHTML = '<div class="sync-empty">No cloud snapshots yet. A snapshot is created before a cloud-changing sync or restore.</div>';
      return;
    }
    el.innerHTML = snapshotRows.map(row =>
      `<div class="snapshot-row"><div><strong>${esc(formatWhen(row.createdAt))}</strong><span>Revision ${esc(row.revision || 'unknown')} · ${Number(row.spoolCount || 0)} spools</span></div><button class="btn" data-restore-revision="${esc(row.revision || '')}" type="button">Restore</button></div>`
    ).join('');
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
    const snapshots = document.getElementById('loadSnapshotsBtn');
    if (snapshots) snapshots.disabled = syncInFlight || !connected || !navigator.onLine;
    const copy = document.getElementById('copySyncKeyBtn');
    if (copy) copy.disabled = !connected;
    const name = document.getElementById('deviceNameInput');
    if (name && document.activeElement !== name) name.value = settings.deviceName;
    const last = document.getElementById('lastSyncText');
    if (last) {
      const revision = settings.lastRevision ? ` · revision ${settings.lastRevision}` : '';
      last.textContent = settings.lastSyncedAt ? `Last successful sync: ${formatWhen(settings.lastSyncedAt)}${revision}` : 'Not synced yet on this device.';
    }
    const cloud = document.getElementById('cloudRevisionText');
    if (cloud) cloud.textContent = cloudMeta?.revision ? `Cloud revision ${cloudMeta.revision} · updated ${formatWhen(cloudMeta.updatedAt)}` : 'Cloud revision not loaded yet.';

    renderDevices();
    renderActivity();
    renderSnapshots();

    if (!navigator.onLine) setStatus('offline', 'Offline', 'Local inventory remains available. Sync resumes when this device reconnects.');
    else if (syncInFlight) setStatus('working', 'Syncing…', 'Merging this device with the private cloud inventory.');
    else if (connected) setStatus('ready', 'Cloud sync connected', settings.auto ? 'Automatic merge sync is enabled.' : 'Automatic sync is off; use Sync now when needed.');
    else setStatus('locked', 'Cloud sync is not connected', 'Paste the private key from another device, or create a new one here.');
  }

  async function apiRequest(method, key, body, query = '') {
    const response = await fetch(`${API}${query}`, {
      method,
      headers:{Accept:'application/json','X-Filament-Sync-Key':key,...(body ? {'Content-Type':'application/json'} : {})},
      body:body ? JSON.stringify(body) : undefined,
      cache:'no-store',
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Sync failed (${response.status}).`);
    return result;
  }

  function absorbMeta(result) {
    cloudMeta = result?.meta || cloudMeta;
    const revision = String(result?.meta?.revision || '');
    if (revision) writeSettings({lastRevision:revision});
  }

  async function syncNow({silent=false} = {}) {
    const key = readKey();
    const state = cloudState();
    const settings = readSettings();
    if (syncInFlight || !validKey(key) || !state || !navigator.onLine) return false;
    syncInFlight = true;
    renderSync();
    try {
      const result = await apiRequest('POST', key, {action:'sync',state,device:deviceInfo(),baseRevision:settings.lastRevision || null});
      absorbMeta(result);
      const changed = applyRemoteState(result.state);
      writeSettings({enabled:true, lastSyncedAt:nowIso(), lastRevision:String(result?.meta?.revision || '')});
      renderSync();
      updateHealthBadge();
      if (result?.merge?.concurrent && !silent) toast('Concurrent cloud edits were merged safely.');
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

  async function loadCloudMeta({silent=true} = {}) {
    const key = readKey();
    if (!validKey(key) || !navigator.onLine || syncInFlight) return false;
    try {
      const result = await apiRequest('GET', key, null, '?view=meta');
      absorbMeta(result);
      renderSync();
      return true;
    } catch (error) {
      if (!silent) toast(error.message || 'Could not load cloud status.');
      return false;
    }
  }

  async function loadSnapshots() {
    const key = readKey();
    if (!validKey(key) || !navigator.onLine || syncInFlight) return;
    syncInFlight = true;
    renderSync();
    try {
      const result = await apiRequest('GET', key, null, '?view=snapshots');
      snapshotRows = Array.isArray(result.snapshots) ? result.snapshots : [];
      absorbMeta(result);
      renderSync();
      toast(snapshotRows.length ? `${snapshotRows.length} cloud snapshots loaded.` : 'No cloud snapshots yet.');
    } catch (error) {
      toast(error.message || 'Could not load cloud snapshots.');
    } finally {
      syncInFlight = false;
      renderSync();
    }
  }

  async function restoreSnapshot(revision) {
    const key = readKey();
    if (!validKey(key) || !revision || syncInFlight) return;
    if (!confirm(`Restore cloud revision ${revision}? The current cloud state will be snapshotted first, so this restore is reversible.`)) return;
    syncInFlight = true;
    renderSync();
    try {
      const result = await apiRequest('POST', key, {action:'restore',revision,device:deviceInfo()});
      absorbMeta(result);
      const changed = applyRemoteState(result.state);
      writeSettings({enabled:true, lastSyncedAt:nowIso(), lastRevision:String(result?.meta?.revision || '')});
      snapshotRows = [];
      renderSync();
      toast('Cloud snapshot restored.');
      if (changed) setTimeout(() => location.reload(), 450);
    } catch (error) {
      toast(error.message || 'Snapshot restore failed.');
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
      const result = await apiRequest('GET', key, null, '?view=meta');
      if (!result.exists) throw new Error('No cloud inventory exists for that key. Check for a typo, or create a new key on the first device.');
      writeKey(key);
      writeSettings({enabled:true, lastRevision:String(result?.meta?.revision || '')});
      absorbMeta(result);
      if (input) input.value = '';
      renderSync();
      await syncNow();
    } catch (error) {
      setStatus('error', 'Could not connect', error.message || 'Check the key and try again.');
    }
  }

  function generateKey() { return makeId(32); }

  async function createNewKey() {
    if (!crypto?.getRandomValues) return toast('Secure key generation is not supported in this browser.');
    const key = generateKey();
    writeKey(key);
    writeSettings({enabled:true, lastRevision:''});
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
    writeSettings({enabled:false, lastRevision:''});
    cloudMeta = null;
    snapshotRows = [];
    clearTimeout(syncTimer);
    renderSync();
    updateHealthBadge();
    toast('Sync key removed from this device.');
  }

  function saveDeviceName() {
    const input = document.getElementById('deviceNameInput');
    const name = String(input?.value || '').trim().slice(0,60) || detectDeviceName();
    writeSettings({deviceName:name});
    if (input) input.value = name;
    renderSync();
    scheduleSync();
    toast('Device name saved.');
  }

  function injectStyle() {
    const style = document.createElement('style');
    style.textContent = `.sync-layout{display:grid;grid-template-columns:1.02fr .98fr;gap:18px}.sync-card{padding:22px}.sync-status{margin-top:18px;display:grid;grid-template-columns:auto 1fr;align-items:center;gap:12px;padding:14px;border:1px solid var(--line);border-radius:16px;background:rgba(3,10,18,.34)}.sync-status strong{display:block;font-size:14px}.sync-status span{display:block;margin-top:3px;color:var(--muted);font-size:12px;line-height:1.45}.sync-dot{width:12px;height:12px;border-radius:50%;background:#64748b;box-shadow:0 0 18px currentColor}.sync-status[data-state=ready] .sync-dot{color:#84cc16;background:#84cc16}.sync-status[data-state=working] .sync-dot{color:#38bdf8;background:#38bdf8;animation:syncPulse 1.1s ease-in-out infinite}.sync-status[data-state=offline] .sync-dot{color:#f59e0b;background:#f59e0b}.sync-status[data-state=error] .sync-dot{color:#ef4444;background:#ef4444}.sync-options{display:grid;gap:10px;margin-top:18px}.toggle-row{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:14px;border:1px solid var(--line);border-radius:16px;background:rgba(3,10,18,.28);text-transform:none;letter-spacing:0}.toggle-row span{min-width:0}.toggle-row strong{display:block;color:var(--text);font-size:13px}.toggle-row small{display:block;margin-top:4px;color:var(--muted);font-size:11px;line-height:1.45}.toggle-row input{width:22px;height:22px;accent-color:var(--cyan);flex:0 0 auto}.sync-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}.sync-actions .btn{flex:1}.sync-notes{display:grid;gap:11px;margin-top:18px}.sync-notes>div{padding:14px;border:1px solid var(--line);border-radius:15px;background:rgba(3,10,18,.28)}.sync-notes strong{display:block;font-size:13px}.sync-notes span{display:block;margin-top:4px;color:var(--muted);font-size:12px;line-height:1.5}.sync-section{margin-top:18px}.sync-list{display:grid;gap:8px;margin-top:10px}.sync-row,.snapshot-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 12px;border:1px solid var(--line);border-radius:13px;background:rgba(3,10,18,.25)}.sync-row>div,.snapshot-row>div{min-width:0}.sync-row strong,.snapshot-row strong{display:block;font-size:12px}.sync-row span,.snapshot-row span{display:block;color:var(--muted);font-size:11px;margin-top:2px}.snapshot-row .btn{flex:0 0 auto;min-height:34px;padding:6px 10px}.sync-empty{padding:14px;border:1px dashed var(--line);border-radius:13px;color:var(--muted);font-size:12px}.device-name-row{display:grid;grid-template-columns:1fr auto;gap:8px}@keyframes syncPulse{0%,100%{opacity:.55;transform:scale(.85)}50%{opacity:1;transform:scale(1.15)}}@media(max-width:900px){.sync-layout{grid-template-columns:1fr}}@media(max-width:520px){.device-name-row{grid-template-columns:1fr}.sync-row,.snapshot-row{align-items:flex-start}.snapshot-row{flex-direction:column}.snapshot-row .btn{width:100%}}`;
    document.head.appendChild(style);
  }

  function syncMarkup() {
    return `<div class="sync-layout"><section class="panel sync-card"><span class="eyebrow">Secure cross-device sync · v5</span><h2 id="syncTitle" style="margin:8px 0 6px;font-size:30px;letter-spacing:-.04em">Sync with a recovery plan.</h2><p class="muted" style="line-height:1.6">The capability key still protects the cloud inventory, but v5 adds device identity, cloud revisions, activity visibility, and rolling recovery snapshots.</p><div class="sync-status" id="syncStatusBox"><i class="sync-dot"></i><div><strong id="syncStatusTitle">Checking sync…</strong><span id="syncStatusDetail">Checking this device for a private key.</span></div></div><form class="form-grid" id="syncLoginForm" style="margin-top:18px"><div class="form-field full"><label for="syncKeyInput">Private sync key</label><input autocomplete="off" autocapitalize="none" class="field" id="syncKeyInput" placeholder="Paste the key from another device" spellcheck="false" type="password"/></div><div class="form-field full sync-actions"><button class="btn btn-primary" type="submit">Connect existing key</button><button class="btn" id="syncGenerateBtn" type="button">Create new sync key</button></div></form><div id="syncControls" hidden><div class="sync-options"><label class="toggle-row" for="autoSyncToggle"><span><strong>Automatic sync</strong><small>Merge changes after edits and when this device comes back online.</small></span><input id="autoSyncToggle" type="checkbox" checked/></label><div><label for="deviceNameInput">This device name</label><div class="device-name-row"><input class="field" id="deviceNameInput" maxlength="60" placeholder="iPhone"/><button class="btn" id="saveDeviceNameBtn" type="button">Save name</button></div></div></div><div class="sync-actions"><button class="btn btn-primary" id="syncNowBtn" type="button">Sync now</button><button class="btn" id="copySyncKeyBtn" type="button">Copy sync key</button><button class="btn" id="syncForgetBtn" type="button">Forget key</button></div><p class="muted" id="lastSyncText" style="font-size:12px;margin:14px 0 0">Not synced yet.</p><p class="muted" id="cloudRevisionText" style="font-size:12px;margin:6px 0 0">Cloud revision not loaded yet.</p></div><div class="sync-section"><span class="eyebrow">Known devices</span><div class="sync-list" id="syncDevices"></div></div><div class="sync-section"><span class="eyebrow">Recent cloud activity</span><div class="sync-list" id="syncActivity"></div></div></section><aside class="panel sync-card"><span class="eyebrow">Recovery snapshots</span><h3 style="margin-top:8px">Undo a bad cloud change.</h3><p class="muted" style="line-height:1.6">Before cloud state changes, v5 preserves a rolling snapshot. Restoring one first snapshots the current cloud state, so the restore itself is reversible.</p><div class="sync-actions"><button class="btn" id="loadSnapshotsBtn" type="button">Load cloud snapshots</button></div><div class="sync-list" id="snapshotList"></div><div class="sync-notes"><div><strong>Capability-key security</strong><span>The raw 256-bit key remains only on your devices. It is not stored in GitHub, Blob data, JSON backup, or CSV export.</span></div><div><strong>Conflict-aware merge</strong><span>Spool records resolve by newest record timestamp. v5 also tracks cloud revision drift so concurrent-device merges are visible.</span></div><div><strong>Offline-first</strong><span>Local inventory remains the working copy. Cloud sync is additive resilience, not a dependency.</span></div></div></aside></div>`;
  }

  function injectUi() {
    injectStyle();
    const tabs = document.querySelector('.tabs');
    const dataTab = tabs?.querySelector('[data-view="data"]');
    if (tabs && dataTab && !tabs.querySelector('[data-view="sync"]')) {
      const btn = document.createElement('button'); btn.className='tab'; btn.dataset.view='sync'; btn.setAttribute('aria-selected','false'); btn.textContent='Sync'; tabs.insertBefore(btn,dataTab);
    }
    const dataView = document.getElementById('dataView');
    if (dataView && !document.getElementById('syncView')) {
      const section=document.createElement('section'); section.className='view'; section.id='syncView'; section.setAttribute('aria-labelledby','syncTitle'); section.innerHTML=syncMarkup(); dataView.parentNode.insertBefore(section,dataView);
    }
    const eyebrow=document.querySelector('#dashboardView .hero-copy .eyebrow'); if (eyebrow) eyebrow.textContent='Inventory control center · v5';
    const heroActions=document.querySelector('#dashboardView .hero-actions');
    if (heroActions && !heroActions.querySelector('[data-jump="sync"]')) { const btn=document.createElement('button'); btn.className='btn'; btn.type='button'; btn.dataset.jump='sync'; btn.textContent='Sync devices'; heroActions.insertBefore(btn,heroActions.lastElementChild); }
    const dataTitle=document.getElementById('dataTitle'); if (dataTitle) dataTitle.textContent='Data, backup & install · v5';
  }

  function bind() {
    document.getElementById('syncLoginForm')?.addEventListener('submit', connectExisting);
    document.getElementById('syncGenerateBtn')?.addEventListener('click', createNewKey);
    document.getElementById('syncNowBtn')?.addEventListener('click', () => syncNow());
    document.getElementById('copySyncKeyBtn')?.addEventListener('click', copyKey);
    document.getElementById('syncForgetBtn')?.addEventListener('click', forgetKey);
    document.getElementById('loadSnapshotsBtn')?.addEventListener('click', loadSnapshots);
    document.getElementById('saveDeviceNameBtn')?.addEventListener('click', saveDeviceName);
    document.getElementById('snapshotList')?.addEventListener('click', event => { const btn=event.target.closest('[data-restore-revision]'); if (btn) restoreSnapshot(btn.dataset.restoreRevision); });
    document.getElementById('autoSyncToggle')?.addEventListener('change', event => { writeSettings({auto:Boolean(event.target.checked)}); renderSync(); if (event.target.checked) scheduleSync(); });
    window.addEventListener('online', () => { renderSync(); loadCloudMeta(); scheduleSync(); });
    window.addEventListener('offline', renderSync);
    window.addEventListener('focus', () => { if (validKey(readKey()) && navigator.onLine) loadCloudMeta(); });
  }

  function updateHealthBadge() {
    const health=document.getElementById('dataHealth'); if (!health) return;
    const existing=document.getElementById('syncHealthCard'); const settings=readSettings(); const connected=validKey(readKey());
    const html=`<strong>${connected?'Cloud sync connected':'Local only'}</strong><span>${connected?(settings.lastSyncedAt?`Last sync ${formatWhen(settings.lastSyncedAt)}`:'Connected; first sync pending'):'Connect the Sync tab for cross-device recovery.'}</span>`;
    if (existing) existing.innerHTML=html; else { const box=document.createElement('article'); box.id='syncHealthCard'; box.className='health-card'; box.innerHTML=html; health.appendChild(box); }
  }

  function init() {
    injectUi(); bind(); renderSync(); updateHealthBadge();
    if (validKey(readKey()) && navigator.onLine) { loadCloudMeta(); scheduleSync(); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true}); else init();
})();
