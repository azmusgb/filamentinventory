(() => {
  'use strict';
  const core = globalThis.FilamentInventoryPrintReadiness;
  if (!core) return;
  const KEY = 'filament-inventory-v1';
  const $ = id => document.getElementById(id);
  const state = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function ensureLauncher() {
    if (document.querySelector('[data-print-readiness]')) return;
    const host = document.querySelector('#dashboardView .hero-actions');
    if (!host) return;
    const button = document.createElement('button');
    button.className = 'btn btn-primary';
    button.type = 'button';
    button.dataset.printReadiness = '';
    button.textContent = 'Can I print this?';
    host.prepend(button);
  }
  function ensure() {
    ensureLauncher();
    if ($('printReadinessDialog')) return;
    const dialog = document.createElement('dialog'); dialog.id = 'printReadinessDialog'; dialog.className = 'spool-action-dialog';
    dialog.innerHTML = `<form method="dialog" class="spool-action-shell" id="printReadinessForm"><div class="spool-action-head"><div><span class="eyebrow">Print readiness</span><h2>Can I print this?</h2></div><button class="btn icon-btn" type="button" data-readiness-close aria-label="Close">×</button></div><div class="spool-action-body"><div class="form-grid"><div class="form-field"><label for="printMaterial">Material</label><input class="field" id="printMaterial" required placeholder="PLA"></div><div class="form-field"><label for="printColor">Color</label><input class="field" id="printColor" required placeholder="Black"></div><div class="form-field"><label for="printGrams">Needed (g)</label><input class="field" id="printGrams" type="number" min="1" step="1" required value="250"></div><div class="form-field"><label for="printMargin">Safety margin (%)</label><input class="field" id="printMargin" type="number" min="0" max="100" step="1" value="10"></div></div><div class="dialog-actions"><button class="btn btn-primary" type="submit">Check inventory</button></div><div id="printReadinessResult" aria-live="polite"></div></div></form>`;
    document.body.appendChild(dialog);
    $('printReadinessForm').addEventListener('submit', event => { event.preventDefault(); render(); });
    dialog.querySelector('[data-readiness-close]')?.addEventListener('click', () => dialog.close());
  }
  function render() {
    const result = core.evaluate(state().spools || [], {material:$('printMaterial').value,color:$('printColor').value,grams:$('printGrams').value,safetyMargin:$('printMargin').value});
    const host = $('printReadinessResult'); const row = result.recommended;
    if (!row) { host.innerHTML = `<section class="spool-action-summary"><h3>NO MATCH</h3><p class="muted">No active spool matches that material and color.</p></section>`; return; }
    const s = row.spool; const title = result.status === 'ready' ? 'READY TO PRINT' : result.status === 'measurement-needed' ? 'MEASUREMENT NEEDED' : 'NOT ENOUGH';
    const detail = result.status === 'ready' ? `${Math.round(row.grams)} g available · ${result.required} g required incl. safety · ${Math.round(row.after)} g afterward` : result.status === 'measurement-needed' ? 'Remaining amount is unknown. Weigh this spool before relying on it.' : `${Math.round(row.grams)} g available · ${result.required} g required`;
    const action = result.status === 'measurement-needed'
      ? `<button class="btn btn-primary" type="button" data-ready-action="weigh" data-ready-id="${esc(s.id)}">Weigh now</button>`
      : result.status === 'ready'
        ? `<button class="btn btn-primary" type="button" data-ready-action="${row.loaded ? 'open' : 'place'}" data-ready-id="${esc(s.id)}">${row.loaded ? 'Use this spool' : 'Load this spool'}</button>`
        : `<button class="btn" type="button" data-ready-action="open" data-ready-id="${esc(s.id)}">Review spool</button>`;
    host.innerHTML = `<section class="spool-action-summary" style="margin-top:18px"><span class="eyebrow">${esc(title)}</span><h3>${esc(s.id)} · ${esc(s.brand || 'Unknown')} ${esc(s.material || '')}</h3><p>${esc(s.colorName || '')}</p><p><strong>${esc(detail)}</strong></p>${row.loaded ? `<p class="muted">Already loaded: ${esc(s.printerName || 'Printer')} · ${esc(s.feederName || '')} ${esc(s.feederSlot || '')}</p>` : ''}<div class="dialog-actions">${action}</div></section>`;
  }
  function open() { ensure(); const dialog = $('printReadinessDialog'); if (!dialog.open) dialog.showModal(); $('printMaterial')?.focus({preventScroll:true}); }
  document.addEventListener('click', event => {
    const launch = event.target.closest('[data-print-readiness]'); if (launch) { event.preventDefault(); open(); return; }
    const action = event.target.closest('[data-ready-action]'); if (!action) return;
    $('printReadinessDialog')?.close(); const workflows = globalThis.FilamentInventoryWorkflows; if (!workflows) return;
    if (action.dataset.readyAction === 'weigh') workflows.weigh(action.dataset.readyId);
    else if (action.dataset.readyAction === 'place') workflows.place(action.dataset.readyId);
    else workflows.open(action.dataset.readyId, {source:'print-readiness'});
  });
  globalThis.FilamentInventoryPrintReadinessUI = Object.freeze({open});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensure, {once:true}); else ensure();
})();