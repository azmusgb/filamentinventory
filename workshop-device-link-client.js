(() => {
  'use strict';

  const SYNC_KEY_STORAGE = 'filament-sync-key-v1';
  const DISPLAY_FEED_PATH = '/api/display-feed';
  const KEY_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
  let observer = null;
  let scheduled = false;

  const currentProfile = () => globalThis.FilamentInventoryUsers?.currentUser?.() || 'Bill';
  const readKey = () => String(localStorage.getItem(SYNC_KEY_STORAGE) || '').trim();
  const validKey = key => KEY_PATTERN.test(String(key || '').trim());
  const endpoint = () => `${location.origin}${DISPLAY_FEED_PATH}`;

  function toast(message) {
    const node = document.getElementById('toast');
    if (!node) return;
    node.textContent = message;
    node.classList.add('show');
    setTimeout(() => node.classList.remove('show'), 3200);
  }

  async function copyText(value, successMessage) {
    try {
      await navigator.clipboard.writeText(value);
      toast(successMessage);
      return true;
    } catch {
      const area = document.createElement('textarea');
      area.value = value;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      toast(ok ? successMessage : 'Could not copy automatically.');
      return ok;
    }
  }

  function setDeviceStatus(state, title, detail) {
    const status = document.getElementById('workshopDeviceStatus');
    if (!status) return;
    status.dataset.state = state;
    const titleNode = status.querySelector('[data-workshop-status-title]');
    const detailNode = status.querySelector('[data-workshop-status-detail]');
    if (titleNode) titleNode.textContent = title;
    if (detailNode) detailNode.textContent = detail;
  }

  function summaryText(result) {
    const summary = result?.summary;
    if (!summary || typeof summary !== 'object') return 'Display feed validated.';
    const parts = [
      `${Number(summary.spools || 0)} spools`,
      `${Number(summary.loaded || 0)} loaded`,
      `${Number(summary.low || 0)} low`,
      `${Number(summary.unknown || 0)} unknown`,
      `${Number(summary.queue || 0)} queued`,
    ];
    return parts.join(' · ');
  }

  async function testDisplayFeed() {
    const key = readKey();
    if (!validKey(key)) {
      setDeviceStatus('locked', 'Private sync is not connected', 'Create or connect the private sync key above first.');
      return;
    }

    setDeviceStatus('working', 'Checking Workshop OS feed…', 'Validating the profile-scoped display contract without changing inventory.');
    try {
      const response = await fetch(DISPLAY_FEED_PATH, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Filament-Sync-Key': key,
          'X-Filament-Profile': currentProfile(),
        },
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Display feed failed (${response.status}).`);
      if (result.contractVersion !== 1) throw new Error('Workshop OS display contract is not version 1.');
      if (typeof result.stale !== 'boolean' || !result.summary || typeof result.summary !== 'object') {
        throw new Error('Display feed returned an invalid contract payload.');
      }
      setDeviceStatus(result.stale ? 'stale' : 'ready', result.stale ? 'Feed is valid but stale' : 'Workshop OS feed is ready', summaryText(result));
    } catch (error) {
      setDeviceStatus('error', 'Workshop OS feed needs attention', error?.message || 'Could not validate the display feed.');
    }
  }

  function markup() {
    return `
      <section class="panel workshop-device-card" id="workshopDeviceCard" aria-labelledby="workshopDeviceTitle">
        <div class="workshop-device-heading">
          <div>
            <span class="eyebrow">Workshop OS</span>
            <h3 id="workshopDeviceTitle">Connect your workshop display</h3>
            <p>Use the same profile-scoped inventory source on a WS350 without exposing mutable inventory state in a QR code or browser URL.</p>
          </div>
          <span class="workshop-device-badge">Device contract v1</span>
        </div>

        <div class="workshop-device-status" id="workshopDeviceStatus" data-state="locked" role="status" aria-live="polite">
          <i aria-hidden="true"></i>
          <div>
            <strong data-workshop-status-title>Checking private sync…</strong>
            <span data-workshop-status-detail>The display feed uses your active private profile and a write-only credential on Workshop OS.</span>
          </div>
        </div>

        <div class="workshop-device-values" aria-label="Workshop OS connection values">
          <div class="workshop-device-value">
            <span>Display feed</span>
            <strong id="workshopDisplayFeedValue"></strong>
            <button class="btn" id="copyWorkshopUrlBtn" type="button">Copy URL</button>
          </div>
          <div class="workshop-device-value">
            <span>Profile</span>
            <strong id="workshopProfileValue"></strong>
          </div>
          <div class="workshop-device-value workshop-device-secret">
            <span>Private credential</span>
            <strong id="workshopCredentialState">Not available</strong>
            <button class="btn" id="copyWorkshopKeyBtn" type="button">Copy credential</button>
          </div>
        </div>

        <div class="workshop-device-actions">
          <button class="btn btn-primary" id="testWorkshopFeedBtn" type="button">Test display feed</button>
        </div>

        <ol class="workshop-device-steps">
          <li><span>1</span><div><strong>Open Workshop OS</strong><p>Open the device's local portal, then go to its Inventory setup.</p></div></li>
          <li><span>2</span><div><strong>Use the values above</strong><p>Paste the display-feed URL, choose this exact profile, and paste the private credential only into the device.</p></div></li>
          <li><span>3</span><div><strong>Refresh on the WS350</strong><p>The device should report CURRENT or STALE only after the full contract validates.</p></div></li>
        </ol>

        <div class="workshop-device-security-note">
          <strong>Transitional credential</strong>
          <span>This currently reuses the private sync capability key for the profile-scoped read-only display feed. Stable device authorization should move to a revocable device-scoped credential.</span>
        </div>
      </section>`;
  }

  function render() {
    const card = document.getElementById('workshopDeviceCard');
    if (!card) return;
    const key = readKey();
    const connected = validKey(key);
    const urlNode = document.getElementById('workshopDisplayFeedValue');
    const profileNode = document.getElementById('workshopProfileValue');
    const credentialState = document.getElementById('workshopCredentialState');
    const copyKey = document.getElementById('copyWorkshopKeyBtn');
    const test = document.getElementById('testWorkshopFeedBtn');

    if (urlNode) urlNode.textContent = endpoint();
    if (profileNode) profileNode.textContent = currentProfile();
    if (credentialState) credentialState.textContent = connected ? 'Ready to copy' : 'Connect private sync first';
    if (copyKey) copyKey.disabled = !connected;
    if (test) test.disabled = !connected || !navigator.onLine;

    if (!navigator.onLine) {
      setDeviceStatus('offline', 'Offline', 'The connection values remain available, but the display feed cannot be validated until this browser reconnects.');
    } else if (!connected) {
      setDeviceStatus('locked', 'Connect private sync first', 'Create or connect the private sync key above; no Workshop OS credential is available until then.');
    } else {
      setDeviceStatus('ready', 'Ready to connect Workshop OS', 'Copy the URL and credential below, then validate the display feed before configuring the device.');
    }
  }

  function bind() {
    document.getElementById('copyWorkshopUrlBtn')?.addEventListener('click', () => copyText(endpoint(), 'Workshop OS display-feed URL copied.'));
    document.getElementById('copyWorkshopKeyBtn')?.addEventListener('click', () => {
      const key = readKey();
      if (!validKey(key)) return render();
      copyText(key, 'Private Workshop OS credential copied. Paste it only into the device.');
    });
    document.getElementById('testWorkshopFeedBtn')?.addEventListener('click', testDisplayFeed);
  }

  function ensureCard() {
    scheduled = false;
    const workflow = document.querySelector('#syncView .sync-workflow');
    if (!workflow || document.getElementById('workshopDeviceCard')) return;
    const primary = workflow.querySelector('.sync-primary-card');
    const wrapper = document.createElement('div');
    wrapper.innerHTML = markup().trim();
    const card = wrapper.firstElementChild;
    if (primary?.nextSibling) workflow.insertBefore(card, primary.nextSibling);
    else workflow.appendChild(card);
    bind();
    render();
  }

  function scheduleEnsure() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(ensureCard);
  }

  function init() {
    scheduleEnsure();
    observer = new MutationObserver(scheduleEnsure);
    observer.observe(document.body, {subtree:true, childList:true});
    window.addEventListener('online', render);
    window.addEventListener('offline', render);
    window.addEventListener('storage', event => {
      if (event.key === SYNC_KEY_STORAGE) render();
    });
    document.addEventListener('fi:profile-updated', render);
    document.addEventListener('fi:navigation', event => {
      if (event.detail?.view === 'sync') scheduleEnsure();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
