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
  let initialsManuallyEdited=false;

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
  function accentColor(value){return core.ACCENT_VALUES?.[value]?.dark?.[0]||'#49d3c4';}

  function appearanceSummary(p){
    const theme=p.appearance.theme==='system'?'System theme':`${optionLabel(p.appearance.theme)} theme`;
    return `${theme} · ${optionLabel(p.appearance.accent)} · ${optionLabel(p.appearance.density)}`;
  }

  function renderSummary(p){
    return `<aside class="profile-summary-card panel" aria-label="Current profile summary">
      <div class="profile-summary-identity">
        <span class="profile-avatar profile-avatar-xl" aria-hidden="true">${esc(p.identity.initials)}</span>
        <div><span class="eyebrow">Private profile</span><h3>${esc(p.identity.displayName)}</h3><p>${esc(owner())}'s isolated filament workspace</p></div>
      </div>
      <div class="profile-privacy-note"><span aria-hidden="true">◆</span><p><strong>Inventory stays separate.</strong><br>Spools, activity, backups and cloud sync never mix between profiles.</p></div>
      <div class="profile-summary-appearance"><span class="profile-accent-dot" style="--profile-accent-preview:${esc(accentColor(p.appearance.accent))}"></span><span data-profile-appearance-summary>${esc(appearanceSummary(p))}</span></div>
      <nav class="profile-section-nav" aria-label="Profile settings sections">
        <a href="#profileSectionIdentity">Profile</a>
        <a href="#profileSectionAppearance">Look & feel</a>
        <a href="#profileSectionWorkspace">Workspace</a>
        <a href="#profileSectionPrinting">Printing</a>
      </nav>
      <button class="btn profile-switch-cta" type="button" data-profile-menu>Switch profile</button>
    </aside>`;
  }

  function accentSwatches(selected){
    return `<div class="profile-accent-swatches" aria-label="Quick accent choices">${core.ACCENTS.map(value=>`<button type="button" class="profile-accent-swatch${value===selected?' is-selected':''}" data-profile-accent-choice="${esc(value)}" style="--swatch:${esc(accentColor(value))}" aria-label="Use ${esc(optionLabel(value))} accent" aria-pressed="${String(value===selected)}"><span></span></button>`).join('')}</div>`;
  }

  function render(){
    const view=ensureSurface();
    if(!view) return;
    const p=read();
    initialsManuallyEdited=false;
    view.innerHTML=`<div class="profile-experience-grid">
      ${renderSummary(p)}
      <form class="profile-settings-stack" id="profilePreferencesForm">
        <div class="profile-save-rail panel" aria-label="Profile save status">
          <div><strong>Customize this workspace</strong><span>Changes preview immediately and save automatically.</span></div>
          <div class="profile-save-cluster"><span class="profile-save-status" data-profile-save-status role="status" aria-live="polite" data-state="saved">Saved automatically</span><button class="btn" type="submit">Save now</button></div>
        </div>

        <section class="panel profile-settings-section" id="profileSectionIdentity">
          <div class="profile-settings-head"><div><span class="profile-section-index">01</span><h3>Profile identity</h3><p>Make this workspace instantly recognizable without changing who owns the underlying inventory.</p></div></div>
          <div class="profile-identity-editor">
            <div class="profile-avatar-editor"><span class="profile-avatar profile-avatar-xl" data-profile-draft-avatar aria-hidden="true">${esc(p.identity.initials)}</span><span>Your workspace badge</span></div>
            <div class="form-grid profile-identity-fields">
              <div class="form-field"><label for="profileDisplayName">Display name</label><input class="field" id="profileDisplayName" maxlength="48" autocomplete="off" value="${esc(p.identity.displayName)}"><small>Shown in the header and profile switcher.</small></div>
              <div class="form-field"><label for="profileInitials">Initials</label><div class="profile-inline-field"><input class="field" id="profileInitials" maxlength="3" autocomplete="off" value="${esc(p.identity.initials)}"><button class="btn" type="button" data-profile-auto-initials>Auto</button></div><small>Up to three letters.</small></div>
            </div>
          </div>
        </section>

        <section class="panel profile-settings-section" id="profileSectionAppearance">
          <div class="profile-settings-head"><div><span class="profile-section-index">02</span><h3>Look & feel</h3><p>Choose the visual treatment that makes this profile easy to identify at a glance.</p></div></div>
          <div class="profile-control-grid">
            <div class="profile-control-card"><div class="profile-control-copy"><span class="profile-control-icon" aria-hidden="true">◐</span><div><label for="profileTheme">Theme</label><p>Use your device setting or lock this profile to dark or light.</p></div></div><select class="select" id="profileTheme"><option value="system">Follow system</option><option value="dark">Dark</option><option value="light">Light</option></select></div>
            <div class="profile-control-card profile-accent-control"><div class="profile-control-copy"><span class="profile-control-icon" aria-hidden="true">●</span><div><label for="profileAccent">Accent</label><p>Color is the fastest way to distinguish one private workspace from another.</p></div></div><select class="select" id="profileAccent">${core.ACCENTS.map(value=>`<option value="${esc(value)}">${esc(optionLabel(value))}</option>`).join('')}</select>${accentSwatches(p.appearance.accent)}</div>
            <div class="profile-control-card"><div class="profile-control-copy"><span class="profile-control-icon" aria-hidden="true">≡</span><div><label for="profileDensity">Density</label><p>Comfortable is roomier; compact puts more inventory on screen.</p></div></div><select class="select" id="profileDensity"><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></div>
          </div>
        </section>

        <section class="panel profile-settings-section" id="profileSectionWorkspace">
          <div class="profile-settings-head"><div><span class="profile-section-index">03</span><h3>Workspace flow</h3><p>Control where this profile lands and how much Home surfaces by default.</p></div></div>
          <div class="profile-control-grid profile-control-grid-two">
            <div class="profile-control-card"><div class="profile-control-copy"><span class="profile-control-icon" aria-hidden="true">⌂</span><div><label for="profileStartView">Start on</label><p>Pick the first destination when this profile opens without a deep link.</p></div></div><select class="select" id="profileStartView"><option value="dashboard">Home</option><option value="inventory">Inventory</option><option value="household">Printer</option></select></div>
            <div class="profile-control-card"><div class="profile-control-copy"><span class="profile-control-icon" aria-hidden="true">▤</span><div><label for="profileDashboardDetail">Home detail</label><p>Focused shows only the highest-value signals; balanced includes secondary context.</p></div></div><select class="select" id="profileDashboardDetail"><option value="focused">Focused</option><option value="balanced">Balanced</option></select></div>
          </div>
        </section>

        <section class="panel profile-settings-section" id="profileSectionPrinting">
          <div class="profile-settings-head"><div><span class="profile-section-index">04</span><h3>Printing defaults</h3><p>These are starting values for print intelligence and new spools—not hidden inventory facts.</p></div></div>
          <div class="profile-number-grid">
            <label class="profile-number-card" for="profileSafetyMargin"><span>Safety margin</span><div><input class="field" id="profileSafetyMargin" type="number" min="0" max="100" step="1" value="${p.printing.safetyMargin}"><b>%</b></div><small>Extra filament required before a print is considered ready.</small></label>
            <label class="profile-number-card" for="profileReorder"><span>Reorder threshold</span><div><input class="field" id="profileReorder" type="number" min="0" max="5000" step="10" value="${p.printing.defaultReorderGrams}"><b>g</b></div><small>Default low-stock trigger for newly added spools.</small></label>
            <label class="profile-number-card" for="profileStartWeight"><span>Nominal spool weight</span><div><input class="field" id="profileStartWeight" type="number" min="1" max="10000" step="50" value="${p.printing.defaultStartWeight}"><b>g</b></div><small>Default full filament weight before any measured evidence exists.</small></label>
          </div>
        </section>

        <details class="panel profile-reset-panel"><summary><span><strong>Reset & recovery</strong><small>Restore this profile's preferences without touching inventory.</small></span><span aria-hidden="true">＋</span></summary><div class="profile-reset-body"><p>Resetting affects display, workspace and printing defaults only. Spools, measurements, activity and sync data stay intact.</p><button class="btn btn-danger" type="button" data-profile-reset>Reset profile defaults</button></div></details>
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
    $('profileDisplayName')?.addEventListener('input',previewIdentityDraft);
    $('profileInitials')?.addEventListener('input',()=>{initialsManuallyEdited=true;previewIdentityDraft();});
    view.querySelector('[data-profile-auto-initials]')?.addEventListener('click',autoInitials);
    view.querySelectorAll('[data-profile-accent-choice]').forEach(button=>button.addEventListener('click',()=>chooseAccent(button.dataset.profileAccentChoice)));
    view.querySelector('[data-profile-reset]')?.addEventListener('click',resetDefaults);
    enhanceProfileSwitcher();
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
    view.querySelectorAll('.profile-summary-card .profile-avatar-xl,[data-profile-draft-avatar]').forEach(node=>node.textContent=p.identity.initials);
    const title=view.querySelector('.profile-summary-identity h3');
    if(title) title.textContent=p.identity.displayName;
    const appearance=view.querySelector('[data-profile-appearance-summary]');
    if(appearance) appearance.textContent=appearanceSummary(p);
    const dot=view.querySelector('.profile-summary-appearance .profile-accent-dot');
    if(dot) dot.style.setProperty('--profile-accent-preview',accentColor(p.appearance.accent));
  }

  function previewIdentityDraft(){
    const display=String($('profileDisplayName')?.value||owner()).trim()||owner();
    if(!initialsManuallyEdited){
      const input=$('profileInitials');
      if(input) input.value=core.initials(display);
    }
    const initials=String($('profileInitials')?.value||core.initials(display)).trim().toUpperCase().slice(0,3);
    const view=$('preferencesView');
    const title=view?.querySelector('.profile-summary-identity h3');
    if(title) title.textContent=display;
    view?.querySelectorAll('.profile-summary-card .profile-avatar-xl,[data-profile-draft-avatar]').forEach(node=>node.textContent=initials);
  }

  function autoInitials(){
    const display=String($('profileDisplayName')?.value||owner()).trim()||owner();
    const input=$('profileInitials');
    if(!input) return;
    initialsManuallyEdited=false;
    input.value=core.initials(display);
    previewIdentityDraft();
    scheduleSave();
    input.focus();
  }

  function chooseAccent(accent){
    if(!core.ACCENTS.includes(String(accent))) return;
    const select=$('profileAccent');
    if(!select) return;
    select.value=accent;
    select.dispatchEvent(new Event('change',{bubbles:true}));
    document.querySelectorAll('[data-profile-accent-choice]').forEach(button=>{
      const selected=button.dataset.profileAccentChoice===accent;
      button.classList.toggle('is-selected',selected);
      button.setAttribute('aria-pressed',String(selected));
    });
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
    updateIdentityPreview(preview);
    document.querySelectorAll('[data-profile-accent-choice]').forEach(button=>{
      const selected=button.dataset.profileAccentChoice===preview.appearance.accent;
      button.classList.toggle('is-selected',selected);
      button.setAttribute('aria-pressed',String(selected));
    });
  }

  function persistForm({announce=false}={}){
    if(!$('profilePreferencesForm')) return null;
    if(saveTimer){clearTimeout(saveTimer);saveTimer=0;}
    const next=write(formValue());
    apply(next,{persist:false});
    updateIdentityPreview(next);
    emitChanged();
    setSaveStatus('Saved automatically','saved');
    if(announce) toast('Profile preferences saved.');
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

  function profileIdentity(forOwner){
    const p=readFor(forOwner);
    return {displayName:p.identity.displayName,initials:p.identity.initials,accent:p.appearance.accent};
  }

  function enhanceProfileSwitcher(){
    const dialog=document.querySelector('.profile-switch-dialog');
    if(!dialog) return;
    const currentOwner=owner();
    const owners=users?.OWNERS||['Bill','Aimee'];
    const current=profileIdentity(currentOwner);
    dialog.classList.add('profile-switch-dialog-v2');
    dialog.innerHTML=`<div class="dialog-head profile-switch-head"><div><span class="eyebrow">Profiles</span><h3 id="fiProfileSwitchTitle">Choose a private workspace</h3><p>Switch context without mixing inventory data.</p></div><button class="btn icon-btn" type="button" data-dialog-close aria-label="Close">×</button></div>
      <div class="dialog-body profile-switch-body">
        <div class="profile-switch-current"><span class="profile-avatar profile-avatar-lg" data-profile-option-accent="${esc(current.accent)}">${esc(current.initials)}</span><div><span>Current workspace</span><strong>${esc(current.displayName)}</strong></div><span class="profile-current-badge">Current</span></div>
        <div class="profile-options profile-options-v2">${owners.map(name=>{const option=profileIdentity(name);const isCurrent=name===currentOwner;return `<button class="profile-option profile-option-v2" type="button" data-profile-owner="${esc(name)}" aria-current="${String(isCurrent)}"><span class="profile-avatar profile-avatar-lg" data-profile-option-accent="${esc(option.accent)}">${esc(option.initials)}</span><span class="profile-option-copy"><strong>${esc(option.displayName)}</strong><small>${isCurrent?'This workspace is open':`Switch to ${esc(option.displayName)}`}</small></span><span class="profile-option-state">${isCurrent?'✓':'›'}</span></button>`;}).join('')}</div>
        <div class="profile-switch-footer"><button class="btn btn-primary" type="button" data-profile-manage-current>Customize ${esc(current.displayName)}</button><p>Appearance and defaults are personal to each profile. Inventory and history remain isolated.</p></div>
      </div>`;
  }

  function bindProfileHub(){
    document.addEventListener('click',event=>{
      const currentOption=event.target.closest('[data-profile-owner][aria-current="true"]');
      if(currentOption){event.preventDefault();event.stopImmediatePropagation();currentOption.closest('dialog')?.close();return;}
      const manage=event.target.closest('[data-profile-manage-current]');
      if(manage){event.preventDefault();event.stopImmediatePropagation();manage.closest('dialog')?.close();openPreferences();return;}
    },true);
    document.addEventListener('fi:profile-updated',()=>setTimeout(enhanceProfileSwitcher,0));
    document.addEventListener('click',event=>{if(event.target.closest('[data-profile-menu]'))setTimeout(enhanceProfileSwitcher,0);});
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
    bindProfileHub();
    matchMedia('(prefers-color-scheme: light)').addEventListener?.('change',()=>{if(read().appearance.theme==='system')apply();});
    emitChanged();
    setTimeout(enhanceProfileSwitcher,0);
  }

  globalThis.FilamentInventoryProfileUI=Object.freeze({read,readFor,write,apply,render,open:openPreferences,flush:flushPendingSave,enhanceSwitcher:enhanceProfileSwitcher});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();