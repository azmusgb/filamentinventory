(() => {
  'use strict';
  const PRIMARY = [['dashboard','Home'],['inventory','Inventory'],['household','Printer']];
  const MANAGE = [['history','Activity'],['labels','Labels'],['data','Backup & data']];
  const SETTINGS = [['preferences','Preferences']];
  const WIDTHS = {dashboard:'standard',inventory:'workbench',household:'workbench',weigh:'focus',history:'standard',labels:'standard',data:'standard',preferences:'standard'};
  const TITLES = {dashboard:['Home','What needs attention, what is loaded, and what can print now.'],inventory:['Inventory','Find, filter and manage spools.'],household:['Printer','Physical printer and AMS state.'],weigh:['Weigh spool','Record an authoritative remaining amount.'],history:['Activity','Inventory, measurements and Printer / AMS changes.'],labels:['QR labels','Identify physical spools.'],data:['Backup & data','Protect and transfer this private inventory.'],preferences:['Preferences','Personalize this private workspace.']};
  const ICONS = {dashboard:'⌂',inventory:'▦',household:'◉',history:'↺',labels:'◇',data:'⇩',preferences:'⚙'};
  const PAGE_ACTIONS = {inventory:['inventoryAddBtn'],history:['exportHistoryBtn'],data:['installBtn']};
  const $ = id => document.getElementById(id);
  const switchView = view => document.querySelector(`.tab[data-view="${CSS.escape(view)}"]`)?.click();
  const scriptLoads = new Map();
  let enhancementScheduled = false;

  const loadScript = src => {
    if (scriptLoads.has(src)) return scriptLoads.get(src);
    const promise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-fi-dynamic="${src}"]`);
      if (existing?.dataset.fiLoaded === '1') { resolve(); return; }
      if (existing) {
        existing.addEventListener('load', resolve, {once:true});
        existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), {once:true});
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
      script.dataset.fiDynamic = src;
      script.onload = () => { script.dataset.fiLoaded = '1'; resolve(); };
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
    scriptLoads.set(src, promise);
    return promise;
  };

  async function ensurePrintReadiness() {
    try {
      if (!globalThis.FilamentInventoryPrintReadiness) await loadScript('/print-readiness-core.js');
      if (!globalThis.FilamentInventoryPrintReadinessUI) await loadScript('/print-readiness-client.js');
      return Boolean(globalThis.FilamentInventoryPrintReadinessUI);
    } catch (error) {
      console.error('Print readiness failed to initialize.', error);
      return false;
    }
  }

  function activeView() { return document.querySelector('.tab[aria-selected="true"]')?.dataset.view || 'dashboard'; }
  function ensureWidths() { document.querySelectorAll('.view[id$="View"]').forEach(view => { const key=view.id.replace(/View$/,''); view.dataset.pageWidth=WIDTHS[key] || 'standard'; }); }
  const navButtons = items => items.map(([view,label])=>`<button type="button" data-shell-view="${view}"><span class="fi-nav-icon" aria-hidden="true">${ICONS[view] || '•'}</span><span>${label}</span></button>`).join('');

  function ensureSidebar() {
    const shell=document.querySelector('.app-shell'); if(!shell || $('.fiDesktopSidebar')) return;
    const aside=document.createElement('aside'); aside.id='fiDesktopSidebar'; aside.className='fi-desktop-sidebar'; aside.setAttribute('aria-label','Application navigation');
    aside.innerHTML=`<div class="fi-sidebar-group-label">Workspace</div><nav class="fi-secondary-nav">${navButtons(PRIMARY)}</nav><div class="fi-sidebar-group-label">Manage</div><nav class="fi-secondary-nav">${navButtons(MANAGE)}</nav><div class="fi-sidebar-group-label">Settings</div><nav class="fi-secondary-nav">${navButtons(SETTINGS)}</nav><div class="fi-sidebar-spacer"></div><div class="fi-sidebar-group-label">Quick actions</div><nav class="fi-secondary-nav fi-quick-actions"><button type="button" data-shell-action="print-readiness"><span class="fi-nav-icon" aria-hidden="true">✓</span><span>Can I print this?</span></button><button type="button" data-shell-action="scan"><span class="fi-nav-icon" aria-hidden="true">⌁</span><span>Scan spool</span></button><button type="button" data-shell-action="add"><span class="fi-nav-icon" aria-hidden="true">＋</span><span>Add spool</span></button></nav>`;
    shell.insertBefore(aside,shell.querySelector('main'));
    aside.addEventListener('click',async event=>{ const view=event.target.closest('[data-shell-view]'); if(view) return switchView(view.dataset.shellView); const action=event.target.closest('[data-shell-action]')?.dataset.shellAction; if(action==='add') ($('inventoryAddBtn')||$('addTopBtn')||$('heroAddBtn'))?.click(); if(action==='scan') document.querySelector('.scan-launch')?.click(); if(action==='print-readiness' && await ensurePrintReadiness()) globalThis.FilamentInventoryPrintReadinessUI.open(); });
  }

  function ensurePageHeaders() {
    document.querySelectorAll('.view[id$="View"]').forEach(view=>{
      const key=view.id.replace(/View$/,''); const meta=TITLES[key]; if(!meta || view.querySelector(':scope > .fi-page-header')) return;
      const header=document.createElement('header'); header.className='fi-page-header'; header.innerHTML=`<div class="fi-page-header-copy"><h2>${meta[0]}</h2><p>${meta[1]}</p></div><div class="fi-page-header-actions" aria-label="Page actions"></div>`; view.prepend(header);
    });
  }

  function adoptPageActions() {
    for (const [viewKey, ids] of Object.entries(PAGE_ACTIONS)) {
      const actions=document.querySelector(`#${CSS.escape(viewKey)}View > .fi-page-header .fi-page-header-actions`); if(!actions) continue;
      ids.forEach(id=>{ const button=$(id); if(button && !actions.contains(button)){ button.classList.add('fi-page-action'); actions.appendChild(button); } });
    }
  }

  function suppressLegacyPageHeads() {
    ['inventoryTitle','historyTitle','dataTitle'].forEach(id=>{
      const title=$(id); const head=title?.closest('.panel-head'); const view=title?.closest('.view');
      if(head && view?.querySelector(':scope > .fi-page-header')) head.classList.add('fi-legacy-page-head');
    });
  }

  function compactHome() {
    const view=$('dashboardView'); if(!view || view.dataset.shellHomeCompact==='1') return;
    view.dataset.shellHomeCompact='1'; view.classList.add('fi-home-compact');
    const hero=view.querySelector('.hero-copy');
    const eyebrow=hero?.querySelector('.eyebrow'); const title=$('dashboardTitle'); const lead=hero?.querySelector('.lead');
    if(eyebrow) eyebrow.textContent='Print workflow';
    if(title) title.textContent='Start with the print. Choose the right spool.';
    if(lead) lead.textContent='Check material, color and required grams against what is actually available and loaded.';
    const add=$('heroAddBtn'); if(add){ add.classList.remove('btn-primary'); add.textContent='Add spool'; }
    const weigh=hero?.querySelector('[data-jump="weigh"]'); if(weigh) weigh.textContent='Weigh spool';
  }

  function quietTopbar() {
    const copy=document.querySelector('.brand p'); if(!copy || copy.dataset.shellQuiet==='1') return;
    copy.dataset.shellQuiet='1';
    const version=copy.querySelector('[data-app-version]')?.textContent?.trim();
    copy.textContent='Private filament workspace';
    if(version){ copy.append(' · '); const span=document.createElement('span'); span.dataset.appVersion=''; span.textContent=version; copy.appendChild(span); }
  }

  function harmonizeActivitySwitcher() {
    const switcher=$('activitySwitcherV10'); const actions=document.querySelector('#historyView > .fi-page-header .fi-page-header-actions');
    if(!switcher || !actions || actions.contains(switcher)) return;
    const copy=switcher.firstElementChild; if(copy && !copy.classList.contains('activity-segments')) copy.remove();
    switcher.classList.add('fi-activity-header-switcher'); actions.appendChild(switcher);
  }

  function simplifyLegacyNav() {
    const tabs=document.querySelector('.tabs'); if(tabs) tabs.setAttribute('aria-hidden','true');
    document.querySelectorAll('.tabs .tab').forEach(tab=>{ if(tab.dataset.view==='dashboard') tab.textContent='Home'; if(tab.dataset.view==='household') tab.textContent='Printer'; });
    const add=$('mobileAddBtn'); if(add){ add.setAttribute('aria-label','Scan spool'); }
  }

  function sync() {
    const active=activeView(); document.querySelectorAll('[data-shell-view]').forEach(button=>button.setAttribute('aria-current',button.dataset.shellView===active?'page':'false'));
  }

  function enhanceBottomNav() {
    const nav=$('mobileBottomNav'); if(!nav) return;
    const inventory=nav.querySelector('[data-bottom-view="inventory"] small'); if(inventory) inventory.textContent='Inventory';
    const add=nav.querySelector('[data-bottom-add]'); if(add && add.dataset.shellScan!=='1') { add.dataset.shellScan='1'; add.innerHTML='<span aria-hidden="true">⌁</span><small>Scan</small>'; add.removeAttribute('data-bottom-add'); add.setAttribute('data-bottom-scan',''); add.addEventListener('click',()=>document.querySelector('.scan-launch')?.click()); }
  }

  function harmonize() {
    adoptPageActions(); suppressLegacyPageHeads(); compactHome(); quietTopbar(); harmonizeActivitySwitcher(); enhanceBottomNav(); sync();
  }

  function scheduleHarmonize() {
    if(enhancementScheduled) return; enhancementScheduled=true;
    requestAnimationFrame(()=>{ enhancementScheduled=false; harmonize(); });
  }

  function init(){
    document.documentElement.classList.add('fi-app-frame'); ensureWidths(); ensureSidebar(); ensurePageHeaders(); simplifyLegacyNav(); harmonize(); ensurePrintReadiness();
    document.addEventListener('click',e=>{ if(e.target.closest('.tab[data-view]')) setTimeout(sync,0); });
    new MutationObserver(scheduleHarmonize).observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0),{once:true}); else setTimeout(init,0);
})();
