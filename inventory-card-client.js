(() => {
  'use strict';

  const STORAGE_KEY = 'filament-inventory-v1';
  const CONFIDENCE_LABELS = Object.freeze({Confirmed:'Confirmed',High:'ID high',Medium:'ID medium',Low:'ID low',Unknown:'ID unknown'});
  const ID_ATTENTION = new Set(['Medium','Low','Unknown']);
  let observer = null;
  let queued = false;
  let interactionBound = false;
  const $ = id => document.getElementById(id);

  function readState() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return value && Array.isArray(value.spools) ? value : {spools:[]};
    } catch {
      return {spools:[]};
    }
  }

  function spoolForCard(card) {
    const id = String(card?.dataset?.id || '').trim().toLowerCase();
    if (!id) return null;
    return readState().spools.find(spool => String(spool?.id || '').trim().toLowerCase() === id) || null;
  }

  function canonicalSummary(card) {
    const spool = spoolForCard(card);
    const contract = globalThis.FilamentInventorySpoolContract;
    if (!spool || !contract?.workflowSummary) return null;
    return contract.workflowSummary(spool,{owner:readState().profile || spool.owner || 'Bill'});
  }

  function fallbackEvidence(card) {
    const fill = card.querySelector('.fill-top');
    const percent = fill?.querySelector('strong')?.textContent?.trim() || '—';
    const text = String(fill?.querySelector('small')?.innerText || fill?.querySelector('small')?.textContent || '');
    const lines = text.split(/\n+/).map(value => value.trim()).filter(Boolean);
    const amount = lines[0] || 'Fill unknown';
    const source = lines[1] || 'Unknown';
    if (/^measured$/i.test(source)) {
      return {percent,amount:amount.replace(/^~/,''),source:'Measured · scale',tone:'measured',percentValue:Number.parseFloat(percent)};
    }
    if (/^(visual|estimated)$/i.test(source)) {
      const normalized = amount.replace(/^~/,'').replace(/^≈/,'');
      return {
        percent:percent === '—' ? '—' : `≈${percent.replace(/^≈/,'')}`,
        amount:normalized === 'Fill unknown' ? 'Amount unknown' : `≈${normalized}`,
        source:'Estimated · visual',
        tone:'estimated',
        percentValue:Number.parseFloat(percent),
      };
    }
    return {percent:'—',amount:'Amount unknown',source:'Unknown · verify',tone:'unknown',percentValue:null};
  }

  function evidenceModel(card, summary = canonicalSummary(card)) {
    if (!summary) return fallbackEvidence(card);
    const measurement = summary.measurement || {};
    if (measurement.source === 'Measured') {
      return {
        percent:measurement.percent == null ? '—' : `${Math.round(Number(measurement.percent))}%`,
        amount:measurement.grams == null ? 'Amount unknown' : `${Math.round(Number(measurement.grams))} g`,
        source:'Measured · scale',
        tone:'measured',
        percentValue:measurement.percent == null ? null : Number(measurement.percent),
      };
    }
    if (measurement.source === 'Estimated') {
      return {
        percent:measurement.percent == null ? '—' : `≈${Math.round(Number(measurement.percent))}%`,
        amount:measurement.grams == null ? 'Amount unknown' : `≈${Math.round(Number(measurement.grams))} g`,
        source:measurement.evidence === 'usage' ? 'Estimated · usage' : 'Estimated · visual',
        tone:'estimated',
        percentValue:measurement.percent == null ? null : Number(measurement.percent),
      };
    }
    return {percent:'—',amount:'Amount unknown',source:'Unknown · verify',tone:'unknown',percentValue:null};
  }

  function normalizeLegacyHeaderBadge(card, summary = canonicalSummary(card)) {
    const badge = card.querySelector('.confidence');
    if (!badge) return;
    if (!badge.classList.contains('reorder-badge') && !badge.classList.contains('archived-badge')) {
      const raw = summary?.spool?.confidence || badge.dataset.identificationConfidence || badge.textContent.trim();
      badge.dataset.identificationConfidence = raw;
      badge.textContent = CONFIDENCE_LABELS[raw] || raw;
      badge.title = `Identification confidence: ${raw}`;
      badge.setAttribute('aria-label',`Identification confidence: ${raw}`);
    }
    // V12 inventory cards move lifecycle and identification signals below quantity evidence.
    badge.hidden = true;
    badge.setAttribute('aria-hidden','true');
    card.classList.add('inventory-head-status-demoted');
  }

  function compactEvidence(card, summary = canonicalSummary(card)) {
    const fill = card.querySelector('.fill-top');
    if (!fill) return;
    const evidence = evidenceModel(card,summary);
    fill.classList.add('inventory-quantity-row');
    fill.dataset.quantityEvidence = evidence.tone;
    fill.replaceChildren();

    const primary = document.createElement('span');
    primary.className = 'inventory-quantity-primary';
    const amount = document.createElement('strong');
    amount.className = 'inventory-quantity-amount';
    amount.textContent = evidence.amount;
    const percent = document.createElement('span');
    percent.className = 'inventory-quantity-percent';
    percent.textContent = evidence.percent;
    primary.append(amount,percent);

    const chip = document.createElement('span');
    chip.className = 'inventory-evidence-chip';
    chip.dataset.evidence = evidence.tone;
    chip.textContent = evidence.source;
    fill.append(primary,chip);

    const progress = card.querySelector('.progress');
    if (progress) {
      const known = evidence.percentValue !== null && Number.isFinite(evidence.percentValue);
      progress.hidden = !known;
      if (known) {
        const value = Math.max(0,Math.min(100,Number(evidence.percentValue)));
        const bar = progress.querySelector('i');
        if (bar) bar.style.width = `${value}%`;
        progress.setAttribute('role','progressbar');
        progress.setAttribute('aria-label','Filament remaining');
        progress.setAttribute('aria-valuemin','0');
        progress.setAttribute('aria-valuemax','100');
        progress.setAttribute('aria-valuenow',String(Math.round(value)));
      } else {
        progress.removeAttribute('role');
        progress.removeAttribute('aria-label');
        progress.removeAttribute('aria-valuemin');
        progress.removeAttribute('aria-valuemax');
        progress.removeAttribute('aria-valuenow');
      }
    }
  }

  function stateChip(label,state) {
    const chip = document.createElement('span');
    chip.className = 'inventory-state-chip';
    chip.dataset.state = state;
    chip.textContent = label;
    return chip;
  }

  function renderStateRow(card, summary = canonicalSummary(card)) {
    let row = card.querySelector('.inventory-state-row');
    if (!row) {
      row = document.createElement('div');
      row.className = 'inventory-state-row';
      const progress = card.querySelector('.progress');
      if (progress) progress.insertAdjacentElement('afterend',row);
      else card.querySelector('.spool-body')?.appendChild(row);
    }
    row.replaceChildren();

    if (!summary) {
      row.hidden = true;
      return;
    }

    const {spool,stock,loaded,archived,placementLabel} = summary;
    card.dataset.stockState = String(stock || '').toLowerCase();
    card.dataset.placementState = loaded ? 'loaded' : 'stored';
    card.dataset.quantityEvidence = evidenceModel(card,summary).tone;

    const spoken = [];
    if (archived) {
      row.appendChild(stateChip('Archived','archived'));
      spoken.push('Archived');
    } else {
      if (stock === 'Empty') {
        row.appendChild(stateChip('Empty','empty'));
        spoken.push('Empty');
      } else if (stock === 'Low') {
        row.appendChild(stateChip('Low stock','low'));
        spoken.push('Low stock');
      }
      if (loaded) {
        row.appendChild(stateChip('Loaded','loaded'));
        spoken.push('Loaded');
      }

      const placement = document.createElement('span');
      placement.className = 'inventory-placement';
      placement.textContent = loaded ? placementLabel : `Stored · ${spool.location || 'Unassigned'}`;
      row.appendChild(placement);
      spoken.push(placement.textContent);
    }

    const confidence = spool.confidence || 'Unknown';
    if (!archived && ID_ATTENTION.has(confidence)) {
      const id = document.createElement('span');
      id.className = 'inventory-id-chip';
      id.dataset.idConfidence = confidence.toLowerCase();
      id.textContent = CONFIDENCE_LABELS[confidence] || `ID ${confidence.toLowerCase()}`;
      id.title = `Identification confidence: ${confidence}`;
      row.appendChild(id);
      spoken.push(`Identification confidence ${confidence}`);
      card.dataset.identificationAttention = confidence.toLowerCase();
    } else {
      delete card.dataset.identificationAttention;
    }

    row.hidden = row.childElementCount === 0;
    row.setAttribute('aria-label',spoken.join(', '));
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
    const summary = canonicalSummary(card);
    card.classList.add('inventory-card-compact','inventory-evidence-v12');
    normalizeLegacyHeaderBadge(card,summary);
    compactEvidence(card,summary);
    renderStateRow(card,summary);
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
    globalThis.FilamentInventoryEvents?.on?.('measurement:saved',queueEnhance);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
