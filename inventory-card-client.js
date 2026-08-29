(() => {
  'use strict';

  const CONFIDENCE_LABELS = Object.freeze({Confirmed:'Confirmed',High:'ID high',Medium:'ID medium',Low:'ID low',Unknown:'ID unknown'});
  let observer = null;
  let queued = false;
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

  function openSpool(id) {
    const actions = globalThis.FilamentInventorySpoolActions;
    if (actions?.openPhysical) return actions.openPhysical(id,{source:'inventory'}) !== false;
    if (actions?.open) return actions.open(id,{source:'inventory'}) !== false;
    const fallback = document.querySelector(`[data-spool-actions-open="${CSS.escape(id)}"]`);
    if (fallback) { fallback.click(); return true; }
    return false;
  }

  function ensureDetailsAction(card) {
    const head = card.querySelector('.spool-head');
    const id = String(card.dataset.id || '').trim();
    if (!head || !id || head.querySelector('.spool-card-more')) return;
    const button = document.createElement('button');
    button.className = 'spool-card-more';
    button.type = 'button';
    button.dataset.spoolActionsOpen = id;
    button.setAttribute('aria-label',`Open ${id} spool details`);
    button.title = 'Open spool details';
    button.textContent = '•••';
    head.appendChild(button);
  }

  function ensureIdentityAction(card) {
    const id = String(card.dataset.id || '').trim();
    const target = card.querySelector('.spool-title');
    if (!id || !target || target.dataset.inventoryOpenBound === '1') return;
    target.dataset.inventoryOpenBound = '1';
    target.tabIndex = 0;
    target.setAttribute('role','button');
    target.setAttribute('aria-label',`Open ${id} spool details`);
    target.title = 'Open spool details';
    target.addEventListener('click',() => openSpool(id));
    target.addEventListener('keydown',event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openSpool(id);
    });
  }

  function enhanceCard(card) {
    if (!(card instanceof HTMLElement)) return;
    card.classList.add('inventory-card-compact');
    normalizeConfidence(card);
    compactEvidence(card);
    ensureDetailsAction(card);
    ensureIdentityAction(card);
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
    watch();
    queueEnhance();
    globalThis.FilamentInventoryCardPresentation = Object.freeze({refresh:queueEnhance});
    globalThis.FilamentInventoryEvents?.on?.('inventory:changed',queueEnhance);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();