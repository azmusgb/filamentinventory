(() => {
  'use strict';

  const core = globalThis.FilamentInventoryPrintReadiness;
  if (!core) return;

  const KEY = 'filament-inventory-v1';
  const $ = id => document.getElementById(id);
  const parse = (value, fallback = null) => { try { return JSON.parse(value); } catch { return fallback; } };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text = value => String(value ?? '').trim();
  let lastResult = null;
  let selectedSpoolId = '';
  let toastTimer = null;

  function readState() {
    const value = parse(localStorage.getItem(KEY) || '{}', {});
    return value && Array.isArray(value.spools) ? value : {spools:[], printJobs:[]};
  }

  function writeState(value) {
    localStorage.setItem(KEY, JSON.stringify(value));
  }

  function emit(name, detail = {}) {
    globalThis.FilamentInventoryEvents?.emit?.(name, detail);
  }

  function toast(message) {
    const node = $('toast');
    if (!node) return;
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 2800);
  }

  function ensureStyles() {
    const href = '/css/components/print-job.css';
    if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.fiComponent = 'print-job';
    document.head.appendChild(link);
  }

  function ensureLauncher() {
    if (document.querySelector('[data-print-readiness]:not([data-print-launcher="queue"])')) return;
    const host = document.querySelector('.fi-home-actions, #dashboardView .hero-actions');
    if (!host) return;
    const button = document.createElement('button');
    button.className = 'btn btn-primary';
    button.type = 'button';
    button.dataset.printReadiness = '';
    button.dataset.printLauncher = 'home';
    button.setAttribute('aria-haspopup','dialog');
    button.setAttribute('aria-controls','printReadinessDialog');
    button.textContent = 'Can I print this?';
    host.prepend(button);
  }

  function defaultMargin() {
    return globalThis.FilamentInventoryProfileUI?.read?.()?.printing?.safetyMargin ?? 10;
  }

  function optionsFromState() {
    const value = readState();
    const printers = [...new Set(value.spools.filter(row => row?.placementState === 'Loaded').map(row => text(row.printerName)).filter(Boolean))].sort();
    const feeders = [...new Set(value.spools.filter(row => row?.placementState === 'Loaded').map(row => text(row.feederName)).filter(Boolean))].sort();
    const printerList = $('printPrinterNames');
    const feederList = $('printFeederNames');
    if (printerList) printerList.innerHTML = printers.map(item => `<option value="${esc(item)}"></option>`).join('');
    if (feederList) feederList.innerHTML = feeders.map(item => `<option value="${esc(item)}"></option>`).join('');
  }

  function ensure() {
    ensureStyles();
    ensureLauncher();
    if ($('printReadinessDialog')) {
      optionsFromState();
      renderJobs();
      return;
    }

    const dialog = document.createElement('dialog');
    dialog.id = 'printReadinessDialog';
    dialog.className = 'spool-action-dialog print-job-dialog';
    dialog.setAttribute('aria-labelledby','printReadinessTitle');
    dialog.innerHTML = `<form method="dialog" class="spool-action-shell print-job-shell" id="printReadinessForm">
      <div class="spool-action-head"><div><span class="eyebrow">Print intelligence</span><h2 id="printReadinessTitle">Can I print this?</h2></div><button class="btn icon-btn" type="button" data-readiness-close aria-label="Close">×</button></div>
      <div class="spool-action-body print-job-body">
        <section class="print-job-requirement" aria-labelledby="printRequirementTitle">
          <div class="print-job-section-head"><div><span class="eyebrow">1 · Requirement</span><h3 id="printRequirementTitle">What does the model need?</h3></div></div>
          <div class="form-grid print-job-form-grid">
            <div class="form-field full"><label for="printJobName">Print / model name</label><input class="field" id="printJobName" maxlength="100" placeholder="Optional · AMS riser bracket" autocomplete="off"></div>
            <div class="form-field"><label for="printMaterial">Material</label><input class="field" id="printMaterial" maxlength="80" placeholder="PLA" autocomplete="off"></div>
            <div class="form-field"><label for="printColor">Color</label><input class="field" id="printColor" maxlength="80" placeholder="Black · blank for any" autocomplete="off"></div>
            <div class="form-field full"><label for="printGrams">Slicer filament estimate (g)</label><input class="field" id="printGrams" type="number" min="1" step="1" required value="250" inputmode="decimal"></div>
          </div>
          <details class="fi-readiness-options print-job-options"><summary><span><strong>Printer & safety options</strong><small>Optional target placement and reserve</small></span><span aria-hidden="true">＋</span></summary><div class="print-job-option-fields">
            <div class="form-field"><label for="printMargin">Safety margin (%)</label><input class="field" id="printMargin" type="number" min="0" max="100" step="1" value="${defaultMargin()}"><small class="muted">Added to the slicer estimate when deciding whether a spool has enough.</small></div>
            <div class="form-field"><label for="printPrinter">Target printer</label><input class="field" id="printPrinter" list="printPrinterNames" maxlength="60" placeholder="Optional · P1S"><datalist id="printPrinterNames"></datalist></div>
            <div class="form-field"><label for="printFeeder">AMS / feeder</label><input class="field" id="printFeeder" list="printFeederNames" maxlength="60" placeholder="Optional · AMS 1"><datalist id="printFeederNames"></datalist></div>
            <div class="form-field"><label for="printSlot">Preferred slot</label><input class="field" id="printSlot" maxlength="24" placeholder="Optional · 2"></div>
          </div></details>
          <div class="print-job-check-action"><button class="btn btn-primary" type="submit">Check inventory</button></div>
        </section>
        <div id="printReadinessResult" role="status" aria-live="polite" aria-atomic="true"></div>
        <div id="printJobPanel" aria-live="polite"></div>
        <div class="dialog-actions print-job-footer"><button class="btn" type="button" data-readiness-close>Close</button></div>
      </div>
    </form>`;
    document.body.appendChild(dialog);
    $('printReadinessForm')?.addEventListener('submit', event => { event.preventDefault(); render(); });
    dialog.querySelectorAll('[data-readiness-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
    optionsFromState();
    renderJobs();
  }

  function requirementFromForm() {
    return {
      jobName:text($('printJobName')?.value),
      material:text($('printMaterial')?.value),
      color:text($('printColor')?.value),
      grams:$('printGrams')?.value,
      safetyMargin:$('printMargin')?.value,
      printer:text($('printPrinter')?.value),
      feeder:text($('printFeeder')?.value),
      slot:text($('printSlot')?.value),
    };
  }

  function evidenceLabel(row) {
    if (!row) return 'Unknown';
    if (row.measurement.source === 'Measured') return 'Measured · scale';
    if (row.measurement.evidence === 'usage') return 'Estimated · print usage';
    if (row.measurement.source === 'Estimated') return 'Estimated · visual';
    return 'Unknown';
  }

  function candidateStatus(row) {
    if (!row) return 'no-match';
    if (row.enough && row.measurement.source === 'Measured') return 'ready';
    if (row.enough && row.measurement.source === 'Estimated') return 'estimate-ready';
    if (row.measurement.source === 'Unknown') return 'measurement-needed';
    return 'not-enough';
  }

  function placementText(row) {
    const placement = row?.placement;
    if (!placement) return 'Choose placement after selecting a spool.';
    if (placement.status === 'already-loaded') return `Already loaded · ${placement.label}`;
    if (placement.status === 'recommended') return `Suggested placement · ${placement.label}`;
    if (placement.status === 'occupied') return `Preferred slot is occupied · ${placement.label}`;
    if (placement.status === 'full') return `${placement.label}. Choose another slot or unload a spool.`;
    return placement.label || 'Choose placement after selecting a spool.';
  }

  function candidateActions(row) {
    const status = candidateStatus(row);
    const id = esc(row.spool.id);
    if (status === 'measurement-needed') {
      return `<button class="btn btn-primary" type="button" data-ready-action="weigh" data-ready-id="${id}">Weigh this spool</button><button class="btn" type="button" data-ready-action="open" data-ready-id="${id}">Review spool</button>`;
    }
    if (status === 'estimate-ready') {
      return `<button class="btn btn-primary" type="button" data-ready-action="weigh" data-ready-id="${id}">Verify on scale</button><button class="btn" type="button" data-print-plan="${id}">Plan provisionally</button>`;
    }
    if (status === 'ready') {
      return `<button class="btn btn-primary" type="button" data-print-plan="${id}">Plan with this spool</button><button class="btn" type="button" data-ready-action="${row.loaded ? 'open' : 'place'}" data-ready-id="${id}">${row.loaded ? 'Open spool' : 'Load spool'}</button>`;
    }
    return `<button class="btn" type="button" data-ready-action="open" data-ready-id="${id}">Review spool</button>`;
  }

  function resultConfig(status, row, result) {
    const physical = row?.grams === null ? 'Unknown' : `${Math.round(row.grams)} g`;
    const available = row?.availableGrams === null ? 'Unknown' : `${Math.round(row.availableGrams)} g`;
    const required = `${Math.round(result.required)} g`;
    const commitment = row?.reservedGrams > 0 ? ` ${Math.round(row.reservedGrams)} g is already reserved by ${row.reservedJobs} queued job${row.reservedJobs === 1 ? '' : 's'}, leaving ${available} available for this plan.` : '';
    return {
      ready:{eyebrow:'Measured ready', title:'Enough verified filament', copy:`${physical} is scale-backed and ${required} is required with your safety margin.${commitment}`},
      'estimate-ready':{eyebrow:'Provisional', title:'The estimate says enough — verify first', copy:`${available} is available after queued commitments, but the quantity is estimated rather than measured. Plan it if useful, then verify before starting.`},
      'measurement-needed':{eyebrow:'Verification needed', title:'A matching spool has an unknown amount', copy:'Weigh this spool before relying on it for the print.'},
      'not-enough':{eyebrow:row?.reservedGrams > 0 ? 'Committed elsewhere' : 'Not enough', title:row?.reservedGrams > 0 ? 'Queued jobs already reserve this filament' : 'Best matching spool is short', copy:row?.reservedGrams > 0 ? `${physical} is recorded on the spool, but ${Math.round(row.reservedGrams)} g is committed to queued work. Only ${available} remains available to plan.` : `${available} is available and ${required} is required with your safety margin.`},
    }[status];
  }

  function alternativesMarkup(result, selectedId) {
    const rows = result.candidates.filter(row => String(row.spool.id) !== String(selectedId)).slice(0, 4);
    if (!rows.length) return '';
    return `<details class="print-job-alternatives"><summary><span><strong>${rows.length} other matching spool${rows.length === 1 ? '' : 's'}</strong><small>Compare evidence, committed grams and placement</small></span><span aria-hidden="true">＋</span></summary><div class="print-job-alternative-list">${rows.map(row => `<button type="button" class="print-job-alternative" data-print-select="${esc(row.spool.id)}"><i class="fi-spool-swatch" style="background:${esc(row.spool.colorHex || '#666d7d')}"></i><span><strong>${esc(row.spool.id)} · ${esc(row.spool.brand || 'Unknown')} · ${esc(row.spool.colorName || 'Unknown')}</strong><small>${esc(evidenceLabel(row))} · ${row.availableGrams === null ? 'available unknown' : `${Math.round(row.availableGrams)} g available`}${row.reservedGrams > 0 ? ` · ${Math.round(row.reservedGrams)} g reserved` : ''} · ${row.loaded ? 'loaded' : 'stored'}</small></span><b>${row.enough ? 'Fits' : row.measurement.source === 'Unknown' ? 'Verify' : row.reservedGrams > 0 ? 'Reserved' : 'Short'}</b></button>`).join('')}</div></details>`;
  }

  function renderResult(result) {
    const host = $('printReadinessResult');
    if (!host) return;
    host.dataset.hasResult = '1';
    if (!result.recommended) {
      selectedSpoolId = '';
      host.innerHTML = `<section class="fi-readiness-result print-job-result" data-state="no-match"><span class="eyebrow">No match</span><h3>No active spool matches</h3><p>Try a broader color, another material, or leave color blank to check any color.</p></section>`;
      return;
    }

    let row = result.candidates.find(candidate => String(candidate.spool.id) === String(selectedSpoolId));
    if (!row) row = result.recommended;
    selectedSpoolId = row.spool.id;
    const status = candidateStatus(row);
    const config = resultConfig(status, row, result);
    const after = row.after === null ? 'Unknown' : `${Math.round(row.after)} g`;
    const afterTone = row.after !== null && row.after <= row.reorder ? 'warning' : 'neutral';

    host.innerHTML = `<section class="fi-readiness-result print-job-result" data-state="${esc(status)}">
      <div class="print-job-result-head"><div><span class="eyebrow">2 · ${esc(config.eyebrow)}</span><h3>${esc(config.title)}</h3><p>${esc(config.copy)}</p></div><span class="print-job-evidence" data-source="${esc(row.measurement.source.toLowerCase())}">${esc(evidenceLabel(row))}</span></div>
      <div class="print-job-spool"><i class="fi-spool-swatch" style="background:${esc(row.spool.colorHex || '#666d7d')}"></i><div><strong>${esc(row.spool.id)} · ${esc(row.spool.brand || 'Unknown')} · ${esc(row.spool.material || 'Unknown')}</strong><span>${esc(row.spool.productLine || '')}${row.spool.productLine ? ' · ' : ''}${esc(row.spool.colorName || 'Unknown')}</span></div></div>
      <div class="print-job-metrics"><div><span>Required + margin</span><strong>${Math.round(result.required)} g</strong></div><div><span>On spool</span><strong>${row.grams === null ? 'Unknown' : `${Math.round(row.grams)} g`}</strong></div><div data-tone="${row.reservedGrams > 0 ? 'warning' : 'neutral'}"><span>Already reserved</span><strong>${Math.round(row.reservedGrams || 0)} g</strong></div><div><span>Available to plan</span><strong>${row.availableGrams === null ? 'Unknown' : `${Math.round(row.availableGrams)} g`}</strong></div><div data-tone="${afterTone}"><span>Projected after</span><strong>${esc(after)}</strong></div></div>
      <div class="print-job-placement"><span>Placement</span><strong>${esc(placementText(row))}</strong></div>
      <div class="dialog-actions print-job-result-actions">${candidateActions(row)}</div>
      ${alternativesMarkup(result, row.spool.id)}
    </section>`;
  }

  function render() {
    const form = $('printReadinessForm');
    if (form && !form.reportValidity()) return;
    const value = readState();
    lastResult = core.evaluate(value.spools || [], requirementFromForm(), Date.now(), {printJobs:value.printJobs || []});
    if (!lastResult.candidates.some(row => String(row.spool.id) === String(selectedSpoolId))) selectedSpoolId = lastResult.recommended?.spool?.id || '';
    renderResult(lastResult);
    renderJobs();
  }

  function hasRecheckableQuery() {
    return $('printReadinessResult')?.dataset.hasResult === '1' && Number($('printGrams')?.value) > 0;
  }

  function jobTitle(job) {
    return job.jobName || [job.material || 'Print', job.color].filter(Boolean).join(' · ');
  }

  function jobStatusLabel(job) {
    return ({planned:'Planned','in-progress':'Printing',completed:'Completed',cancelled:'Cancelled'})[job.status] || job.status;
  }

  function startBlockMarkup(check, job) {
    const id = esc(job.spoolId);
    if (check.reason === 'verification-required') return `<button class="btn btn-primary" type="button" data-ready-action="weigh" data-ready-id="${id}">Verify spool on scale</button>`;
    if (check.reason === 'not-loaded') return `<button class="btn btn-primary" type="button" data-ready-action="place" data-ready-id="${id}">Load spool</button>`;
    if (check.reason === 'not-enough') return `<button class="btn btn-primary" type="button" data-ready-action="weigh" data-ready-id="${id}">Re-check remaining</button>`;
    if (check.reason === 'reservation-conflict') return `<p class="print-job-warning">Other queued jobs reserve ${Math.round(check.reservedOther || 0)} g. Re-plan or cancel another commitment before starting.</p>`;
    if (check.reason === 'spool-busy') return `<p class="print-job-warning">This spool is already being used by ${esc(jobTitle(check.conflictJob || {}))}.</p>`;
    if (check.reason === 'printer-busy') return `<p class="print-job-warning">${esc(check.spool?.printerName || 'This printer')} is already running ${esc(jobTitle(check.conflictJob || {}))}.</p>`;
    if (check.reason === 'spool-unavailable') return '<p class="print-job-warning">The planned spool is no longer available.</p>';
    return '<p class="print-job-warning">This plan needs attention before it can start.</p>';
  }

  function activeJobMarkup(job, value) {
    const spool = core.findSpool(value, job.spoolId);
    const current = spool ? core.measurement(spool) : {source:'Unknown',grams:null};
    const loaded = spool?.placementState === 'Loaded';
    const destination = loaded ? [spool.printerName || 'Printer', spool.feederName, spool.feederSlot ? `Slot ${spool.feederSlot}` : ''].filter(Boolean).join(' · ') : 'Not loaded';
    const otherReserved = core.reservedGramsForSpool(value.printJobs || [], job.spoolId, job.id);
    let next = '';

    if (job.status === 'planned') {
      const check = core.startEligibility(value, job.id);
      next = check.ok ? `<button class="btn btn-primary" type="button" data-print-start="${esc(job.id)}">Start print</button>` : startBlockMarkup(check, job);
      next += `<button class="btn" type="button" data-print-cancel="${esc(job.id)}">Cancel plan</button>`;
    } else if (job.status === 'in-progress') {
      const maximum = Number(job.remainingAtStart) || 0;
      const suggested = Math.min(maximum || job.modelGrams, Number(job.modelGrams) || 0) || '';
      next = `<div class="print-job-complete"><div class="form-field"><label for="printConsumed-${esc(job.id)}">Filament consumed (g)</label><input class="field" id="printConsumed-${esc(job.id)}" data-print-consumed="${esc(job.id)}" type="number" min="0.1" ${maximum ? `max="${maximum}"` : ''} step="0.1" value="${esc(suggested)}" inputmode="decimal"><small class="muted">Use the slicer’s actual/finished usage when available. This becomes a projected remaining amount until you re-weigh.</small></div><button class="btn btn-primary" type="button" data-print-complete="${esc(job.id)}">Complete print</button><button class="btn" type="button" data-print-cancel="${esc(job.id)}">Cancel job</button></div>`;
    }

    return `<article class="print-job-active" data-job-status="${esc(job.status)}"><div class="print-job-active-head"><div><span class="eyebrow">3 · ${esc(jobStatusLabel(job))}</span><h3>${esc(jobTitle(job))}</h3></div><span class="print-job-job-chip">${esc(job.spoolId)}</span></div><div class="print-job-active-meta"><span>${Math.round(job.modelGrams)} g model</span><span>${Math.round(job.requiredGrams)} g reserved</span><span>${current.grams === null ? 'Amount unknown' : `${Math.round(current.grams)} g on spool`}</span>${otherReserved > 0 ? `<span>${Math.round(otherReserved)} g reserved by other jobs</span>` : ''}<span>${esc(current.source)} now</span><span>${esc(destination)}</span></div><div class="print-job-active-actions">${next}</div></article>`;
  }

  function recentJobMarkup(job) {
    const at = job.completedAt || job.cancelledAt || job.startedAt || job.plannedAt;
    const when = at ? new Date(at).toLocaleString() : 'Unknown time';
    const detail = job.status === 'completed'
      ? `${job.consumedGrams ?? '—'} g consumed · ${job.remainingAfter ?? '—'} g projected after`
      : `${Math.round(job.modelGrams)} g model · spool ${job.spoolId}`;
    return `<div class="print-job-recent-row"><div><strong>${esc(jobTitle(job))}</strong><span>${esc(jobStatusLabel(job))} · ${esc(detail)}</span></div><time datetime="${esc(at || '')}">${esc(when)}</time></div>`;
  }

  function queueRowMarkup(job, value) {
    const spool = core.findSpool(value, job.spoolId);
    const destination = spool?.placementState === 'Loaded' ? [spool.printerName || 'Printer', spool.feederName, spool.feederSlot ? `Slot ${spool.feederSlot}` : ''].filter(Boolean).join(' · ') : 'Not loaded';
    return `<div class="print-queue-row" data-job-status="${esc(job.status)}"><span class="print-queue-state" aria-hidden="true"></span><div><strong>${esc(jobTitle(job))}</strong><small>${esc(jobStatusLabel(job))} · ${esc(job.spoolId)} · ${Math.round(job.requiredGrams)} g reserved · ${esc(destination)}</small></div></div>`;
  }

  function ensureQueueMount(surface, key) {
    if (!surface) return null;
    let node = surface.querySelector(`[data-print-queue-surface="${key}"]`);
    if (node) return node;
    node = document.createElement('section');
    node.className = 'panel print-queue-summary';
    node.dataset.printQueueSurface = key;
    if (key === 'home') {
      const hero = surface.querySelector('.hero');
      if (hero) hero.insertAdjacentElement('afterend', node); else surface.prepend(node);
    } else {
      const header = surface.querySelector(':scope > .fi-page-header');
      if (header) header.insertAdjacentElement('afterend', node); else surface.prepend(node);
    }
    return node;
  }

  function renderQueueSurfaces(value = readState(), active = core.activeJobs(value)) {
    const surfaces = [{node:$('dashboardView'), key:'home'}, {node:$('householdView'), key:'printer'}];
    if (!active.length) {
      surfaces.forEach(({node,key}) => node?.querySelector(`[data-print-queue-surface="${key}"]`)?.remove());
      return;
    }
    const printing = active.filter(job => job.status === 'in-progress').length;
    const planned = active.length - printing;
    const committed = Math.round(active.reduce((sum, job) => sum + (Number(job.requiredGrams) || 0), 0));
    const summary = [printing ? `${printing} printing` : '', planned ? `${planned} planned` : '', `${committed} g committed`].filter(Boolean).join(' · ');
    for (const {node,key} of surfaces) {
      const mount = ensureQueueMount(node,key);
      if (!mount) continue;
      mount.innerHTML = `<div class="print-queue-summary-head"><div><span class="eyebrow">Print queue</span><h3>${esc(summary)}</h3><p>Queued jobs reserve filament so a later plan cannot silently spend the same grams twice.</p></div><button class="btn" type="button" data-print-readiness data-print-launcher="queue" aria-haspopup="dialog" aria-controls="printReadinessDialog">Open queue</button></div><div class="print-queue-list">${active.slice(0,4).map(job => queueRowMarkup(job,value)).join('')}</div>`;
    }
  }

  function renderJobs() {
    const value = readState();
    const active = core.activeJobs(value);
    renderQueueSurfaces(value,active);
    const host = $('printJobPanel');
    if (!host) return;
    const recent = core.recentJobs(value, 5).filter(job => job.status === 'completed' || job.status === 'cancelled').slice(0, 3);
    if (!active.length && !recent.length) {
      host.innerHTML = '';
      return;
    }
    host.innerHTML = `<section class="print-job-ledger"><div class="print-job-section-head"><div><span class="eyebrow">Print jobs</span><h3>${active.length ? 'Current queue' : 'Recent prints'}</h3></div></div>${active.map(job => activeJobMarkup(job, value)).join('')}${recent.length ? `<details class="print-job-history" ${active.length ? '' : 'open'}><summary><span><strong>Recent completed / cancelled</strong><small>${recent.length} recent job${recent.length === 1 ? '' : 's'}</small></span><span aria-hidden="true">＋</span></summary><div>${recent.map(recentJobMarkup).join('')}</div></details>` : ''}</section>`;
  }

  function planSelected(id) {
    const value = readState();
    const result = core.planJob(value, requirementFromForm(), id || selectedSpoolId);
    if (!result.changed) {
      const messages = { 'grams-required':'Enter the slicer filament estimate first.', 'spool-not-matching':'That spool no longer matches this print requirement.', 'not-enough':'That spool does not have enough recorded filament for this print.', 'reserved':'Queued jobs already reserve too much of this spool. Cancel or complete a commitment, or choose another spool.' };
      toast(messages[result.reason] || 'Could not create the print plan.');
      return;
    }
    writeState(result.state);
    emit('print:planned',{jobId:result.job.id,spoolId:result.job.spoolId});
    emit('print:queue-changed',{activeJobs:core.activeJobs(result.state).length});
    toast(`${result.job.jobName || 'Print'} planned with ${result.job.spoolId} · ${Math.round(result.job.requiredGrams)} g reserved.`);
    renderJobs();
    if (hasRecheckableQuery()) render();
  }

  function startPrint(jobId) {
    const result = core.startJob(readState(), jobId);
    if (!result.changed) {
      const messages = { 'not-loaded':'Load the planned spool before starting.', 'verification-required':'Verify the spool on the scale before starting.', 'not-enough':'The measured spool no longer has enough filament.', 'spool-unavailable':'The planned spool is unavailable.', 'spool-busy':'That spool is already assigned to another tracked print in progress.', 'printer-busy':'That printer already has another tracked print in progress.', 'reservation-conflict':'Other queued jobs now reserve too much filament for this print to start.' };
      toast(messages[result.reason] || 'Could not start this print.');
      renderJobs();
      return;
    }
    writeState(result.state);
    emit('print:started',{jobId:result.job.id,spoolId:result.job.spoolId});
    emit('print:queue-changed',{activeJobs:core.activeJobs(result.state).length});
    toast(`${result.job.jobName || 'Print'} started.`);
    renderJobs();
  }

  function completePrint(jobId) {
    const input = document.querySelector(`[data-print-consumed="${CSS.escape(String(jobId))}"]`);
    const result = core.completeJob(readState(), jobId, input?.value);
    if (!result.changed) {
      const messages = { 'consumption-required':'Enter the filament actually consumed.', 'consumption-exceeds-start':'Consumed filament cannot exceed the measured amount available when the print started.', 'spool-unavailable':'The print spool is unavailable.' };
      toast(messages[result.reason] || 'Could not complete this print.');
      input?.focus();
      return;
    }
    writeState(result.state);
    emit('inventory:changed',{spoolId:result.job.spoolId,reason:'print-completed'});
    emit('print:completed',{jobId:result.job.id,spoolId:result.job.spoolId,consumedGrams:result.job.consumedGrams,remainingAfter:result.remainingAfter});
    emit('print:queue-changed',{activeJobs:core.activeJobs(result.state).length,reservationShortfall:result.reservationShortfall});
    const warning = result.reservationShortfall > 0 ? ` ${Math.round(result.reservationShortfall)} g of remaining queued commitments now need re-checking.` : '';
    toast(`${result.job.jobName || 'Print'} completed · ${result.job.consumedGrams} g recorded.${warning}`);
    renderJobs();
    if (hasRecheckableQuery()) render();
  }

  function cancelPrint(jobId) {
    const result = core.cancelJob(readState(), jobId);
    if (!result.changed) {
      toast('This print job is already final.');
      return;
    }
    writeState(result.state);
    emit('print:cancelled',{jobId:result.job.id,spoolId:result.job.spoolId});
    emit('print:queue-changed',{activeJobs:core.activeJobs(result.state).length});
    toast(`${result.job.jobName || 'Print'} cancelled · reserved filament released.`);
    renderJobs();
    if (hasRecheckableQuery()) render();
  }

  function openWorkflow(action, id) {
    const workflows = globalThis.FilamentInventoryWorkflows;
    if (!workflows) return;
    $('printReadinessDialog')?.close();
    if (action === 'weigh') workflows.weigh(id);
    else if (action === 'place') workflows.place(id);
    else workflows.open(id,{source:'print-readiness'});
  }

  function open() {
    ensure();
    const dialog = $('printReadinessDialog');
    if (!dialog) return;
    optionsFromState();
    renderJobs();
    if (!dialog.open) dialog.showModal();
    if (hasRecheckableQuery()) render();
    setTimeout(() => $('printMaterial')?.focus({preventScroll:true}), 20);
  }

  document.addEventListener('click', event => {
    const launch = event.target.closest('[data-print-readiness]');
    if (launch) { event.preventDefault(); open(); return; }

    const select = event.target.closest('[data-print-select]');
    if (select) {
      selectedSpoolId = select.dataset.printSelect || '';
      if (lastResult) renderResult(lastResult);
      return;
    }

    const plan = event.target.closest('[data-print-plan]');
    if (plan) { planSelected(plan.dataset.printPlan); return; }

    const start = event.target.closest('[data-print-start]');
    if (start) { startPrint(start.dataset.printStart); return; }

    const complete = event.target.closest('[data-print-complete]');
    if (complete) { completePrint(complete.dataset.printComplete); return; }

    const cancel = event.target.closest('[data-print-cancel]');
    if (cancel) { cancelPrint(cancel.dataset.printCancel); return; }

    const action = event.target.closest('[data-ready-action]');
    if (action) openWorkflow(action.dataset.readyAction, action.dataset.readyId);
  });

  window.addEventListener('storage', event => {
    if (event.key !== KEY) return;
    renderJobs();
    if ($('printReadinessDialog')?.open && hasRecheckableQuery()) render();
  });
  globalThis.FilamentInventoryEvents?.on?.('inventory:changed', () => {
    if ($('printReadinessDialog')?.open && hasRecheckableQuery()) render();
    renderJobs();
  });
  globalThis.FilamentInventoryEvents?.on?.('measurement:saved', () => {
    if ($('printReadinessDialog')?.open && hasRecheckableQuery()) render();
    renderJobs();
  });
  document.addEventListener('fi:navigation', () => renderQueueSurfaces());

  globalThis.FilamentInventoryPrintReadinessUI = Object.freeze({open,render,renderJobs,plan:planSelected,start:startPrint,complete:completePrint,cancel:cancelPrint});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensure,{once:true});
  else ensure();
})();