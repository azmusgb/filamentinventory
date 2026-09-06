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
  let lastSuccessProfile='';
  let lastSuccessAt='';
  let previousConfigured=null;
  let previousProfile='';
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

  function phaseFor(current){
    if(current.server.checked&&current.server.configured===false)return 'server-unconfigured';
    if(!current.configured)return current.server.configured===true?'link-required':'local';
    if(!current.online)return 'offline';
    if(current.lastError)return 'fallback';
    if(current.verifiedForCurrentProfile)return 'model';
    if(current.server.checked&&current.server.configured===true)return 'ready';
    if(current.server.checked&&current.server.error)return 'health-error';
    return 'checking';
  }

  function state(){
    const currentProfile=profile();
    const configured=validKey(readKey());
    const base={
      configured,
      online:navigator.onLine,
      enabled:configured,
      profile:currentProfile,
      lastError,
      model:lastModel,
      lastSuccessProfile,
      lastSuccessAt,
      verifiedForCurrentProfile:Boolean(lastSuccessProfile&&lastSuccessProfile===currentProfile),
      server:Object.freeze({
        checked:serverChecked,
        configured:serverConfigured,
        model:serverModel,
        error:serverError,
      }),
    };
    return Object.freeze({...base,phase:phaseFor(base)});
  }

  function presentation(current=state()){
    let mode='Grounded local';
    let detail=`${current.profile} inventory`;
    let note='The deterministic grounded engine is authoritative.';

    if(current.phase==='server-unconfigured'){
      detail+=' · model service not configured';
      note='The production Assistant endpoint is online, but its server-side model transport is not configured. Local grounded answers remain authoritative.';
    }else if(current.phase==='link-required'){
      detail+=' · cloud ready · link Sync devices';
      note=`Cloud model transport is ready${current.server.model?` on ${current.server.model}`:''}. Link this browser through More → Sync devices to enable grounded model answers.`;
    }else if(current.phase==='local'){
      detail+=' · connect Sync devices for model';
      note='Cloud-enhanced answers require this browser to be linked to your private inventory. Open More → Sync devices, then connect or create the private sync key.';
    }else if(current.phase==='offline'){
      detail+=' · private sync linked · offline';
      note='Private sync is linked, but this device is offline. Local grounded answers remain available.';
    }else if(current.phase==='fallback'){
      mode='Local fallback';
      detail+=' · model unavailable';
      note=`Model request failed: ${current.lastError} Local grounded answers remain authoritative.`;
    }else if(current.phase==='model'){
      mode='Grounded model';
      detail+=' · private sync linked · verified';
      const model=current.model||current.server.model;
      note=model
        ? `Verified through ${model}. Model output is accepted only when its evidence IDs and numeric claims match the current inventory.`
        : 'A grounded model response has been verified for this profile. Model output is accepted only when its evidence matches the current inventory.';
    }else if(current.phase==='ready'){
      mode='Cloud ready';
      detail+=' · private sync linked · ask to verify';
      note=`Cloud model transport is configured${current.server.model?` on ${current.server.model}`:''}, but this profile has not yet completed a validated model answer in this browser session.`;
    }else if(current.phase==='health-error'){
      detail+=' · private sync linked · cloud status unavailable';
      note=`The cloud readiness check could not be verified${current.server.error?`: ${current.server.error}`:''}. Local grounded answers remain authoritative until a model response succeeds.`;
    }else{
      detail+=' · private sync linked · checking cloud';
      note='Private sync is linked. Cloud readiness is being checked; local grounded answers remain authoritative until a validated model response succeeds.';
    }

    return Object.freeze({mode,detail,note,phase:current.phase});
  }

  function updateUi(){
    const view=presentation();
    document.querySelectorAll('[data-llm-mode]').forEach(node=>node.textContent=view.mode);
    document.querySelectorAll('[data-llm-owner]').forEach(node=>node.textContent=view.detail);
    document.querySelectorAll('.fi-llm-mode').forEach(node=>node.dataset.modeState=view.phase);
    const transportNote=document.querySelector('[data-llm-transport-note]');
    if(transportNote)transportNote.textContent=view.note;
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
    const requestProfile=profile();
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
    if(String(payload?.profile||'')!==requestProfile){
      lastError='Assistant request profile no longer matches the active inventory.';
      emit('error');
      throw new Error(lastError);
    }
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),TIMEOUT_MS);
    const abort=()=>controller.abort();
    if(signal?.aborted)controller.abort();
    else signal?.addEventListener?.('abort',abort,{once:true});
    try{
      const response=await fetch(API,{
        method:'POST',
        headers:{Accept:'application/json','Content-Type':'application/json','X-Filament-Sync-Key':key,'X-Filament-Profile':requestProfile},
        body:JSON.stringify(payload),
        cache:'no-store',
        signal:controller.signal,
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||`Grounded model failed (${response.status}).`);
      if(profile()!==requestProfile)throw new Error('Active inventory profile changed while the model request was running.');
      if(!validateGroundedResult(result,payload))throw new Error('Grounded model response failed client validation.');
      lastError='';
      lastModel=String(result.model||'').trim().slice(0,100);
      lastSuccessProfile=requestProfile;
      lastSuccessAt=new Date().toISOString();
      serverChecked=true;
      serverConfigured=true;
      serverError='';
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
    const currentProfile=profile();
    if(previousConfigured!==null&&previousConfigured!==configured){
      lastError='';
      lastModel='';
      lastSuccessProfile='';
      lastSuccessAt='';
    }
    if(previousProfile&&previousProfile!==currentProfile){
      lastError='';
      lastModel='';
      lastSuccessProfile='';
      lastSuccessAt='';
    }
    previousConfigured=configured;
    previousProfile=currentProfile;
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
      else if(event.key===CURRENT_USER_STORAGE)refresh();
    });
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});
    document.addEventListener('fi:profile-updated',()=>setTimeout(refresh,0));
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
      presentation,
      validateResponse:validateGroundedResult,
    });
    setTimeout(updateUi,100);
  }

  init();
})();
