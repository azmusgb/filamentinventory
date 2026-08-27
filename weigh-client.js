(() => {
  'use strict';

  const STORAGE_KEY = 'filament-inventory-v1';
  const core = globalThis.FilamentInventoryWeigh;
  if (!core) return;

  let selectObserver = null;
  let viewObserver = null;
  let renderQueued = false;
  let pendingSubmit = null;

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const parse = (value, fallback = null) => { try { return JSON.parse(value); } catch { return fallback; } };
  const currentUser = () => globalThis.FilamentInventoryUsers?.currentUser?.() || 'Bill';

  function state() {
    const result = parse(localStorage.getItem(STORAGE_KEY) || '{}', {});
    return {
      spools:Array.isArray(result?.spools) ? result.spools : [],
      weighLog:Array.isArray(result?.weighLog) ? result.weighLog : [],
    };
  }

  function selectedSpool() {
    const id = String($('weighSpool')?.value || '').trim().toLowerCase();
    return state().spools.find(spool => String(spool?.id || '').trim().toLowerCase() === id && !spool.archivedAt) || null;
  }

  function dispatch(node, type = 'input') {
    node?.dispatchEvent(new Event(type, {bubbles:true}));
  }

  function ensureUi() {
    const form = $('weighForm');
    if (!form) return false;

    if (!$('weighSmartIntro')) {
      const intro = document.createElement('section');
      intro.id = 'weighSmartIntro';
      intro.className = 'weigh-smart-intro quick-list';
      intro.innerHTML = `
        <div class="weigh-smart-profile qr-private-note"><span>Smart Weigh</span><strong id="weighSmartOwner"></strong></div>
        <div class="weigh-smart-section"><span class="eyebrow">Fast choices</span><p class="muted">Loaded and recently touched spools first.</p><div class="quick-list weigh-chip-row" id="weighQuickChoices"></div></div>
        <div class="weigh-smart-section"><span class="eyebrow">Measure next</span><p class="muted">Prioritized by unknown amount, loaded state, and measurement age.</p><div class="quick-list weigh-next-row" id="weighNextQueue"></div></div>`;
      form.insertAdjacentElement('beforebegin', intro);
    }

    if (!$('weighTareGuide')) {
      const tareField = $('tareWeight')?.closest('.form-field');
      if (tareField) {
        const guide = document.createElement('div');
        guide.id = 'weighTareGuide';
        guide.className = 'form-field full weigh-tare-guide';
        tareField.insertAdjacentElement('afterend', guide);
      }
    }

    if (!$('weighImpactV103')) {
      const submit = form.querySelector('.form-field.full:last-child');
      const impact = document.createElement('div');
      impact.id = 'weighImpactV103';
      impact.className = 'form-field full weigh-impact';
      impact.setAttribute('aria-live', 'polite');
      if (submit) submit.insertAdjacentElement('beforebegin', impact);
      else form.appendChild(impact);
    }

    ensureNextDialog();
    return true;
  }

  function ensureNextDialog() {
    let dialog = $('weighNextDialog');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'weighNextDialog';
    dialog.className = 'spool-action-dialog weigh-next-dialog';
    dialog.setAttribute('aria-labelledby', 'weighNextTitle');
    dialog.innerHTML = `<div class="spool-action-shell"><div class="spool-action-head"><div><span class="eyebrow">Measurement saved</span><h2 id="weighNextTitle">What next?</h2></div><button class="btn icon-btn" id="weighNextClose" type="button" aria-label="Close measurement actions">×</button></div><div class="spool-action-body" id="weighNextBody"></div></div>`;
    document.body.appendChild(dialog);
    $('weighNextClose')?.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    return dialog;
  }

  function inferTare(spool, currentState) {
    const intake = globalThis.FilamentInventoryIntake;
    const inferred = intake?.inferredTare?.(currentState, spool) || null;
    return core.tareSuggestion(spool, inferred);
  }

  function renderTareGuide() {
    const guide = $('weighTareGuide');
    if (!guide) return;
    const spool = selectedSpool();
    if (!spool) {
      guide.innerHTML = '<div class="quick-item"><i class="dot"></i><div><strong>Tare guidance</strong><span>Choose a spool to see saved or inferred tare guidance.</span></div><span>—</span></div>';
      return;
    }
    const suggestion = inferTare(spool, state());
    if (!suggestion) {
      guide.innerHTML = '<div class="quick-item"><i class="dot"></i><div><strong>No tare suggestion yet</strong><span>Enter the empty-spool tare from the label, manufacturer, or a verified empty spool.</span></div><span>—</span></div>';
      return;
    }
    const current = String($('tareWeight')?.value || '').trim();
    const using = current !== '' && Number(current) === Number(suggestion.grams);
    guide.innerHTML = `<div class="quick-item"><i class="dot"></i><div><strong>${esc(suggestion.title)} · ${Math.round(suggestion.grams)} g</strong><span>${esc(suggestion.detail)}</span></div>${using ? '<span>Using</span>' : `<button class="btn" type="button" data-weigh-use-tare="${esc(suggestion.grams)}">Use ${Math.round(suggestion.grams)} g</button>`}</div>`;
  }

  function renderImpact() {
    const node = $('weighImpactV103');
    if (!node) return;
    const spool = selectedSpool();
    const result = core.preview(spool || {}, $('grossWeight')?.value, $('tareWeight')?.value);
    if (!spool) {
      node.innerHTML = '<div class="calc"><div class="calc-row"><span>After save</span><strong>Choose a spool</strong></div></div>';
      return;
    }
    if (!result.ok) {
      const message = result.reason === 'invalid' ? 'Check weights' : 'Enter gross + tare';
      node.innerHTML = `<div class="calc"><div class="calc-row"><span>After save</span><strong>${esc(message)}</strong></div><div class="calc-row"><span>Spool</span><strong>${esc(spool.id)}</strong></div></div>`;
      return;
    }
    node.innerHTML = `<div class="calc"><div class="calc-row"><span>After save</span><strong>${Math.round(result.grams)} g · ${result.percent.toFixed(1)}%</strong></div><div class="calc-row"><span>Stock</span><strong>${esc(result.stock)}</strong></div><div class="calc-row"><span>Reorder impact</span><strong>${esc(result.impact)}</strong></div><div class="calc-row"><span>Action</span><strong>${result.reorder ? 'Reorder attention' : 'Above threshold'}</strong></div></div>`;
  }

  function spoolChip(spool, reason = '') {
    const m = core.measurement(spool);
    const amount = m.grams === null ? '—' : `${Math.round(m.grams)} g`;
    const status = reason || `${amount}${core.loaded(spool) ? ' · Loaded' : ''}`;
    return `<button class="quick-item quick-button weigh-spool-chip" type="button" data-weigh-select="${esc(spool.id)}"><i class="dot"></i><div><strong>${esc(spool.id)} · ${esc(spool.material || 'Unknown')}</strong><span>${esc(spool.colorName || 'Unknown')}</span></div><span>${esc(status)}</span></button>`;
  }

  function renderChoices() {
    const currentState = state();
    const owner = $('weighSmartOwner');
    if (owner) owner.textContent = `${currentUser()}'s private inventory`;

    const quick = $('weighQuickChoices');
    if (quick) {
      const rows = core.quickSpools(currentState.spools, currentState.weighLog, 7);
      quick.innerHTML = rows.length ? rows.map(spool => spoolChip(spool)).join('') : '<div class="empty"><strong>No active spools</strong>Add a spool to start measuring.</div>';
    }

    const next = $('weighNextQueue');
    if (next) {
      const rows = core.nextToMeasure(currentState.spools, currentState.weighLog, 5);
      next.innerHTML = rows.length ? rows.map(spool => spoolChip(spool, core.reasonFor(spool, currentState.weighLog))).join('') : '<div class="empty"><strong>Nothing urgent</strong>Your active measurement queue is clear.</div>';
    }
  }

  function render() {
    if (!ensureUi()) return;
    renderChoices();
    renderTareGuide();
    renderImpact();
  }

  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; render(); });
  }

  function select(id, {focus = true, clearWeights = true} = {}) {
    const selectNode = $('weighSpool');
    if (!selectNode) return false;
    const option = [...selectNode.options].find(row => String(row.value).toLowerCase() === String(id || '').toLowerCase());
    if (!option) return false;
    selectNode.value = option.value;
    if (clearWeights) {
      if ($('grossWeight')) $('grossWeight').value = '';
      if ($('tareWeight')) $('tareWeight').value = '';
    }
    dispatch(selectNode, 'change');
    renderTareGuide();
    renderImpact();
    if (focus) $('grossWeight')?.focus({preventScroll:true});
    return true;
  }

  function newestLogFor(id, currentState) {
    return currentState.weighLog
      .filter(entry => String(entry?.id || '').toLowerCase() === String(id || '').toLowerCase())
      .sort((a,b) => new Date(b.at) - new Date(a.at))[0] || null;
  }

  function showNext(id, entry) {
    const currentState = state();
    const next = core.nextToMeasure(currentState.spools, currentState.weighLog, 8).find(spool => String(spool.id).toLowerCase() !== String(id).toLowerCase()) || null;
    const dialog = ensureNextDialog();
    dialog.dataset.spoolId = id;
    dialog.dataset.nextSpoolId = next?.id || '';
    const body = $('weighNextBody');
    const title = $('weighNextTitle');
    if (title) title.textContent = `${id} measured`;
    const remaining = entry?.remaining === null || entry?.remaining === undefined ? 'Unknown' : `${Math.round(entry.remaining)} g`;
    const percent = entry?.percent === null || entry?.percent === undefined ? '—' : `${Number(entry.percent).toFixed(1)}%`;
    if (body) body.innerHTML = `<section class="calc weigh-next-summary"><div class="calc-row"><span>Saved measurement</span><strong>${esc(remaining)} · ${esc(percent)}</strong></div><div class="calc-row"><span>Location</span><strong>${entry?.location ? esc(entry.location) : 'Unchanged'}</strong></div></section><section class="spool-action-grid" aria-label="Measurement follow-up"><button class="btn btn-primary" type="button" data-weigh-next="next" ${next ? '' : 'disabled'}>${next ? `Measure next · ${esc(next.id)}` : 'No next measurement'}</button><button class="btn" type="button" data-weigh-next="spool">Open spool</button><button class="btn" type="button" data-weigh-next="done">Done</button></section>${next ? `<p class="spool-action-note">Next recommendation: ${esc(core.reasonFor(next, currentState.weighLog))}.</p>` : '<p class="spool-action-note">No other active spool currently ranks above the measurement queue.</p>'}`;
    if (!dialog.open) dialog.showModal();
  }

  function handleSuccessfulSubmit() {
    const pending = pendingSubmit;
    pendingSubmit = null;
    if (!pending?.id) return;
    const currentState = state();
    const newest = newestLogFor(pending.id, currentState);
    if (!newest) return;
    const stamp = new Date(newest.at || 0).getTime();
    if (currentState.weighLog.length <= pending.logCount && stamp <= pending.latestAt) return;
    renderChoices();
    showNext(pending.id, newest);
  }

  function bind() {
    const form = $('weighForm');
    const selectNode = $('weighSpool');
    if (!form || !selectNode || form.dataset.smartWeighBound === 'true') return;
    form.dataset.smartWeighBound = 'true';

    document.addEventListener('click', event => {
      const choice = event.target.closest('[data-weigh-select]');
      if (choice) { event.preventDefault(); select(choice.dataset.weighSelect); return; }
      const tare = event.target.closest('[data-weigh-use-tare]');
      if (tare) {
        event.preventDefault();
        const input = $('tareWeight');
        if (input) { input.value = tare.dataset.weighUseTare || ''; dispatch(input); input.focus({preventScroll:true}); }
        renderTareGuide(); renderImpact(); return;
      }
      const next = event.target.closest('[data-weigh-next]');
      if (next) {
        const dialog = $('weighNextDialog');
        const action = next.dataset.weighNext;
        if (action === 'done') { dialog?.close(); return; }
        if (action === 'next') {
          const id = dialog?.dataset.nextSpoolId;
          dialog?.close();
          if (id) select(id);
          return;
        }
        if (action === 'spool') {
          const id = dialog?.dataset.spoolId;
          dialog?.close();
          if (id) globalThis.FilamentInventorySpoolActions?.open?.(id);
        }
      }
    });

    selectNode.addEventListener('change', () => {
      if ($('grossWeight')) $('grossWeight').value = '';
      if ($('tareWeight')) $('tareWeight').value = '';
      renderTareGuide(); renderImpact();
    });
    $('grossWeight')?.addEventListener('input', renderImpact);
    $('tareWeight')?.addEventListener('input', () => { renderTareGuide(); renderImpact(); });

    form.addEventListener('submit', () => {
      const currentState = state();
      const id = String(selectNode.value || '');
      const latest = newestLogFor(id, currentState);
      pendingSubmit = {id, logCount:currentState.weighLog.length, latestAt:new Date(latest?.at || 0).getTime()};
      setTimeout(handleSuccessfulSubmit, 100);
    });

    selectObserver = new MutationObserver(queueRender);
    selectObserver.observe(selectNode, {childList:true});

    const view = $('weighView');
    if (view) {
      viewObserver = new MutationObserver(() => { if (view.classList.contains('active')) setTimeout(queueRender, 0); });
      viewObserver.observe(view, {attributes:true, attributeFilter:['class']});
    }

    window.addEventListener('storage', event => { if (event.key && event.key.includes(STORAGE_KEY)) queueRender(); });
  }

  function init() {
    if (!ensureUi()) return;
    bind();
    setTimeout(queueRender, 120);
    globalThis.FilamentInventorySmartWeigh = Object.freeze({refresh:queueRender, select});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
