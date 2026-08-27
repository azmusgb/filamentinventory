(() => {
  'use strict';

  const STORAGE_KEY = 'filament-inventory-v1';
  const core = globalThis.FilamentInventoryBulk;
  if (!core) return;

  const selected = new Set();
  let selecting = false;
  let gridObserver = null;
  let refreshQueued = false;

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const parse = (value, fallback = null) => { try { return JSON.parse(value); } catch { return fallback; } };
  const state = () => parse(localStorage.getItem(STORAGE_KEY) || '{}', {spools:[]}) || {spools:[]};
  const nowIso = () => new Date().toISOString();

  function visibleCards() {
    return [...document.querySelectorAll('#inventoryGrid .spool-card')].filter(card => !card.hidden && !card.classList.contains('inventory-command-hidden'));
  }

  function selectedIds() {
    return [...selected];
  }

  function ensureControls() {
    document.querySelectorAll('#inventoryGrid .spool-card').forEach(card => {
      const id = String(card.dataset.id || '').trim();
      if (!id || card.querySelector('[data-bulk-toggle]')) return;
      const button = document.createElement('button');
      button.className = 'bulk-select-control';
      button.type = 'button';
      button.dataset.bulkToggle = id;
      button.setAttribute('aria-label', `Select ${id}`);
      button.innerHTML = '<span aria-hidden="true">✓</span><b>Select</b>';
      card.prepend(button);
    });
  }

  function injectSelectButton() {
    const head = document.querySelector('#inventoryCommand .inventory-command-head');
    if (!head || document.querySelector('[data-bulk-start]')) return;
    const button = document.createElement('button');
    button.className = 'btn inventory-command-select';
    button.type = 'button';
    button.dataset.bulkStart = '1';
    button.textContent = 'Select';
    head.appendChild(button);
  }

  function injectDock() {
    if ($('bulkActionDock')) return;
    const dock = document.createElement('section');
    dock.id = 'bulkActionDock';
    dock.className = 'bulk-action-dock';
    dock.hidden = true;
    dock.setAttribute('aria-label', 'Selected spool actions');
    dock.innerHTML = `<div class="bulk-action-summary"><strong id="bulkSelectedCount">0 selected</strong><span id="bulkSelectedMeta">Choose one or more visible spools.</span></div><div class="bulk-action-buttons"><button class="btn" type="button" data-bulk-visible>Select visible</button><button class="btn" type="button" data-bulk-move>Move</button><button class="btn" type="button" data-bulk-store>Mark stored</button><button class="btn" type="button" data-bulk-labels>QR labels</button><button class="btn btn-danger" type="button" data-bulk-archive>Archive</button><button class="btn" type="button" data-bulk-restore>Restore</button><button class="btn btn-primary" type="button" data-bulk-done>Done</button></div>`;
    document.body.appendChild(dock);
  }

  function injectMoveDialog() {
    if ($('bulkMoveDialog')) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'bulkMoveDialog';
    dialog.className = 'bulk-move-dialog';
    dialog.innerHTML = `<form method="dialog"><div class="dialog-head"><div><span class="eyebrow">Bulk update</span><h3 id="bulkMoveTitle">Move selected spools</h3></div><button class="btn icon-btn" value="cancel" aria-label="Close">×</button></div><div class="dialog-body"><p class="muted" id="bulkMoveCopy">Update the storage location for the selected active spools.</p><div class="form-field"><label for="bulkLocation">Location</label><input class="field" id="bulkLocation" maxlength="60" placeholder="Rack A / Dry box / Shelf 2"/></div></div><div class="dialog-actions"><button class="btn" value="cancel">Cancel</button><button class="btn btn-primary" id="bulkMoveSave" type="button">Update location</button></div></form>`;
    document.body.appendChild(dialog);
  }

  function writeAndReload(nextState, message) {
    nextState.savedAt = nowIso();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    try { sessionStorage.setItem('filament-bulk-message', message); } catch {}
    location.reload();
  }

  function renderSelection() {
    document.documentElement.classList.toggle('bulk-selection-mode', selecting);
    ensureControls();
    injectSelectButton();
    injectDock();
    injectMoveDialog();

    document.querySelectorAll('[data-bulk-start]').forEach(button => {
      button.textContent = selecting ? 'Selecting…' : 'Select';
      button.setAttribute('aria-pressed', String(selecting));
    });

    document.querySelectorAll('#inventoryGrid .spool-card').forEach(card => {
      const active = selected.has(String(card.dataset.id));
      card.classList.toggle('bulk-selected', active);
      const toggle = card.querySelector('[data-bulk-toggle]');
      if (toggle) toggle.setAttribute('aria-pressed', String(active));
    });

    const dock = $('bulkActionDock');
    if (!dock) return;
    dock.hidden = !selecting;
    const summary = core.selectionSummary(state(), selectedIds());
    if ($('bulkSelectedCount')) $('bulkSelectedCount').textContent = `${summary.count} selected`;
    if ($('bulkSelectedMeta')) $('bulkSelectedMeta').textContent = summary.count ? `${summary.activeCount} active · ${summary.archivedCount} archived · ${summary.loadedCount} loaded` : 'Choose one or more visible spools.';
    dock.querySelector('[data-bulk-move]').disabled = !summary.canMove;
    dock.querySelector('[data-bulk-store]').disabled = !summary.canStore;
    dock.querySelector('[data-bulk-labels]').disabled = !summary.canLabel;
    dock.querySelector('[data-bulk-archive]').disabled = !summary.canArchive;
    dock.querySelector('[data-bulk-restore]').disabled = !summary.canRestore;
  }

  function queueRender() {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => { refreshQueued = false; renderSelection(); });
  }

  function startSelection() {
    selecting = true;
    selected.clear();
    queueRender();
  }

  function stopSelection() {
    selecting = false;
    selected.clear();
    queueRender();
  }

  function toggle(id) {
    if (!selecting) selecting = true;
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    queueRender();
  }

  function selectVisible() {
    if (!selecting) selecting = true;
    const cards = visibleCards();
    const everySelected = cards.length > 0 && cards.every(card => selected.has(String(card.dataset.id)));
    cards.forEach(card => {
      const id = String(card.dataset.id || '');
      if (!id) return;
      if (everySelected) selected.delete(id); else selected.add(id);
    });
    queueRender();
  }

  function openMoveDialog(storeMode = false) {
    const dialog = $('bulkMoveDialog');
    if (!dialog) return;
    dialog.dataset.mode = storeMode ? 'store' : 'move';
    $('bulkMoveTitle').textContent = storeMode ? 'Mark selected spools stored' : 'Move selected spools';
    $('bulkMoveCopy').textContent = storeMode ? 'Clear Printer / AMS assignments for the selected active spools. Optionally set their storage location.' : 'Update the location for the selected active spools without changing Printer / AMS state.';
    $('bulkMoveSave').textContent = storeMode ? 'Mark stored' : 'Update location';
    $('bulkLocation').value = '';
    dialog.showModal();
    setTimeout(() => $('bulkLocation')?.focus(), 30);
  }

  function saveMove() {
    const mode = $('bulkMoveDialog')?.dataset.mode || 'move';
    const locationValue = String($('bulkLocation')?.value || '').trim();
    if (mode === 'move' && !locationValue) return $('bulkLocation')?.focus();
    const at = nowIso();
    const current = state();
    const result = mode === 'store' ? core.markStored(current, selectedIds(), locationValue, at) : core.moveLocation(current, selectedIds(), locationValue, at);
    if (!result.changed) return;
    $('bulkMoveDialog')?.close();
    writeAndReload(result.state, mode === 'store' ? `${result.changed} spools marked stored.` : `${result.changed} spool locations updated.`);
  }

  function archiveSelected() {
    const summary = core.selectionSummary(state(), selectedIds());
    if (!summary.activeCount) return;
    if (!confirm(`Archive ${summary.activeCount} selected active spool${summary.activeCount === 1 ? '' : 's'}? Measurement history will be preserved.`)) return;
    const result = core.archive(state(), selectedIds(), nowIso());
    if (result.changed) writeAndReload(result.state, `${result.changed} spools archived.`);
  }

  function restoreSelected() {
    const summary = core.selectionSummary(state(), selectedIds());
    if (!summary.archivedCount) return;
    const result = core.restore(state(), selectedIds(), nowIso());
    if (result.changed) writeAndReload(result.state, `${result.changed} spools restored.`);
  }

  function selectLabelsSequentially(ids, index = 0) {
    if (index >= ids.length) {
      $('labelPreviewGrid')?.scrollIntoView({behavior:'smooth', block:'start'});
      return;
    }
    const input = [...document.querySelectorAll('[data-label-id]')].find(node => String(node.dataset.labelId) === String(ids[index]));
    if (input && !input.checked) {
      input.checked = true;
      input.dispatchEvent(new Event('change', {bubbles:true}));
    }
    setTimeout(() => selectLabelsSequentially(ids, index + 1), 20);
  }

  function openLabels() {
    const ids = selectedIds();
    if (!ids.length) return;
    stopSelection();
    document.querySelector('.tab[data-view="labels"]')?.click();
    setTimeout(() => {
      const search = $('labelSearch');
      if (search) { search.value = ''; search.dispatchEvent(new Event('input', {bubbles:true})); }
      $('clearLabelsBtn')?.click();
      setTimeout(() => selectLabelsSequentially(ids), 60);
    }, 90);
  }

  function showReloadMessage() {
    try {
      const message = sessionStorage.getItem('filament-bulk-message');
      if (!message) return;
      sessionStorage.removeItem('filament-bulk-message');
      setTimeout(() => {
        const toast = $('toast');
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2600);
      }, 250);
    } catch {}
  }

  function bind() {
    document.addEventListener('click', event => {
      if (event.target.closest('[data-bulk-start]')) { selecting ? stopSelection() : startSelection(); return; }
      const toggleButton = event.target.closest('[data-bulk-toggle]');
      if (toggleButton) { event.preventDefault(); event.stopPropagation(); toggle(toggleButton.dataset.bulkToggle); return; }
      if (selecting) {
        const card = event.target.closest('#inventoryGrid .spool-card');
        if (card && !event.target.closest('button,a,input,select,textarea')) { event.preventDefault(); toggle(String(card.dataset.id)); return; }
      }
      if (event.target.closest('[data-bulk-visible]')) { selectVisible(); return; }
      if (event.target.closest('[data-bulk-move]')) { openMoveDialog(false); return; }
      if (event.target.closest('[data-bulk-store]')) { openMoveDialog(true); return; }
      if (event.target.closest('[data-bulk-labels]')) { openLabels(); return; }
      if (event.target.closest('[data-bulk-archive]')) { archiveSelected(); return; }
      if (event.target.closest('[data-bulk-restore]')) { restoreSelected(); return; }
      if (event.target.closest('[data-bulk-done]')) { stopSelection(); return; }
      if (event.target.closest('#bulkMoveSave')) { saveMove(); }
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && selecting && !$('bulkMoveDialog')?.open) stopSelection();
    });
  }

  function watchGrid() {
    const grid = $('inventoryGrid');
    if (!grid || gridObserver) return;
    gridObserver = new MutationObserver(queueRender);
    gridObserver.observe(grid, {childList:true, subtree:false});
  }

  function init() {
    bind();
    watchGrid();
    queueRender();
    showReloadMessage();
    globalThis.FilamentInventoryBulkActions = Object.freeze({start:startSelection, stop:stopSelection, selected:() => selectedIds()});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
