import type { Config, Context } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { buildDeviceFeedV1, type InventoryEnvelope } from '../lib/device-feed-v1.mts';

const ALLOWED_PROFILES = new Set(['Bill', 'Aimee']);

function json(body:unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store',
      'x-content-type-options':'nosniff',
    },
  });
}

function authorized(request:Request) {
  const configured = String(process.env.FILAMENT_SYNC_KEY || '').trim();
  const supplied = String(request.headers.get('x-filament-sync-key') || '').trim();
  return Boolean(configured && supplied && configured === supplied);
}

function profileFrom(request:Request) {
  const profile = String(request.headers.get('x-filament-profile') || '').trim();
  return ALLOWED_PROFILES.has(profile) ? profile : null;
}

export default async (request:Request, context:Context) => {
  if (request.method !== 'GET') return json({ok:false,error:'Method not allowed.'}, 405);
  if (!authorized(request)) return json({ok:false,error:'A valid private sync key is required.'}, 401);

  const profile = profileFrom(request);
  if (!profile) return json({ok:false,error:'A valid profile scope is required.'}, 400);

  const store = getStore({name:'filament-inventory', siteID:context.site?.id});
  const key = `inventory-${profile.toLowerCase()}`;
  const envelope = await store.get(key, {type:'json'}) as InventoryEnvelope | null;
  if (!envelope || typeof envelope !== 'object') {
    return json({
      schemaVersion:1,
      generatedAt:new Date().toISOString(),
      scope:{type:'profile',id:profile},
      freshness:{sourceUpdatedAt:null,ageSeconds:null,stale:true},
      inventory:{status:'unavailable',spools:[]},
      readiness:{state:'Undetermined',reason:'No authoritative Filament Inventory state is available for this profile.',requiredGrams:null},
      unknowns:['Inventory unavailable','Print readiness undetermined'],
      attention:[{kind:'inventory-unavailable',message:'Filament Inventory has no authoritative state for this profile.'}],
    }, 200);
  }

  return json(buildDeviceFeedV1({...envelope,key}, profile));
};

export const config:Config = {path:'/api/device-feed/v1'};
