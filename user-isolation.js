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
  const STARTER_BILL_SPOOLS=Object.freeze([
    {id:'F01',brand:'ELEGOO',material:'Rapid PETG',colorName:'Brown / Tan',colorHex:'#8b5e3c',spoolType:'Cardboard',startWeight:1000,visualPercent:15,gross:null,tare:null,location:'Floor audit',confidence:'High',notes:'Label visible: ELEGOO Rapid PETG. Visual fill estimate only.'},
    {id:'F02',brand:'Inland',material:'Unknown',colorName:'Light Blue',colorHex:'#8fd3ff',spoolType:'Cardboard',startWeight:1000,visualPercent:null,gross:null,tare:null,location:'Floor audit',confidence:'High',notes:'Inland brand visible; exact subtype and remaining amount not readable from photo.'},
    {id:'F03',brand:'Probable Inland',material:'Probable PLA+ refill',colorName:'Neon Green',colorHex:'#7cff57',spoolType:'Spoolless / refill',startWeight:1000,visualPercent:90,gross:null,tare:null,location:'Floor audit',confidence:'Medium',notes:'Exposed refill; tightly wound. Brand/type inferred from purchase history, not confirmed on label.'},
    {id:'F04',brand:'Unknown',material:'Unknown',colorName:'Tan / Natural',colorHex:'#c9a675',spoolType:'Cardboard',startWeight:1000,visualPercent:10,gross:null,tare:null,location:'Floor audit',confidence:'Low',notes:'Very small visible remnant.'},
    {id:'F05',brand:'Polymaker',material:'Probable PLA Pro',colorName:'Light Yellow / Cream',colorHex:'#f3d779',spoolType:'Cardboard',startWeight:1000,visualPercent:null,gross:null,tare:null,location:'Floor audit',confidence:'Medium',notes:'Polymaker branding visible; exact line likely PLA Pro based on purchase history.'},
    {id:'F06',brand:'Inland',material:'High Speed PLA+',colorName:'Green',colorHex:'#2f7d4a',spoolType:'Cardboard',startWeight:1000,visualPercent:null,gross:null,tare:null,location:'Floor audit',confidence:'High',notes:'High Speed PLA+ label visible.'},
    {id:'F07',brand:'Probable Inland',material:'Probable PLA+ refill',colorName:'Bright Orange',colorHex:'#ff5a1f',spoolType:'Spoolless / refill',startWeight:1000,visualPercent:85,gross:null,tare:null,location:'Floor audit',confidence:'Medium',notes:'Exposed refill. Brand/type inferred rather than label-confirmed.'},
    {id:'F08',brand:'Inland',material:'ABS Fiber / ABS-GF',colorName:'Green / Teal',colorHex:'#12806e',spoolType:'Cardboard',startWeight:1000,visualPercent:null,gross:null,tare:null,location:'Floor audit',confidence:'High',notes:'ABS fiber family label visible.'},
    {id:'F09',brand:'Unknown',material:'Unknown',colorName:'Brown / Bronze',colorHex:'#7c5a3a',spoolType:'Plastic',startWeight:1000,visualPercent:15,gross:null,tare:null,location:'Floor audit',confidence:'Medium',notes:'Clear plastic spool with a small amount remaining.'},
    {id:'F10',brand:'Inland',material:'Unknown',colorName:'Light Blue',colorHex:'#9fdcf8',spoolType:'Cardboard',startWeight:1000,visualPercent:null,gross:null,tare:null,location:'Floor audit',confidence:'High',notes:'Inland brand visible; subtype and fill amount not determinable.'},
    {id:'F11',brand:'Inland',material:'Silk PLA',colorName:'Gold',colorHex:'#c79a35',spoolType:'Cardboard',startWeight:1000,visualPercent:null,gross:null,tare:null,location:'Floor audit',confidence:'High',notes:'Silk PLA label visible.'},
    {id:'F12',brand:'Inland',material:'PLA / Basic PLA',colorName:'Dark Green',colorHex:'#184f37',spoolType:'Cardboard',startWeight:1000,visualPercent:null,gross:null,tare:null,location:'Floor audit',confidence:'High',notes:'PLA/basic PLA family visible.'},
    {id:'F13',brand:'Overture',material:'PLA',colorName:'Orange',colorHex:'#ea6a22',spoolType:'Cardboard',startWeight:1000,visualPercent:null,gross:null,tare:null,location:'Floor audit',confidence:'High',notes:'Overture PLA branding visible.'},
    {id:'F14',brand:'Inland',material:'PLA+',colorName:'Cream / Tan',colorHex:'#e8d8b3',spoolType:'Cardboard',startWeight:1000,visualPercent:null,gross:null,tare:null,location:'Floor audit',confidence:'High',notes:'PLA+ type visible.'},
    {id:'F15',brand:'Inland',material:'PETG+',colorName:'Natural / Off White',colorHex:'#e8e3d8',spoolType:'Cardboard',startWeight:1000,visualPercent:null,gross:null,tare:null,location:'Floor audit',confidence:'High',notes:'PETG+ label visible.'},
    {id:'F16',brand:'Cookiecad',material:'PLA',colorName:'Pink / Blue / Purple Gradient',colorHex:'#b35bd8',spoolType:'Plastic',startWeight:1000,visualPercent:25,gross:null,tare:null,location:'Floor audit',confidence:'High',notes:'Cookiecad brand visible on clear spool. Visual fill estimate only.'},
    {id:'F17',brand:'Inland',material:'PLA',colorName:'Purple / Magenta',colorHex:'#9b4bb5',spoolType:'Cardboard',startWeight:1000,visualPercent:null,gross:null,tare:null,location:'Floor audit',confidence:'High',notes:'PLA type visible.'},
    {id:'F18',brand:'ELEGOO',material:'Sparkle PLA',colorName:'Yellow / Gold',colorHex:'#e3b422',spoolType:'Cardboard',startWeight:1000,visualPercent:null,gross:null,tare:null,location:'Floor audit',confidence:'High',notes:'ELEGOO Sparkle PLA label visible.'},
    {id:'C01',brand:'Inland',material:'PLA+',colorName:'Purple',colorHex:'#6f3ba5',spoolType:'Cardboard',startWeight:1000,visualPercent:65,gross:null,tare:null,location:'Close-up set',confidence:'Confirmed',notes:'Confirmed directly from close-up label photo.'},
    {id:'C02',brand:'Inland',material:'TPU',colorName:'Translucent Blue',colorHex:'#1673c8',spoolType:'Cardboard',startWeight:1000,visualPercent:40,gross:null,tare:null,location:'Close-up set',confidence:'Confirmed',notes:'Confirmed directly from close-up label photo.'},
    {id:'C03',brand:'Inland',material:'PLA+',colorName:'Black',colorHex:'#111827',spoolType:'Cardboard',startWeight:1000,visualPercent:50,gross:null,tare:null,location:'Close-up set',confidence:'Confirmed',notes:'Confirmed directly from close-up label photo.'}
  ]);

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
    const legacy=input&&Array.isArray(input.spools)?input:{spools:[],weighLog:[],auditLog:[],printJobs:[],tombstones:{},meta:{}};
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
      const printJobs=(legacy.printJobs||[]).filter(row=>ids.has(lowerId(row?.spoolId)));
      const tombstones={};
      for(const [idRaw,when] of Object.entries(legacy.tombstones||{})){const id=lowerId(idRaw);const tombOwner=spoolOwners.get(id)||deletedOwners.get(id)||'Bill';if(id&&tombOwner===owner)tombstones[id]=when;}
      states[owner]={...legacy,version:Math.max(Number(legacy.version)||0,schemaVersion),profile:owner,savedAt:at,meta:{...(legacy.meta||{}),userIsolationMigratedAt:at},spools,weighLog,auditLog,printJobs,tombstones};
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
    const printJobs=(Array.isArray(input.printJobs)?input.printJobs:[]).filter(row=>ids.has(lowerId(row?.spoolId)));
    return {...input,version:Math.max(Number(input.version)||0,schemaVersion),profile:current,spools:allowedSpools,weighLog,auditLog,printJobs};
  }

  function emptyState(owner,schemaVersion=10,{at=nowIso(),meta={}}={}){return {version:schemaVersion,profile:normalizeOwner(owner),savedAt:at,meta,spools:[],weighLog:[],auditLog:[],printJobs:[],tombstones:{}};}

  function starterState(owner='Bill',schemaVersion=10,{at=nowIso()}={}){
    const current=normalizeOwner(owner);
    if(current!=='Bill')return emptyState(current,schemaVersion,{at});
    return {
      ...emptyState(current,schemaVersion,{at,meta:{starterInventory:true,starterInventorySeededAt:at}}),
      spools:STARTER_BILL_SPOOLS.map(spool=>({...spool,owner:'Bill',opened:'Unknown',bagged:'Unknown',purchaseSource:'',purchasePrice:null,purchaseDate:'',reorderThreshold:250,lastDriedDate:'',createdAt:null,updatedAt:null,archivedAt:null})),
    };
  }

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

    const repairMissingProfileStates=()=>{
      for(const owner of OWNERS){
        const inventoryKey=physicalKey(owner,INVENTORY_KEY);
        if(nativeGet.call(storage,inventoryKey)!==null)continue;
        const profileSyncKey=String(nativeGet.call(storage,physicalKey(owner,SYNC_KEY))||'').trim();
        const state=owner==='Bill'&&!profileSyncKey
          ? starterState(owner,schemaVersion)
          : emptyState(owner,schemaVersion,{meta:profileSyncKey?{awaitingCloudBootstrap:true}:{}});
        nativeSet.call(storage,inventoryKey,JSON.stringify(state));
      }
    };
    repairMissingProfileStates();

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

  const api={OWNERS,INVENTORY_KEY,CURRENT_USER_KEY,SYNC_KEY,SYNC_SETTINGS_KEY,MIGRATION_KEY,USER_PREFIX,STARTER_BILL_SPOOLS,normalizeOwner,physicalKey,splitLegacyState,enforceUserState,emptyState,starterState,install};
  return api;
});