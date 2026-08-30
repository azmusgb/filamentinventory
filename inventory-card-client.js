(() => {
  'use strict';

  const CONFIDENCE_LABELS = Object.freeze({Confirmed:'Confirmed',High:'ID high',Medium:'ID medium',Low:'ID low',Unknown:'ID unknown'});
  let observer = null;
  let queued = false;
  let interactionBound = false;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

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

  function ensureDetailsAction(card) {
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
    button.setAttribute('aria-label',`More actions for ${id}`);
    button.setAttribute('aria-haspopup','dialog');
    button.setAttribute('aria-controls','inventoryCardQuickActionsDialog');
    button.title = 'More spool actions';
  }

  function ensurePrimaryOpenSemantics(card) {
    const id = String(card.dataset.id || '').trim();
    if (!id) return;
    card.setAttribute('tabindex','0');
    card.setAttribute('role','button');
    card.setAttribute('aria-label',`Open details for spool ${id}`);
    card.dataset.primarySpoolOpen = id;
    // Prevent the older cohesion layer from attaching a second card-open handler.
    card.dataset.cohesionOpen = '1';
  }

  function isInteractiveTarget(target, card) {
    if (!(target instanceof Element)) return false;
    const interactive = target.closest('button, a, input, select, textarea, label, summary, [role="button"]');
    return Boolean(interactive && interactive !== card);
  }

  function openCard(card) {
    const id = String(card?.dataset.primarySpoolOpen || card?.dataset.id || '').trim();
    if (!id) return false;
    return globalThis.FilamentInventoryWorkflows?.open?.(id,{source:'inventory-card'}) ?? false;
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
    const card = document.querySelector(`#inventoryGrid .spool-card[data-id="${globalThis.CSS?.escape ? CSS.escape(id) : id}"]`);
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
      const menuButton = event.target instanceof Element ? event.target.closest('[data-inventory-card-menu]') : null;
      if (menuButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openQuickMenu(menuButton.dataset.inventoryCardMenu);
        return;
      }

      const menuAction = event.target instanceof Element ? event.target.closest('[data-inventory-card-action]') : null;
      if (menuAction) {
        event.preventDefault();
        runQuickAction(menuAction.dataset.inventoryCardAction);
        return;
      }

      const close = event.target instanceof Element ? event.target.closest('[data-inventory-card-menu-close]') : null;
      if (close) {
        event.preventDefault();
        closeQuickMenu();
        return;
      }

      const quickDialog = $('inventoryCardQuickActionsDialog');
      if (quickDialog?.open && event.target === quickDialog) {
        closeQuickMenu();
        return;
      }

      const card = event.target instanceof Element ? event.target.closest('#inventoryGrid .spool-card[data-primary-spool-open]') : null;
      if (!card || isInteractiveTarget(event.target, card)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openCard(card);
    }, true);

    document.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const card = event.target instanceof Element ? event.target.closest('#inventoryGrid .spool-card[data-primary-spool-open]') : null;
      if (!card || event.target !== card) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openCard(card);
    }, true);
  }

  function enhanceCard(card) {
    if (!(card instanceof HTMLElement)) return;
    card.classList.add('inventory-card-compact');
    normalizeConfidence(card);
    compactEvidence(card);
    ensureDetailsAction(card);
    ensurePrimaryOpenSemantics(card);
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
