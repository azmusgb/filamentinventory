(() => {
  'use strict';

  const API='/api/inventory-assistant';
  const SYNC_KEY_STORAGE='filament-sync-key-v1';
  const TIMEOUT_MS=16000;
  const validKey=key=>/^[A-Za-z0-9_-]{32,128}$/.test(String(key||'').trim());
  const profile=()=>globalThis.FilamentInventoryUsers?.currentUser?.()||localStorage.getItem('filament-current-user-v1')||'Bill';
  const readKey=()=>String(localStorage.getItem(SYNC_KEY_STORAGE)||'').trim();

  async function transport(payload,{signal}={}){
    const key=readKey();
    if(!validKey(key))throw new Error('Grounded model requires private device sync.');
    if(!navigator.onLine)throw new Error('Grounded model is offline.');
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
      return result;
    }finally{
      clearTimeout(timeout);
      signal?.removeEventListener?.('abort',abort);
    }
  }

  function refresh(){
    const core=globalThis.FilamentInventoryLLM;
    if(!core)return false;
    const enabled=validKey(readKey());
    core.setTransport(enabled?transport:null);
    document.dispatchEvent(new CustomEvent('fi:llm-transport',{detail:{enabled,online:navigator.onLine}}));
    return enabled;
  }

  function init(){
    if(!globalThis.FilamentInventoryLLM){setTimeout(init,25);return;}
    refresh();
    window.addEventListener('online',refresh);
    window.addEventListener('offline',refresh);
    window.addEventListener('focus',refresh);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});
    globalThis.FilamentInventoryLLMTransport=Object.freeze({refresh,configured:()=>validKey(readKey())});
  }

  init();
})();
