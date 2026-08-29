(() => {
  'use strict';

  const STORAGE_KEY = 'filament-inventory-v1';
  const CUSTOM_VALUE = '__custom__';
  const $ = id => document.getElementById(id);
  const dispatch = node => {
    node?.dispatchEvent(new Event('input', {bubbles:true}));
    node?.dispatchEvent(new Event('change', {bubbles:true}));
  };
  const text = value => String(value ?? '').trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  const BASE = Object.freeze({
    brand: Object.freeze(['Inland','Bambu Lab','ELEGOO','Polymaker','Overture','eSUN','SUNLU','Hatchbox','Prusament','Creality','Cookiecad','Anycubic']),
    material: Object.freeze(['PLA','PLA+','Tough PLA','Matte PLA','Silk PLA','High Speed PLA+','PETG','PETG HF','Rapid PETG','PETG+','ABS','ASA','TPU','PC','PA / Nylon','PVA']),
    location: Object.freeze(['Shelf','Storage bin','Dry box']),
    purchaseSource: Object.freeze(['Micro Center','Amazon','Bambu Lab','Manufacturer direct']),
  });

  const COLORS = Object.freeze([
    Object.freeze({name:'Black',hex:'#111827'}),
    Object.freeze({name:'White',hex:'#f3f4f6'}),
    Object.freeze({name:'Gray',hex:'#6b7280'}),
    Object.freeze({name:'Red',hex:'#dc2626'}),
    Object.freeze({name:'Orange',hex:'#f97316'}),
    Object.freeze({name:'Yellow',hex:'#eab308'}),
    Object.freeze({name:'Green',hex:'#16a34a'}),
    Object.freeze({name:'Blue',hex:'#2563eb'}),
    Object.freeze({name:'Purple',hex:'#7c3aed'}),
    Object.freeze({name:'Pink',hex:'#ec4899'}),
    Object.freeze({name:'Brown / Tan',hex:'#9a6b43'}),
    Object.freeze({name:'Natural / Cream',hex:'#e7ddc4'}),
    Object.freeze({name:'Gold / Bronze',hex:'#b8892f'}),
    Object.freeze({name:'Translucent',hex:'#c9e9f5'}),
    Object.freeze({name:'Multicolor / Gradient',hex:'#9b5de5'}),
  ]);

  const GUIDED = Object.freeze({
    brand:Object.freeze({label:'Brand',placeholder:'Choose a brand…',base:BASE.brand}),
    material:Object.freeze({label:'Material / type',placeholder:'Choose a material…',base:BASE.material}),
    colorName:Object.freeze({label:'Color / finish',placeholder:'Choose a color…',base:COLORS.map(item => item.name)}),
    location:Object.freeze({label:'Storage location',placeholder:'Choose a location…',base:BASE.location}),
    purchaseSource:Object.freeze({label:'Purchase source',placeholder:'Choose a source…',base:BASE.purchaseSource}),
  });

  const TEMPLATE_FIELDS = Object.freeze(['brand','material','colorName','colorHex','spoolType','startWeight','confidence','reorderThreshold']);
  let enhanced = false;
  let reopenAfterSave = false;
  let enhancementAttempts = 0;

  function state() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return parsed && Array.isArray(parsed.spools) ? parsed : {spools:[]};
    } catch {
      return {spools:[]};
    }
  }

  function learned(field) {
    const counts = new Map();
    for (const spool of state().spools) {
      const value = text(spool?.[field]);
      if (!value || /^unknown$/i.test(value) || /^probable\b/i.test(value)) continue;
      const key = value.toLocaleLowerCase();
      const prior = counts.get(key) || {value,count:0};
      prior.count += 1;
      counts.set(key, prior);
    }
    return [...counts.values()].sort((a,b) => b.count - a.count || a.value.localeCompare(b.value)).map(item => item.value);
  }

  function valuesFor(field) {
    const config = GUIDED[field];
    const seen = new Set();
    const result = [];
    for (const value of [...learned(field), ...(config?.base || [])]) {
      const clean = text(value);
      const key = clean.toLocaleLowerCase();
      if (!clean || seen.has(key)) continue;
      seen.add(key);
      result.push(clean);
    }
    return result;
  }

  function colorHexForName(name) {
    const clean = text(name);
    const preset = COLORS.find(item => item.name.toLocaleLowerCase() === clean.toLocaleLowerCase());
    if (preset) return preset.hex;
    const match = state().spools.find(spool => text(spool.colorName).toLocaleLowerCase() === clean.toLocaleLowerCase() && /^#[0-9a-f]{6}$/i.test(spool.colorHex || ''));
    return match?.colorHex || null;
  }

  function option(value,label=value) {
    const node = document.createElement('option');
    node.value = value;
    node.textContent = label;
    return node;
  }

  function syncChoice(field) {
    const input = $(field);
    const select = $(`${field}Choice`);
    if (!input || !select) return;
    const values = valuesFor(field);
    const current = text(input.value);
    select.replaceChildren(option('', GUIDED[field].placeholder), ...values.map(value => option(value)), option(CUSTOM_VALUE,'Other / custom…'));
    const exact = values.find(value => value.toLocaleLowerCase() === current.toLocaleLowerCase());
    if (!current) {
      select.value = '';
      input.hidden = true;
    } else if (exact) {
      select.value = exact;
      if (input.value !== exact) input.value = exact;
      input.hidden = true;
    } else {
      select.value = CUSTOM_VALUE;
      input.hidden = false;
    }
  }

  function createChoice(field) {
    const input = $(field);
    const holder = input?.closest('.form-field');
    if (!input || !holder || $(`${field}Choice`)) return;
    const label = holder.querySelector('label');
    const select = document.createElement('select');
    select.id = `${field}Choice`;
    select.className = 'select spool-guided-select';
    select.setAttribute('aria-label', GUIDED[field].label);
    const wrap = document.createElement('div');
    wrap.className = 'spool-guided-field';
    input.parentNode.insertBefore(wrap,input);
    wrap.append(select,input);
    input.classList.add('spool-guided-custom');
    input.setAttribute('aria-label',`Custom ${GUIDED[field].label.toLocaleLowerCase()}`);
    input.placeholder = `Type custom ${GUIDED[field].label.toLocaleLowerCase()}`;
    if (label) {
      label.setAttribute('for',select.id);
      if (field === 'location') label.textContent = 'Storage location';
    }
    select.addEventListener('change',() => {
      if (select.value === CUSTOM_VALUE) {
        const known = valuesFor(field).some(value => value.toLocaleLowerCase() === text(input.value).toLocaleLowerCase());
        if (known) input.value = '';
        input.hidden = false;
        input.focus();
      } else {
        input.value = select.value;
        input.hidden = true;
        if (field === 'colorName' && select.value) {
          const hex = colorHexForName(select.value);
          if (hex && $('colorHex')) $('colorHex').value = hex;
        }
        dispatch(input);
        updateSummary();
      }
    });
    input.addEventListener('input',updateSummary);
    syncChoice(field);
  }

  function helper(field,copy) {
    const holder = $(field)?.closest('.form-field');
    if (!holder || holder.querySelector('.spool-field-help')) return;
    const node = document.createElement('small');
    node.className = 'spool-field-help';
    node.textContent = copy;
    holder.appendChild(node);
  }

  function ensureNumberChoices(inputId, values, formatter, label) {
    const input = $(inputId);
    const holder = input?.closest('.form-field');
    if (!input || !holder || holder.querySelector(`[data-number-choices="${inputId}"]`)) return;
    const group = document.createElement('div');
    group.className = 'spool-number-choices';
    group.dataset.numberChoices = inputId;
    group.setAttribute('role','group');
    group.setAttribute('aria-label',label);
    for (const value of values) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'spool-choice-chip';
      button.dataset.value = String(value);
      button.textContent = formatter(value);
      button.addEventListener('click',() => {
        input.value = String(value);
        dispatch(input);
        syncNumberChoices(inputId);
        updateSummary();
      });
      group.appendChild(button);
    }
    holder.appendChild(group);
    input.addEventListener('input',() => syncNumberChoices(inputId));
    syncNumberChoices(inputId);
  }

  function ensurePercentChoices() {
    const input = $('visualPercent');
    const holder = input?.closest('.form-field');
    if (!input || !holder || holder.querySelector('[data-percent-choices]')) return;
    const group = document.createElement('div');
    group.className = 'spool-number-choices';
    group.dataset.percentChoices = 'visualPercent';
    group.setAttribute('role','group');
    group.setAttribute('aria-label','Visual estimate quick choices');
    const values = ['',25,50,75,100];
    for (const value of values) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'spool-choice-chip';
      button.dataset.value = String(value);
      button.textContent = value === '' ? 'Unknown' : `${value}%`;
      button.addEventListener('click',() => {
        input.value = String(value);
        dispatch(input);
        syncPercentChoices();
        updateSummary();
      });
      group.appendChild(button);
    }
    holder.appendChild(group);
    input.addEventListener('input',syncPercentChoices);
    syncPercentChoices();
  }

  function syncNumberChoices(inputId) {
    const input = $(inputId);
    const group = document.querySelector(`[data-number-choices="${inputId}"]`);
    if (!input || !group) return;
    for (const button of group.querySelectorAll('button[data-value]')) button.setAttribute('aria-pressed', String(button.dataset.value === String(input.value)));
  }

  function syncPercentChoices() {
    const input = $('visualPercent');
    const group = document.querySelector('[data-percent-choices]');
    if (!input || !group) return;
    for (const button of group.querySelectorAll('button[data-value]')) button.setAttribute('aria-pressed', String(button.dataset.value === String(input.value)));
  }

  function ensureColorSwatches() {
    const holder = $('colorHex')?.closest('.form-field');
    if (!holder || holder.querySelector('.spool-color-presets')) return;
    const group = document.createElement('div');
    group.className = 'spool-color-presets';
    group.setAttribute('role','group');
    group.setAttribute('aria-label','Common filament colors');
    for (const item of COLORS.slice(0,12)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'spool-color-preset';
      button.title = item.name;
      button.setAttribute('aria-label',item.name);
      const swatch = document.createElement('span');
      swatch.setAttribute('aria-hidden','true');
      swatch.style.backgroundColor = item.hex;
      button.appendChild(swatch);
      button.addEventListener('click',() => {
        $('colorName').value = item.name;
        $('colorHex').value = item.hex;
        dispatch($('colorName'));
        dispatch($('colorHex'));
        syncChoice('colorName');
        syncColorSwatches();
        updateSummary();
      });
      group.appendChild(button);
    }
    holder.appendChild(group);
    $('colorHex')?.addEventListener('input',() => { syncColorSwatches(); updateSummary(); });
    syncColorSwatches();
  }

  function syncColorSwatches() {
    const current = text($('colorHex')?.value).toLocaleLowerCase();
    for (const button of document.querySelectorAll('.spool-color-preset')) {
      const item = COLORS.find(entry => entry.name === button.getAttribute('aria-label'));
      button.setAttribute('aria-pressed', String(Boolean(item && item.hex.toLocaleLowerCase() === current)));
    }
  }

  function ensureSummary() {
    const body = document.querySelector('#spoolDialog .dialog-body');
    if (!body || body.querySelector('.spool-intake-summary')) return;
    const summary = document.createElement('section');
    summary.className = 'spool-intake-summary';
    summary.setAttribute('aria-live','polite');
    summary.innerHTML = `<div class="spool-intake-swatch" data-intake-swatch aria-hidden="true"></div><div class="spool-intake-copy"><span class="eyebrow">Guided spool entry</span><strong data-intake-title>New spool</strong><small data-intake-detail>Choose brand, material and color for a clean inventory card.</small></div><span class="spool-intake-state" data-intake-state>3 suggested</span>`;
    const root = body.querySelector('.v10-form-root') || body.querySelector('.form-grid');
    body.insertBefore(summary,root || body.firstChild);
  }

  function updateSummary() {
    const summary = document.querySelector('.spool-intake-summary');
    if (!summary) return;
    const brand = text($('brand')?.value);
    const material = text($('material')?.value);
    const color = text($('colorName')?.value);
    const id = text($('spoolId')?.value) || 'New spool';
    const missing = [brand,material,color].filter(value => !value).length;
    const title = summary.querySelector('[data-intake-title]');
    const detail = summary.querySelector('[data-intake-detail]');
    const stateNode = summary.querySelector('[data-intake-state]');
    const swatch = summary.querySelector('[data-intake-swatch]');
    if (title) title.textContent = `${id}${color ? ` · ${color}` : ''}`;
    if (detail) detail.textContent = [brand,material].filter(Boolean).join(' · ') || 'Choose brand, material and color for a clean inventory card.';
    if (stateNode) {
      stateNode.textContent = missing ? `${missing} suggested` : 'Ready';
      stateNode.dataset.state = missing ? 'incomplete' : 'ready';
    }
    if (swatch) swatch.style.backgroundColor = /^#[0-9a-f]{6}$/i.test($('colorHex')?.value || '') ? $('colorHex').value : '#64748b';
  }

  function launchAdd() {
    const button = $('inventoryAddBtn') || $('heroAddBtn') || $('addTopBtn');
    button?.click();
  }

  function saveAndAddAnother() {
    const form = $('spoolForm');
    const dialog = $('spoolDialog');
    const submit = form?.querySelector('button[type="submit"]');
    if (!form || !dialog || !submit) return;
    reopenAfterSave = true;
    form.requestSubmit(submit);
    setTimeout(() => { if (dialog.open) reopenAfterSave = false; },120);
  }

  function duplicateAsNew() {
    const dialog = $('spoolDialog');
    if (!dialog) return;
    const template = Object.fromEntries(TEMPLATE_FIELDS.map(field => [field,$(field)?.value ?? '']));
    dialog.close();
    setTimeout(() => {
      launchAdd();
      setTimeout(() => {
        for (const [field,value] of Object.entries(template)) if ($(field)) $(field).value = value;
        refreshGuidedControls();
        updateSummary();
        $('brandChoice')?.focus();
      },20);
    },0);
  }

  function ensureActions() {
    const actions = document.querySelector('#spoolDialog .dialog-actions');
    if (!actions || actions.querySelector('[data-spool-save-another]')) return;
    const primary = actions.querySelector('button[type="submit"]');
    const cancel = $('cancelSpoolBtn');
    const duplicate = document.createElement('button');
    duplicate.type = 'button';
    duplicate.className = 'btn spool-duplicate-action';
    duplicate.dataset.spoolDuplicate = '';
    duplicate.textContent = 'Duplicate as new';
    duplicate.addEventListener('click',duplicateAsNew);
    const another = document.createElement('button');
    another.type = 'button';
    another.className = 'btn spool-save-another';
    another.dataset.spoolSaveAnother = '';
    another.textContent = 'Save & add another';
    another.addEventListener('click',saveAndAddAnother);
    if (cancel) cancel.insertAdjacentElement('afterend',duplicate);
    if (primary) primary.insertAdjacentElement('beforebegin',another);
  }

  function syncMode() {
    const editing = Boolean(text($('editOriginalId')?.value));
    const dialog = $('spoolDialog');
    const primary = dialog?.querySelector('.dialog-actions button[type="submit"]');
    const another = dialog?.querySelector('[data-spool-save-another]');
    const duplicate = dialog?.querySelector('[data-spool-duplicate]');
    if (primary) primary.textContent = editing ? 'Save changes' : 'Add spool';
    if (another) another.hidden = editing;
    if (duplicate) duplicate.hidden = !editing;
    const advanced = dialog?.querySelector('.spool-form-advanced');
    if (advanced && !editing) advanced.open = false;
  }

  function refreshGuidedControls() {
    for (const field of Object.keys(GUIDED)) syncChoice(field);
    syncNumberChoices('startWeight');
    syncNumberChoices('reorderThreshold');
    syncPercentChoices();
    syncColorSwatches();
    syncMode();
    updateSummary();
  }

  function enhance() {
    const dialog = $('spoolDialog');
    const form = $('spoolForm');
    const structured = dialog?.querySelector('.v10-form-root');
    if (!dialog || !form || !structured) {
      if (enhancementAttempts++ < 40) setTimeout(enhance,50);
      return;
    }
    if (enhanced) return;
    enhanced = true;
    dialog.classList.add('spool-intake-dialog');
    ensureSummary();
    for (const field of Object.keys(GUIDED)) createChoice(field);
    helper('brand','Choose a common brand or use Other / custom.');
    helper('material','Common materials are standardized; custom specialty types stay supported.');
    helper('location','For stored filament. Use the Printer page for loaded AMS / feeder placement.');
    ensureNumberChoices('startWeight',[250,500,750,1000,2000,3000],value => value >= 1000 ? `${value/1000} kg` : `${value} g`,'Starting filament quick choices');
    ensureNumberChoices('reorderThreshold',[100,200,250,500],value => `${value} g`,'Reorder threshold quick choices');
    ensurePercentChoices();
    ensureColorSwatches();
    ensureActions();
    form.addEventListener('input',updateSummary);
    form.addEventListener('change',updateSummary);
    new MutationObserver(() => {
      if (dialog.open) refreshGuidedControls();
      else if (reopenAfterSave) {
        reopenAfterSave = false;
        setTimeout(launchAdd,20);
      }
    }).observe(dialog,{attributes:true,attributeFilter:['open']});
    refreshGuidedControls();
  }

  globalThis.FilamentInventorySpoolIntakeUI = Object.freeze({refresh:refreshGuidedControls,enhance});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',() => setTimeout(enhance,40),{once:true});
  else setTimeout(enhance,40);
})();
