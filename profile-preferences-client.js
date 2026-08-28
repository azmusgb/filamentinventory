(() => {
  'use strict';

  const core=globalThis.FilamentInventoryProfilePreferences;
  if(!core) return;
  const users=globalThis.FilamentInventoryUsers;
  const $=id=>document.getElementById(id);
  const owner=()=>users?.currentUser?.()||'Bill';
  const normalizeOwner=value=>users?.OWNERS?.includes(String(value))?String(value):owner();
  const storageKey=(forOwner=owner())=>`${users?.USER_PREFIX||'filament-user-v1'}:${normalizeOwner(forOwner).toLowerCase()}:preferences`;
  const readFor=(forOwner=owner())=>{const target=normalizeOwner(forOwner);try{return core.normalize(JSON.parse(localStorage.getItem(storageKey(target))||'{}'),target);}catch{return core.defaults(target);}};
  const read=()=>readFor(owner());
  const write=value=>{const normalized=core.normalize(value,owner());localStorage.setItem(storageKey(),JSON.stringify(normalized));return normalized;};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let applying=false;
  let resetSnapshot=null;
  let saveTimer=0;

  function navigate(view){
    if(globalThis.FilamentInventoryNavigation?.navigate?.(view,{historyMode:'push',focus:true})) return;
    document.querySelector(`.tab[data-view="${CSS.escape(view)}"]`)?.click();
  }

  function openPreferences(){navigate('preferences');}

  function ensureSurface(){
    let tab=document.querySelector('.tab[data-view="preferences"]');
    if(!tab){
      tab=document.createElement('button');tab.type='button';tab.className='tab';tab.dataset.view='preferences';tab.hidden=true;tab.setAttribute('aria-selected','false');tab.textContent='Preferences';document.querySelector('.tabs')?.appendChild(tab);
    }
    let view=$('preferencesView');
    if(!view){
      view=document.createElement('section');view.id='preferencesView';view.className='view profile-preferences-view';view.dataset.pageWidth='standard';document.querySelector('.app-shell > main')?.appendChild(view);
    }
    globalThis.FilamentInventoryNavigation?.register?.('preferences');
    return view;
  }

  function optionLabel(value){return value.charAt(0).toUpperCase()+value.slice(1);}

  function render(){
    const view=ensureSurface();
    if(!view) return;
    const p=read();
    view.innerHTML=`<div class="profile-preferences-grid">
      <section class="panel profile-identity-card">
        <div class="profile-identity-preview"><span class="profile-avatar profile-avatar-lg" aria-hidden="true">${esc(p.identity.initials)}</span><div><span class="eyebrow">Private profile</span><h3>${esc(p.identity.displayName)}</h3><p>${esc(owner())}'s isolated filament workspace</p></div></div>
        <p class="muted">Display preferences are local to this profile. Inventory, activity, backups and cloud sync remain isolated.</p>
      </section>
      <form class="panel profile-preferences-form" id="profilePreferencesForm">
        <section class="profile-settings-section"><div class="profile-settings-head"><div><h3>Identity</h3><p>How this workspace appears in the app.</p></div></div><div class="form-grid"><div class="form-field"><label for="profileDisplayName">Display name</label><input class="field" id="profileDisplayName" maxlength="48" value="${esc(p.identity.displayName)}"></div><div class="form-field"><label for="profileInitials">Initials</label><input class="field" id="profileInitials" maxlength="3" value="${esc(p.identity.initials)}"></div></div></section>
        <section class="profile-settings-section"><div class="profile-settings-head"><div><h3>Appearance</h3><p>Theme, accent and density preview immediately and save automatically.</p></div></div><div class="form-grid"><div class="form-field"><label for="profileTheme">Theme</label><select class="select" id="profileTheme"><option value="system">Follow system</option><option value="dark">Dark</option><option value="light">Light</option></select></div><div class="form-field"><label for="profileAccent">Accent</label><select class="select" id="profileAccent">${core.ACCENTS.map(value=>`<option value="${value}">${optionLabel(value)}</option>`).join('')}</select></div><div class="form-field"><label for="profileDensity">Density</label><select class="select" id="profileDensity"><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></div></div></section>
        <section class="profile-settings-section"><div class="profile-settings-head"><div><h3>Workspace</h3><p>Choose where this profile starts and how much Home shows.</p></div></div><div class="form-grid"><div class="form-field"><label for="profileStartView">Start on</label><select class="select" id="profileStartView"><option value="dashboard">Home</option><option value="inventory">Inventory</option><option value="household">Printer</option></select></div><div class="form-field"><label for="profileDashboardDetail">Home detail</label><select class="select" id="profileDashboardDetail"><option value="focused">Focused</option><option value="balanced">Balanced</option></select></div></div></section>
        <section class="profile-settings-section"><div class="profile-settings-head"><div><h3>Printing defaults</h3><p>Defaults used by print checks and newly added spools.</p></div></div><div class="form-grid"><div class="form-field"><label for="profileSafetyMargin">Print safety margin (%)</label><input class="field" id="profileSafetyMargin" type="number" min="0" max="100" step="1" value="${p.printing.safetyMargin}"></div><div class="form-field"><label for="profileReorder">Default reorder threshold (g)</label><input class="field" id="profileReorder" type="number" min="0" max="5000" step="10" value="${p.printing.defaultReorderGrams}"></div><div class="form-field"><label for="profileStartWeight">Default spool weight (g)</label><input class="field" id="profileStartWeight" type="number" min="1" max="10000" step="50" value="${p.printing.defaultStartWeight}"></div></div></section>
        <div class="profile-settings-actions"><button class="btn" type="button" data-profile-reset>Reset defaults</button><div class="profile-save-cluster"><span class="profile-save-status" data-profile-save-status role="status" aria-live="polite" data-state="saved">Saved automatically</span><button class="btn btn-primary" type="submit">Save now</button></div></div>
      </form>
    </div>`;
    $('profileTheme').value=p.appearance.theme;
    $('profileAccent').value=p.appearance.accent;
    $('profileDensity').value=p.appearance.density;
    $('profileStartView').value=p.workspace.startView;
    $('profileDashboardDetail').value=p.workspace.dashboardDetail;
    const form=$('profilePreferencesForm');
    form?.addEventListener('submit',saveNow);
    form?.addEventListener('input',scheduleSave);
    form?.addEventListener('change',scheduleSave);
    ['profileTheme','profileAccent','profileDensity'].forEach(id=>$(id)?.addEventListener('change',previewAppearance));
    view.querySelector('[data-profile-reset]')?.addEventListener('click',resetDefaults);
  }

  function formValue(){
    return {
      identity:{displayName:$('profileDisplayName')?.value,initials:$('profileInitials')?.value},
      appearance:{theme:$('profileTheme')?.value,accent:$('profileAccent')?.value,density:$('profileDensity')?.value},
      workspace:{startView:$('profileStartView')?.value,dashboardDetail:$('profileDashboardDetail')?.value},
      printing:{safetyMargin:$('profileSafetyMargin')?.value,defaultReorderGrams:$('profileReorder')?.value,defaultStartWeight:$('profileStartWeight')?.value},
    };
  }

  function setSaveStatus(text,state='saved'){
    const node=document.querySelector('[data-profile-save-status]');
    if(!node) return;
    node.textContent=text;
    node.dataset.state=state;
  }

  function updateIdentityPreview(p){
    const view=$('preferencesView');
    if(!view) return;
    const avatar=view.querySelector('.profile-identity-preview .profile-avatar-lg');
    const title=view.querySelector('.profile-identity-preview h3');
    if(avatar) avatar.textContent=p.identity.initials;
    if(title) title.textContent=p.identity.displayName;
  }

  function emitChanged(){
    const detail={owner:owner()};
    globalThis.FilamentInventoryEvents?.emit?.('profile:preferences-changed',detail);
    document.dispatchEvent(new CustomEvent('fi:profile-updated',{detail}));
  }

  function previewAppearance(){
    const current=read();
    const draft=formValue();
    const preview=core.merge(current,{appearance:draft.appearance},owner());
    apply(preview,{persist:false});
  }

  function persistForm({announce=false}={}){
    if(!$('profilePreferencesForm')) return null;
    if(saveTimer){clearTimeout(saveTimer);saveTimer=0;}
    const next=write(formValue());
    apply(next,{persist:false});
    updateIdentityPreview(next);
    emitChanged();
    setSaveStatus('Saved automatically','saved');
    if(announce) toast('Preferences saved.');
    return next;
  }

  function scheduleSave(){
    if(!$('profilePreferencesForm')) return;
    if(saveTimer) clearTimeout(saveTimer);
    setSaveStatus('Saving…','saving');
    saveTimer=setTimeout(()=>{saveTimer=0;persistForm();},450);
  }

  function flushPendingSave(){
    if(!saveTimer) return;
    clearTimeout(saveTimer);saveTimer=0;persistForm();
  }

  function saveNow(event){
    event?.preventDefault();
    persistForm({announce:true});
  }

  function toast(message,undo){
    const node=$('toast');
    if(!node) return;
    node.replaceChildren();
    const text=document.createElement('span');text.textContent=message;node.appendChild(text);
    if(undo){const button=document.createElement('button');button.className='toast-action';button.type='button';button.textContent='Undo';button.addEventListener('click',()=>{undo();node.classList.remove('show');},{once:true});node.appendChild(button);}
    node.classList.add('show');setTimeout(()=>node.classList.remove('show'),undo?6000:2600);
  }

  function resetDefaults(){
    if(saveTimer){clearTimeout(saveTimer);saveTimer=0;}
    resetSnapshot=read();
    const next=write(core.defaults(owner()));
    apply(next,{persist:false});
    render();
    emitChanged();
    toast('Profile defaults restored.',()=>{
      if(!resetSnapshot) return;
      const restored=write(resetSnapshot);apply(restored,{persist:false});render();emitChanged();resetSnapshot=null;
    });
  }

  function effectiveTheme(preference){
    return core.effectiveTheme(preference,matchMedia('(prefers-color-scheme: light)').matches);
  }

  function apply(value=read(),{persist=false}={}){
    if(applying) return;
    applying=true;
    const p=core.normalize(value,owner());
    if(persist) write(p);
    const root=document.documentElement;
    const theme=effectiveTheme(p.appearance.theme);
    if(theme==='light') root.dataset.theme='light'; else root.removeAttribute('data-theme');
    root.dataset.profileDensity=p.appearance.density;
    root.dataset.profileDashboard=p.workspace.dashboardDetail;
    const pair=core.accentPair(p.appearance.accent,theme);
    root.style.setProperty('--color-accent',pair[0]);
    root.style.setProperty('--color-accent-secondary',pair[1]);
    document.body?.setAttribute('data-profile-accent',p.appearance.accent);
    const themeMeta=document.querySelector('meta[name="theme-color"]');
    themeMeta?.setAttribute('content',theme==='light'?'#fafaf8':'#0d0f14');
    const margin=$('printMargin');
    if(margin && !margin.dataset.profileDefaultApplied){margin.value=String(p.printing.safetyMargin);margin.dataset.profileDefaultApplied='1';}
    const reorder=$('reorderThreshold');
    const start=$('startWeight');
    const adding=$('dialogTitle')?.textContent?.toLowerCase().includes('add');
    if(adding&&reorder&&['250',''].includes(String(reorder.value))) reorder.value=String(p.printing.defaultReorderGrams);
    if(adding&&start&&['1000',''].includes(String(start.value))) start.value=String(p.printing.defaultStartWeight);
    applying=false;
  }

  function applyStartView(){
    const p=read();
    if(new URLSearchParams(location.hash.replace(/^#/,'' )).get('view')) return;
    if(p.workspace.startView==='dashboard') return;
    setTimeout(()=>navigate(p.workspace.startView),100);
  }

  function bindPersistenceGuards(){
    document.addEventListener('fi:navigation',flushPendingSave);
    window.addEventListener('pagehide',flushPendingSave);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)flushPendingSave();});
  }

  function init(){
    ensureSurface();
    render();
    apply();
    applyStartView();
    bindPersistenceGuards();
    matchMedia('(prefers-color-scheme: light)').addEventListener?.('change',()=>{if(read().appearance.theme==='system')apply();});
    emitChanged();
  }

  globalThis.FilamentInventoryProfileUI=Object.freeze({read,readFor,write,apply,render,open:openPreferences,flush:flushPendingSave});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();