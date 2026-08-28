(() => {
  'use strict';

  const core=globalThis.FilamentInventoryScan;
  if(!core)return;
  const STORAGE_KEY='filament-inventory-v1';
  let stream=null,detector=null,scanFrame=0,scanning=false,detecting=false,lastDetectionAt=0,pendingUnknown='';
  const currentProfile=()=>globalThis.FilamentInventoryUsers?.currentUser?.()||'Bill';
  const parse=(text,fallback=null)=>{try{return JSON.parse(text);}catch{return fallback;}};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function readState(owner=currentProfile()){
    const users=globalThis.FilamentInventoryUsers;const key=owner===currentProfile()?STORAGE_KEY:users?.physicalKey?.(STORAGE_KEY,owner);if(!key)return{spools:[]};const value=parse(localStorage.getItem(key)||'{}',{});return Array.isArray(value?.spools)?value:{spools:[]};
  }
  function allProfileStates(){return Object.fromEntries(core.OWNERS.map(owner=>[owner,readState(owner)]));}
  function findSpool(id,owner=currentProfile()){const wanted=String(id||'').trim().toLowerCase();return readState(owner).spools.find(spool=>String(spool?.id||'').trim().toLowerCase()===wanted)||null;}
  function liveScanningSupported(){return Boolean(globalThis.BarcodeDetector&&navigator.mediaDevices?.getUserMedia&&window.isSecureContext);}

  function scannerMarkup(){return `<div class="dialog-head"><div><span class="eyebrow">Scan spool</span><h3>Point at a filament QR</h3></div><button class="btn icon-btn" type="button" data-scanner-close aria-label="Close">×</button></div><div class="dialog-body qr-scanner-body"><div class="qr-private-note"><span>Scanning inside</span><strong data-scanner-profile></strong></div><div class="qr-video-shell" id="qrVideoShell" hidden><video class="qr-video" id="qrScannerVideo" muted playsinline></video><div class="qr-reticle" aria-hidden="true"></div></div><div class="qr-scan-status" id="qrScanStatus"><strong>Ready.</strong> Start the camera or enter a spool ID.</div><div class="qr-scan-fallback" id="qrScanFallback" hidden><h4>Use Apple Camera or Code Scanner</h4><p>On iPhone and iPad, the system QR scanner is the most reliable option. Scanning a Filament Inventory label still opens the spool directly in this app.</p></div><form class="qr-manual" id="qrManualForm"><input class="field" id="qrManualId" autocomplete="off" maxlength="32" placeholder="Enter spool ID, e.g. S022"><button class="btn" type="submit">Find spool</button></form><div class="dialog-actions"><button class="btn" id="qrStopCamera" type="button" disabled>Stop camera</button><button class="btn btn-primary" id="qrStartCamera" type="button">Start camera</button></div></div>`;}

  function ensureDialogs(){
    if(!document.getElementById('qrScannerDialog')){const dialog=document.createElement('dialog');dialog.id='qrScannerDialog';dialog.className='qr-scanner-dialog';dialog.innerHTML=scannerMarkup();document.body.appendChild(dialog);dialog.addEventListener('close',stopCamera);dialog.querySelector('[data-scanner-close]')?.addEventListener('click',()=>dialog.close());document.getElementById('qrStartCamera')?.addEventListener('click',startCamera);document.getElementById('qrStopCamera')?.addEventListener('click',stopCamera);document.getElementById('qrManualForm')?.addEventListener('submit',event=>{event.preventDefault();processScanValue(document.getElementById('qrManualId')?.value||'');});}
    if(!document.querySelector('.qr-unknown-dialog')){const dialog=document.createElement('dialog');dialog.className='qr-unknown-dialog';dialog.innerHTML=`<div class="dialog-head"><div><span class="eyebrow">Unknown spool</span><h3 data-unknown-title>Spool not found</h3></div><button class="btn icon-btn" type="button" data-unknown-close aria-label="Close">×</button></div><div class="dialog-body"><p class="fi-confirm-copy">This code is valid, but the spool is not in this private inventory on this device.</p><div class="dialog-actions"><button class="btn" type="button" data-unknown-sync>Sync from another device</button><button class="btn btn-primary" type="button" data-unknown-add>Add this spool</button></div></div>`;document.body.appendChild(dialog);}
  }

  function ensureLaunchButton(){
    let button=document.querySelector('.scan-launch');if(button)return button;const host=document.querySelector('.top-actions');if(!host)return null;button=document.createElement('button');button.id='qrScanLaunch';button.type='button';button.className='btn scan-launch header-scan-launch';button.setAttribute('aria-label','Scan spool');button.textContent='⌁';button.addEventListener('click',openScanner);host.prepend(button);return button;
  }

  function setStatus(html){const node=document.getElementById('qrScanStatus');if(node)node.innerHTML=html;}
  function setCameraUi(active){const shell=document.getElementById('qrVideoShell');const start=document.getElementById('qrStartCamera');const stop=document.getElementById('qrStopCamera');if(shell)shell.hidden=!active;if(start)start.disabled=active;if(stop)stop.disabled=!active;}

  function openScanner(){
    ensureDialogs();ensureLaunchButton();const dialog=document.getElementById('qrScannerDialog');const fallback=document.getElementById('qrScanFallback');const start=document.getElementById('qrStartCamera');const profile=dialog?.querySelector('[data-scanner-profile]');if(profile)profile.textContent=`${currentProfile()}'s private inventory`;if(fallback)fallback.hidden=liveScanningSupported();if(start)start.hidden=!liveScanningSupported();setStatus(liveScanningSupported()?'<strong>Ready.</strong> Start the camera and hold a Filament Inventory QR inside the frame.':'<strong>Camera scan is unavailable here.</strong> Use your device QR scanner or enter the spool ID.');if(dialog&&!dialog.open)dialog.showModal();if(!liveScanningSupported())document.getElementById('qrManualId')?.focus();
  }

  function closeScanner(){stopCamera();const dialog=document.getElementById('qrScannerDialog');if(dialog?.open)dialog.close();}

  async function startCamera(){
    if(!liveScanningSupported())return openScanner();stopCamera();try{if(typeof BarcodeDetector.getSupportedFormats==='function'){const formats=await BarcodeDetector.getSupportedFormats();if(Array.isArray(formats)&&!formats.includes('qr_code'))throw new Error('QR detection is not supported by this browser.');}detector=new BarcodeDetector({formats:['qr_code']});stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});const video=document.getElementById('qrScannerVideo');if(!video)throw new Error('Scanner video surface is unavailable.');video.srcObject=stream;await video.play();scanning=true;setCameraUi(true);setStatus('<strong>Scanning…</strong> Hold the QR steady inside the frame.');scanFrame=requestAnimationFrame(scanLoop);}catch(error){stopCamera();const message=error?.name==='NotAllowedError'?'Camera access was denied. Use your device QR scanner or enter the spool ID.':(error?.message||'Camera scanning could not start.');setStatus(`<strong>Camera unavailable.</strong> ${esc(message)}`);const fallback=document.getElementById('qrScanFallback');if(fallback)fallback.hidden=false;}}

  async function scanLoop(timestamp){if(!scanning)return;const video=document.getElementById('qrScannerVideo');if(!detecting&&video?.readyState>=2&&timestamp-lastDetectionAt>=160){detecting=true;lastDetectionAt=timestamp;try{const results=await detector.detect(video);const value=results?.find(row=>row?.rawValue)?.rawValue;if(value){scanning=false;await processScanValue(value);return;}}catch(error){console.warn('QR detection frame failed',error);}finally{detecting=false;}}if(scanning)scanFrame=requestAnimationFrame(scanLoop);}

  function stopCamera(){scanning=false;detecting=false;if(scanFrame)cancelAnimationFrame(scanFrame);scanFrame=0;stream?.getTracks?.().forEach(track=>track.stop());stream=null;detector=null;const video=document.getElementById('qrScannerVideo');if(video)video.srcObject=null;setCameraUi(false);}

  function openPhysicalSpool(id){const actions=globalThis.FilamentInventorySpoolActions;if((!actions?.openPhysical&&!actions?.open)||!findSpool(id))return false;closeScanner();document.getElementById('scanSpoolDialog')?.close();if(actions.openPhysical)return actions.openPhysical(id,{source:'scan'})!==false;return actions.open(id,{source:'scan'})!==false;}

  function showUnknown(id){pendingUnknown=id;closeScanner();const dialog=document.querySelector('.qr-unknown-dialog');dialog.querySelector('[data-unknown-title]').textContent=`${id} is not in ${currentProfile()}'s inventory`;dialog.showModal();}

  function addUnknown(){const id=pendingUnknown;pendingUnknown='';document.querySelector('.qr-unknown-dialog')?.close();(document.getElementById('inventoryAddBtn')||document.getElementById('heroAddBtn')||document.getElementById('addTopBtn'))?.click();setTimeout(()=>{const field=document.getElementById('spoolId');if(field){field.value=id;field.dispatchEvent(new Event('input',{bubbles:true}));field.focus();}},60);}
  function syncUnknown(){pendingUnknown='';document.querySelector('.qr-unknown-dialog')?.close();if(!globalThis.FilamentInventoryNavigation?.navigate?.('sync',{historyMode:'replace',focus:true}))document.querySelector('.tab[data-view="sync"]')?.click();}

  async function processScanValue(raw){
    const parsed=core.parseScanValue(raw,location.origin);if(!parsed.ok){const message=parsed.reason==='foreign-origin'?'That QR points to a different site.':'No valid filament spool ID was found in that code.';setStatus(`<strong>Not a Filament Inventory label.</strong> ${esc(message)}`);return;}
    stopCamera();const current=currentProfile();const states=allProfileStates();const resolved=parsed.profile||core.resolveProfile(parsed.spoolId,current,states)||current;const exists=core.stateHasSpool(states[resolved],parsed.spoolId);const target=core.buildSpoolTarget({spoolId:parsed.spoolId,profile:resolved},location.origin);
    if(exists&&resolved===current){setStatus(`<strong>Found ${esc(parsed.spoolId)}.</strong> Opening spool controls…`);setTimeout(()=>{if(!openPhysicalSpool(parsed.spoolId))location.assign(target);},60);return;}
    if(exists&&resolved!==current){setStatus(`<strong>Found ${esc(parsed.spoolId)}.</strong> Switching to ${esc(resolved)}'s private inventory…`);setTimeout(()=>location.assign(target),80);return;}
    showUnknown(parsed.spoolId);
  }

  function reconcileIncomingLegacyScan(){const url=new URL(location.href);const spoolId=String(url.searchParams.get('spool')||'').trim();const scan=url.searchParams.get('scan')==='1';const hashProfile=core.profileFromUrl(url);if(!scan||!core.validId(spoolId)||hashProfile)return false;const current=currentProfile();const resolved=core.resolveProfile(spoolId,current,allProfileStates());if(!resolved||resolved===current)return false;location.replace(core.buildSpoolTarget({spoolId,profile:resolved},location.origin));return true;}

  function bindUnknown(){document.addEventListener('click',event=>{if(event.target.closest('[data-unknown-close]')){pendingUnknown='';event.target.closest('dialog')?.close();return;}if(event.target.closest('[data-unknown-add]')){addUnknown();return;}if(event.target.closest('[data-unknown-sync]'))syncUnknown();});}

  function init(){ensureDialogs();if(reconcileIncomingLegacyScan())return;ensureLaunchButton();bindUnknown();globalThis.FilamentInventoryScanner=Object.freeze({open:openScanner,close:closeScanner,stop:stopCamera,process:processScanValue});window.addEventListener('pagehide',stopCamera);document.addEventListener('visibilitychange',()=>{if(document.hidden&&scanning)stopCamera();});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
