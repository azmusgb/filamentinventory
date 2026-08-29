(() => {
  'use strict';

  const STORAGE_KEY = 'filament-inventory-v1';
  const core = globalThis.FilamentInventoryPrinter;
  if (!core) return;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text = value => String(value || '').trim();
  const parse = (value, fallback = null) => { try { return JSON.parse(value); } catch { return fallback; } };
  let scheduled = false;
  let applying = false;
  let observer = null;

  function readState() {
    const value = parse(localStorage.getItem(STORAGE_KEY) || '{}', {});
    return value && Array.isArray(value.spools)
      ? {...value, printers:Array.isArray(value.printers) ? value.printers : []}
      : {spools:[],printers:[]};
  }

  function isLoadedOnPrinter(spool, printer) {
    if (spool?.placementState !== 'Loaded') return false;
    const id = text(spool.printerId);
    if (id) return id === printer.id;
    return text(spool.printerName).toLowerCase() === printer.name.toLowerCase();
  }

  function isLoadedInFeeder(spool, feeder) {
    const id = text(spool.feederId);
    if (id) return id === feeder.id;
    return text(spool.feederName).toLowerCase() === feeder.name.toLowerCase();
  }

  function evidence(spool) {
    const measurement = core.measurement(spool);
    if (measurement.source === 'Measured') return {label:'Measured', tone:'measured'};
    if (measurement.evidence === 'usage') return {label:'Usage estimate', tone:'estimated'};
    if (measurement.source === 'Estimated') return {label:'Visual estimate', tone:'estimated'};
    return {label:'Weigh required', tone:'unknown'};
  }

  function quantity(spool) {
    const measurement = core.measurement(spool);
    if (measurement.grams === null) return 'Not measured';
    const percent = measurement.percent === null ? '' : ` · ${Math.round(measurement.percent)}%`;
    return `${Math.round(measurement.grams)} g${percent}`;
  }

  function statusFor(spool) {
    const measurement = core.measurement(spool);
    if (measurement.grams === null) return 'unknown';
    if (core.reorderNeeded(spool)) return 'low';
    return measurement.source === 'Measured' ? 'measured' : 'estimated';
  }

  function slotLabel(spool) {
    const feeder = text(spool.feederName);
    const slot = text(spool.feederSlot);
    if (!feeder) return 'Direct / external spool';
    return [feeder, slot ? `Slot ${slot}` : ''].filter(Boolean).join(' · ');
  }

  function attentionRows(state) {
    const summary = core.summary(state);
    const rows = [];
    summary.conflicts.forEach(group => {
      const first = group[0];
      if (first) rows.push({kind:'conflict', spool:first, title:'Duplicate slot assignment', detail:group.map(row => row.id).join(', ')});
    });
    summary.unknownLoaded.forEach(spool => rows.push({kind:'unknown', spool, title:`${spool.id} needs weighing`, detail:slotLabel(spool)}));
    summary.lowLoaded.forEach(spool => {
      const measurement = core.measurement(spool);
      rows.push({kind:'low', spool, title:`${spool.id} is low`, detail:`${Math.round(measurement.grams)} g remaining · ${slotLabel(spool)}`});
    });
    return rows;
  }

  function renderMetrics(state) {
    const node = document.getElementById('printerMetrics');
    if (!node) return;
    const summary = core.summary(state);
    const attention = summary.lowLoaded.length + summary.unknownLoaded.length + summary.conflicts.length;
    const amount = summary.knownLoadedGrams >= 1000
      ? `${(summary.knownLoadedGrams / 1000).toFixed(2)} kg`
      : `${Math.round(summary.knownLoadedGrams)} g`;
    node.innerHTML = `
      <div class="printer-metric"><span>Printers</span><strong>${summary.printers}</strong></div>
      <div class="printer-metric"><span>Loaded</span><strong>${summary.loaded}</strong></div>
      <div class="printer-metric"><span>Filament</span><strong>${esc(amount)}</strong></div>
      ${attention ? `<button class="printer-metric printer-metric-action" type="button" data-printer-attention-jump aria-label="Show ${attention} printer attention item${attention === 1 ? '' : 's'}"><span>Attention</span><strong>${attention}</strong></button>` : '<div class="printer-metric"><span>Attention</span><strong>0</strong></div>'}`;
  }

  function recordedSpecs(printer) {
    const specs = [];
    const identity = [printer.manufacturer, printer.model && printer.model !== printer.name ? printer.model : ''].filter(Boolean).join(' · ');
    const nozzle = [printer.nozzleSize, printer.nozzleMaterial].filter(Boolean).join(' · ');
    if (identity) specs.push(['Printer', identity]);
    if (printer.location) specs.push(['Location', printer.location]);
    if (nozzle) specs.push(['Nozzle', nozzle]);
    if (printer.buildPlate) specs.push(['Build plate', printer.buildPlate]);
    return specs;
  }

  function renderRegistry(state) {
    const node = document.getElementById('printerRegistry');
    if (!node) return;
    const printers = core.configuredPrinters(state,{includeLegacy:false});
    if (!printers.length) return;
    const loaded = core.loadedSpools(state);
    node.innerHTML = printers.map(printer => {
      const onPrinter = loaded.filter(spool => isLoadedOnPrinter(spool, printer));
      const slots = printer.feeders.reduce((sum, feeder) => sum + Number(feeder.slotCount || 0), 0);
      const feederText = printer.feeders.length
        ? `${printer.feeders.length} feeder${printer.feeders.length === 1 ? '' : 's'} · ${slots} slot${slots === 1 ? '' : 's'}`
        : 'Direct / external spool';
      const specs = recordedSpecs(printer);
      return `<article class="printer-registry-card ams-printer-summary" data-printer-id="${esc(printer.id)}">
        <div class="printer-registry-main">
          <div><span class="eyebrow">Printer</span><h4>${esc(printer.name)}</h4><p>${esc(feederText)} · ${onPrinter.length} loaded</p></div>
          <button class="printer-summary-menu" type="button" data-printer-edit="${esc(printer.id)}" aria-label="Edit ${esc(printer.name)}">•••</button>
        </div>
        ${specs.length ? `<dl class="ams-recorded-specs">${specs.map(([label,value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>` : `<button class="ams-add-details" type="button" data-printer-edit="${esc(printer.id)}">Add hardware details</button>`}
        <div class="printer-registry-actions"><button class="btn" type="button" data-printer-edit="${esc(printer.id)}">Edit</button><button class="btn btn-primary" type="button" data-printer-load-target="${esc(printer.name)}">Load spool</button></div>
      </article>`;
    }).join('');
  }

  function spoolCard(spool, slotNumber) {
    const m = core.measurement(spool);
    const ev = evidence(spool);
    const status = statusFor(spool);
    const needsWeigh = m.grams === null;
    const low = status === 'low';
    return `<article class="ams-slot-card" data-status="${status}" data-ams-attention="${needsWeigh || low ? 'true' : 'false'}">
      <div class="ams-slot-top"><span class="ams-slot-number">${esc(slotNumber)}</span><span class="ams-slot-swatch" style="background:${esc(spool.colorHex || '#666d7d')}"></span><button class="ams-slot-more" type="button" data-spool-actions-open="${esc(spool.id)}" aria-label="Open ${esc(spool.id)} actions">•••</button></div>
      <div class="ams-slot-copy"><strong>${esc(spool.id)} · ${esc(spool.colorName || 'Unknown')}</strong><span>${esc(spool.brand || 'Unknown')} · ${esc(spool.material || 'Unknown')}</span></div>
      <div class="ams-slot-quantity"><strong>${esc(quantity(spool))}</strong><span class="ams-evidence" data-tone="${ev.tone}">${esc(ev.label)}</span></div>
      ${needsWeigh ? `<button class="ams-slot-primary" type="button" data-printer-weigh="${esc(spool.id)}">Weigh</button>` : ''}
    </article>`;
  }

  function emptySlot(printer, feeder, slotNumber) {
    return `<button class="ams-slot-card ams-slot-empty" type="button" data-ams-empty-slot data-printer-ref="${esc(printer.name)}" data-feeder-ref="${esc(feeder.name)}" data-slot="${esc(slotNumber)}">
      <span class="ams-slot-number">${esc(slotNumber)}</span><span class="ams-empty-plus">＋</span><strong>Empty</strong><span>Load filament</span>
    </button>`;
  }

  function feederBoard(printer, feeder, loaded) {
    const slots = core.slotsForFeeder(feeder);
    const occupied = loaded.filter(spool => isLoadedOnPrinter(spool, printer) && isLoadedInFeeder(spool, feeder));
    const cards = slots.map(slot => {
      const spool = occupied.find(row => text(row.feederSlot) === String(slot));
      return spool ? spoolCard(spool, slot) : emptySlot(printer, feeder, slot);
    }).join('');
    return `<section class="ams-feeder" data-feeder-id="${esc(feeder.id)}">
      <header class="ams-feeder-head"><div><span class="eyebrow">${esc(feeder.type || 'Feeder')}</span><h4>${esc(feeder.name)}</h4></div><span>${occupied.length} / ${slots.length} loaded</span></header>
      <div class="ams-slot-grid">${cards}</div>
    </section>`;
  }

  function directBoard(rows) {
    if (!rows.length) return '';
    return `<section class="ams-feeder"><header class="ams-feeder-head"><div><span class="eyebrow">External</span><h4>Direct / external spool</h4></div><span>${rows.length} loaded</span></header><div class="ams-slot-grid ams-direct-grid">${rows.map((spool,index) => spoolCard(spool,index + 1)).join('')}</div></section>`;
  }

  function attentionBanner(state) {
    const rows = attentionRows(state);
    if (!rows.length) return '';
    const first = rows[0];
    const action = first.kind === 'conflict'
      ? `<button class="btn" type="button" data-printer-edit-load="${esc(first.spool.id)}">Review</button>`
      : `<button class="btn btn-primary" type="button" data-printer-weigh="${esc(first.spool.id)}">Weigh</button>`;
    return `<aside class="ams-attention-banner" role="status"><div><span class="eyebrow">Needs attention</span><strong>${esc(first.title)}</strong><span>${esc(first.detail)}${rows.length > 1 ? ` · +${rows.length - 1} more` : ''}</span></div>${action}</aside>`;
  }

  function renderBoard(state) {
    const node = document.getElementById('printerBoard');
    if (!node) return;
    const printers = core.configuredPrinters(state,{includeLegacy:false});
    const loaded = core.loadedSpools(state);
    if (!printers.length) return;
    node.innerHTML = `${attentionBanner(state)}${printers.map(printer => {
      const onPrinter = loaded.filter(spool => isLoadedOnPrinter(spool, printer));
      const feederIds = new Set(printer.feeders.map(feeder => feeder.id));
      const feederNames = new Set(printer.feeders.map(feeder => feeder.name.toLowerCase()));
      const direct = onPrinter.filter(spool => {
        if (!text(spool.feederId) && !text(spool.feederName)) return true;
        if (text(spool.feederId)) return !feederIds.has(text(spool.feederId));
        return !feederNames.has(text(spool.feederName).toLowerCase());
      });
      const slotTotal = printer.feeders.reduce((sum,feeder) => sum + core.slotsForFeeder(feeder).length,0);
      return `<article class="ams-printer-board" data-printer-id="${esc(printer.id)}">
        <header class="ams-printer-head"><div><span class="eyebrow">Printer</span><h3>${esc(printer.name)}</h3></div><span>${onPrinter.length}${slotTotal ? ` / ${slotTotal} slots` : ' loaded'}</span></header>
        ${printer.feeders.map(feeder => feederBoard(printer, feeder, loaded)).join('')}${directBoard(direct)}
      </article>`;
    }).join('')}`;
  }

  function hideLegacyAttention() {
    const attention = document.getElementById('printerAttention');
    const panel = attention?.closest('.printer-panel');
    if (panel) panel.classList.add('ams-legacy-attention-panel');
  }

  function refineSectionChrome() {
    const command = document.querySelector('.printer-command');
    if (command) command.classList.add('ams-first-printer');
    const registry = document.getElementById('printerRegistry');
    const registryPanel = registry?.closest('.printer-panel');
    const add = registryPanel?.querySelector('[data-printer-add]');
    if (add && matchMedia('(max-width:620px)').matches) {
      add.textContent = '+';
      add.setAttribute('aria-label','Add printer');
      add.classList.add('ams-add-printer-compact');
    }
  }

  function observeNow() {
    observer?.observe(document.body,{childList:true,subtree:true});
  }

  function apply() {
    scheduled = false;
    if (applying) return;
    if (document.getElementById('householdView')?.dataset.printerCommand !== '3') return;
    applying = true;
    observer?.disconnect();
    try {
      const state = readState();
      document.documentElement.classList.add('ams-first-printer-ui');
      renderMetrics(state);
      renderRegistry(state);
      renderBoard(state);
      hideLegacyAttention();
      refineSectionChrome();
    } finally {
      applying = false;
      observeNow();
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(apply);
  }

  function bind() {
    document.addEventListener('click', event => {
      const jump = event.target.closest('[data-printer-attention-jump]');
      if (jump) {
        const target = document.querySelector('.ams-attention-banner, [data-ams-attention="true"]');
        target?.scrollIntoView({behavior:'smooth',block:'center'});
        target?.querySelector('button')?.focus({preventScroll:true});
        return;
      }
      const empty = event.target.closest('[data-ams-empty-slot]');
      if (empty) {
        globalThis.FilamentInventoryPrinterUI?.openLoad?.('', empty.dataset.printerRef || '');
        setTimeout(() => {
          const feeder = document.getElementById('moveFeederV8');
          if (feeder) {
            feeder.value = empty.dataset.feederRef || '';
            feeder.dispatchEvent(new Event('change',{bubbles:true}));
          }
          setTimeout(() => {
            const slot = document.getElementById('moveSlotV8');
            if (slot) slot.value = empty.dataset.slot || '';
          },20);
        },30);
      }
    });
    globalThis.FilamentInventoryEvents?.on?.('inventory:changed', schedule);
    globalThis.FilamentInventoryEvents?.on?.('navigation:changed', schedule);
    window.addEventListener('storage', event => { if (String(event.key || '').includes('inventory')) schedule(); });
    window.addEventListener('resize', schedule);
  }

  function watch() {
    if (observer || !document.body) return;
    observer = new MutationObserver(records => {
      if (applying) return;
      const relevant = records.some(record => record.target.closest?.('#householdView') || [...record.addedNodes].some(node => node.nodeType === Node.ELEMENT_NODE && (node.id === 'householdView' || node.querySelector?.('#householdView'))));
      if (relevant) schedule();
    });
    observeNow();
  }

  function init() {
    bind();
    watch();
    schedule();
    globalThis.FilamentInventoryAMSBoard = Object.freeze({render:schedule});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
