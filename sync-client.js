(() => {
  'use strict';

  const STORAGE_KEY = 'filament-inventory-v1';
  const SYNC_KEY_STORAGE = 'filament-sync-key-v1';
  const SYNC_SETTINGS_STORAGE = 'filament-sync-settings-v1';
  const DEVICE_ID_STORAGE = 'filament-device-id-v1';
  const API = '/api/sync';
  const VERSION = 5;
  const currentProfile = () => globalThis.FilamentInventoryUsers?.currentUser?.() || 'Bill';

  const nativeSetItem = Storage.prototype.setItem;
  const nativeGetItem = Storage.prototype.getItem;
  const nativeRemoveItem = Storage.prototype.removeItem;
  let syncTimer = null;
  let syncInFlight = false;
  let applyingRemote = false;
  let cloudMeta = null;
  let snapshotRows = [];
  let confirmAction = null;

  const parse = (text, fallback = null) => { try { return JSON.parse(text); } catch { return fallback; } };
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
      enabled:Boolean(parsed?.enabled),
      auto:parsed?.auto !== false,
      lastSyncedAt:parsed?.lastSyncedAt || null,
      lastRevision:String(parsed?.lastRevision || ''),
      deviceName:String(parsed?.deviceName || detectDeviceName()).slice(0,60),
    };
  }

  function writeSettings(next) {
    nativeSetItem.call(localStorage, SYNC_SETTINGS_STORAGE, JSON.stringify({...readSettings(),...next}));
  }

  function readKey() { return String(nativeGetItem.call(localStorage, SYNC_KEY_STORAGE) || '').trim(); }
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
    return {id:deviceId(),name:settings.deviceName || detectDeviceName()};
  }

  function normalizeTombstones(value) {
    const out = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
    Object.entries(value).forEach(([id,at]) => {
      const key = String(id || '').trim().toLowerCase();
      if (key && at && !Number.isNaN(Date.parse(String(at)))) out[key] = String(at);
    });
    return out;
  }

  function readLocal() {
    const state = parse(nativeGetItem.call(localStorage, STORAGE_KEY), null);
    return state && Array.isArray(state.spools) ? state : null;
  }

  function augmentState(previous,next) {
    if (!next || !Array.isArray(next.spools)) return next;
    const tombstones = {...normalizeTombstones(previous?.tombstones),...normalizeTombstones(next.tombstones)};
    const nextIds = new Set(next.spools.map(spool => String(spool?.id || '').trim().toLowerCase()).filter(Boolean));
    for (const spool of previous?.spools || []) {
      const id = String(spool?.id || '').trim().toLowerCase();
      if (id && !nextIds.has(id)) tombstones[id] = nowIso();
    }
    next.version = Math.max(Number(next.version) || 0,VERSION);
    next.tombstones = tombstones;
    return next;
  }

  Storage.prototype.setItem = function(key,value) {
    if (!applyingRemote && this === localStorage && key === STORAGE_KEY) {
      const previous = readLocal();
      const next = parse(String(value),null);
      if (next && Array.isArray(next.spools)) value = JSON.stringify(augmentState(previous,next));
      nativeSetItem.call(this,key,value);
      scheduleSync();
      return;
    }
    nativeSetItem.call(this,key,value);
  };

  function cloudState() {
    const local = readLocal();
    if (!local) return null;
    return {
      version:VERSION,
      spools:Array.isArray(local.spools) ? local.spools : [],
      weighLog:Array.isArray(local.weighLog) ? local.weighLog : [],
      auditLog:Array.isArray(local.auditLog) ? local.auditLog : [],
      tombstones:normalizeTombstones(local.tombstones),
    };
  }

  function fingerprint(state) {
    if (!state) return '';
    return JSON.stringify({spools:state.spools || [],weighLog:state.weighLog || [],auditLog:state.auditLog || [],tombstones:state.tombstones || {}});
  }

  function applyRemoteState(remote) {
    if (!remote || !Array.isArray(remote.spools)) return false;
    const current = readLocal() || {};
    if (fingerprint(cloudState()) === fingerprint(remote)) return false;
    const next = {
      ...current,
      version:Math.max(Number(current.version) || 0,VERSION),
      savedAt:nowIso(),
      spools:remote.spools,
      weighLog:Array.isArray(remote.weighLog) ? remote.weighLog : [],
      auditLog:Array.isArray(remote.auditLog) ? remote.auditLog : [],
      tombstones:normalizeTombstones(remote.tombstones),
    };
    applyingRemote = true;
    nativeSetItem.call(localStorage,STORAGE_KEY,JSON.stringify(next));
    applyingRemote = false;
    return true;
  }

  function scheduleSync() {
    const settings = readSettings();
    const key = readKey();
    if (!settings.enabled || !settings.auto || !validKey(key) || !navigator.onLine) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncNow({silent:true}),1500);
  }

  function toast(message) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'),3200);
  }

  function setStatus(state,title,detail) {
    const box = document.getElementById('syncStatusBox');
    if (!box) return;
    box.dataset.state = state;
    const titleNode = document.getElementById('syncStatusTitle');
    const detailNode = document.getElementById('syncStatusDetail');
    if (titleNode) titleNode.textContent = title;
    if (detailNode) detailNode.textContent = detail;
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
    if (!devices.length) { el.innerHTML='<div class="sync-empty">No cloud device activity yet.</div>'; return; }
    const mine = deviceId();
    el.innerHTML = devices.slice().sort((a,b) => Date.parse(b.lastSeenAt || 0)-Date.parse(a.lastSeenAt || 0)).slice(0,8).map(device => `<div class="sync-row"><div><strong>${esc(device.name || 'Device')}${device.id === mine ? ' · this device' : ''}</strong><span>${esc(formatWhen(device.lastSeenAt))}</span></div><span>${esc(device.lastAction || 'sync')}</span></div>`).join('');
  }

  function renderActivity() {
    const el = document.getElementById('syncActivity');
    if (!el) return;
    const rows = Array.isArray(cloudMeta?.activity) ? cloudMeta.activity : [];
    if (!rows.length) { el.innerHTML='<div class="sync-empty">No cloud activity yet.</div>'; return; }
    el.innerHTML = rows.slice(0,8).map(row => `<div class="sync-row"><div><strong>${esc(row.deviceName || 'Device')} · ${esc(row.type || 'sync')}</strong><span>${esc(formatWhen(row.at))}</span></div><span>${esc(row.summary || '')}</span></div>`).join('');
  }

  function renderSnapshots() {
    const el = document.getElementById('snapshotList');
    if (!el) return;
    if (!snapshotRows.length) { el.innerHTML='<div class="sync-empty">Load recovery snapshots when you need to undo a cloud change.</div>'; return; }
    el.innerHTML = snapshotRows.map(row => `<div class="snapshot-row"><div><strong>${esc(formatWhen(row.createdAt))}</strong><span>Revision ${esc(row.revision || 'unknown')} · ${Number(row.spoolCount || 0)} spools</span></div><button class="btn" data-restore-revision="${esc(row.revision || '')}" type="button">Restore</button></div>`).join('');
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
      last.textContent = settings.lastSyncedAt ? `Last successful sync: ${formatWhen(settings.lastSyncedAt)}${revision}` : 'Connected, but this device has not completed its first sync yet.';
    }
    const cloud = document.getElementById('cloudRevisionText');
    if (cloud) cloud.textContent = cloudMeta?.revision ? `Cloud revision ${cloudMeta.revision} · updated ${formatWhen(cloudMeta.updatedAt)}` : 'Cloud revision will appear after a status check.';
    renderDevices();
    renderActivity();
    renderSnapshots();

    if (!navigator.onLine) setStatus('offline','Offline','Local inventory is still available. Sync resumes when this device reconnects.');
    else if (syncInFlight) setStatus('working','Syncing…','Merging this device with the private cloud inventory.');
    else if (connected) setStatus('ready','Devices are connected',settings.auto ? 'Changes sync automatically after edits and reconnects.' : 'Automatic sync is off. Use Sync now when you want to merge changes.');
    else setStatus('locked','Connect another device','Paste the private key from an existing device, or create the first private sync key here.');
  }

  async function apiRequest(method,key,body,query='') {
    const response = await fetch(`${API}${query}`,{
      method,
      headers:{Accept:'application/json','X-Filament-Sync-Key':key,'X-Filament-Profile':currentProfile(),...(body ? {'Content-Type':'application/json'} : {})},
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

  async function syncNow({silent=false}={}) {
    const key = readKey();
    const state = cloudState();
    const settings = readSettings();
    if (syncInFlight || !validKey(key) || !state || !navigator.onLine) return false;
    syncInFlight = true;
    renderSync();
    try {
      const result = await apiRequest('POST',key,{action:'sync',state,device:deviceInfo(),baseRevision:settings.lastRevision || null});
      absorbMeta(result);
      const changed = applyRemoteState(result.state);
      writeSettings({enabled:true,lastSyncedAt:nowIso(),lastRevision:String(result?.meta?.revision || '')});
      renderSync();
      updateHealthBadge();
      if (result?.merge?.concurrent && !silent) {
        const conflicts = Number(result?.merge?.conflictedSpools || 0);
        if (conflicts > 0) toast(`Concurrent edits reconciled; ${conflicts} spool${conflicts === 1 ? '' : 's'} had same-field conflicts resolved by the newer edit.`);
        else if (result?.merge?.baseRecovered) toast('Concurrent edits reconciled from a recovery snapshot.');
        else toast('Concurrent edits merged using the newest spool state.');
      }
      if (changed) {
        if (!silent) toast('Cloud changes merged. Refreshing inventory…');
        setTimeout(() => location.reload(),450);
      } else if (!silent) toast('Cloud sync complete.');
      return true;
    } catch (error) {
      console.warn('Cloud sync failed',error);
      setStatus('error','Sync needs attention',error.message || 'Try again when online.');
      if (!silent) toast(error.message || 'Cloud sync failed.');
      return false;
    } finally {
      syncInFlight = false;
      renderSync();
    }
  }

  async function loadCloudMeta({silent=true}={}) {
    const key = readKey();
    if (!validKey(key) || !navigator.onLine || syncInFlight) return false;
    try {
      const result = await apiRequest('GET',key,null,'?view=meta');
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
      const result = await apiRequest('GET',key,null,'?view=snapshots');
      snapshotRows = Array.isArray(result.snapshots) ? result.snapshots : [];
      absorbMeta(result);
      renderSync();
      toast(snapshotRows.length ? `${snapshotRows.length} recovery snapshot${snapshotRows.length === 1 ? '' : 's'} loaded.` : 'No recovery snapshots yet.');
    } catch (error) {
      toast(error.message || 'Could not load recovery snapshots.');
    } finally {
      syncInFlight = false;
      renderSync();
    }
  }

  async function performRestoreSnapshot(revision) {
    const key = readKey();
    if (!validKey(key) || !revision || syncInFlight) return;
    syncInFlight = true;
    renderSync();
    try {
      const result = await apiRequest('POST',key,{action:'restore',revision,device:deviceInfo()});
      absorbMeta(result);
      const changed = applyRemoteState(result.state);
      writeSettings({enabled:true,lastSyncedAt:nowIso(),lastRevision:String(result?.meta?.revision || '')});
      snapshotRows = [];
      renderSync();
      toast('Recovery snapshot restored.');
      if (changed) setTimeout(() => location.reload(),450);
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
    if (!validKey(key)) return setStatus('error','Invalid sync key','Paste the complete private key created by this app.');
    setStatus('working','Connecting…','Checking the private cloud inventory.');
    try {
      const result = await apiRequest('GET',key,null,'?view=meta');
      if (!result.exists) throw new Error('No cloud inventory exists for that key. Check for a typo, or create the first key on the original device.');
      writeKey(key);
      writeSettings({enabled:true,lastRevision:String(result?.meta?.revision || '')});
      absorbMeta(result);
      if (input) input.value='';
      renderSync();
      await syncNow();
    } catch (error) {
      setStatus('error','Could not connect',error.message || 'Check the key and try again.');
    }
  }

  function generateKey() { return makeId(32); }

  function showKeyDialog(key,title='Private sync key') {
    const dialog = document.getElementById('syncKeyDialog');
    const input = document.getElementById('syncKeyReveal');
    if (!dialog || !input) return;
    dialog.querySelector('[data-key-title]').textContent = title;
    input.value = key;
    dialog.showModal();
    setTimeout(() => input.select(),30);
  }

  async function createNewKey() {
    if (!crypto?.getRandomValues) return toast('Secure key generation is not supported in this browser.');
    const key = generateKey();
    writeKey(key);
    writeSettings({enabled:true,lastRevision:''});
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
      toast('New sync key copied. Save it in your password manager, then paste it on the other device.');
    } catch {
      showKeyDialog(key,'Save this private sync key');
    }
  }

  async function copyKey() {
    const key = readKey();
    if (!key) return;
    try { await navigator.clipboard.writeText(key); toast('Sync key copied.'); }
    catch { showKeyDialog(key,'Copy this private sync key'); }
  }

  function performForgetKey() {
    writeKey('');
    writeSettings({enabled:false,lastRevision:''});
    cloudMeta = null;
    snapshotRows = [];
    clearTimeout(syncTimer);
    renderSync();
    updateHealthBadge();
    toast('Sync key removed from this device.');
  }

  function showConfirm({title,copy,confirmText='Continue',danger=false,onConfirm}) {
    const dialog = document.getElementById('syncConfirmDialog');
    if (!dialog) return;
    dialog.querySelector('[data-confirm-title]').textContent = title;
    dialog.querySelector('[data-confirm-copy]').textContent = copy;
    const button = dialog.querySelector('[data-confirm-accept]');
    button.textContent = confirmText;
    button.classList.toggle('btn-danger',danger);
    button.classList.toggle('btn-primary',!danger);
    confirmAction = onConfirm;
    dialog.showModal();
  }

  function saveDeviceName() {
    const input = document.getElementById('deviceNameInput');
    const name = String(input?.value || '').trim().slice(0,60) || detectDeviceName();
    writeSettings({deviceName:name});
    if (input) input.value=name;
    renderSync();
    scheduleSync();
    toast('Device name saved.');
  }

  function syncMarkup() {
    return `<div class="sync-workflow"><section class="panel sync-card sync-primary-card"><div class="sync-status" id="syncStatusBox"><i class="sync-dot" aria-hidden="true"></i><div><strong id="syncStatusTitle">Checking sync…</strong><span id="syncStatusDetail">Checking this device for a private key.</span></div></div><form id="syncLoginForm" class="sync-connect-form"><div class="sync-connect-copy"><span class="eyebrow">Connect this device</span><h3>Use the same private inventory on another device</h3><p>Paste the private sync key from an existing device. If this is the first device, create a new key and save it in your password manager.</p></div><div class="form-field"><label for="syncKeyInput">Private sync key</label><input autocomplete="off" autocapitalize="none" class="field" id="syncKeyInput" placeholder="Paste the key from another device" spellcheck="false" type="password"></div><div class="sync-actions"><button class="btn btn-primary" type="submit">Connect device</button><button class="btn" id="syncGenerateBtn" type="button">Create first sync key</button></div></form><div id="syncControls" class="sync-connected" hidden><div class="sync-primary-actions"><button class="btn btn-primary" id="syncNowBtn" type="button">Sync now</button><button class="btn" id="copySyncKeyBtn" type="button">Copy key for another device</button></div><p class="sync-last" id="lastSyncText">Connected, but this device has not completed its first sync yet.</p><p class="sync-revision" id="cloudRevisionText">Cloud revision will appear after a status check.</p><label class="toggle-row" for="autoSyncToggle"><span><strong>Automatic sync</strong><small>Merge changes after edits and whenever this device comes back online.</small></span><input id="autoSyncToggle" type="checkbox" checked></label></div></section><details class="panel sync-advanced"><summary><span><strong>Devices, recovery & settings</strong><small>Device name, recovery snapshots, cloud history and private-key controls</small></span><span aria-hidden="true">＋</span></summary><div class="sync-advanced-body"><section class="sync-section"><div class="sync-section-head"><div><span class="eyebrow">This device</span><h3>Name this device</h3></div></div><div class="device-name-row"><input class="field" id="deviceNameInput" maxlength="60" placeholder="iPhone"><button class="btn" id="saveDeviceNameBtn" type="button">Save name</button></div></section><section class="sync-section"><div class="sync-section-head"><div><span class="eyebrow">Known devices</span><h3>Recently connected</h3></div></div><div class="sync-list" id="syncDevices"></div></section><section class="sync-section"><div class="sync-section-head"><div><span class="eyebrow">Recovery</span><h3>Cloud snapshots</h3><p>Snapshots are created before cloud-changing sync or restore operations.</p></div><button class="btn" id="loadSnapshotsBtn" type="button">Load snapshots</button></div><div class="sync-list" id="snapshotList"></div></section><section class="sync-section"><div class="sync-section-head"><div><span class="eyebrow">Cloud activity</span><h3>Recent sync events</h3></div></div><div class="sync-list" id="syncActivity"></div></section><section class="sync-security-note"><strong>Private by capability key</strong><span>The raw key stays on your devices. Local inventory remains the working copy even when cloud sync is unavailable.</span></section><div class="sync-danger-actions"><button class="btn btn-danger" id="syncForgetBtn" type="button">Forget key on this device</button></div></div></details></div>`;
  }

  function ensureDialogs() {
    if (!document.getElementById('syncConfirmDialog')) {
      const dialog=document.createElement('dialog');
      dialog.id='syncConfirmDialog';
      dialog.className='sync-confirm-dialog';
      dialog.innerHTML=`<div class="dialog-head"><div><span class="eyebrow">Confirm change</span><h3 data-confirm-title>Continue?</h3></div><button class="btn icon-btn" type="button" data-confirm-cancel aria-label="Close">×</button></div><div class="dialog-body"><p class="fi-confirm-copy" data-confirm-copy></p><div class="dialog-actions"><button class="btn" type="button" data-confirm-cancel>Cancel</button><button class="btn btn-primary" type="button" data-confirm-accept>Continue</button></div></div>`;
      document.body.appendChild(dialog);
      dialog.addEventListener('close',() => { confirmAction=null; });
    }
    if (!document.getElementById('syncKeyDialog')) {
      const dialog=document.createElement('dialog');
      dialog.id='syncKeyDialog';
      dialog.className='sync-key-dialog';
      dialog.innerHTML=`<div class="dialog-head"><div><span class="eyebrow">Private sync key</span><h3 data-key-title>Private sync key</h3></div><button class="btn icon-btn" type="button" data-key-close aria-label="Close">×</button></div><div class="dialog-body"><p class="muted">Store this key in your password manager. Anyone with the key can access this profile's cloud inventory.</p><input class="field sync-key-reveal" id="syncKeyReveal" readonly><div class="dialog-actions"><button class="btn btn-primary" type="button" data-key-close>Done</button></div></div>`;
      document.body.appendChild(dialog);
    }
  }

  function injectUi() {
    const tabs=document.querySelector('.tabs');
    const dataTab=tabs?.querySelector('[data-view="data"]');
    if (tabs && dataTab && !tabs.querySelector('[data-view="sync"]')) {
      const button=document.createElement('button');
      button.className='tab';
      button.dataset.view='sync';
      button.setAttribute('aria-selected','false');
      button.textContent='Sync';
      tabs.insertBefore(button,dataTab);
    }
    const dataView=document.getElementById('dataView');
    if (dataView && !document.getElementById('syncView')) {
      const section=document.createElement('section');
      section.className='view';
      section.id='syncView';
      section.setAttribute('aria-label','Sync devices');
      section.innerHTML=syncMarkup();
      dataView.parentNode.insertBefore(section,dataView);
    }
    ensureDialogs();
  }

  function bind() {
    document.getElementById('syncLoginForm')?.addEventListener('submit',connectExisting);
    document.getElementById('syncGenerateBtn')?.addEventListener('click',createNewKey);
    document.getElementById('syncNowBtn')?.addEventListener('click',() => syncNow());
    document.getElementById('copySyncKeyBtn')?.addEventListener('click',copyKey);
    document.getElementById('syncForgetBtn')?.addEventListener('click',() => showConfirm({title:'Forget this device key?',copy:'This removes the private sync key from this device only. The cloud inventory is not deleted.',confirmText:'Forget key',danger:true,onConfirm:performForgetKey}));
    document.getElementById('loadSnapshotsBtn')?.addEventListener('click',loadSnapshots);
    document.getElementById('saveDeviceNameBtn')?.addEventListener('click',saveDeviceName);
    document.getElementById('snapshotList')?.addEventListener('click',event => {
      const button=event.target.closest('[data-restore-revision]');
      if (!button) return;
      const revision=button.dataset.restoreRevision;
      showConfirm({title:`Restore revision ${revision}?`,copy:'The current cloud state is snapshotted first, so this restore can itself be reversed.',confirmText:'Restore snapshot',onConfirm:() => performRestoreSnapshot(revision)});
    });
    document.getElementById('autoSyncToggle')?.addEventListener('change',event => { writeSettings({auto:Boolean(event.target.checked)}); renderSync(); if(event.target.checked) scheduleSync(); });
    document.addEventListener('click',event => {
      if (event.target.closest('[data-confirm-cancel]')) { document.getElementById('syncConfirmDialog')?.close(); return; }
      if (event.target.closest('[data-confirm-accept]')) {
        const action=confirmAction;
        document.getElementById('syncConfirmDialog')?.close();
        action?.();
        return;
      }
      if (event.target.closest('[data-key-close]')) document.getElementById('syncKeyDialog')?.close();
    });
    window.addEventListener('online',() => { renderSync(); loadCloudMeta(); scheduleSync(); });
    window.addEventListener('offline',renderSync);
    window.addEventListener('focus',() => { if(validKey(readKey()) && navigator.onLine) loadCloudMeta(); });
  }

  function updateHealthBadge() {
    const health=document.getElementById('dataHealth');
    if (!health) return;
    const existing=document.getElementById('syncHealthCard');
    const settings=readSettings();
    const connected=validKey(readKey());
    const html=`<strong>${connected ? 'Cloud sync connected' : 'Local only'}</strong><span>${connected ? (settings.lastSyncedAt ? `Last sync ${formatWhen(settings.lastSyncedAt)}` : 'Connected; first sync pending') : 'Connect Sync devices for cross-device recovery.'}</span>`;
    if (existing) existing.innerHTML=html;
    else {
      const box=document.createElement('article');
      box.id='syncHealthCard';
      box.className='health-card';
      box.innerHTML=html;
      health.appendChild(box);
    }
  }

  function init() {
    injectUi();
    bind();
    renderSync();
    updateHealthBadge();
    if (validKey(readKey()) && navigator.onLine) { loadCloudMeta(); scheduleSync(); }
  }

  globalThis.FilamentInventorySync = Object.freeze({syncNow,loadCloudMeta,connected:() => validKey(readKey())});

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
