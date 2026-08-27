(() => {
  'use strict';

  const core = globalThis.FilamentInventoryScan;
  if (!core) return;

  const STORAGE_KEY = 'filament-inventory-v1';
  let stream = null;
  let detector = null;
  let scanFrame = 0;
  let scanning = false;
  let detecting = false;
  let lastDetectionAt = 0;
  let boundaryObserver = null;

  const currentProfile = () => globalThis.FilamentInventoryUsers?.currentUser?.() || 'Bill';
  const parse = (text, fallback = null) => { try { return JSON.parse(text); } catch { return fallback; } };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function readState(owner = currentProfile()) {
    const users = globalThis.FilamentInventoryUsers;
    const key = owner === currentProfile() ? STORAGE_KEY : users?.physicalKey?.(STORAGE_KEY, owner);
    if (!key) return {spools:[]};
    const state = parse(localStorage.getItem(key) || '{}', {});
    return Array.isArray(state?.spools) ? state : {spools:[]};
  }

  function allProfileStates() {
    return Object.fromEntries(core.OWNERS.map(owner => [owner, readState(owner)]));
  }

  function findSpool(id, owner = currentProfile()) {
    const wanted = String(id || '').trim().toLowerCase();
    return readState(owner).spools.find(spool => String(spool?.id || '').trim().toLowerCase() === wanted) || null;
  }

  function liveScanningSupported() {
    return Boolean(globalThis.BarcodeDetector && navigator.mediaDevices?.getUserMedia && window.isSecureContext);
  }

  function injectStyles() {
    if (document.getElementById('qrFastScanStyles')) return;
    const style = document.createElement('style');
    style.id = 'qrFastScanStyles';
    style.textContent = `
      .scan-launch{min-height:44px;padding:9px 14px;white-space:nowrap;border-color:rgba(34,211,238,.38);background:linear-gradient(135deg,rgba(34,211,238,.14),rgba(99,102,241,.12));font-weight:850}
      body[data-inventory-user="Aimee"] .scan-launch{border-color:rgba(192,132,252,.42);background:linear-gradient(135deg,rgba(192,132,252,.16),rgba(99,102,241,.13))}
      #qrScannerDialog{width:min(94vw,560px);padding:0;overflow:hidden}
      .qr-scanner-body{display:grid;gap:14px}.qr-private-note{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 12px;border:1px solid var(--line);border-radius:14px;background:rgba(3,10,18,.28);font-size:11px;color:var(--muted)}.qr-private-note strong{color:var(--text);font-size:12px}
      .qr-video-shell{position:relative;overflow:hidden;aspect-ratio:4/3;border-radius:18px;border:1px solid var(--line);background:#02060b}.qr-video-shell[hidden]{display:none}.qr-video{display:block;width:100%;height:100%;object-fit:cover}.qr-reticle{position:absolute;inset:17%;border:2px solid rgba(255,255,255,.92);border-radius:20px;box-shadow:0 0 0 999px rgba(0,0,0,.28)}.qr-reticle:after{content:'Align the QR inside the frame';position:absolute;left:50%;bottom:-34px;transform:translateX(-50%);white-space:nowrap;padding:6px 9px;border-radius:999px;background:rgba(0,0,0,.7);font-size:10px;color:white}
      .qr-scan-status{padding:12px 13px;border:1px solid var(--line);border-radius:14px;background:rgba(3,10,18,.22);font-size:12px;line-height:1.5;color:var(--muted)}.qr-scan-status strong{color:var(--text)}
      .qr-scan-fallback{padding:14px;border:1px solid rgba(56,189,248,.22);border-radius:16px;background:rgba(14,116,144,.08)}.qr-scan-fallback h4{margin:0 0 6px}.qr-scan-fallback p{margin:0;color:var(--muted);font-size:12px;line-height:1.55}.qr-scan-fallback ol{margin:9px 0 0;padding-left:20px;color:var(--muted);font-size:12px;line-height:1.55}
      .qr-manual{display:grid;grid-template-columns:1fr auto;gap:9px}.qr-scanner-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px}.scan-extended-actions{margin-top:10px}
      @media(max-width:650px){.user-boundary>.scan-launch{width:100%}.qr-manual,.qr-scanner-actions{grid-template-columns:1fr}#qrScannerDialog{width:100%;max-width:none;margin:auto 0 0;border-radius:22px 22px 0 0}.qr-video-shell{border-radius:15px}}
    `;
    document.head.appendChild(style);
  }

  function scannerMarkup() {
    return `<div class="dialog-head"><div><span class="eyebrow">Fast spool lookup</span><h3 style="margin-top:5px">Scan a filament QR</h3></div><button class="btn icon-btn" id="qrScannerClose" type="button" aria-label="Close scanner">×</button></div><div class="dialog-body qr-scanner-body"><div class="qr-private-note"><span>Scanning inside</span><strong id="qrScannerProfile"></strong></div><div class="qr-video-shell" id="qrVideoShell" hidden><video class="qr-video" id="qrScannerVideo" muted playsinline></video><div class="qr-reticle" aria-hidden="true"></div></div><div class="qr-scan-status" id="qrScanStatus"><strong>Ready.</strong> Start the camera or enter a spool ID below.</div><div class="qr-scan-fallback" id="qrScanFallback" hidden><h4>On iPhone / iPad</h4><p>Safari does not reliably expose web QR detection. Apple’s scanner is the dependable path and still lands directly in this app.</p><ol><li>Open Camera or Control Center → Code Scanner.</li><li>Point it at a Filament Inventory QR label.</li><li>Tap the detected link to open the spool here.</li></ol></div><form class="qr-manual" id="qrManualForm"><input class="field" id="qrManualId" autocomplete="off" maxlength="32" placeholder="Or enter spool ID, e.g. S022"/><button class="btn" type="submit">Find spool</button></form><div class="qr-scanner-actions"><button class="btn btn-primary" id="qrStartCamera" type="button">Start camera</button><button class="btn" id="qrStopCamera" type="button" disabled>Stop camera</button></div></div>`;
  }

  function injectScannerDialog() {
    if (document.getElementById('qrScannerDialog')) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'qrScannerDialog';
    dialog.innerHTML = scannerMarkup();
    document.body.appendChild(dialog);
    dialog.addEventListener('close', stopCamera);
    document.getElementById('qrScannerClose')?.addEventListener('click', () => dialog.close());
    document.getElementById('qrStartCamera')?.addEventListener('click', startCamera);
    document.getElementById('qrStopCamera')?.addEventListener('click', stopCamera);
    document.getElementById('qrManualForm')?.addEventListener('submit', event => {
      event.preventDefault();
      const raw = document.getElementById('qrManualId')?.value || '';
      processScanValue(raw);
    });
  }

  function injectLaunchButton() {
    if (document.getElementById('qrScanLaunch')) return true;
    const boundary = document.getElementById('userBoundary');
    if (!boundary) return false;
    const button = document.createElement('button');
    button.id = 'qrScanLaunch';
    button.type = 'button';
    button.className = 'btn scan-launch';
    button.textContent = 'Scan QR';
    button.addEventListener('click', openScanner);
    boundary.appendChild(button);
    return true;
  }

  function ensureLaunchButton() {
    if (injectLaunchButton() || boundaryObserver) return;
    boundaryObserver = new MutationObserver(() => {
      if (injectLaunchButton()) {
        boundaryObserver.disconnect();
        boundaryObserver = null;
      }
    });
    boundaryObserver.observe(document.body, {childList:true, subtree:true});
  }

  function setStatus(html) {
    const node = document.getElementById('qrScanStatus');
    if (node) node.innerHTML = html;
  }

  function setCameraUi(active) {
    const shell = document.getElementById('qrVideoShell');
    const start = document.getElementById('qrStartCamera');
    const stop = document.getElementById('qrStopCamera');
    if (shell) shell.hidden = !active;
    if (start) start.disabled = active;
    if (stop) stop.disabled = !active;
  }

  function openScanner() {
    injectScannerDialog();
    const dialog = document.getElementById('qrScannerDialog');
    const fallback = document.getElementById('qrScanFallback');
    const start = document.getElementById('qrStartCamera');
    const profile = document.getElementById('qrScannerProfile');
    if (profile) profile.textContent = `${currentProfile()}'s private inventory`;
    if (fallback) fallback.hidden = liveScanningSupported();
    if (start) start.hidden = !liveScanningSupported();
    setStatus(liveScanningSupported() ? '<strong>Ready.</strong> Start the camera and point it at a Filament Inventory QR label.' : '<strong>Use Apple Camera / Code Scanner.</strong> You can also enter a spool ID below.');
    dialog?.showModal();
    if (!liveScanningSupported()) document.getElementById('qrManualId')?.focus();
  }

  async function startCamera() {
    if (!liveScanningSupported()) return openScanner();
    stopCamera();
    try {
      if (typeof BarcodeDetector.getSupportedFormats === 'function') {
        const formats = await BarcodeDetector.getSupportedFormats();
        if (Array.isArray(formats) && !formats.includes('qr_code')) throw new Error('QR detection is not supported by this browser.');
      }
      detector = new BarcodeDetector({formats:['qr_code']});
      stream = await navigator.mediaDevices.getUserMedia({audio:false, video:{facingMode:{ideal:'environment'}, width:{ideal:1280}, height:{ideal:720}}});
      const video = document.getElementById('qrScannerVideo');
      if (!video) throw new Error('Scanner video surface is unavailable.');
      video.srcObject = stream;
      await video.play();
      scanning = true;
      setCameraUi(true);
      setStatus('<strong>Scanning…</strong> Hold the QR steady inside the frame.');
      scanFrame = requestAnimationFrame(scanLoop);
    } catch (error) {
      stopCamera();
      const message = error?.name === 'NotAllowedError' ? 'Camera access was denied. Use your device camera/code scanner or enter the spool ID.' : (error?.message || 'Camera scanning could not start.');
      setStatus(`<strong>Camera unavailable.</strong> ${esc(message)}`);
      const fallback = document.getElementById('qrScanFallback');
      if (fallback) fallback.hidden = false;
    }
  }

  async function scanLoop(timestamp) {
    if (!scanning) return;
    const video = document.getElementById('qrScannerVideo');
    if (!detecting && video?.readyState >= 2 && timestamp - lastDetectionAt >= 160) {
      detecting = true;
      lastDetectionAt = timestamp;
      try {
        const results = await detector.detect(video);
        const value = results?.find(row => row?.rawValue)?.rawValue;
        if (value) {
          scanning = false;
          await processScanValue(value);
          return;
        }
      } catch (error) {
        console.warn('QR detection frame failed', error);
      } finally {
        detecting = false;
      }
    }
    if (scanning) scanFrame = requestAnimationFrame(scanLoop);
  }

  function stopCamera() {
    scanning = false;
    detecting = false;
    if (scanFrame) cancelAnimationFrame(scanFrame);
    scanFrame = 0;
    stream?.getTracks?.().forEach(track => track.stop());
    stream = null;
    detector = null;
    const video = document.getElementById('qrScannerVideo');
    if (video) video.srcObject = null;
    setCameraUi(false);
  }

  async function processScanValue(raw) {
    const parsed = core.parseScanValue(raw, location.origin);
    if (!parsed.ok) {
      const message = parsed.reason === 'foreign-origin' ? 'That QR points to a different site.' : 'No valid filament spool ID was found in that code.';
      setStatus(`<strong>Not a Filament Inventory label.</strong> ${esc(message)}`);
      return;
    }

    stopCamera();
    const current = currentProfile();
    const states = allProfileStates();
    const resolved = parsed.profile || core.resolveProfile(parsed.spoolId, current, states) || current;
    const exists = core.stateHasSpool(states[resolved], parsed.spoolId);
    setStatus(exists ? `<strong>Found ${esc(parsed.spoolId)}.</strong> Opening ${esc(resolved)}'s private inventory…` : `<strong>${esc(parsed.spoolId)} not found locally.</strong> Opening the scan result so Sync/recovery options remain available.`);
    const target = core.buildSpoolTarget({spoolId:parsed.spoolId, profile:resolved}, location.origin);
    setTimeout(() => location.assign(target), 120);
  }

  function reconcileIncomingLegacyScan() {
    const url = new URL(location.href);
    const spoolId = String(url.searchParams.get('spool') || '').trim();
    const scan = url.searchParams.get('scan') === '1';
    const hashProfile = core.profileFromUrl(url);
    if (!scan || !core.validId(spoolId) || hashProfile) return false;
    const current = currentProfile();
    const resolved = core.resolveProfile(spoolId, current, allProfileStates());
    if (!resolved || resolved === current) return false;
    location.replace(core.buildSpoolTarget({spoolId, profile:resolved}, location.origin));
    return true;
  }

  function switchView(view) {
    document.querySelector(`.tab[data-view="${view}"]`)?.click();
  }

  function openEditFromScan(id) {
    const scanDialog = document.getElementById('scanSpoolDialog');
    scanDialog?.close();
    switchView('inventory');
    setTimeout(() => {
      const lifecycle = document.getElementById('lifecycleFilter');
      if (lifecycle) { lifecycle.value = 'all'; lifecycle.dispatchEvent(new Event('change', {bubbles:true})); }
      const search = document.getElementById('searchInput');
      if (search) { search.value = id; search.dispatchEvent(new Event('input', {bubbles:true})); }
      setTimeout(() => {
        const card = [...document.querySelectorAll('#inventoryGrid .spool-card')].find(node => String(node.dataset.id).toLowerCase() === String(id).toLowerCase());
        card?.querySelector('button[data-action="edit"]')?.click();
      }, 90);
    }, 80);
  }

  function openPlacementFromScan(id) {
    document.getElementById('scanSpoolDialog')?.close();
    switchView('household');
    setTimeout(() => {
      const select = document.getElementById('moveSpoolV8');
      if (select) {
        const option = [...select.options].find(row => String(row.value).toLowerCase() === String(id).toLowerCase());
        if (option) { select.value = option.value; select.dispatchEvent(new Event('change', {bubbles:true})); }
        select.scrollIntoView({behavior:'smooth', block:'center'});
      }
    }, 100);
  }

  function updateEnhancedScanActions() {
    const dialog = document.getElementById('scanSpoolDialog');
    if (!dialog) return;
    const id = dialog.dataset.spoolId || '';
    const exists = Boolean(findSpool(id));
    const edit = document.getElementById('scanEditBtn');
    const placement = document.getElementById('scanPlacementBtn');
    if (edit) edit.hidden = !exists;
    if (placement) placement.hidden = !exists;
  }

  function enhanceExistingScanDialog() {
    const dialog = document.getElementById('scanSpoolDialog');
    if (!dialog || document.getElementById('scanAgainBtn')) return false;
    const body = dialog.querySelector('.dialog-body');
    if (!body) return false;
    const actions = document.createElement('div');
    actions.className = 'scan-actions scan-extended-actions';
    actions.innerHTML = '<button class="btn" id="scanEditBtn" type="button">Edit spool</button><button class="btn" id="scanPlacementBtn" type="button">Printer / AMS</button><button class="btn" id="scanAgainBtn" type="button">Scan another</button>';
    body.appendChild(actions);
    document.getElementById('scanEditBtn')?.addEventListener('click', () => { const id=dialog.dataset.spoolId; if (id) openEditFromScan(id); });
    document.getElementById('scanPlacementBtn')?.addEventListener('click', () => { const id=dialog.dataset.spoolId; if (id) openPlacementFromScan(id); });
    document.getElementById('scanAgainBtn')?.addEventListener('click', () => { dialog.close(); openScanner(); });
    const observer = new MutationObserver(updateEnhancedScanActions);
    observer.observe(dialog, {attributes:true, attributeFilter:['open','data-spool-id'], subtree:false});
    observer.observe(document.getElementById('scanSpoolBody'), {childList:true, subtree:true});
    updateEnhancedScanActions();
    return true;
  }

  function ensureScanEnhancement() {
    if (enhanceExistingScanDialog()) return;
    const observer = new MutationObserver(() => {
      if (enhanceExistingScanDialog()) observer.disconnect();
    });
    observer.observe(document.body, {childList:true, subtree:true});
  }

  function init() {
    injectStyles();
    injectScannerDialog();
    if (reconcileIncomingLegacyScan()) return;
    ensureLaunchButton();
    ensureScanEnhancement();
    window.addEventListener('pagehide', stopCamera);
    document.addEventListener('visibilitychange', () => { if (document.hidden && scanning) stopCamera(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
