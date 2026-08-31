(() => {
  'use strict';

  const CONFIDENCE_LABELS = Object.freeze({Confirmed:'Confirmed',High:'ID high',Medium:'ID medium',Low:'ID low',Unknown:'ID unknown'});
  let observer = null;
  let queued = false;
  let interactionBound = false;
  const $ = id => document.getElementById(id);

  function evidenceFromCard(card) {
    const fill = card.querySelector('.fill-top');
    const percent = fill?.querySelector('strong')?.textContent?.trim() || '—';
    const text = String(fill?.querySelector('small')?.innerText || fill?.querySelector('small')?.textContent || '');
    const lines = text.split(/\n+/).map(value => value.trim()).filter(Boolean);
    const amount = lines[0] || 'Fill unknown';
    const source = lines[1] || 'Unknown';
    if (/^measured$/i.test(source)) return {percent,amount:amount.replace(/^~/,''),source:'Measured',tone:'measured'};
    if (/^(visual|estimated)$/i.test(source)) {
      const normalized = amount.replace(/^~/,'').replace(/^≈/,'');
      return {percent,amount:normalized === 'Fill unknown' ? 'Not measured' : `≈${normalized}`,source:'Visual estimate',tone:'estimated'};
    }
    return {percent:'—',amount:'Not measured',source:'Unknown',tone:'unknown'};
  }

  function normalizeConfidence(card) {
    const badge = card.querySelector('.confidence');
    if (!badge || badge.classList.contains('reorder-badge') || badge.classList.contains('archived-badge')) return;
    const raw = badge.dataset.identificationConfidence || badge.textContent.trim();
    badge.dataset.identificationConfidence = raw;
    badge.textContent = CONFIDENCE_LABELS[raw] || raw;
    badge.title = `Identification confidence: ${raw}`;
    badge.setAttribute('aria-label',`Identification confidence: ${raw}`);
  }

  function compactEvidence(card) {
    const fill = card.querySelector('.fill-top');
    if (!fill) return;
    const evidence = evidenceFromCard(card);
    fill.classList.add('inventory-quantity-row');
    fill.dataset.quantityEvidence = evidence.tone;
    fill.replaceChildren();
    const percent = document.createElement('strong');
    percent.className = 'inventory-quantity-percent';
    percent.textContent = evidence.percent;
    const amount = document.createElement('span');
    amount.className = 'inventory-quantity-amount';
    amount.textContent = evidence.amount;
    const chip = document.createElement('span');
    chip.className = 'inventory-evidence-chip';
    chip.dataset.evidence = evidence.tone;
    chip.textContent = evidence.source;
    fill.append(percent,amount,chip);
    const progress = card.querySelector('.progress');
    if (progress) progress.hidden = evidence.tone === 'unknown';
  }

  function ensureQuickActionButton(card) {
    const head = card.querySelector('.spool-head');
    const id = String(card.dataset.id || '').trim();
    if (!head || !id) return;
    let button = head.querySelector('.spool-card-more');
    if (!button) {
      button = document.createElement('button');
      button.className = 'spool-card-more';
      button.type = 'button';
      button.textContent = '•••';
      head.appendChild(button);
    }
    delete button.dataset.spoolActionsOpen;
    button.dataset.inventoryCardMenu = id;
    button.dataset.cohesionLabel = '1';
    button.classList.add('fi-spool-details-action');
    button.setAttribute('aria-label',`More actions for ${id}`);
    button.setAttribute('aria-haspopup','dialog');
    button.setAttribute('aria-controls','inventoryCardQuickActionsDialog');
    button.title = 'More spool actions';
  }

  function ensurePrimaryOpenButton(card) {
    const head = card.querySelector('.spool-head');
    const id = String(card.dataset.id || '').trim();
    if (!head || !id) return;
    let title = head.querySelector('.spool-title');
    if (!title) return;

    if (!(title instanceof HTMLButtonElement)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `${title.className} spool-card-primary`;
      while (title.firstChild) button.appendChild(title.firstChild);
      title.replaceWith(button);
      title = button;
    }

    title.classList.add('spool-card-primary');
    title.dataset.spoolPrimaryOpen = id;
    title.setAttribute('aria-label',`Open details for spool ${id}`);
    card.dataset.primarySpoolOpen = id;
    card.removeAttribute('role');
    card.removeAttribute('tabindex');
    card.removeAttribute('aria-label');
    // Prevent the older cohesion layer from attaching card-level button semantics.
    card.dataset.cohesionOpen = '1';
  }

  function isInteractiveTarget(target, card) {
    if (!(target instanceof Element)) return false;
    const interactive = target.closest('button, a, input, select, textarea, label, summary, [role="button"]');
    return Boolean(interactive && interactive !== card);
  }

  function openSpool(id, source) {
    const spoolId = String(id || '').trim();
    if (!spoolId) return false;
    return globalThis.FilamentInventoryWorkflows?.open?.(spoolId,{source}) ?? false;
  }

  function ensureQuickMenuDialog() {
    let dialog = $('inventoryCardQuickActionsDialog');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'inventoryCardQuickActionsDialog';
    dialog.className = 'spool-action-dialog inventory-card-menu-dialog';
    dialog.setAttribute('aria-labelledby','inventoryCardQuickActionsTitle');
    dialog.innerHTML = `
      <div class="spool-action-shell">
        <div class="spool-action-head">
          <div><span class="eyebrow">Spool actions</span><h2 id="inventoryCardQuickActionsTitle">Spool</h2></div>
          <button class="btn icon-btn" type="button" data-inventory-card-menu-close aria-label="Close spool actions">×</button>
        </div>
        <div class="spool-action-body">
          <div class="spool-action-grid" data-inventory-card-menu-actions></div>
        </div>
      </div>`;
    document.body.appendChild(dialog);
    return dialog;
  }

  function renderQuickMenu(id) {
    const dialog = ensureQuickMenuDialog();
    const escaped = globalThis.CSS?.escape ? CSS.escape(id) : id.replace(/["\\]/g,'\\$&');
    const card = document.querySelector(`#inventoryGrid .spool-card[data-id="${escaped}"]`);
    const archived = Boolean(card?.querySelector('button[data-action="restore"]'));
    const title = $('inventoryCardQuickActionsTitle');
    const actions = dialog.querySelector('[data-inventory-card-menu-actions]');
    if (title) title.textContent = id;
    dialog.dataset.spoolId = id;
    if (actions) actions.innerHTML = `
      <button class="btn btn-primary" type="button" data-inventory-card-action="open">Open details</button>
      <button class="btn" type="button" data-inventory-card-action="weigh">Weigh</button>
      <button class="btn" type="button" data-inventory-card-action="place">Printer / AMS</button>
      <button class="btn" type="button" data-inventory-card-action="label">QR label</button>
      <button class="btn" type="button" data-inventory-card-action="edit">Edit</button>
      <button class="btn" type="button" data-inventory-card-action="${archived ? 'restore' : 'archive'}">${archived ? 'Restore' : 'Archive'}</button>`;
    return dialog;
  }

  function openQuickMenu(id) {
    const dialog = renderQuickMenu(String(id || '').trim());
    if (!dialog.open) dialog.showModal();
  }

  function closeQuickMenu() {
    const dialog = $('inventoryCardQuickActionsDialog');
    if (dialog?.open) dialog.close();
  }

  function runQuickAction(action) {
    const dialog = $('inventoryCardQuickActionsDialog');
    const id = String(dialog?.dataset.spoolId || '').trim();
    if (!id) return;
    closeQuickMenu();
    const workflows = globalThis.FilamentInventoryWorkflows;
    if (!workflows) return;
    if (action === 'open') workflows.open?.(id,{source:'inventory-card-menu'});
    else workflows[action]?.(id);
  }

  function bindPrimaryInteraction() {
    if (interactionBound) return;
    interactionBound = true;

    document.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const menuButton = target.closest('[data-inventory-card-menu]');
      if (menuButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openQuickMenu(menuButton.dataset.inventoryCardMenu);
        return;
      }

      const menuAction = target.closest('[data-inventory-card-action]');
      if (menuAction) {
        event.preventDefault();
        runQuickAction(menuAction.dataset.inventoryCardAction);
        return;
      }

      const close = target.closest('[data-inventory-card-menu-close]');
      if (close) {
        event.preventDefault();
        closeQuickMenu();
        return;
      }

      const quickDialog = $('inventoryCardQuickActionsDialog');
      if (quickDialog?.open && target === quickDialog) {
        closeQuickMenu();
        return;
      }

      const primary = target.closest('[data-spool-primary-open]');
      if (primary) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openSpool(primary.dataset.spoolPrimaryOpen,'inventory-card-title');
        return;
      }

      const card = target.closest('#inventoryGrid .spool-card[data-primary-spool-open]');
      if (!card || isInteractiveTarget(target, card)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openSpool(card.dataset.primarySpoolOpen,'inventory-card');
    }, true);
  }

  function enhanceCard(card) {
    if (!(card instanceof HTMLElement)) return;
    card.classList.add('inventory-card-compact');
    normalizeConfidence(card);
    compactEvidence(card);
    ensureQuickActionButton(card);
    ensurePrimaryOpenButton(card);
  }

  function enhance() {
    queued = false;
    const grid = $('inventoryGrid');
    if (!grid) return;
    grid.querySelectorAll('.spool-card').forEach(enhanceCard);
    const search = $('searchInput');
    if (search) search.placeholder = 'Search spools…';
  }

  function queueEnhance() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(enhance);
  }

  function watch() {
    const grid = $('inventoryGrid');
    if (!grid || observer) return;
    observer = new MutationObserver(queueEnhance);
    observer.observe(grid,{childList:true});
  }

  function init() {
    bindPrimaryInteraction();
    ensureQuickMenuDialog();
    watch();
    queueEnhance();
    globalThis.FilamentInventoryCardPresentation = Object.freeze({refresh:queueEnhance});
    globalThis.FilamentInventoryEvents?.on?.('inventory:changed',queueEnhance);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
