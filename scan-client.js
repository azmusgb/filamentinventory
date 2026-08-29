(() => {
  'use strict';

  const core=globalThis.FilamentInventoryScan;
  if(!core)return;
  const STORAGE_KEY='filament-inventory-v1';
  const STYLE_HREF='/css/components/scan.css';
  let stream=null,detector=null,scanFrame=0,scanning=false,detecting=false,lastDetectionAt=0,pendingUnknown='';
  let startingCamera=false,torchOn=false;
  const currentProfile=()=>globalThis.FilamentInventoryUsers?.currentUser?.()||'Bill';
  const parse=(text,fallback=null)=>{try{return JSON.parse(text);}catch{return fallback;}};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const $=id=>document.getElementById(id);

  function readState(owner=currentProfile()){
    const users=globalThis.FilamentInventoryUsers;
    const key=owner===currentProfile()?STORAGE_KEY:users?.physicalKey?.(STORAGE_KEY,owner);
    if(!key)return{spools:[]};
    const value=parse(localStorage.getItem(key)||'{}',{});
    return Array.isArray(value?.spools)?value:{spools:[]};
  }
  function allProfileStates(){return Object.fromEntries(core.OWNERS.map(owner=>[owner,readState(owner)]));}
  function findSpool(id,owner=currentProfile()){const wanted=String(id||'').trim().toLowerCase();return readState(owner).spools.find(spool=>String(spool?.id||'').trim().toLowerCase()===wanted)||null;}
  function liveScanningSupported(){return Boolean(globalThis.BarcodeDetector&&navigator.mediaDevices?.getUserMedia&&window.isSecureContext);}

  function ensureStyles(){
    if(document.querySelector(`link[data-fi-scan-style="${STYLE_HREF}"]`))return;
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href=STYLE_HREF;
    link.dataset.fiScanStyle=STYLE_HREF;
    document.head.appendChild(link);
  }

  function scannerMarkup(){return `<div class="dialog-head qr-scanner-head"><div><span class="eyebrow">Scan spool</span><h3>Scan a filament spool</h3><p>Point the camera at a Filament Inventory QR label.</p></div><button class="btn icon-btn" type="button" data-scanner-close aria-label="Close scanner">×</button></div><div class="dialog-body qr-scanner-body"><div class="qr-scanner-context"><span class="qr-profile-pill"><span>Inventory</span><strong data-scanner-profile></strong></span><span class="qr-capability" data-scanner-capability>Checking camera…</span></div><section class="qr-camera-stage" data-camera-active="false"><div class="qr-video-shell" id="qrVideoShell" hidden><video class="qr-video" id="qrScannerVideo" muted playsinline></video><div class="qr-reticle" aria-hidden="true"><span></span></div><span class="qr-live-pill" aria-hidden="true">Scanning</span></div><div class="qr-camera-idle" data-camera-idle><span class="qr-camera-mark" aria-hidden="true">⌁</span><strong>Ready to scan</strong><p>Keep the QR label inside the frame. The camera starts automatically when supported.</p><button class="btn btn-primary" id="qrStartCamera" type="button">Start camera</button></div></section><div class="qr-scan-status" id="qrScanStatus" role="status" aria-live="polite" data-tone="neutral"><strong>Ready.</strong> Open the scanner and point at a spool label.</div><div class="qr-camera-controls" aria-label="Camera controls"><button class="btn" id="qrTorchCamera" type="button" hidden aria-pressed="false">Flashlight</button><button class="btn" id="qrStopCamera" type="button" disabled>Pause camera</button></div><div class="qr-scan-fallback" id="qrScanFallback" hidden><strong>Use your device QR scanner</strong><p>This browser cannot read QR codes live. Apple Camera or Code Scanner can open Filament Inventory labels directly, or enter the spool ID below.</p></div><details class="qr-manual-details" id="qrManualDetails"><summary>Enter spool ID instead</summary><form class="qr-manual" id="qrManualForm"><label class="sr-only" for="qrManualId">Spool ID</label><input class="field" id="qrManualId" autocomplete="off" autocapitalize="characters" maxlength="32" placeholder="Spool ID, e.g. S022"><button class="btn" type="submit">Find spool</button></form></details><section class="qr-recent-section" aria-labelledby="qrRecentTitle"><div class="qr-recent-head"><div><span class="eyebrow">Quick access</span><strong id="qrRecentTitle">Recent spools</strong></div><span>Tap to open</span></div><div class="qr-recent-list" id="qrRecentSpools"></div></section></div>`;}

  function ensureDialogs(){
    ensureStyles();
    if(!$('qrScannerDialog')){
      const dialog=document.createElement('dialog');
      dialog.id='qrScannerDialog';
      dialog.className='qr-scanner-dialog';
      dialog.setAttribute('aria-labelledby','qrScannerTitle');
      dialog.innerHTML=scannerMarkup().replace('<h3>Scan a filament spool</h3>','<h3 id="qrScannerTitle">Scan a filament spool</h3>');
      document.body.appendChild(dialog);
      dialog.addEventListener('close',stopCamera);
      dialog.querySelector('[data-scanner-close]')?.addEventListener('click',()=>dialog.close());
      $('qrStartCamera')?.addEventListener('click',()=>startCamera({automatic:false}));
      $('qrStopCamera')?.addEventListener('click',stopCamera);
      $('qrTorchCamera')?.addEventListener('click',toggleTorch);
      $('qrManualForm')?.addEventListener('submit',event=>{event.preventDefault();processScanValue($('qrManualId')?.value||'');});
    }
    if(!document.querySelector('.qr-unknown-dialog')){
      const dialog=document.createElement('dialog');
      dialog.className='qr-unknown-dialog';
      dialog.setAttribute('aria-labelledby','qrUnknownTitle');
      dialog.innerHTML=`<div class="dialog-head"><div><span class="eyebrow">Unknown spool</span><h3 id="qrUnknownTitle" data-unknown-title>Spool not found</h3></div><button class="btn icon-btn" type="button" data-unknown-close aria-label="Close">×</button></div><div class="dialog-body"><p class="fi-confirm-copy">This is a valid Filament Inventory code, but that spool is not in the active private inventory on this device.</p><div class="qr-unknown-actions"><button class="btn" type="button" data-unknown-scan>Scan another</button><button class="btn" type="button" data-unknown-sync>Sync devices</button><button class="btn btn-primary" type="button" data-unknown-add>Add this spool</button></div></div>`;
      document.body.appendChild(dialog);
    }
  }

  function ensureLaunchButton(){
    let button=document.querySelector('.scan-launch');
    if(button)return button;
    const host=document.querySelector('.top-actions');
    if(!host)return null;
    button=document.createElement('button');
    button.id='qrScanLaunch';
    button.type='button';
    button.className='btn scan-launch header-scan-launch';
    button.setAttribute('aria-label','Scan spool');
    button.setAttribute('aria-haspopup','dialog');
    button.setAttribute('aria-controls','qrScannerDialog');
    button.textContent='⌁';
    button.addEventListener('click',openScanner);
    host.prepend(button);
    return button;
  }

  function setStatus(html,tone='neutral'){
    const node=$('qrScanStatus');
    if(!node)return;
    node.innerHTML=html;
    node.dataset.tone=tone;
  }

  function setCapability(text,tone='neutral'){
    const node=document.querySelector('[data-scanner-capability]');
    if(!node)return;
    node.textContent=text;
    node.dataset.tone=tone;
  }

  function setCameraUi(active){
    const shell=$('qrVideoShell');
    const start=$('qrStartCamera');
    const stop=$('qrStopCamera');
    const stage=document.querySelector('.qr-camera-stage');
    if(shell)shell.hidden=!active;
    if(start)start.disabled=active||startingCamera;
    if(stop)stop.disabled=!active;
    if(stage)stage.dataset.cameraActive=String(active);
  }

  function renderRecent(){
    const holder=$('qrRecentSpools');
    if(!holder)return;
    const rows=(readState().spools||[])
      .filter(spool=>spool&&!spool.archivedAt)
      .slice()
      .sort((a,b)=>new Date(b.updatedAt||b.createdAt||0)-new Date(a.updatedAt||a.createdAt||0))
      .slice(0,4);
    holder.replaceChildren();
    if(!rows.length){
      const empty=document.createElement('span');
      empty.className='qr-recent-empty';
      empty.textContent='No recent spools yet.';
      holder.appendChild(empty);
      return;
    }
    for(const spool of rows){
      const button=document.createElement('button');
      button.type='button';
      button.className='qr-recent-spool';
      button.dataset.scannerRecentId=spool.id;
      button.setAttribute('aria-label',`Open ${spool.id}, ${spool.colorName||'unknown color'}`);
      const swatch=document.createElement('i');
      swatch.setAttribute('aria-hidden','true');
      swatch.style.backgroundColor=/^#[0-9a-f]{6}$/i.test(spool.colorHex||'')?spool.colorHex:'#64748b';
      const copy=document.createElement('span');
      const title=document.createElement('strong');
      title.textContent=`${spool.id} · ${spool.colorName||'Unknown color'}`;
      const detail=document.createElement('small');
      detail.textContent=`${spool.brand||'Unknown'} · ${spool.material||'Unknown'}`;
      copy.append(title,detail);
      const arrow=document.createElement('b');
      arrow.setAttribute('aria-hidden','true');
      arrow.textContent='›';
      button.append(swatch,copy,arrow);
      holder.appendChild(button);
    }
  }

  function openScanner(){
    ensureDialogs();
    ensureLaunchButton();
    const dialog=$('qrScannerDialog');
    const fallback=$('qrScanFallback');
    const start=$('qrStartCamera');
    const manual=$('qrManualDetails');
    const profile=dialog?.querySelector('[data-scanner-profile]');
    const supported=liveScanningSupported();
    if(profile)profile.textContent=`${currentProfile()}'s private inventory`;
    if(fallback)fallback.hidden=supported;
    if(start)start.hidden=!supported;
    if(manual)manual.open=!supported;
    renderRecent();
    setCameraUi(false);
    setCapability(supported?'Camera available':'Manual / device scan','neutral');
    setStatus(supported?'<strong>Starting camera…</strong> Hold a Filament Inventory QR inside the frame.':'<strong>Live camera scanning is unavailable here.</strong> Use your device QR scanner or enter the spool ID.','neutral');
    if(dialog&&!dialog.open)dialog.showModal();
    if(supported)requestAnimationFrame(()=>startCamera({automatic:true}));
    else $('qrManualId')?.focus();
  }

  function closeScanner(){
    stopCamera();
    const dialog=$('qrScannerDialog');
    if(dialog?.open)dialog.close();
  }

  async function startCamera({automatic=false}={}){
    if(startingCamera||scanning)return;
    if(!liveScanningSupported())return openScanner();
    startingCamera=true;
    setCameraUi(false);
    setCapability('Opening camera…','neutral');
    try{
      if(typeof BarcodeDetector.getSupportedFormats==='function'){
        const formats=await BarcodeDetector.getSupportedFormats();
        if(Array.isArray(formats)&&!formats.includes('qr_code'))throw new Error('QR detection is not supported by this browser.');
      }
      detector=new BarcodeDetector({formats:['qr_code']});
      stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}}});
      const video=$('qrScannerVideo');
      if(!video)throw new Error('Scanner video surface is unavailable.');
      video.srcObject=stream;
      const track=stream.getVideoTracks?.()[0]||stream.getTracks?.()[0];
      const capabilities=track?.getCapabilities?.()||{};
      const torch=$('qrTorchCamera');
      if(torch){torch.hidden=!capabilities.torch;torch.setAttribute('aria-pressed','false');}
      if(Array.isArray(capabilities.focusMode)&&capabilities.focusMode.includes('continuous')){
        track.applyConstraints?.({advanced:[{focusMode:'continuous'}]}).catch(()=>{});
      }
      await video.play();
      scanning=true;
      lastDetectionAt=0;
      setCameraUi(true);
      setCapability('Live camera','success');
      setStatus('<strong>Scanning…</strong> Hold the QR steady inside the frame.','active');
      scanFrame=requestAnimationFrame(scanLoop);
    }catch(error){
      stopCamera();
      const denied=error?.name==='NotAllowedError'||error?.name==='SecurityError';
      const message=denied?'Camera permission was not granted. You can retry, use your device QR scanner, or enter the spool ID.':(error?.message||'Camera scanning could not start.');
      setCapability(denied?'Camera permission needed':'Camera unavailable','warning');
      setStatus(`<strong>${automatic?'Camera did not start':'Camera unavailable'}.</strong> ${esc(message)}`,'warning');
      const fallback=$('qrScanFallback');
      const manual=$('qrManualDetails');
      if(fallback)fallback.hidden=false;
      if(manual)manual.open=true;
    }finally{
      startingCamera=false;
      const start=$('qrStartCamera');
      if(start)start.disabled=false;
    }
  }

  async function scanLoop(timestamp){
    if(!scanning)return;
    const video=$('qrScannerVideo');
    if(!detecting&&video?.readyState>=2&&timestamp-lastDetectionAt>=140){
      detecting=true;
      lastDetectionAt=timestamp;
      try{
        const results=await detector.detect(video);
        const value=results?.find(row=>row?.rawValue)?.rawValue;
        if(value){
          const handled=await processScanValue(value,{fromCamera:true});
          if(handled)return;
          lastDetectionAt=timestamp+700;
        }
      }catch(error){
        console.warn('QR detection frame failed',error);
      }finally{
        detecting=false;
      }
    }
    if(scanning)scanFrame=requestAnimationFrame(scanLoop);
  }

  async function toggleTorch(){
    const track=stream?.getVideoTracks?.()[0]||stream?.getTracks?.()[0];
    const button=$('qrTorchCamera');
    if(!track?.applyConstraints||!button)return;
    try{
      torchOn=!torchOn;
      await track.applyConstraints({advanced:[{torch:torchOn}]});
      button.setAttribute('aria-pressed',String(torchOn));
      button.textContent=torchOn?'Flashlight on':'Flashlight';
    }catch{
      torchOn=false;
      button.setAttribute('aria-pressed','false');
      button.hidden=true;
    }
  }

  function stopCamera(){
    scanning=false;
    detecting=false;
    startingCamera=false;
    torchOn=false;
    if(scanFrame)cancelAnimationFrame(scanFrame);
    scanFrame=0;
    stream?.getTracks?.().forEach(track=>track.stop());
    stream=null;
    detector=null;
    const video=$('qrScannerVideo');
    if(video)video.srcObject=null;
    const torch=$('qrTorchCamera');
    if(torch){torch.hidden=true;torch.textContent='Flashlight';torch.setAttribute('aria-pressed','false');}
    setCameraUi(false);
  }

  function openPhysicalSpool(id){
    const actions=globalThis.FilamentInventorySpoolActions;
    if((!actions?.openPhysical&&!actions?.open)||!findSpool(id))return false;
    closeScanner();
    $('scanSpoolDialog')?.close();
    if(actions.openPhysical)return actions.openPhysical(id,{source:'scan'})!==false;
    return actions.open(id,{source:'scan'})!==false;
  }

  function showUnknown(id){
    pendingUnknown=id;
    closeScanner();
    const dialog=document.querySelector('.qr-unknown-dialog');
    const title=dialog?.querySelector('[data-unknown-title]');
    if(title)title.textContent=`${id} is not in ${currentProfile()}'s inventory`;
    if(dialog&&!dialog.open)dialog.showModal();
  }

  function addUnknown(){
    const id=pendingUnknown;
    pendingUnknown='';
    document.querySelector('.qr-unknown-dialog')?.close();
    ($('inventoryAddBtn')||$('heroAddBtn')||$('addTopBtn'))?.click();
    setTimeout(()=>{
      const field=$('spoolId');
      if(field){field.value=id;field.dispatchEvent(new Event('input',{bubbles:true}));field.focus();}
    },70);
  }

  function syncUnknown(){
    pendingUnknown='';
    document.querySelector('.qr-unknown-dialog')?.close();
    if(!globalThis.FilamentInventoryNavigation?.navigate?.('sync',{historyMode:'replace',focus:true}))document.querySelector('.tab[data-view="sync"]')?.click();
  }

  function scanAnotherUnknown(){
    pendingUnknown='';
    document.querySelector('.qr-unknown-dialog')?.close();
    openScanner();
  }

  async function processScanValue(raw){
    const parsed=core.parseScanValue(raw,location.origin);
    if(!parsed.ok){
      const message=parsed.reason==='foreign-origin'?'That QR points to a different site.':'No valid filament spool ID was found in that code.';
      setStatus(`<strong>Not a Filament Inventory label.</strong> ${esc(message)} Keep scanning or enter an ID.`,'warning');
      return false;
    }
    stopCamera();
    navigator.vibrate?.(35);
    const current=currentProfile();
    const states=allProfileStates();
    const resolved=parsed.profile||core.resolveProfile(parsed.spoolId,current,states)||current;
    const exists=core.stateHasSpool(states[resolved],parsed.spoolId);
    const target=core.buildSpoolTarget({spoolId:parsed.spoolId,profile:resolved},location.origin);
    if(exists&&resolved===current){
      setStatus(`<strong>Found ${esc(parsed.spoolId)}.</strong> Opening spool controls…`,'success');
      setTimeout(()=>{if(!openPhysicalSpool(parsed.spoolId))location.assign(target);},50);
      return true;
    }
    if(exists&&resolved!==current){
      setStatus(`<strong>Found ${esc(parsed.spoolId)}.</strong> Switching to ${esc(resolved)}'s private inventory…`,'success');
      setTimeout(()=>location.assign(target),70);
      return true;
    }
    showUnknown(parsed.spoolId);
    return true;
  }

  function reconcileIncomingLegacyScan(){
    const url=new URL(location.href);
    const spoolId=String(url.searchParams.get('spool')||'').trim();
    const scan=url.searchParams.get('scan')==='1';
    const hashProfile=core.profileFromUrl(url);
    if(!scan||!core.validId(spoolId)||hashProfile)return false;
    const current=currentProfile();
    const resolved=core.resolveProfile(spoolId,current,allProfileStates());
    if(!resolved||resolved===current)return false;
    location.replace(core.buildSpoolTarget({spoolId,profile:resolved},location.origin));
    return true;
  }

  function bindActions(){
    document.addEventListener('click',event=>{
      const recent=event.target.closest('[data-scanner-recent-id]');
      if(recent){openPhysicalSpool(recent.dataset.scannerRecentId);return;}
      if(event.target.closest('[data-unknown-close]')){pendingUnknown='';event.target.closest('dialog')?.close();return;}
      if(event.target.closest('[data-unknown-add]')){addUnknown();return;}
      if(event.target.closest('[data-unknown-sync]')){syncUnknown();return;}
      if(event.target.closest('[data-unknown-scan]'))scanAnotherUnknown();
    });
  }

  function init(){
    ensureDialogs();
    if(reconcileIncomingLegacyScan())return;
    ensureLaunchButton();
    bindActions();
    globalThis.FilamentInventoryScanner=Object.freeze({open:openScanner,close:closeScanner,stop:stopCamera,process:processScanValue,start:startCamera});
    window.addEventListener('pagehide',stopCamera);
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&scanning)stopCamera();});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();