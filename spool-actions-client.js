(() => {
  'use strict';

  const STORAGE_KEY = 'filament-inventory-v1';
  const core = globalThis.FilamentInventorySpoolActionCore;
  if (!core) return;

  const priorSetItem = Storage.prototype.setItem;
  let refreshQueued = false;
  let bodyObserver = null;

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const parse = (text, fallback = null) => { try { return JSON.parse(text); } catch { return fallback; } };
  const currentUser = () => globalThis.FilamentInventoryUsers?.currentUser?.() || 'Bill';
  const routedInventoryKey = () => globalThis.FilamentInventoryUsers?.physicalKey?.(STORAGE_KEY, currentUser()) || '';
  const isInventoryStorageKey = key => String(key || '') === STORAGE_KEY || String(key || '') === routedInventoryKey();
  const cssEscape = value => globalThis.CSS?.escape ? CSS.escape(String(value)) : String(value).replace(/["\\]/g, '\\$&');

  function readState() {
    const state = parse(localStorage.getItem(STORAGE_KEY) || '{}', {});
    return state && Array.isArray(state.spools) ? state : {spools:[]};
  }

  function findSpool(id) {
    const target = String(id || '').trim().toLowerCase();
    return readState().spools.find(spool => String(spool?.id || '').trim().toLowerCase() === target) || null;
  }

  function toast(message) {
    const node = $('toast');
    if (!node) return;
    node.textContent = message;
    node.classList.add('show');
    setTimeout(() => node.classList.remove('show'), 2600);
  }

  function switchView(view) {
    document.querySelector(`.tab[data-view="${view}"]`)?.click();
  }

  function ensureDialog() {
    let dialog = $('spoolActionDialog');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'spoolActionDialog';
    dialog.className = 'spool-action-dialog';
    dialog.setAttribute('aria-labelledby', 'spoolActionTitle');
    dialog.innerHTML = '<div class="spool-action-shell"><div class="spool-action-head"><div><span class="eyebrow">Physical spool</span><h2 id="spoolActionTitle">Spool</h2></div><button class="btn icon-btn" id="spoolActionClose" type="button" aria-label="Close physical spool">×</button></div><div class="spool-action-body" id="spoolActionBody"></div></div>';
    document.body.appendChild(dialog);
    $('spoolActionClose')?.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    return dialog;
  }

  function actionButton(action, prominent = false) {
    const className = prominent || action.kind === 'primary' ? 'btn btn-primary' : action.kind === 'danger' ? 'btn btn-danger' : 'btn';
    return `<button class="${className}" type="button" data-spool-sheet-action="${esc(action.key)}">${esc(action.label)}</button>`;
  }

  function renderDialog(spool) {
    const body = $('spoolActionBody');
    const title = $('spoolActionTitle');
    if (!body || !title) return;
    const summary = core.summary(spool);
    title.textContent = `${summary.id} · ${summary.colorName}`;
    const updated = summary.updatedAt ? new Date(summary.updatedAt).toLocaleString() : 'Not recorded';
    const primary = summary.primaryAction;
    const secondary = summary.actions.filter(action => !primary || action.key !== primary.key);
    const attention = summary.attention;
    body.innerHTML = `
      <section class="spool-action-summary" data-physical-spool="${esc(summary.id)}">
        <div class="spool-action-ident"><i class="spool-action-swatch" style="background:${esc(summary.colorHex)}"></i><div><strong>${esc(summary.id)}</strong><span>${esc(summary.brand)} · ${esc(summary.material)} · ${esc(summary.colorName)}</span></div></div>
        <div class="spool-action-metrics"><div><span>Remaining</span><strong>${esc(summary.remainingLabel)}</strong><small>${esc(summary.measurementSource)} · ${esc(summary.percentLabel)}</small></div><div><span>Inventory</span><strong>${esc(summary.stock)}</strong><small>${summary.archived ? 'Archived lifecycle' : 'Private active inventory'}</small></div><div><span>Physical location</span><strong>${esc(summary.placement)}</strong><small>${summary.loaded ? 'Loaded now' : 'Stored / placement state'}</small></div></div>
        ${attention ? `<div class="spool-action-updated" data-attention="${esc(attention.tone)}"><span>${esc(attention.label)}</span><strong>${esc(attention.detail)}</strong></div>` : ''}
        <div class="spool-action-updated"><span>Last updated</span><strong>${esc(updated)}</strong></div>
      </section>
      <section class="spool-action-grid" aria-label="Physical actions for ${esc(summary.id)}">${primary ? actionButton(primary, true) : ''}${secondary.map(action => actionButton(action)).join('')}<button class="btn" type="button" data-spool-sheet-action="scan">Scan another</button></section>
      <p class="spool-action-note">This physical-spool view reuses the authoritative inventory, Weigh, Printer / AMS, Labels, audit, sync, and lifecycle controls.</p>`;
  }

  function open(id) {
    const spool = findSpool(id);
    if (!spool) { toast(`Spool ${id || ''} is not in ${currentUser()}'s inventory.`); return false; }
    const dialog = ensureDialog();
    dialog.dataset.spoolId = spool.id;
    renderDialog(spool);
    if (!dialog.open) dialog.showModal();
    return true;
  }

  function close() {
    const dialog = $('spoolActionDialog');
    if (dialog?.open) dialog.close();
  }

  function prepareInventoryCard(id, callback) {
    switchView('inventory');
    const apply = () => {
      const lifecycle = $('lifecycleFilter');
      if (lifecycle) { lifecycle.value = 'all'; lifecycle.dispatchEvent(new Event('change', {bubbles:true})); }
      const search = $('searchInput');
      if (search) { search.value = id; search.dispatchEvent(new Event('input', {bubbles:true})); }
      setTimeout(() => {
        const card = document.querySelector(`#inventoryGrid .spool-card[data-id="${cssEscape(id)}"]`);
        callback(card || null);
      }, 70);
    };
    setTimeout(apply, 50);
  }

  function triggerNative(id, action) {
    const nativeAction = action === 'link' ? 'copylink' : action;
    close();
    const current = document.querySelector(`#inventoryGrid .spool-card[data-id="${cssEscape(id)}"] button[data-action="${nativeAction}"]`);
    if (current) { current.click(); return; }
    prepareInventoryCard(id, card => {
      const button = card?.querySelector(`button[data-action="${nativeAction}"]`);
      if (button) button.click();
      else toast(`${id} action is unavailable in the current state.`);
    });
  }

  function openPlacement(id) {
    const spool = findSpool(id);
    close();
    switchView('household');
    setTimeout(() => {
      const select = $('moveSpoolV8');
      if (!select) { toast('Printer / AMS controls are not ready yet.'); return; }
      const option = [...select.options].find(row => String(row.value).toLowerCase() === String(id).toLowerCase());
      if (option) {
        select.value = option.value;
        select.dispatchEvent(new Event('change', {bubbles:true}));
      }
      const loaded = spool?.placementState === 'Loaded';
      const printer = $('movePrinterV8');
      const feeder = $('moveFeederV8');
      const slot = $('moveSlotV8');
      if (printer) printer.value = loaded ? String(spool?.printerName || '') : '';
      if (feeder) feeder.value = loaded ? String(spool?.feederName || '') : '';
      if (slot) slot.value = loaded ? String(spool?.feederSlot || '') : '';
      select.scrollIntoView({behavior:'smooth', block:'center'});
      (printer || select).focus({preventScroll:true});
    }, 100);
  }

  function openLabel(id) {
    close();
    switchView('labels');
    setTimeout(() => {
      $('clearLabelsBtn')?.click();
      const search = $('labelSearch');
      if (search) {
        search.value = id;
        search.dispatchEvent(new Event('input', {bubbles:true}));
      }
      setTimeout(() => {
        const checkbox = document.querySelector(`#spoolPickList [data-label-id="${cssEscape(id)}"]`);
        if (!checkbox) { toast(`Could not prepare a QR label for ${id}.`); return; }
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change', {bubbles:true}));
        $('labelPreviewGrid')?.scrollIntoView({behavior:'smooth', block:'start'});
        $('printLabelsBtn')?.focus({preventScroll:true});
      }, 70);
    }, 80);
  }

  function openScanner() {
    close();
    if (globalThis.FilamentInventoryScanner?.open) {
      globalThis.FilamentInventoryScanner.open();
      return;
    }
    $('qrScanLaunch')?.click();
  }

  function runAction(id, action) {
    if (action === 'placement') { openPlacement(id); return; }
    if (action === 'label') { openLabel(id); return; }
    if (action === 'scan') { openScanner(); return; }
    if (['weigh','edit','archive','restore','delete','link'].includes(action)) triggerNative(id, action);
  }

  function enhanceInventoryCards() {
    document.documentElement.classList.add('spool-actions-enhanced');
    document.querySelectorAll('#inventoryGrid .spool-card').forEach(card => {
      if (card.querySelector('.spool-action-bar')) return;
      const id = card.dataset.id;
      const spool = findSpool(id);
      if (!spool) return;
      const summary = core.summary(spool);
      const native = card.querySelector(':scope > .card-actions');
      if (!native) return;
      const bar = document.createElement('div');
      bar.className = 'spool-action-bar';
      const primaryKey = summary.primaryAction?.key || (summary.archived ? 'restore' : 'weigh');
      const primaryLabel = summary.primaryAction?.label || (summary.archived ? 'Restore' : 'Weigh');
      bar.innerHTML = `<button class="btn" type="button" data-spool-primary="${esc(primaryKey)}" data-spool-id="${esc(id)}">${esc(primaryLabel)}</button><button class="btn btn-primary" type="button" data-spool-actions-open="${esc(id)}">Open spool</button>`;
      native.insertAdjacentElement('afterend', bar);
    });
  }

  function enhanceCommandRecent() {
    document.querySelectorAll('.inventory-command-spool').forEach(row => {
      if (row.querySelector('.inventory-command-more')) return;
      const id = row.querySelector('[data-command-open]')?.dataset.commandOpen;
      if (!id) return;
      const button = document.createElement('button');
      button.className = 'inventory-command-more';
      button.type = 'button';
      button.dataset.spoolActionsOpen = id;
      button.setAttribute('aria-label', `Open physical spool ${id}`);
      button.textContent = '•••';
      row.appendChild(button);
    });
  }

  function enhancePrinterSlots() {
    document.querySelectorAll('.printer-slot').forEach(row => {
      const actions = row.querySelector('.printer-slot-actions');
      if (!actions || actions.querySelector('.printer-slot-more')) return;
      const id = row.querySelector('[data-printer-weigh]')?.dataset.printerWeigh || row.querySelector('[data-printer-unload]')?.dataset.printerUnload;
      if (!id) return;
      const button = document.createElement('button');
      button.className = 'btn printer-slot-more';
      button.type = 'button';
      button.dataset.spoolActionsOpen = id;
      button.textContent = 'Open spool';
      actions.appendChild(button);
    });
  }

  function enhanceScanDialog() {
    const actions = document.querySelector('#scanSpoolDialog .scan-extended-actions');
    if (!actions || actions.querySelector('.scan-more-actions')) return;
    const button = document.createElement('button');
    button.className = 'btn btn-primary scan-more-actions';
    button.type = 'button';
    button.textContent = 'Open spool';
    button.addEventListener('click', () => {
      const dialog = $('scanSpoolDialog');
      const id = dialog?.dataset.spoolId;
      if (!id || !findSpool(id)) return;
      dialog.close();
      open(id);
    });
    actions.prepend(button);
  }

  function cleanIncomingScanUrl(url) {
    url.searchParams.delete('scan');
    url.searchParams.delete('spool');
    const query = url.searchParams.toString();
    history.replaceState(null, '', `${url.pathname}${query ? `?${query}` : ''}${url.hash}`);
  }

  function openIncomingScan() {
    const url = new URL(location.href);
    if (url.searchParams.get('scan') !== '1') return false;
    const id = String(url.searchParams.get('spool') || '').trim();
    if (!id || !findSpool(id)) return false;
    setTimeout(() => {
      $('scanSpoolDialog')?.close();
      if (open(id)) cleanIncomingScanUrl(url);
    }, 140);
    return true;
  }

  function refresh() {
    enhanceInventoryCards();
    enhanceCommandRecent();
    enhancePrinterSlots();
    enhanceScanDialog();
  }

  function queueRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => { refreshQueued = false; refresh(); });
  }

  Storage.prototype.setItem = function(key, value) {
    const result = priorSetItem.call(this, key, value);
    if (this === localStorage && isInventoryStorageKey(key)) queueRefresh();
    return result;
  };

  function bind() {
    document.addEventListener('click', event => {
      const openButton = event.target.closest('[data-spool-actions-open]');
      if (openButton) { event.preventDefault(); event.stopPropagation(); open(openButton.dataset.spoolActionsOpen); return; }
      const primary = event.target.closest('[data-spool-primary]');
      if (primary) { event.preventDefault(); triggerNative(primary.dataset.spoolId, primary.dataset.spoolPrimary); return; }
      const action = event.target.closest('[data-spool-sheet-action]');
      if (action) {
        const id = $('spoolActionDialog')?.dataset.spoolId;
        if (id) runAction(id, action.dataset.spoolSheetAction);
      }
    });
    window.addEventListener('storage', event => { if (isInventoryStorageKey(event.key)) queueRefresh(); });
  }

  function watch() {
    if (bodyObserver) return;
    bodyObserver = new MutationObserver(queueRefresh);
    bodyObserver.observe(document.body, {childList:true, subtree:true});
  }

  function init() {
    ensureDialog();
    bind();
    watch();
    queueRefresh();
    globalThis.FilamentInventorySpoolActions = Object.freeze({open, close, refresh:queueRefresh, openIncomingScan});
    openIncomingScan();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
