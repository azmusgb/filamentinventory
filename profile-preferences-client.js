(() => {
  'use strict';
  const core=globalThis.FilamentInventoryProfilePreferences;
  if(!core) return;
  const users=globalThis.FilamentInventoryUsers;
  const $=id=>document.getElementById(id);
  const owner=()=>users?.currentUser?.()||'Bill';
  const storageKey=()=>`${users?.USER_PREFIX||'filament-user-v1'}:${owner().toLowerCase()}:preferences`;
  const read=()=>{try{return core.normalize(JSON.parse(localStorage.getItem(storageKey())||'{}'),owner());}catch{return core.defaults(owner());}};
  const write=value=>{const normalized=core.normalize(value,owner());localStorage.setItem(storageKey(),JSON.stringify(normalized));return normalized;};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function ensureSurface(){
    let tab=document.querySelector('.tab[data-view="preferences"]');
    if(!tab){tab=document.createElement('button');tab.type='button';tab.className='tab';tab.dataset.view='preferences';tab.hidden=true;tab.setAttribute('aria-selected','false');tab.textContent='Preferences';document.querySelector('.tabs')?.appendChild(tab);}
    let view=$('preferencesView');
    if(view) return view;
    view=document.createElement('section');view.id='preferencesView';view.className='view profile-preferences-view';view.dataset.pageWidth='standard';
    document.querySelector('.app-shell > main')?.appendChild(view);
    return view;
  }

  function render(){
    const view=ensureSurface(); if(!view) return;
    const p=read();
    view.innerHTML=`<div class="profile-preferences-grid">
      <section class="panel profile-identity-card"><div class="profile-identity-preview"><span class="profile-avatar profile-avatar-lg" aria-hidden="true">${esc(p.identity.initials)}</span><div><span class="eyebrow">Profile</span><h3>${esc(p.identity.displayName)}</h3><p>${esc(owner())}'s private inventory workspace</p></div></div><p class="muted">Identity and preferences are private to this profile. Spools, history, backups and sync remain isolated.</p></section>
      <form class="panel profile-preferences-form" id="profilePreferencesForm">
        <section class="profile-settings-section"><div class="profile-settings-head"><div><h3>Identity</h3><p>How this workspace identifies you.</p></div></div><div class="form-grid"><div class="form-field"><label for="profileDisplayName">Display name</label><input class="field" id="profileDisplayName" maxlength="48" value="${esc(p.identity.displayName)}"></div><div class="form-field"><label for="profileInitials">Initials</label><input class="field" id="profileInitials" maxlength="3" value="${esc(p.identity.initials)}"></div></div></section>
        <section class="profile-settings-section"><div class="profile-settings-head"><div><h3>Appearance</h3><p>Customize this profile without changing the other workspace.</p></div></div><div class="form-grid"><div class="form-field"><label for="profileTheme">Theme</label><select class="select" id="profileTheme"><option value="system">System</option><option value="dark">Dark</option><option value="light">Light</option></select></div><div class="form-field"><label for="profileAccent">Accent</label><select class="select" id="profileAccent">${core.ACCENTS.map(x=>`<option value="${x}">${x[0].toUpperCase()+x.slice(1)}</option>`).join('')}</select></div><div class="form-field"><label for="profileDensity">Density</label><select class="select" id="profileDensity"><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></div></div></section>
        <section class="profile-settings-section"><div class="profile-settings-head"><div><h3>Workspace</h3><p>Choose what this profile emphasizes.</p></div></div><div class="form-grid"><div class="form-field"><label for="profileStartView">Start on</label><select class="select" id="profileStartView"><option value="dashboard">Home</option><option value="inventory">Inventory</option><option value="household">Printer</option></select></div><div class="form-field"><label for="profileDashboardDetail">Home detail</label><select class="select" id="profileDashboardDetail"><option value="focused">Focused</option><option value="balanced">Balanced</option></select></div></div></section>
        <section class="profile-settings-section"><div class="profile-settings-head"><div><h3>Printing defaults</h3><p>Defaults for decisions and newly added spools.</p></div></div><div class="form-grid"><div class="form-field"><label for="profileSafetyMargin">Print safety margin (%)</label><input class="field" id="profileSafetyMargin" type="number" min="0" max="100" step="1" value="${p.printing.safetyMargin}"></div><div class="form-field"><label for="profileReorder">Default reorder threshold (g)</label><input class="field" id="profileReorder" type="number" min="0" max="5000" step="10" value="${p.printing.defaultReorderGrams}"></div><div class="form-field"><label for="profileStartWeight">Default spool weight (g)</label><input class="field" id="profileStartWeight" type="number" min="1" max="10000" step="50" value="${p.printing.defaultStartWeight}"></div></div></section>
        <div class="profile-settings-actions"><button class="btn" type="button" data-profile-reset>Reset profile defaults</button><button class="btn btn-primary" type="submit">Save preferences</button></div>
      </form></div>`;
    $('profileTheme').value=p.appearance.theme;$('profileAccent').value=p.appearance.accent;$('profileDensity').value=p.appearance.density;$('profileStartView').value=p.workspace.startView;$('profileDashboardDetail').value=p.workspace.dashboardDetail;
    $('profilePreferencesForm').addEventListener('submit',save);
    view.querySelector('[data-profile-reset]')?.addEventListener('click',()=>{write(core.defaults(owner()));render();apply();});
  }

  function save(event){
    event.preventDefault();
    write({identity:{displayName:$('profileDisplayName').value,initials:$('profileInitials').value},appearance:{theme:$('profileTheme').value,accent:$('profileAccent').value,density:$('profileDensity').value},workspace:{startView:$('profileStartView').value,dashboardDetail:$('profileDashboardDetail').value},printing:{safetyMargin:$('profileSafetyMargin').value,defaultReorderGrams:$('profileReorder').value,defaultStartWeight:$('profileStartWeight').value}});
    apply();render();
    globalThis.FilamentInventoryEvents?.emit?.('profile:preferences-changed',{owner:owner()});
  }

  function apply(){
    const p=read(); const root=document.documentElement;
    root.dataset.profileDensity=p.appearance.density; root.dataset.profileDashboard=p.workspace.dashboardDetail;
    if(p.appearance.theme==='system') root.removeAttribute('data-theme'); else root.dataset.theme=p.appearance.theme;
    const accent=core.ACCENT_VALUES[p.appearance.accent]||core.ACCENT_VALUES.cyan;
    root.style.setProperty('--color-accent',accent[0]);root.style.setProperty('--color-accent-secondary',accent[1]);
    document.body?.setAttribute('data-profile-accent',p.appearance.accent);
    const chip=$('profileMenuButton'); if(chip){chip.querySelector('.profile-avatar')?.replaceChildren(p.identity.initials);const strong=chip.querySelector('.profile-chip-copy strong');if(strong)strong.textContent=p.identity.displayName;}
    const margin=$('printMargin'); if(margin && !margin.dataset.profileDefaultApplied){margin.value=String(p.printing.safetyMargin);margin.dataset.profileDefaultApplied='1';}
    const reorder=$('reorderThreshold'); const start=$('startWeight');
    if(reorder && $('dialogTitle')?.textContent?.toLowerCase().includes('add')) reorder.defaultValue=String(p.printing.defaultReorderGrams);
    if(start && $('dialogTitle')?.textContent?.toLowerCase().includes('add')) start.defaultValue=String(p.printing.defaultStartWeight);
  }

  function applyStartView(){
    const p=read(); if(location.hash.includes('view=')) return;
    const target=p.workspace.startView; if(target==='dashboard') return;
    setTimeout(()=>document.querySelector(`.tab[data-view="${CSS.escape(target)}"]`)?.click(),80);
  }

  function init(){
    ensureSurface();render();apply();applyStartView();
    new MutationObserver(()=>apply()).observe(document.body,{childList:true,subtree:true});
  }
  globalThis.FilamentInventoryProfileUI=Object.freeze({read,write,apply,render});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
