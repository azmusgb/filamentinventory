(() => {
  'use strict';
  const PRIMARY = [['dashboard','Home'],['inventory','Inventory'],['household','Printer']];
  const SECONDARY = [['history','Activity'],['labels','Labels'],['data','Backup & data'],['preferences','Preferences']];
  const WIDTHS = {dashboard:'standard',inventory:'workbench',household:'workbench',weigh:'focus',history:'standard',labels:'standard',data:'standard',preferences:'standard'};
  const TITLES = {dashboard:['Home','What needs attention and what is loaded now.'],inventory:['Inventory','Find, filter and manage spools.'],household:['Printer','Physical printer and AMS state.'],weigh:['Weigh spool','Record an authoritative remaining amount.'],history:['Activity','Recent inventory and measurement changes.'],labels:['QR labels','Identify physical spools.'],data:['Backup & data','Protect and transfer this private inventory.'],preferences:['Preferences','Personalize this private workspace.']};
  const $ = id => document.getElementById(id);
  const switchView = view => document.querySelector(`.tab[data-view="${CSS.escape(view)}"]`)?.click();
  const scriptLoads = new Map();
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
  function ensureSidebar() {
    const shell=document.querySelector('.app-shell'); if(!shell || $('.fiDesktopSidebar')) return;
    const aside=document.createElement('aside'); aside.id='fiDesktopSidebar'; aside.className='fi-desktop-sidebar'; aside.setAttribute('aria-label','Application navigation');
    const buttons = items => items.map(([view,label])=>`<button type="button" data-shell-view="${view}">${label}</button>`).join('');
    aside.innerHTML=`<nav class="fi-secondary-nav">${buttons(PRIMARY)}</nav><div class="fi-sidebar-group-label">Tools</div><nav class="fi-secondary-nav">${buttons(SECONDARY)}</nav><div class="fi-sidebar-spacer"></div><div class="fi-sidebar-group-label">Workflow</div><nav class="fi-secondary-nav"><button type="button" data-shell-action="print-readiness">Can I print this?</button><button type="button" data-shell-action="scan">Scan spool</button><button type="button" data-shell-action="add">Add spool</button></nav>`;
    shell.insertBefore(aside,shell.querySelector('main'));
    aside.addEventListener('click',async event=>{ const view=event.target.closest('[data-shell-view]'); if(view) return switchView(view.dataset.shellView); const action=event.target.closest('[data-shell-action]')?.dataset.shellAction; if(action==='add') ($('addTopBtn')||$('inventoryAddBtn')||$('heroAddBtn'))?.click(); if(action==='scan') document.querySelector('.scan-launch')?.click(); if(action==='print-readiness' && await ensurePrintReadiness()) globalThis.FilamentInventoryPrintReadinessUI.open(); });
  }
  function ensurePageHeaders() {
    document.querySelectorAll('.view[id$="View"]').forEach(view=>{
      const key=view.id.replace(/View$/,''); const meta=TITLES[key]; if(!meta || view.querySelector(':scope > .fi-page-header')) return;
      const header=document.createElement('header'); header.className='fi-page-header'; header.innerHTML=`<div class="fi-page-header-copy"><h2>${meta[0]}</h2><p>${meta[1]}</p></div>`; view.prepend(header);
    });
  }
  function simplifyLegacyNav() {
    document.querySelectorAll('.tabs .tab').forEach(tab=>{ const view=tab.dataset.view; tab.hidden=!PRIMARY.some(([key])=>key===view); if(view==='dashboard') tab.textContent='Home'; if(view==='household') tab.textContent='Printer'; });
    const add=$('mobileAddBtn'); if(add){ add.setAttribute('aria-label','Scan or add spool'); }
  }
  function sync() {
    const active=activeView(); document.querySelectorAll('[data-shell-view]').forEach(button=>button.setAttribute('aria-current',button.dataset.shellView===active?'page':'false'));
  }
  function enhanceBottomNav() {
    const nav=$('mobileBottomNav'); if(!nav) return;
    const add=nav.querySelector('[data-bottom-add]'); if(add && add.dataset.shellScan!=='1') { add.dataset.shellScan='1'; add.innerHTML='<span aria-hidden="true">⌁</span><small>Scan</small>'; add.removeAttribute('data-bottom-add'); add.setAttribute('data-bottom-scan',''); add.addEventListener('click',()=>document.querySelector('.scan-launch')?.click()); }
  }
  function init(){ document.documentElement.classList.add('fi-app-frame'); ensureWidths(); ensureSidebar(); ensurePageHeaders(); simplifyLegacyNav(); enhanceBottomNav(); sync(); ensurePrintReadiness(); document.addEventListener('click',e=>{ if(e.target.closest('.tab[data-view]')) setTimeout(sync,0); }); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0),{once:true}); else setTimeout(init,0);
})();
