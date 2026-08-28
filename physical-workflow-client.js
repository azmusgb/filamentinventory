(() => {
  'use strict';

  const STORAGE_KEY = 'filament-inventory-v1';
  const workflow = globalThis.FilamentInventoryPhysicalWorkflow;
  if (!workflow) return;

  let refreshQueued = false;
  let observer = null;
  let toastTimer = null;

  const parse = (value, fallback = null) => { try { return JSON.parse(value); } catch { return fallback; } };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const cssEscape = value => globalThis.CSS?.escape ? CSS.escape(String(value)) : String(value).replace(/["\\]/g, '\\$&');

  function ensureStyles() {
    const href = '/css/components/physical-workflow.css';
    if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.fiComponent = 'physical-workflow';
    document.head.append(link);
  }

  function readState() {
    const state = parse(localStorage.getItem(STORAGE_KEY) || '{}', {});
    return state && Array.isArray(state.spools) ? state : {spools:[]};
  }

  function writeState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function findSpool(id) {
    return workflow.findSpool(readState(), id);
  }

  function toast(message) {
    const node = document.getElementById('toast');
    if (!node) return;
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 2800);
  }

  function badge(label, tone = 'muted') {
    return `<span class="physical-workflow-badge" data-tone="${esc(tone)}">${esc(label)}</span>`;
  }

  function stepMarkup(step) {
    return `<div class="physical-workflow-step" data-state="${esc(step.state)}"><i aria-hidden="true"></i><div><strong>${esc(step.label)}</strong><span>${esc(step.detail)}</span></div></div>`;
  }

  function detailMarkup(details) {
    if (!details.length) return '';
    return `<details class="physical-workflow-details"><summary>Product & spool details</summary><dl>${details.map(row => `<div><dt>${esc(row.label)}</dt><dd>${esc(row.value)}</dd></div>`).join('')}</dl></details>`;
  }

  function decorateSpoolDialog() {
    const dialog = document.getElementById('spoolActionDialog');
    const body = document.getElementById('spoolActionBody');
    const id = dialog?.dataset.spoolId;
    if (!dialog || !body || !id) return;
    const spool = findSpool(id);
    if (!spool) return;
    const summary = workflow.summary(spool);
    const ident = body.querySelector('.spool-action-ident');
    if (ident) {
      const copy = ident.querySelector('div');
      const secondary = copy?.querySelector('span');
      if (secondary) secondary.textContent = `${summary.productLabel} · ${summary.colorName}`;
    }

    let workflowCard = body.querySelector('.physical-workflow-card');
    if (!workflowCard) {
      workflowCard = document.createElement('section');
      workflowCard.className = 'physical-workflow-card';
      const summaryNode = body.querySelector('.spool-action-summary');
      summaryNode?.insertAdjacentElement('afterend', workflowCard);
    }

    const stockTone = summary.stock === 'Empty' || summary.stock === 'Low' ? 'danger' : summary.stock === 'Unknown' ? 'warning' : 'success';
    const useAction = summary.recommendation.key === 'use'
      ? `<button class="btn btn-primary physical-workflow-next-action" type="button" data-physical-mark-used="${esc(summary.id)}">${esc(summary.recommendation.label)}</button>`
      : '';
    workflowCard.innerHTML = `
      <div class="physical-workflow-status" aria-label="Canonical spool status">
        ${badge(summary.lifecycle, summary.archived ? 'muted' : summary.loaded ? 'info' : 'success')}
        ${badge(summary.evidenceLabel, summary.evidenceTone)}
        ${summary.reorderNeeded || summary.stock === 'Unknown' ? badge(summary.stock, stockTone) : ''}
      </div>
      <div class="physical-workflow-next"><span>Recommended next step</span><strong>${esc(summary.recommendation.label)}</strong><p>${esc(summary.recommendation.reason)}</p>${useAction}</div>
      <div class="physical-workflow-steps" aria-label="Physical spool workflow">${summary.steps.map(stepMarkup).join('')}</div>
      ${detailMarkup(summary.details)}
      ${summary.lastUsedAt ? `<div class="physical-workflow-last-used"><span>Last used</span><strong>${esc(new Date(summary.lastUsedAt).toLocaleString())}</strong></div>` : ''}`;

    const metric = body.querySelector('.spool-action-metrics > div:first-child small');
    if (metric) metric.textContent = `${summary.evidenceLabel} · ${summary.percentLabel}`;
  }

  function spoolIdFromPrinterRow(row) {
    return row?.querySelector('[data-printer-weigh]')?.dataset.printerWeigh
      || row?.querySelector('[data-printer-unload]')?.dataset.printerUnload
      || row?.querySelector('[data-spool-actions-open]')?.dataset.spoolActionsOpen
      || '';
  }

  function decoratePrinterSlots() {
    document.querySelectorAll('.printer-slot').forEach(row => {
      const id = spoolIdFromPrinterRow(row);
      const spool = id ? findSpool(id) : null;
      if (!spool) return;
      const summary = workflow.summary(spool);
      row.dataset.canonicalEvidence = summary.measurement.source.toLowerCase();
      row.dataset.canonicalStock = summary.stock.toLowerCase();
      const main = row.querySelector('.printer-slot-main');
      const title = main?.querySelector('strong');
      const sub = main?.querySelector('span');
      if (title) title.textContent = `${summary.id} · ${summary.productLabel} · ${summary.colorName}`;
      if (sub) {
        sub.textContent = `${summary.remainingLabel} · ${summary.percentLabel} · ${summary.evidenceLabel}${summary.reorderNeeded ? ' · Reorder' : ''}`;
      }
      let chip = main?.querySelector('.physical-workflow-inline-badge');
      if (!chip && main) {
        chip = document.createElement('span');
        chip.className = 'physical-workflow-inline-badge';
        main.appendChild(chip);
      }
      if (chip) {
        chip.dataset.tone = summary.evidenceTone;
        chip.textContent = summary.evidenceLabel;
      }
    });
  }

  function selectedWeighSpool() {
    const id = document.getElementById('weighSpool')?.value;
    return id ? findSpool(id) : null;
  }

  function decorateWeigh() {
    const select = document.getElementById('weighSpool');
    const holder = select?.closest('.form-field');
    if (!select || !holder) return;
    let status = document.getElementById('weighEvidenceStatus');
    if (!status) {
      status = document.createElement('div');
      status.id = 'weighEvidenceStatus';
      status.className = 'weigh-evidence-status';
      status.setAttribute('aria-live', 'polite');
      holder.appendChild(status);
    }
    const spool = selectedWeighSpool();
    if (!spool) {
      status.textContent = 'Choose a spool to review its current evidence.';
      status.dataset.tone = 'muted';
      return;
    }
    const summary = workflow.summary(spool);
    status.dataset.tone = summary.evidenceTone;
    if (summary.measurement.source === 'Measured') {
      status.innerHTML = `<strong>${esc(summary.remainingLabel)} currently measured</strong><span>${esc(summary.evidenceLabel)} · ${esc(summary.percentLabel)}. Saving another scale reading replaces the prior measurement.</span>`;
    } else if (summary.measurement.source === 'Estimated') {
      status.innerHTML = `<strong>${esc(summary.remainingLabel)} currently estimated</strong><span>${esc(summary.evidenceLabel)} · ${esc(summary.percentLabel)}. This scale workflow upgrades the estimate to measured evidence.</span>`;
    } else {
      status.innerHTML = '<strong>Remaining filament is unknown</strong><span>No usable amount is recorded yet. This scale workflow will create authoritative measured evidence.</span>';
    }
  }

  function markUsed(id) {
    const result = workflow.markUsed(readState(), id);
    if (!result.changed) {
      const message = result.reason === 'not-measured'
        ? 'Verify this spool on the scale before marking it used.'
        : result.reason === 'not-loaded'
          ? 'Load this spool to a printer or AMS before marking it used.'
          : result.reason === 'archived'
            ? 'Restore this spool before marking it used.'
            : 'Could not record spool use.';
      toast(message);
      return;
    }
    writeState(result.state);
    globalThis.FilamentInventoryEvents?.emit('inventory:changed', {spoolId:id, reason:'physical-use'});
    globalThis.FilamentInventoryEvents?.emit('spool:used', {spoolId:id, at:result.spool.lastUsedAt});
    toast(`${id} use recorded.`);
    queueRefresh();
  }

  function decorate() {
    decorateSpoolDialog();
    decoratePrinterSlots();
    decorateWeigh();
  }

  function queueRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      decorate();
    });
  }

  function bind() {
    document.addEventListener('click', event => {
      const used = event.target.closest('[data-physical-mark-used]');
      if (used) {
        event.preventDefault();
        markUsed(used.dataset.physicalMarkUsed);
      }
    });
    document.addEventListener('change', event => {
      if (event.target?.id === 'weighSpool') queueRefresh();
    });
    globalThis.FilamentInventoryEvents?.on?.('inventory:changed', queueRefresh);
    globalThis.FilamentInventoryEvents?.on?.('measurement:saved', queueRefresh);
    window.addEventListener('storage', event => { if (event.key === STORAGE_KEY) queueRefresh(); });
  }

  function watch() {
    if (observer) return;
    observer = new MutationObserver(queueRefresh);
    observer.observe(document.body, {childList:true, subtree:true});
  }

  function init() {
    ensureStyles();
    bind();
    watch();
    queueRefresh();
    globalThis.FilamentInventoryPhysicalWorkflowUI = Object.freeze({refresh:queueRefresh, markUsed});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
