(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root){root.FilamentInventoryUsers=api;if(root.document&&root.localStorage&&root.Storage)api.install(root);}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const OWNERS=Object.freeze(['Bill','Aimee']);
  const INVENTORY_KEY='filament-inventory-v1';
  const CURRENT_USER_KEY='filament-current-user-v1';
  const SYNC_KEY='filament-sync-key-v1';
  const SYNC_SETTINGS_KEY='filament-sync-settings-v1';
  const MIGRATION_KEY='filament-user-isolation-v1';
  const USER_PREFIX='filament-user-v1';

  const normalizeOwner=value=>OWNERS.includes(String(value))?String(value):'Bill';
  const strictOwner=value=>OWNERS.includes(String(value))?String(value):null;
  const lowerId=value=>String(value||'').trim().toLowerCase();
  const nowIso=()=>new Date().toISOString();
  const parse=(text,fallback=null)=>{try{return JSON.parse(text);}catch{return fallback;}};

  function physicalKey(owner,logicalKey){
    const slug=normalizeOwner(owner).toLowerCase();
    if(logicalKey===INVENTORY_KEY)return `${USER_PREFIX}:${slug}:inventory`;
    if(logicalKey===SYNC_KEY)return `${USER_PREFIX}:${slug}:sync-key`;
    if(logicalKey===SYNC_SETTINGS_KEY)return `${USER_PREFIX}:${slug}:sync-settings`;
    return logicalKey;
  }

  function ownerForAudit(row,spoolOwners){
    return strictOwner(row?.owner)||strictOwner(row?.actor)||spoolOwners.get(lowerId(row?.spoolId))||null;
  }

  function splitLegacyState(input,{schemaVersion=10,at=nowIso()}={}){
    const legacy=input&&Array.isArray(input.spools)?input:{spools:[],weighLog:[],auditLog:[],tombstones:{},meta:{}};
    const states={};
    const spoolOwners=new Map();
    const deletedOwners=new Map();
    for(const spool of legacy.spools||[]){const id=lowerId(spool?.id);const owner=strictOwner(spool?.owner)||'Bill';if(id)spoolOwners.set(id,owner);}
    for(const row of legacy.auditLog||[]){const id=lowerId(row?.spoolId);const owner=strictOwner(row?.owner)||strictOwner(row?.actor)||spoolOwners.get(id)||null;if(id&&owner)deletedOwners.set(id,owner);}
    for(const owner of OWNERS){
      const spools=(legacy.spools||[]).filter(spool=>(strictOwner(spool?.owner)||'Bill')===owner).map(spool=>({...spool,owner}));
      const ids=new Set(spools.map(spool=>lowerId(spool.id)).filter(Boolean));
      const weighLog=(legacy.weighLog||[]).filter(row=>{const id=lowerId(row?.id);return (spoolOwners.get(id)||deletedOwners.get(id)||'Bill')===owner;});
      const auditLog=(legacy.auditLog||[]).filter(row=>(ownerForAudit(row,spoolOwners)||'Bill')===owner).map(row=>({...row,owner:strictOwner(row?.owner)||owner}));
      const tombstones={};
      for(const [idRaw,when] of Object.entries(legacy.tombstones||{})){const id=lowerId(idRaw);const tombOwner=spoolOwners.get(id)||deletedOwners.get(id)||'Bill';if(id&&tombOwner===owner)tombstones[id]=when;}
      states[owner]={...legacy,version:Math.max(Number(legacy.version)||0,schemaVersion),profile:owner,savedAt:at,meta:{...(legacy.meta||{}),userIsolationMigratedAt:at},spools,weighLog,auditLog,tombstones};
    }
    return states;
  }

  function enforceUserState(input,owner,schemaVersion=10){
    if(!input||!Array.isArray(input.spools))return input;
    const current=normalizeOwner(owner);
    const allowedSpools=input.spools.filter(spool=>{const declared=strictOwner(spool?.owner);return !declared||declared===current;}).map(spool=>({...spool,owner:current}));
    const ids=new Set(allowedSpools.map(spool=>lowerId(spool.id)).filter(Boolean));
    const auditLog=(Array.isArray(input.auditLog)?input.auditLog:[]).filter(row=>{const declared=strictOwner(row?.owner);if(declared)return declared===current;const id=lowerId(row?.spoolId);return !id||ids.has(id)||strictOwner(row?.actor)===current;}).map(row=>({...row,owner:strictOwner(row?.owner)||current}));
    const weighLog=(Array.isArray(input.weighLog)?input.weighLog:[]).filter(row=>ids.has(lowerId(row?.id)));
    return {...input,version:Math.max(Number(input.version)||0,schemaVersion),profile:current,spools:allowedSpools,weighLog,auditLog};
  }

  function emptyState(owner,schemaVersion=10){return {version:schemaVersion,profile:normalizeOwner(owner),savedAt:nowIso(),meta:{},spools:[],weighLog:[],auditLog:[],tombstones:{}};}

  function install(host){
    if(host.__filamentUserIsolationInstalled)return;
    host.__filamentUserIsolationInstalled=true;
    const storage=host.localStorage;
    const proto=host.Storage.prototype;
    const nativeGet=proto.getItem;
    const nativeSet=proto.setItem;
    const nativeRemove=proto.removeItem;
    const schemaVersion=Number(host.FilamentInventoryVersion?.DATA_SCHEMA_VERSION)||10;
    let reloading=false;

    const rawOwner=()=>normalizeOwner(nativeGet.call(storage,CURRENT_USER_KEY));
    const linkedOwner=strictOwner(new URLSearchParams(String(host.location?.hash||'').replace(/^#/,'')).get('filament-user'));
    if(linkedOwner)nativeSet.call(storage,CURRENT_USER_KEY,linkedOwner);

    const migrate=()=>{
      if(nativeGet.call(storage,MIGRATION_KEY))return;
      const legacyState=parse(nativeGet.call(storage,INVENTORY_KEY),null);
      const billKey=physicalKey('Bill',INVENTORY_KEY);
      const aimeeKey=physicalKey('Aimee',INVENTORY_KEY);
      const hasPartition=Boolean(nativeGet.call(storage,billKey)||nativeGet.call(storage,aimeeKey));
      if(!hasPartition&&legacyState?.spools){const split=splitLegacyState(legacyState,{schemaVersion});nativeSet.call(storage,billKey,JSON.stringify(split.Bill));nativeSet.call(storage,aimeeKey,JSON.stringify(split.Aimee));}
      else if(!hasPartition)nativeSet.call(storage,aimeeKey,JSON.stringify(emptyState('Aimee',schemaVersion)));
      const legacySyncKey=nativeGet.call(storage,SYNC_KEY);
      const legacySettings=parse(nativeGet.call(storage,SYNC_SETTINGS_KEY),{});
      for(const profileOwner of OWNERS){
        if(legacySyncKey&&!nativeGet.call(storage,physicalKey(profileOwner,SYNC_KEY)))nativeSet.call(storage,physicalKey(profileOwner,SYNC_KEY),legacySyncKey);
        if(!nativeGet.call(storage,physicalKey(profileOwner,SYNC_SETTINGS_KEY)))nativeSet.call(storage,physicalKey(profileOwner,SYNC_SETTINGS_KEY),JSON.stringify({...legacySettings,enabled:Boolean(legacySyncKey&&legacySettings?.enabled),lastRevision:'',lastSyncedAt:null}));
      }
      nativeRemove.call(storage,INVENTORY_KEY);nativeRemove.call(storage,SYNC_KEY);nativeRemove.call(storage,SYNC_SETTINGS_KEY);
      nativeSet.call(storage,MIGRATION_KEY,JSON.stringify({at:nowIso(),schemaVersion,cloudIsolation:'profile-scoped'}));
    };
    migrate();

    const routed=key=>key===INVENTORY_KEY||key===SYNC_KEY||key===SYNC_SETTINGS_KEY;
    proto.getItem=function(key){if(this===storage&&routed(key))return nativeGet.call(storage,physicalKey(rawOwner(),key));return nativeGet.call(this,key);};
    proto.setItem=function(key,value){
      if(this===storage&&key===CURRENT_USER_KEY){
        const previous=rawOwner();const next=normalizeOwner(value);nativeSet.call(storage,CURRENT_USER_KEY,next);
        if(previous!==next&&!reloading){reloading=true;host.setTimeout(()=>host.location.reload(),0);}return;
      }
      if(this===storage&&routed(key)){
        const target=physicalKey(rawOwner(),key);
        if(key===INVENTORY_KEY){const parsed=parse(String(value),null);value=JSON.stringify(enforceUserState(parsed,rawOwner(),schemaVersion));}
        nativeSet.call(storage,target,value);return;
      }
      nativeSet.call(this,key,value);
    };
    proto.removeItem=function(key){if(this===storage&&routed(key))return nativeRemove.call(storage,physicalKey(rawOwner(),key));return nativeRemove.call(this,key);};

    const applyProfileAttribute=()=>host.document.body?.setAttribute('data-inventory-user',rawOwner());
    if(host.document.readyState==='loading')host.document.addEventListener('DOMContentLoaded',applyProfileAttribute,{once:true});else applyProfileAttribute();

    Object.assign(api,{currentUser:rawOwner,physicalKey:(logicalKey,owner=rawOwner())=>physicalKey(owner,logicalKey),schemaVersion});
  }

  const api={OWNERS,INVENTORY_KEY,CURRENT_USER_KEY,SYNC_KEY,SYNC_SETTINGS_KEY,MIGRATION_KEY,USER_PREFIX,normalizeOwner,physicalKey,splitLegacyState,enforceUserState,emptyState,install};
  return api;
});
