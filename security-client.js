(() => {
  'use strict';

  const STORAGE_KEY = 'filament-inventory-v1';
  const SYNC_KEY_STORAGE = 'filament-sync-key-v1';
  const SYNC_SETTINGS_STORAGE = 'filament-sync-settings-v1';
  const DEVICE_ID_STORAGE = 'filament-device-id-v1';
  const API = '/api/sync';
  const ADMIN_API = '/api/sync-admin';

  const parse = (text, fallback = null) => {
    try { return JSON.parse(text); } catch { return fallback; }
  };
  const validKey = key => /^[A-Za-z0-9_-]{32,128}$/.test(String(key || '').trim());
  const nowIso = () => new Date().toISOString();

  function readKey() {
    return String(localStorage.getItem(SYNC_KEY_STORAGE) || '').trim();
  }

  function writeKey(key) {
    const clean = String(key || '').trim();
    if (clean) localStorage.setItem(SYNC_KEY_STORAGE, clean);
    else localStorage.removeItem(SYNC_KEY_STORAGE);
  }

  function readSettings() {
    return parse(localStorage.getItem(SYNC_SETTINGS_STORAGE), {}) || {};
  }

  function writeSettings(next) {
    localStorage.setItem(SYNC_SETTINGS_STORAGE, JSON.stringify({...readSettings(), ...next}));
  }

  function deviceInfo() {
    return {
      id:String(localStorage.getItem(DEVICE_ID_STORAGE) || 'unknown').replace(/[^A-Za-z0-9_-]/g,'').slice(0,64) || 'unknown',
      name:String(readSettings().deviceName || 'Device').trim().slice(0,60) || 'Device',
    };
  }

  function localState() {
    const state = parse(localStorage.getItem(STORAGE_KEY), null);
    return state && Array.isArray(state.spools) ? state : null;
  }

  function toast(message) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3600);
  }

  async function apiRequest(key, query = '') {
    const response = await fetch(`${API}${query}`, {
      headers:{Accept:'application/json','X-Filament-Sync-Key':key},
      cache:'no-store',
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Cloud request failed (${response.status}).`);
    return result;
  }

  async function adminRequest(key, body) {
    const response = await fetch(ADMIN_API, {
      method:'POST',
      headers:{Accept:'application/json','Content-Type':'application/json','X-Filament-Sync-Key':key},
      body:JSON.stringify(body),
      cache:'no-store',
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Security operation failed (${response.status}).`);
    return result;
  }

  function makeKey() {
    const data = new Uint8Array(32);
    crypto.getRandomValues(data);
    return btoa(String.fromCharCode(...data)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }

  async function sha256Hex(value) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2,'0')).join('');
  }

  async function copyValue(value, message) {
    try {
      await navigator.clipboard.writeText(value);
      toast(message || 'Copied.');
      return true;
    } catch {
      prompt('Copy this value:', value);
      return false;
    }
  }

  function pairingLink(key = readKey()) {
    if (!validKey(key)) return '';
    return `${location.origin}${location.pathname}#filament-sync=${encodeURIComponent(key)}`;
  }

  async function sharePairingLink() {
    const link = pairingLink();
    if (!link) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title:'Filament Inventory pairing',
          text:'Open this private pairing link on the device you want to add. Treat it like a password.',
          url:link,
        });
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
      }
    }
    await copyValue(link, 'Private pairing link copied.');
  }

  function pairingKeyFromHash() {
    const raw = location.hash.startsWith('#') ? location.hash.slice(1) : '';
    if (!raw) return '';
    const key = String(new URLSearchParams(raw).get('filament-sync') || '').trim();
    if (key) history.replaceState(null, '', `${location.pathname}${location.search}`);
    return key;
  }

  function installCloudState(result, key) {
    const state = result?.state;
    if (!state || !Array.isArray(state.spools)) throw new Error('Cloud inventory data is missing or invalid.');
    writeKey(key);
    writeSettings({
      enabled:true,
      lastRevision:String(result?.meta?.revision || ''),
      lastSyncedAt:nowIso(),
    });
    const current = localState() || {};
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...current,
      version:Math.max(Number(current.version) || 0, 6),
      savedAt:nowIso(),
      spools:state.spools,
      weighLog:Array.isArray(state.weighLog) ? state.weighLog : [],
      tombstones:state.tombstones && typeof state.tombstones === 'object' ? state.tombstones : {},
    }));
  }

  async function pairWithKey(key, {fromLink=false} = {}) {
    const clean = String(key || '').trim();
    if (!validKey(clean)) throw new Error('The private pairing key is invalid.');
    const result = await apiRequest(clean);
    if (!result.exists || !result.state) throw new Error('No cloud inventory exists for this key.');

    const local = localState();
    if (local?.spools?.length) {
      const wording = fromLink ? 'private pairing link' : 'sync key';
      if (!confirm(`This device already has local inventory. Connect using this ${wording} and merge the local records with the cloud inventory?`)) return false;
      writeKey(clean);
      writeSettings({enabled:true, lastRevision:String(result?.meta?.revision || '')});
      toast('Connected. Local and cloud inventory will merge automatically.');
      setTimeout(() => location.reload(), 450);
      return true;
    }

    installCloudState(result, clean);
    toast('Cloud inventory loaded onto this device.');
    setTimeout(() => location.reload(), 350);
    return true;
  }

  async function processPairingLink() {
    const key = pairingKeyFromHash();
    if (!key) return;
    if (!validKey(key)) return toast('That private pairing link is invalid.');
    if (readKey() === key) return toast('This device is already connected to that cloud inventory.');
    if (!confirm('Connect this device to the Filament Inventory shared by this private pairing link?')) return;
    try {
      await pairWithKey(key, {fromLink:true});
    } catch (error) {
      toast(error.message || 'Pairing failed.');
    }
  }

  async function freshConnectCapture(event) {
    if (localState()) return;
    const input = document.getElementById('syncKeyInput');
    const key = String(input?.value || '').trim();
    if (!validKey(key)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      await pairWithKey(key);
    } catch (error) {
      toast(error.message || 'Could not connect this device.');
    }
  }

  function download(name, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  async function downloadCloudBackup({silent=false} = {}) {
    const key = readKey();
    if (!validKey(key) || !navigator.onLine) return false;
    try {
      const result = await apiRequest(key);
      if (!result.exists || !result.state) throw new Error('No cloud inventory is available to download.');
      const stamp = new Date().toISOString().replace(/[:.]/g,'-');
      download(`filament-cloud-backup-${stamp}.json`, {
        exportedAt:nowIso(),
        source:'Filament Inventory v6 cloud backup',
        meta:result.meta || null,
        state:result.state,
      });
      if (!silent) toast('Cloud backup downloaded.');
      return true;
    } catch (error) {
      if (!silent) toast(error.message || 'Cloud backup failed.');
      return false;
    }
  }

  async function rotateKey() {
    const oldKey = readKey();
    if (!validKey(oldKey) || !navigator.onLine) return;
    if (!confirm('Rotate the sync key? Every other device using the old key will be disconnected immediately and must be paired again.')) return;
    if (prompt('Type ROTATE to revoke the old sync key:') !== 'ROTATE') return toast('Key rotation cancelled.');

    setBusy(true);
    try {
      const newKey = makeKey();
      const newKeyHash = await sha256Hex(newKey);
      const result = await adminRequest(oldKey, {action:'rotate', newKeyHash, device:deviceInfo()});
      writeKey(newKey);
      writeSettings({enabled:true, lastRevision:String(result?.meta?.revision || ''), lastSyncedAt:nowIso()});
      await copyValue(pairingLink(newKey), 'Key rotated. New private pairing link copied; re-pair your other devices.');
      setTimeout(() => location.reload(), 700);
    } catch (error) {
      toast(error.message || 'Key rotation failed. The old key remains active.');
    } finally {
      setBusy(false);
    }
  }

  async function wipeCloud() {
    const key = readKey();
    if (!validKey(key) || !navigator.onLine) return;
    if (!confirm('Delete the cloud inventory and all recovery snapshots? Local inventory on this device will remain.')) return;
    if (prompt('Type DELETE CLOUD to permanently erase the cloud copy:') !== 'DELETE CLOUD') return toast('Cloud deletion cancelled.');

    setBusy(true);
    try {
      await downloadCloudBackup({silent:true});
      await adminRequest(key, {action:'wipe', device:deviceInfo()});
      writeKey('');
      writeSettings({enabled:false, lastRevision:'', lastSyncedAt:null});
      toast('Cloud copy deleted. Local inventory remains on this device.');
      setTimeout(() => location.reload(), 700);
    } catch (error) {
      toast(error.message || 'Cloud deletion failed.');
    } finally {
      setBusy(false);
    }
  }

  function setBusy(busy) {
    ['sharePairingBtnV6','downloadCloudBackupBtnV6','rotateSyncKeyBtnV6','wipeCloudBtnV6'].forEach(id => {
      const button = document.getElementById(id);
      if (button) button.disabled = busy || !validKey(readKey()) || !navigator.onLine;
    });
  }

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `.v6-security{margin-top:18px;display:grid;gap:10px}.v6-security-box{padding:14px;border:1px solid rgba(245,158,11,.24);border-radius:15px;background:rgba(120,53,15,.08)}.v6-security-box.danger{border-color:rgba(239,68,68,.24);background:rgba(127,29,29,.08)}.v6-security-box h4{margin:0;font-size:13px}.v6-security-box p{margin:5px 0 0;color:var(--muted);font-size:12px;line-height:1.5}.v6-security-box .btn{width:100%;margin-top:10px}`;
    document.head.appendChild(style);
  }

  function injectUi() {
    injectStyles();
    const eyebrow = document.querySelector('#syncView .eyebrow');
    if (eyebrow) eyebrow.textContent = 'Secure cross-device sync · v6';
    const syncTitle = document.getElementById('syncTitle');
    if (syncTitle) syncTitle.textContent = 'Pair faster. Revoke cleanly. Keep control.';
    const dashboardEyebrow = document.querySelector('#dashboardView .hero-copy .eyebrow');
    if (dashboardEyebrow) dashboardEyebrow.textContent = 'Inventory control center · v6';
    const dataTitle = document.getElementById('dataTitle');
    if (dataTitle) dataTitle.textContent = 'Data, backup & install · v6';

    const actionRow = document.querySelector('#syncControls .sync-actions');
    if (actionRow && !document.getElementById('sharePairingBtnV6')) {
      const button = document.createElement('button');
      button.id = 'sharePairingBtnV6';
      button.className = 'btn';
      button.type = 'button';
      button.textContent = 'Share pairing link';
      actionRow.insertBefore(button, actionRow.children[1] || null);
    }

    const aside = document.querySelector('#syncView .sync-layout aside.sync-card');
    const notes = aside?.querySelector('.sync-notes');
    if (aside && !document.getElementById('syncSecurityV6')) {
      const zone = document.createElement('div');
      zone.id = 'syncSecurityV6';
      zone.className = 'v6-security';
      zone.innerHTML = `<span class="eyebrow">Key lifecycle</span><div class="v6-security-box"><h4>Download cloud backup</h4><p>Save the current cloud state before maintenance or security changes.</p><button class="btn" id="downloadCloudBackupBtnV6" type="button">Download cloud backup</button></div><div class="v6-security-box"><h4>Rotate sync key</h4><p>Revokes the previous key immediately. Other devices must be paired again.</p><button class="btn" id="rotateSyncKeyBtnV6" type="button">Rotate key & revoke devices</button></div><div class="v6-security-box danger"><h4>Delete cloud copy</h4><p>Downloads a final backup, then removes cloud inventory and snapshots. Local data remains.</p><button class="btn btn-danger" id="wipeCloudBtnV6" type="button">Delete cloud copy</button></div><div class="v6-security-box"><h4>Pairing-link privacy</h4><p>The private key is placed only in the URL fragment, which is not sent in the HTTP request. Treat the link like a password.</p></div>`;
      if (notes) aside.insertBefore(zone, notes);
      else aside.appendChild(zone);
    }

    setBusy(false);
  }

  function bind() {
    document.getElementById('syncLoginForm')?.addEventListener('submit', freshConnectCapture, true);
    document.getElementById('sharePairingBtnV6')?.addEventListener('click', sharePairingLink);
    document.getElementById('downloadCloudBackupBtnV6')?.addEventListener('click', () => downloadCloudBackup());
    document.getElementById('rotateSyncKeyBtnV6')?.addEventListener('click', rotateKey);
    document.getElementById('wipeCloudBtnV6')?.addEventListener('click', wipeCloud);
    window.addEventListener('online', () => setBusy(false));
    window.addEventListener('offline', () => setBusy(false));
  }

  async function init() {
    injectUi();
    bind();
    await processPairingLink();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
