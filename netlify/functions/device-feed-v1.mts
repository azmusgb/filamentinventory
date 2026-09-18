import type { Config } from '@netlify/functions';
import { getDeployStore, getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';
import { buildDeviceFeedV1, type InventoryEnvelope } from '../lib/device-feed-v1.mts';

declare const Netlify: any;

const STORE_NAME = 'filament-inventory-sync';
const KEY_HEADER = 'x-filament-sync-key';
const PROFILE_HEADER = 'x-filament-profile';

function json(data:unknown, status = 200, headers:HeadersInit = {}) {
  return Response.json(data, {
    status,
    headers:{
      'Cache-Control':'no-store',
      'Content-Type':'application/json; charset=utf-8',
      'X-Content-Type-Options':'nosniff',
      ...headers,
    },
  });
}

function blobStore() {
  if (Netlify.context?.deploy?.context === 'production') {
    return getStore(STORE_NAME, {consistency:'strong'});
  }
  return getDeployStore(STORE_NAME);
}

function syncKey(req:Request):string|null {
  const key = String(req.headers.get(KEY_HEADER) || '').trim();
  return /^[A-Za-z0-9_-]{32,128}$/.test(key) ? key : null;
}

function profile(req:Request):'Bill'|'Aimee'|null {
  const value = String(req.headers.get(PROFILE_HEADER) || '').trim();
  return value === 'Bill' || value === 'Aimee' ? value : null;
}

function stateKey(key:string, owner:'Bill'|'Aimee'):string {
  const hash = createHash('sha256')
    .update(`${owner.toLowerCase()}:${key}`)
    .digest('hex');
  return `inventory-${hash}`;
}

function unavailable(owner:'Bill'|'Aimee') {
  return {
    schemaVersion:1,
    generatedAt:new Date().toISOString(),
    scope:{type:'profile' as const,id:owner},
    freshness:{sourceUpdatedAt:null,ageSeconds:null,stale:true},
    inventory:{status:'unavailable' as const,spools:[]},
    readiness:{state:'Undetermined' as const,reason:'No authoritative Filament Inventory state is available for this profile.',requiredGrams:null},
    unknowns:['Inventory unavailable','Print readiness undetermined'],
    attention:[{kind:'inventory-unavailable',message:'Filament Inventory has no authoritative state for this profile.'}],
  };
}

export default async (req:Request) => {
  if (req.method !== 'GET') {
    return json({ok:false,error:'Method not allowed.'}, 405, {Allow:'GET'});
  }

  const key = syncKey(req);
  if (!key) return json({ok:false,error:'A valid private sync key is required.'}, 401);

  const owner = profile(req);
  if (!owner) return json({ok:false,error:'A valid inventory profile is required.'}, 400);

  const store = blobStore();
  const keyName = stateKey(key, owner);
  const envelope = await store.get(keyName, {type:'json'});

  // Resolve exactly one credential-derived private profile scope. Never enumerate
  // inventory blobs or aggregate data across member profiles.
  if (!envelope?.state || !Array.isArray(envelope.state.spools)) {
    return json(unavailable(owner));
  }

  const source:InventoryEnvelope = {
    key:keyName,
    updatedAt:String(envelope.updatedAt || ''),
    state:envelope.state,
  };
  return json(buildDeviceFeedV1(source, owner, new Date()));
};

export const config:Config = {
  path:'/api/device-feed/v1',
  rateLimit:{windowLimit:60,windowSize:60,aggregateBy:['ip','domain']},
};
