(() => {
  'use strict';

  const API='/api/inventory-assistant';
  const SYNC_KEY_STORAGE='filament-sync-key-v1';
  const CURRENT_USER_STORAGE='filament-current-user-v1';
  const TIMEOUT_MS=16000;
  const validKey=key=>/^[A-Za-z0-9_-]{32,128}$/.test(String(key||'').trim());
  const profile=()=>globalThis.FilamentInventoryUsers?.currentUser?.()||localStorage.getItem(CURRENT_USER_STORAGE)||'Bill';
  const readKey=()=>String(localStorage.getItem(SYNC_KEY_STORAGE)||'').trim();
  let lastError='';
  let lastModel='';
  let previousConfigured=null;

  function state(){
    const configured=validKey(readKey());
    return Object.freeze({
      configured,
      online:navigator.onLine,
      enabled:configured,
      lastError,
      model:lastModel,
    });
  }

  function updateUi(){
    const current=state();
    let mode='Grounded local';
    let detail=`${profile()} inventory`;
    let note='Model transport is not connected. The deterministic grounded engine remains authoritative.';

    if(!current.configured){
      detail+= ' · connect Sync devices for model';
      note='Cloud-enhanced answers require this browser to be linked to your private inventory. Open More → Sync devices, then connect or create the private sync key.';
    }else if(!current.online){
      detail+= ' · offline';
      note='Private sync is linked, but this device is offline. Local grounded answers remain available.';
    }else if(current.lastError){
      mode='Local fallback';
      detail+= ' · model unavailable';
      note=`Model request failed: ${current.lastError} Local grounded answers remain authoritative.`;
    }else{
      mode='Grounded model';
      detail+= ' · private sync linked';
      note=current.model
        ? `Connected through ${current.model}. Model output is accepted only when its evidence IDs exist in the current inventory.`
        : 'Model transport is connected. Responses are accepted only when their evidence IDs exist in the current inventory.';
    }

    document.querySelectorAll('[data-llm-mode]').forEach(node=>node.textContent=mode);
    document.querySelectorAll('[data-llm-owner]').forEach(node=>node.textContent=detail);
    const transportNote=document.querySelector('[data-llm-transport-note]');
    if(transportNote)transportNote.textContent=note;
  }

  function emit(type='state'){
    const current=state();
    document.dispatchEvent(new CustomEvent('fi:llm-transport',{detail:{type,...current}}));
    updateUi();
  }

  async function transport(payload,{signal}={}){
    const key=readKey();
    if(!validKey(key)){
      lastError='Private sync is not connected on this device.';
      emit('error');
      throw new Error('Grounded model requires private device sync.');
    }
    if(!navigator.onLine){
      lastError='This device is offline.';
      emit('error');
      throw new Error('Grounded model is offline.');
    }
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),TIMEOUT_MS);
    const abort=()=>controller.abort();
    if(signal?.aborted)controller.abort();
    else signal?.addEventListener?.('abort',abort,{once:true});
    try{
      const response=await fetch(API,{
        method:'POST',
        headers:{Accept:'application/json','Content-Type':'application/json','X-Filament-Sync-Key':key,'X-Filament-Profile':profile()},
        body:JSON.stringify(payload),
        cache:'no-store',
        signal:controller.signal,
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||`Grounded model failed (${response.status}).`);
      lastError='';
      lastModel=String(result.model||'').trim().slice(0,100);
      emit('success');
      return result;
    }catch(error){
      const timedOut=controller.signal.aborted&&!signal?.aborted;
      lastError=timedOut?'Grounded model request timed out.':(error instanceof Error?error.message:String(error));
      emit('error');
      if(timedOut)throw new Error(lastError);
      throw error;
    }finally{
      clearTimeout(timeout);
      signal?.removeEventListener?.('abort',abort);
    }
  }

  function refresh(){
    const core=globalThis.FilamentInventoryLLM;
    if(!core)return false;
    const configured=validKey(readKey());
    if(previousConfigured!==null&&previousConfigured!==configured){
      lastError='';
      lastModel='';
    }
    previousConfigured=configured;
    core.setTransport(configured?transport:null);
    emit('refresh');
    return configured;
  }

  function init(){
    if(!globalThis.FilamentInventoryLLM){setTimeout(init,25);return;}
    refresh();
    window.addEventListener('online',refresh);
    window.addEventListener('offline',refresh);
    window.addEventListener('focus',refresh);
    window.addEventListener('storage',event=>{
      if(event.key===SYNC_KEY_STORAGE)refresh();
      else if(event.key===CURRENT_USER_STORAGE)updateUi();
    });
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});
    document.addEventListener('fi:profile-updated',()=>setTimeout(updateUi,0));
    document.addEventListener('click',event=>{
      if(!event.target.closest?.('[data-shell-action="assistant"],[data-llm-open]'))return;
      refresh();
      setTimeout(updateUi,0);
    },true);
    globalThis.FilamentInventoryLLMTransport=Object.freeze({refresh,configured:()=>validKey(readKey()),state});
    setTimeout(updateUi,100);
  }

  init();
})();
