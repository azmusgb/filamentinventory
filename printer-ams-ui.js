(() => {
  'use strict';

  const STORAGE_KEY = 'filament-inventory-v1';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text = value => String(value || '').trim();
  const parse = (value, fallback = null) => { try { return JSON.parse(value); } catch { return fallback; } };
  const same = (a,b) => text(a).toLowerCase() === text(b).toLowerCase();
  let queued = false;
  let observer = null;

  function core() { return globalThis.FilamentInventoryPrinter || null; }
  function readState() {
    const value = parse(localStorage.getItem(STORAGE_KEY) || '{}', {});
    return value && Array.isArray(value.spools) ? value : {spools:[],printers:[]};
  }

  function loadedOnPrinter(spool, printer) {
    if (spool?.placementState !== 'Loaded') return false;
    if (text(spool.printerId)) return same(spool.printerId, printer.id);
    return same(spool.printerName, printer.name);
  }

  function loadedInFeeder(spool, feeder) {
    if (text(spool.feederId)) return same(spool.feederId, feeder.id);
    return same(spool.feederName, feeder.name);
  }

  function quantityView(spool) {
    const api = core();
    const m = api.measurement(spool);
    const low = m.grams !== null && m.grams <= Number(spool.reorderThreshold ?? 250);
    if (m.grams === null) return {quantity:'Not measured', evidence:'Weigh required', tone:'unknown', low:false, primary:'Weigh'};
    const quantity = `${Math.round(m.grams)} g${m.percent === null ? '' : ` · ${Math.round(m.percent)}%`}`;
    if (m.source === 'Measured') return {quantity, evidence:'Measured', tone:low ? 'low' : 'measured', low, primary:low ? 'Low' : ''};
    if (m.evidence === 'usage') return {quantity, evidence:'Print estimate', tone:low ? 'low' : 'estimated', low, primary:low ? 'Low' : ''};
    return {quantity, evidence:'Visual estimate', tone:low ? 'low' : 'estimated', low, primary:low ? 'Low' : ''};
  }

  function shortProduct(spool) {
    const values = [spool.brand, spool.material].map(text).filter(value => value && value !== 'Unknown');
    return values.join(' · ') || 'Filament';
  }

  function slotCard(spool, feeder, slot) {
    if (!spool) {
      return `<article class="ams-slot ams-slot-empty" data-ams-slot="${esc(slot)}">
        <div class="ams-slot-top"><span class="ams-slot-number">${esc(slot)}</span><span class="ams-slot-state">Empty</span></div>
        <div class="ams-empty-copy"><strong>Open slot</strong><span>${esc(feeder.name)}</span></div>
        <button class="btn ams-empty-load" type="button" data-ams-empty-load data-printer-ref="${esc(feeder.__printerName)}" data-feeder-ref="${esc(feeder.name)}" data-slot-ref="${esc(slot)}">+ Load filament</button>
      </article>`;
    }
    const q = quantityView(spool);
    const title = `${text(spool.id)} · ${text(spool.colorName) || 'Unknown color'}`;
    const urgent = q.tone === 'unknown';
    return `<article class="ams-slot" data-ams-slot="${esc(slot)}" data-tone="${esc(q.tone)}" data-spool-id="${esc(spool.id)}">
      <div class="ams-slot-top"><span class="ams-slot-number">${esc(slot)}</span><i class="ams-color" style="background:${esc(spool.colorHex || '#666d7d')}"></i><details class="ams-slot-actions"><summary aria-label="Actions for ${esc(spool.id)}">•••</summary><div class="ams-slot-menu">
        <button class="btn" type="button" data-printer-weigh="${esc(spool.id)}">Weigh</button>
        <button class="btn" type="button" data-printer-edit-load="${esc(spool.id)}">Move</button>
        <button class="btn" type="button" data-printer-unload="${esc(spool.id)}">Unload</button>
        <button class="btn" type="button" data-spool-actions-open="${esc(spool.id)}">Open spool</button>
      </div></details></div>
      <div class="ams-slot-copy"><strong>${esc(title)}</strong><span>${esc(shortProduct(spool))}</span></div>
      <div class="ams-slot-quantity"><strong>${esc(q.quantity)}</strong><span class="ams-evidence" data-tone="${esc(q.tone)}">${esc(q.evidence)}</span></div>
      ${urgent ? `<button class="btn ams-slot-primary" type="button" data-printer-weigh="${esc(spool.id)}">Weigh</button>` : ''}
    </article>`;
  }

  function feederBoard(printer, feeder, rows) {
    const api = core();
    const slots = api.slotsForFeeder(feeder);
    const loaded = rows.filter(spool => loadedInFeeder(spool, feeder));
    const bySlot = new Map(loaded.map(spool => [text(spool.feederSlot), spool]));
    const decorated = {...feeder,__printerName:printer.name};
    return `<section class="ams-feeder" data-feeder-id="${esc(feeder.id)}">
      <div class="ams-feeder-head"><div><span class="eyebrow">${esc(feeder.type || 'Feeder')}</span><h4>${esc(feeder.name)}</h4></div><strong>${loaded.length} of ${slots.length} loaded</strong></div>
      <div class="ams-grid">${slots.map(slot => slotCard(bySlot.get(String(slot)) || null, decorated, slot)).join('')}</div>
    </section>`;
  }

  function directBoard(printer, rows) {
    const direct = rows.filter(spool => !text(spool.feederId) && !text(spool.feederName));
    if (!direct.length) return '';
    return `<section class="ams-feeder ams-direct"><div class="ams-feeder-head"><div><span class="eyebrow">External</span><h4>Direct spool</h4></div><strong>${direct.length} loaded</strong></div><div class="ams-direct-grid">${direct.map((spool,index) => slotCard(spool,{name:'Direct',__printerName:printer.name},String(index + 1))).join('')}</div></section>`;
  }

  function renderRegistry(value) {
    const api = core();
    const host = document.getElementById('printerRegistry');
    if (!host || !api) return;
    const printers = api.configuredPrinters(value,{includeLegacy:false});
    const loaded = api.loadedSpools(value);
    const section = host.closest('.printer-panel');
    const add = section?.querySelector('.panel-head [data-printer-add]');
    if (add) { add.textContent = '+'; add.classList.add('printer-add-quiet'); add.setAttribute('aria-label','Add printer'); }
    if (!printers.length) return;

    host.innerHTML = printers.map(printer => {
      const onPrinter = loaded.filter(spool => loadedOnPrinter(spool,printer));
      const slotCount = printer.feeders.reduce((sum,feeder) => sum + Number(feeder.slotCount || 0),0);
      const meta = [];
      const identity = [printer.manufacturer, printer.model].map(text).filter(Boolean).join(' · ');
      if (identity && !same(identity, printer.name)) meta.push(identity);
      if (printer.location) meta.push(`Location: ${printer.location}`);
      const nozzle = [printer.nozzleSize, printer.nozzleMaterial].map(text).filter(Boolean).join(' · ');
      if (nozzle) meta.push(`Nozzle: ${nozzle}`);
      if (printer.buildPlate) meta.push(`Plate: ${printer.buildPlate}`);
      const feederSummary = printer.feeders.length ? `${printer.feeders.length} feeder${printer.feeders.length === 1 ? '' : 's'} · ${slotCount} slots` : 'Direct spool only';
      const optionalRecorded = Boolean(identity || printer.location || nozzle || printer.buildPlate);
      return `<article class="printer-registry-card printer-registry-compact" data-printer-id="${esc(printer.id)}">
        <div class="printer-registry-main"><div><span class="eyebrow">Printer</span><h4>${esc(printer.name)}</h4></div><span class="printer-loaded-count">${onPrinter.length} loaded</span></div>
        <div class="printer-compact-meta"><strong>${esc(feederSummary)}</strong>${meta.map(item => `<span>${esc(item)}</span>`).join('')}</div>
        ${optionalRecorded ? '' : `<button class="printer-details-prompt" type="button" data-printer-edit="${esc(printer.id)}">+ Add hardware details</button>`}
        <div class="printer-registry-actions"><button class="btn" type="button" data-printer-edit="${esc(printer.id)}">Edit</button><button class="btn btn-primary" type="button" data-printer-load-target="${esc(printer.name)}">Load spool</button></div>
      </article>`;
    }).join('');
  }

  function attentionItems(summary) {
    const items = [];
    summary.conflicts.forEach(group => {
      const spool = group[0];
      if (spool) items.push({kind:'conflict',spool,title:`${spool.id} has a slot conflict`,detail:'Review placement',action:'Review'});
    });
    summary.unknownLoaded.forEach(spool => items.push({kind:'unknown',spool,title:`${spool.id} needs weighing`,detail:slotLocation(spool),action:'Weigh'}));
    summary.lowLoaded.filter(spool => !summary.unknownLoaded.includes(spool)).forEach(spool => items.push({kind:'low',spool,title:`${spool.id} is low`,detail:slotLocation(spool),action:'Open'}));
    return items;
  }

  function slotLocation(spool) {
    const parts = [spool.printerName, spool.feederName, spool.feederSlot ? `Slot ${spool.feederSlot}` : ''].map(text).filter(Boolean);
    return parts.join(' · ') || 'Loaded filament';
  }

  function renderInlineAttention(summary) {
    const board = document.getElementById('printerBoard');
    const panel = board?.closest('.printer-panel');
    if (!panel) return;
    let alert = panel.querySelector('.ams-inline-attention');
    if (!alert) {
      alert = document.createElement('div');
      alert.className = 'ams-inline-attention';
      board.insertAdjacentElement('beforebegin',alert);
    }
    const items = attentionItems(summary);
    if (!items.length) { alert.hidden = true; alert.innerHTML = ''; }
    else {
      const first = items[0];
      alert.hidden = false;
      alert.dataset.amsAttention = '1';
      alert.innerHTML = `<div><span class="ams-alert-icon">!</span><div><strong>${esc(items.length === 1 ? first.title : `${items.length} loaded spools need attention`)}</strong><span>${esc(items.length === 1 ? first.detail : 'Review the highlighted AMS slots below.')}</span></div></div><button class="btn" type="button" ${first.kind === 'unknown' ? `data-printer-weigh="${esc(first.spool.id)}"` : first.kind === 'conflict' ? `data-printer-edit-load="${esc(first.spool.id)}"` : `data-spool-actions-open="${esc(first.spool.id)}"`}>${esc(first.action)}</button>`;
    }

    const attentionHost = document.getElementById('printerAttention');
    const attentionPanel = attentionHost?.closest('.printer-panel');
    if (attentionPanel) attentionPanel.hidden = true;

    const metrics = [...document.querySelectorAll('#printerMetrics .printer-metric')];
    const attentionMetric = metrics[3];
    if (attentionMetric) {
      if (items.length) {
        attentionMetric.dataset.amsAttentionJump = '1';
        attentionMetric.tabIndex = 0;
        attentionMetric.setAttribute('role','button');
        attentionMetric.setAttribute('aria-label',`${items.length} printer attention item${items.length === 1 ? '' : 's'}. Jump to attention.`);
      } else {
        delete attentionMetric.dataset.amsAttentionJump;
        attentionMetric.removeAttribute('tabindex');
        attentionMetric.removeAttribute('role');
        attentionMetric.removeAttribute('aria-label');
      }
    }
  }

  function renderBoard(value) {
    const api = core();
    const host = document.getElementById('printerBoard');
    if (!host || !api) return;
    const printers = api.configuredPrinters(value,{includeLegacy:false});
    const loaded = api.loadedSpools(value);
    if (!printers.length) return;

    host.dataset.amsEnhanced = '1';
    host.innerHTML = printers.map(printer => {
      const rows = loaded.filter(spool => loadedOnPrinter(spool,printer));
      const feederMarkup = printer.feeders.map(feeder => feederBoard(printer,feeder,rows)).join('');
      const directMarkup = directBoard(printer,rows);
      return `<article class="ams-machine" data-printer-id="${esc(printer.id)}"><div class="ams-machine-head"><div><span class="eyebrow">Printer</span><h3>${esc(printer.name)}</h3></div><span>${rows.length} loaded</span></div>${feederMarkup || '<div class="ams-no-feeder">No feeder configured.</div>'}${directMarkup}</article>`;
    }).join('');
  }

  function enhance() {
    if (!document.getElementById('householdView') || !core()) return;
    const value = readState();
    const summary = core().summary(value);
    renderRegistry(value);
    renderBoard(value);
    renderInlineAttention(summary);
    document.documentElement.classList.add('ams-first-printer');
  }

  function queueEnhance() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; enhance(); });
  }

  function prepareEmptySlot(button) {
    const ui = globalThis.FilamentInventoryPrinterUI;
    if (!ui?.openLoad) return;
    ui.openLoad('',button.dataset.printerRef || '');
    setTimeout(() => {
      const feeder = document.getElementById('moveFeederV8');
      const slot = document.getElementById('moveSlotV8');
      if (feeder) {
        feeder.value = button.dataset.feederRef || '';
        feeder.dispatchEvent(new Event('change',{bubbles:true}));
      }
      setTimeout(() => { if (slot) slot.value = button.dataset.slotRef || ''; },30);
    },50);
  }

  function bind() {
    document.addEventListener('click',event => {
      const empty = event.target.closest('[data-ams-empty-load]');
      if (empty) { event.preventDefault(); prepareEmptySlot(empty); return; }
      const jump = event.target.closest('[data-ams-attention-jump]');
      if (jump) { document.querySelector('[data-ams-attention="1"]')?.scrollIntoView({behavior:'smooth',block:'center'}); }
    });
    document.addEventListener('keydown',event => {
      const jump = event.target.closest?.('[data-ams-attention-jump]');
      if (jump && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); jump.click(); }
    });
    globalThis.FilamentInventoryEvents?.on?.('inventory:changed',queueEnhance);
    window.addEventListener('storage',event => { if (String(event.key || '').includes('inventory')) queueEnhance(); });
  }

  function watch() {
    const view = document.getElementById('householdView');
    if (!view || observer) return;
    observer = new MutationObserver(() => {
      const board = document.getElementById('printerBoard');
      if (board && board.dataset.amsEnhanced !== '1') queueEnhance();
    });
    observer.observe(view,{childList:true,subtree:true});
  }

  function init() {
    bind();
    watch();
    queueEnhance();
    setTimeout(queueEnhance,120);
    globalThis.FilamentInventoryAMSUI = Object.freeze({refresh:queueEnhance});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
