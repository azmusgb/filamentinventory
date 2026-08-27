(() => {
  'use strict';

  const PREF_KEY = 'filament-ux-v1';
  const CURRENT_USER_KEY = 'filament-current-user-v1';
  const VERSION_INFO = globalThis.FilamentInventoryVersion || Object.freeze({APP_VERSION:'9.0.0', DATA_SCHEMA_VERSION:9, DISPLAY_VERSION:'v9.0.0'});
  const VERSION = VERSION_INFO.DATA_SCHEMA_VERSION;
  const VERSION_LABEL = VERSION_INFO.DISPLAY_VERSION;
  const OWNERS = ['Bill', 'Aimee'];
  const VALID_VIEWS = ['dashboard','inventory','weigh','history','labels','household','sync','data','preferences'];
  let applying = false;
  let filterTimer = null;

  const defaults = () => ({
    theme:'midnight',
    accent:'cyan',
    density:'comfortable',
    textScale:'100',
    motion:'standard',
    inventoryLayout:'cards',
    defaultView:'dashboard',
    ownerScope:'current',
    defaultSort:'id',
    defaultLifecycle:'active',
    rememberFilters:true,
    dashboardHero:true,
    dashboardPriority:true,
    dashboardCharts:true,
    labelSize:'2x1',
    workspaceName:'Filament Inventory',
    largerTargets:false,
    filters:null
  });

  const parse = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };
  const currentUser = () => OWNERS.includes(localStorage.getItem(CURRENT_USER_KEY)) ? localStorage.getItem(CURRENT_USER_KEY) : 'Bill';

  function readStore() {
    const raw = parse(localStorage.getItem(PREF_KEY) || '{}', {});
    return {version:VERSION, profiles:{Bill:{...defaults(), ...(raw.profiles?.Bill || {})}, Aimee:{...defaults(), ...(raw.profiles?.Aimee || {})}}};
  }

  function writeStore(store) {
    localStorage.setItem(PREF_KEY, JSON.stringify({version:VERSION, profiles:store.profiles}));
  }

  function prefs(owner = currentUser()) { return readStore().profiles[owner]; }

  function updatePrefs(patch, owner = currentUser()) {
    const store = readStore();
    store.profiles[owner] = {...store.profiles[owner], ...patch};
    writeStore(store);
    if (owner === currentUser()) applyPreferences(store.profiles[owner]);
    populateForm(owner);
  }

  function accentPair(name) {
    return {
      cyan:['#22d3ee','#60a5fa'],
      violet:['#a78bfa','#818cf8'],
      green:['#84cc16','#22c55e'],
      amber:['#f59e0b','#fb7185'],
      rose:['#fb7185','#c084fc']
    }[name] || ['#22d3ee','#60a5fa'];
  }

  function effectiveTheme(theme) {
    if (theme !== 'system') return theme;
    return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'midnight';
  }

  function applyPreferences(p = prefs()) {
    applying = true;
    const root = document.documentElement;
    const body = document.body;
    const theme = effectiveTheme(p.theme);
    root.dataset.uxTheme = theme;
    root.dataset.uxDensity = p.density;
    root.dataset.uxLayout = p.inventoryLayout;
    root.dataset.uxMotion = p.motion;
    root.dataset.uxTargets = p.largerTargets ? 'large' : 'standard';
    root.style.fontSize = `${Math.max(90, Math.min(125, Number(p.textScale) || 100))}%`;
    const [accent, accent2] = accentPair(p.accent);
    root.style.setProperty('--ux-accent', accent);
    root.style.setProperty('--ux-accent2', accent2);
    root.style.setProperty('--cyan', accent);
    root.style.setProperty('--blue', accent2);

    body?.classList.toggle('ux-hide-hero', !p.dashboardHero);
    body?.classList.toggle('ux-hide-priority', !p.dashboardPriority);
    body?.classList.toggle('ux-hide-charts', !p.dashboardCharts);

    const title = String(p.workspaceName || '').trim() || 'Filament Inventory';
    const brand = document.querySelector('.brand h1');
    if (brand) brand.textContent = title;
    document.title = title;
    const apple = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (apple) apple.setAttribute('content', title.slice(0, 30));
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute('content', theme === 'light' ? '#f5f8fc' : theme === 'oled' ? '#000000' : '#07111f');

    const current = document.getElementById('currentUserV8');
    if (current && current.value !== currentUser()) current.value = currentUser();
    applying = false;
  }


  function settingsMarkup() {
    return `<section class="panel ux-profile-head"><div><span class="eyebrow">Personal experience · ${VERSION_LABEL}</span><h2 id="preferencesTitle">Make the app fit the person and device.</h2><p class="muted">Preferences are stored locally per user profile. Bill and Aimee can use different layouts, themes, landing pages and defaults without changing private inventory data.</p></div><label class="ux-profile-pill">Editing preferences for <select id="uxProfile" class="select"><option>Bill</option><option>Aimee</option></select></label></section>
    <div class="ux-pref-grid">
      <section class="panel ux-pref-card"><h3>Appearance</h3><p>Theme, accent, text size, spacing and motion.</p><div class="form-grid"><div class="form-field"><label for="uxTheme">Theme</label><select id="uxTheme" class="select"><option value="midnight">Midnight</option><option value="light">Light</option><option value="oled">OLED black</option><option value="contrast">High contrast</option><option value="system">Follow system</option></select></div><div class="form-field"><label for="uxDensity">Density</label><select id="uxDensity" class="select"><option value="compact">Compact</option><option value="comfortable">Comfortable</option><option value="roomy">Roomy</option></select></div><div class="form-field"><label for="uxTextScale">Text size</label><select id="uxTextScale" class="select"><option value="95">Small</option><option value="100">Standard</option><option value="110">Large</option><option value="120">Extra large</option></select></div><div class="form-field"><label for="uxMotion">Motion</label><select id="uxMotion" class="select"><option value="standard">Standard</option><option value="reduced">Reduced</option></select></div></div><label class="ux-check" style="margin-top:10px"><input id="uxTargets" type="checkbox"/> Larger touch targets</label><div style="margin-top:14px"><label>Accent</label><div class="ux-color-row" id="uxAccentRow"><button class="ux-color" type="button" data-accent="cyan" aria-label="Cyan accent" style="background:linear-gradient(135deg,#22d3ee,#60a5fa)"></button><button class="ux-color" type="button" data-accent="violet" aria-label="Violet accent" style="background:linear-gradient(135deg,#a78bfa,#818cf8)"></button><button class="ux-color" type="button" data-accent="green" aria-label="Green accent" style="background:linear-gradient(135deg,#84cc16,#22c55e)"></button><button class="ux-color" type="button" data-accent="amber" aria-label="Amber accent" style="background:linear-gradient(135deg,#f59e0b,#fb7185)"></button><button class="ux-color" type="button" data-accent="rose" aria-label="Rose accent" style="background:linear-gradient(135deg,#fb7185,#c084fc)"></button></div></div></section>
      <section class="panel ux-pref-card"><h3>Navigation & inventory</h3><p>Choose where the app opens and how inventory is presented.</p><div class="form-grid"><div class="form-field"><label for="uxDefaultView">Start on</label><select id="uxDefaultView" class="select"><option value="dashboard">Dashboard</option><option value="inventory">Inventory</option><option value="weigh">Weigh</option><option value="household">Printer / AMS</option><option value="labels">Labels</option><option value="sync">Sync</option></select></div><div class="form-field"><label for="uxLayout">Inventory layout</label><select id="uxLayout" class="select"><option value="cards">Cards</option><option value="list">List</option></select></div><div class="form-field"><label for="uxOwnerScope">Default owner filter</label><select id="uxOwnerScope" class="select"><option value="all">All owners</option><option value="Bill">Bill</option><option value="Aimee">Aimee</option><option value="current">Current profile</option></select></div><div class="form-field"><label for="uxSort">Default sort</label><select id="uxSort" class="select"><option value="id">ID</option><option value="reorder">Reorder first</option><option value="fill-asc">Lowest fill</option><option value="fill-desc">Highest fill</option><option value="brand">Brand</option><option value="updated">Recently updated</option></select></div><div class="form-field"><label for="uxLifecycle">Default lifecycle</label><select id="uxLifecycle" class="select"><option value="active">Active</option><option value="all">Active + archived</option><option value="archived">Archived only</option></select></div><div class="form-field"><label for="uxLabelSize">Default label size</label><select id="uxLabelSize" class="select"><option value="2x1">2 × 1 in</option><option value="2.25x1.25">2.25 × 1.25 in</option><option value="1.5-square">1.5 × 1.5 in</option></select></div></div><label class="ux-check" style="margin-top:10px"><input id="uxRememberFilters" type="checkbox"/> Remember my inventory filters</label></section>
      <section class="panel ux-pref-card"><h3>Dashboard</h3><p>Keep the information you use and hide the rest.</p><div class="ux-options"><label class="ux-check"><input id="uxHero" type="checkbox"/> Welcome / quick actions</label><label class="ux-check"><input id="uxPriority" type="checkbox"/> Priority queue</label><label class="ux-check"><input id="uxCharts" type="checkbox"/> Distribution & material charts</label></div><div class="form-field" style="margin-top:14px"><label for="uxWorkspaceName">App title on this profile</label><input id="uxWorkspaceName" class="field" maxlength="40" placeholder="Filament Inventory"/></div></section>
      <section class="panel ux-pref-card"><h3>Profile & portability</h3><p>Preferences are deliberately separate from cloud inventory because phone, tablet and desktop layouts can be different.</p><div class="ux-note">Changing these settings does not alter spool ownership, measurements, cloud revisions, AMS assignments or the sync key. Each browser keeps its own Bill and Aimee UX profiles.</div><div class="ux-actions"><button class="btn" id="uxCopyOther" type="button">Copy other profile</button><button class="btn" id="uxExport" type="button">Export preferences</button><button class="btn" id="uxImport" type="button">Import preferences</button><button class="btn btn-danger" id="uxReset" type="button">Reset this profile</button></div><input id="uxImportFile" class="sr-only" type="file" accept="application/json,.json"/></section>
    </div>`;
  }

  function injectView() {
    const tabs = document.querySelector('.tabs');
    const dataTab = tabs?.querySelector('[data-view="data"]');
    if (tabs && dataTab && !tabs.querySelector('[data-view="preferences"]')) {
      const button = document.createElement('button');
      button.className = 'tab'; button.type = 'button'; button.dataset.view = 'preferences'; button.setAttribute('aria-selected','false'); button.textContent = 'Customize';
      tabs.insertBefore(button, dataTab);
    }
    const dataView = document.getElementById('dataView');
    if (dataView && !document.getElementById('preferencesView')) {
      const section = document.createElement('section'); section.className = 'view'; section.id = 'preferencesView'; section.setAttribute('aria-labelledby','preferencesTitle'); section.innerHTML = settingsMarkup();
      dataView.parentNode.insertBefore(section, dataView);
    }
    const actions = document.querySelector('.top-actions');
    if (actions && !document.getElementById('uxTopBtn')) {
      const button = document.createElement('button'); button.id='uxTopBtn'; button.type='button'; button.className='btn desktop-only'; button.textContent='Customize'; actions.insertBefore(button, actions.firstChild);
    }
  }

  function populateForm(owner = currentUser()) {
    const p = prefs(owner);
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.value = value; };
    const check = (id, value) => { const el = document.getElementById(id); if (el) el.checked = Boolean(value); };
    set('uxProfile', owner); set('uxTheme',p.theme); set('uxDensity',p.density); set('uxTextScale',p.textScale); set('uxMotion',p.motion); set('uxDefaultView',p.defaultView); set('uxLayout',p.inventoryLayout); set('uxOwnerScope',p.ownerScope); set('uxSort',p.defaultSort); set('uxLifecycle',p.defaultLifecycle); set('uxLabelSize',p.labelSize); set('uxWorkspaceName',p.workspaceName);
    check('uxTargets',p.largerTargets); check('uxRememberFilters',p.rememberFilters); check('uxHero',p.dashboardHero); check('uxPriority',p.dashboardPriority); check('uxCharts',p.dashboardCharts);
    document.querySelectorAll('[data-accent]').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.accent === p.accent)));
  }

  function saveFromForm() {
    if (applying) return;
    const owner = document.getElementById('uxProfile')?.value || currentUser();
    const value = id => document.getElementById(id)?.value;
    const checked = id => Boolean(document.getElementById(id)?.checked);
    updatePrefs({theme:value('uxTheme'),density:value('uxDensity'),textScale:value('uxTextScale'),motion:value('uxMotion'),defaultView:value('uxDefaultView'),inventoryLayout:value('uxLayout'),ownerScope:value('uxOwnerScope'),defaultSort:value('uxSort'),defaultLifecycle:value('uxLifecycle'),labelSize:value('uxLabelSize'),workspaceName:String(value('uxWorkspaceName') || '').trim() || 'Filament Inventory',largerTargets:checked('uxTargets'),rememberFilters:checked('uxRememberFilters'),dashboardHero:checked('uxHero'),dashboardPriority:checked('uxPriority'),dashboardCharts:checked('uxCharts')}, owner);
    if (owner === currentUser()) applyRuntimeDefaults(prefs(owner));
  }

  function resolvedOwnerScope(p) { return p.ownerScope === 'current' ? currentUser() : p.ownerScope === 'all' ? '' : p.ownerScope; }

  function applyRuntimeDefaults(p = prefs()) {
    const ownerFilter = document.getElementById('ownerFilterV8');
    const sort = document.getElementById('sortSelect');
    const lifecycle = document.getElementById('lifecycleFilter');
    if (!p.rememberFilters || !p.filters) {
      if (ownerFilter) { ownerFilter.value = resolvedOwnerScope(p); ownerFilter.dispatchEvent(new Event('change',{bubbles:true})); }
      if (sort && [...sort.options].some(o => o.value === p.defaultSort)) { sort.value=p.defaultSort; sort.dispatchEvent(new Event('change',{bubbles:true})); }
      if (lifecycle && [...lifecycle.options].some(o => o.value === p.defaultLifecycle)) { lifecycle.value=p.defaultLifecycle; lifecycle.dispatchEvent(new Event('change',{bubbles:true})); }
    } else restoreFilters(p.filters);
    const labelSize = document.getElementById('labelSize');
    if (labelSize && [...labelSize.options].some(o => o.value === p.labelSize)) { labelSize.value=p.labelSize; labelSize.dispatchEvent(new Event('change',{bubbles:true})); }
  }

  function captureFilters() {
    if (applying) return;
    const p = prefs();
    if (!p.rememberFilters) return;
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => {
      const filters = {};
      ['searchInput','materialFilter','statusFilter','locationFilter','lifecycleFilter','sortSelect','ownerFilterV8'].forEach(id => { const el=document.getElementById(id); if(el) filters[id]=el.value; });
      updatePrefs({filters});
    }, 220);
  }

  function restoreFilters(filters) {
    applying = true;
    Object.entries(filters || {}).forEach(([id,value]) => { const el=document.getElementById(id); if(el && (!('options' in el) || [...el.options].some(o => o.value === value))) el.value=value; });
    ['lifecycleFilter','materialFilter','statusFilter','locationFilter','sortSelect','ownerFilterV8'].forEach(id => document.getElementById(id)?.dispatchEvent(new Event('change',{bubbles:true})));
    document.getElementById('searchInput')?.dispatchEvent(new Event('input',{bubbles:true}));
    applying = false;
  }

  function openPreferences() { document.querySelector('.tab[data-view="preferences"]')?.click(); }

  function maybeOpenDefault() {
    const url = new URL(location.href);
    const hash = new URLSearchParams(location.hash.slice(1).replace(/^\?/,''));
    if (url.searchParams.get('spool') || url.searchParams.get('scan') || hash.get('spool') || hash.get('view')) return;
    const view = prefs().defaultView;
    if (VALID_VIEWS.includes(view)) document.querySelector(`.tab[data-view="${view}"]`)?.click();
  }

  function download(name, content) {
    const blob = new Blob([content],{type:'application/json'}), url=URL.createObjectURL(blob), a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function exportPrefs() { download(`filament-ux-preferences-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(readStore(),null,2)); }

  async function importPrefs(file) {
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed?.profiles) throw new Error('Preferences file does not contain profiles.');
      const store = readStore();
      for (const owner of OWNERS) if (parsed.profiles[owner]) store.profiles[owner] = {...defaults(), ...parsed.profiles[owner]};
      writeStore(store); applyPreferences(prefs()); populateForm(); applyRuntimeDefaults(prefs()); alert('Preferences imported.');
    } catch (error) { alert(`Preferences import failed: ${error.message}`); }
  }

  function bind() {
    document.getElementById('uxTopBtn')?.addEventListener('click', openPreferences);
    document.getElementById('uxProfile')?.addEventListener('change', e => populateForm(e.target.value));
    ['uxTheme','uxDensity','uxTextScale','uxMotion','uxDefaultView','uxLayout','uxOwnerScope','uxSort','uxLifecycle','uxLabelSize','uxWorkspaceName'].forEach(id => document.getElementById(id)?.addEventListener(id === 'uxWorkspaceName' ? 'input' : 'change', saveFromForm));
    ['uxTargets','uxRememberFilters','uxHero','uxPriority','uxCharts'].forEach(id => document.getElementById(id)?.addEventListener('change', saveFromForm));
    document.getElementById('uxAccentRow')?.addEventListener('click', e => { const btn=e.target.closest('[data-accent]'); if(!btn)return; const owner=document.getElementById('uxProfile')?.value||currentUser(); updatePrefs({accent:btn.dataset.accent},owner); });
    document.getElementById('uxCopyOther')?.addEventListener('click', () => { const owner=document.getElementById('uxProfile')?.value||currentUser(), other=owner==='Bill'?'Aimee':'Bill'; if(!confirm(`Replace ${owner}'s experience preferences with ${other}'s?`))return; const store=readStore(); store.profiles[owner]={...store.profiles[other]}; writeStore(store); populateForm(owner); if(owner===currentUser()) applyPreferences(store.profiles[owner]); });
    document.getElementById('uxReset')?.addEventListener('click', () => { const owner=document.getElementById('uxProfile')?.value||currentUser(); if(!confirm(`Reset ${owner}'s experience preferences on this browser?`))return; const store=readStore(); store.profiles[owner]=defaults(); writeStore(store); populateForm(owner); if(owner===currentUser()){applyPreferences(store.profiles[owner]);applyRuntimeDefaults(store.profiles[owner]);} });
    document.getElementById('uxExport')?.addEventListener('click', exportPrefs);
    document.getElementById('uxImport')?.addEventListener('click', () => document.getElementById('uxImportFile')?.click());
    document.getElementById('uxImportFile')?.addEventListener('change', e => { const file=e.target.files?.[0]; if(file) importPrefs(file); e.target.value=''; });

    ['searchInput','materialFilter','statusFilter','locationFilter','lifecycleFilter','sortSelect','ownerFilterV8'].forEach(id => { const el=document.getElementById(id); if(el) el.addEventListener(id==='searchInput'?'input':'change', captureFilters); });
    document.getElementById('currentUserV8')?.addEventListener('change', () => setTimeout(() => { applyPreferences(prefs()); populateForm(); applyRuntimeDefaults(prefs()); }, 0));
    matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => { if(prefs().theme === 'system') applyPreferences(prefs()); });
    window.addEventListener('hashchange', () => { const hash=new URLSearchParams(location.hash.slice(1)); if(hash.get('view')==='preferences') openPreferences(); });
  }

  function init() {
    injectStyles(); injectView(); applyPreferences(prefs()); populateForm(); bind();
    setTimeout(() => { applyRuntimeDefaults(prefs()); maybeOpenDefault(); if(new URLSearchParams(location.hash.slice(1)).get('view')==='preferences') openPreferences(); }, 220);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true}); else init();
})();