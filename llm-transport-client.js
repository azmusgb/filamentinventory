(() => {
  'use strict';

  const API='/api/inventory-assistant';
  const SYNC_KEY_STORAGE='filament-sync-key-v1';
  const CURRENT_USER_STORAGE='filament-current-user-v1';
  const TIMEOUT_MS=16000;
  const HEALTH_TIMEOUT_MS=5000;
  const HEALTH_TTL_MS=60000;
  const MAX_MODEL_ANSWER=1200;
  const validKey=key=>/^[A-Za-z0-9_-]{32,128}$/.test(String(key||'').trim());
  const profile=()=>globalThis.FilamentInventoryUsers?.currentUser?.()||localStorage.getItem(CURRENT_USER_STORAGE)||'Bill';
  const readKey=()=>String(localStorage.getItem(SYNC_KEY_STORAGE)||'').trim();
  let lastError='';
  let lastModel='';
  let previousConfigured=null;
  let serverChecked=false;
  let serverConfigured=null;
  let serverModel='';
  let serverError='';
  let lastHealthAt=0;
  let healthInFlight=null;

  function numericClaims(text){
    return [...String(text||'').matchAll(/\b\d+(?:\.\d+)?\s*(?:g|%|spools?)\b/gi)]
      .map(match=>match[0].replace(/\s+/g,'').toLowerCase());
  }

  function validateGroundedResult(result,payload){
    if(!result||typeof result!=='object'||result.ok!==true)return null;
    const answer=String(result.answer||'').trim();
    const confidence=String(result.confidence||'').trim();
    if(!answer||answer.length>MAX_MODEL_ANSWER||!['high','medium','low'].includes(confidence))return null;

    const allowedIds=new Set(Array.isArray(payload?.localGrounding?.evidenceIds)
      ? payload.localGrounding.evidenceIds.map(id=>String(id||'').trim()).filter(Boolean)
      : []);
    const evidenceIds=Array.isArray(result.evidenceIds)
      ? result.evidenceIds.map(id=>String(id||'').trim()).filter(Boolean)
      : null;
    if(!evidenceIds||evidenceIds.some(id=>!allowedIds.has(id)))return null;
    if(allowedIds.size>0&&evidenceIds.length===0)return null;

    const fallback=String(payload?.localGrounding?.fallbackAnswer||'');
    const rows=Array.isArray(payload?.inventory)?payload.inventory:[];
    const corpus=[fallback,...rows.filter(row=>allowedIds.has(String(row?.id||'').trim())).map(row=>JSON.stringify(row))]
      .join(' ').toLowerCase().replace(/\s+/g,'');
    if(numericClaims(answer).some(claim=>!corpus.includes(claim)))return null;

    return result;
  }

  function state(){
    const configured=validKey(readKey());
    return Object.freeze({
      configured,
      online:navigator.onLine,
      enabled:configured,
      lastError,
      model:lastModel,
      server:Object.freeze({
        checked:serverChecked,
        configured:serverConfigured,
        model:serverModel,
        error:serverError,
      }),
    });
  }

  function updateUi(){
    const current=state();
    let mode='Grounded local';
    let detail=`${profile()} inventory`;
    let note='Model transport is not connected. The deterministic grounded engine remains authoritative.';

    if(current.server.checked&&current.server.configured===false){
      detail+=' · model service not configured';
      note='The production Assistant endpoint is online, but its server-side model transport is not configured. Local grounded answers remain authoritative.';
    }else if(!current.configured){
      detail+=current.server.configured===true?' · cloud ready · link Sync devices':' · connect Sync devices for model';
      note=current.server.configured===true
        ? `Cloud model transport is ready${current.server.model?` on ${current.server.model}`:''}. Link this browser through More → Sync devices to enable grounded model answers.`
        : 'Cloud-enhanced answers require this browser to be linked to your private inventory. Open More → Sync devices, then connect or create the private sync key.';
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
      const model=current.model||current.server.model;
      note=model
        ? `Connected through ${model}. Model output is accepted only when its evidence IDs exist in the current inventory.`
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

  async function checkHealth(force=false){
    if(!navigator.onLine){
      serverError='Offline';
      updateUi();
      return state().server;
    }
    const now=Date.now();
    if(!force&&serverChecked&&now-lastHealthAt<HEALTH_TTL_MS)return state().server;
    if(healthInFlight)return healthInFlight;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),HEALTH_TIMEOUT_MS);
    healthInFlight=(async()=>{
      try{
        const response=await fetch(API,{method:'GET',headers:{Accept:'application/json'},cache:'no-store',signal:controller.signal});
        const result=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(result.error||`Assistant health failed (${response.status}).`);
        serverChecked=true;
        serverConfigured=result?.transport?.configured===true;
        serverModel=String(result?.transport?.model||'').trim().slice(0,100);
        serverError='';
        lastHealthAt=Date.now();
        emit('health');
        return state().server;
      }catch(error){
        serverChecked=true;
        serverConfigured=null;
        serverError=controller.signal.aborted?'Assistant health check timed out.':(error instanceof Error?error.message:String(error));
        lastHealthAt=Date.now();
        emit('health-error');
        return state().server;
      }finally{
        clearTimeout(timeout);
        healthInFlight=null;
      }
    })();
    return healthInFlight;
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
      if(!validateGroundedResult(result,payload))throw new Error('Grounded model response failed client validation.');
      lastError='';
      lastModel=String(result.model||'').trim().slice(0,100);
      serverChecked=true;
      serverConfigured=true;
      if(lastModel)serverModel=lastModel;
      lastHealthAt=Date.now();
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
    void checkHealth();
    return configured;
  }

  function init(){
    if(!globalThis.FilamentInventoryLLM){setTimeout(init,25);return;}
    refresh();
    window.addEventListener('online',()=>{refresh();void checkHealth(true);});
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
      void checkHealth();
      setTimeout(updateUi,0);
    },true);
    globalThis.FilamentInventoryLLMTransport=Object.freeze({
      refresh,
      checkHealth,
      configured:()=>validKey(readKey()),
      state,
      validateResponse:validateGroundedResult,
    });
    setTimeout(updateUi,100);
  }

  init();
})();
