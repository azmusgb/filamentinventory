import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import {
  DEVICE_CREDENTIAL_SCOPE,
  deviceCredentialKey,
  hashDeviceToken,
  validDeviceToken,
  type DeviceCredentialRecord,
} from '../lib/device-credential.mts';
import { buildDeviceFeedV1, type InventoryEnvelope } from '../lib/device-feed-v1.mts';

const STORE_NAME = 'filament-inventory-sync';

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

function bearerToken(req:Request):string|null {
  const value = String(req.headers.get('authorization') || '').trim();
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match ? validDeviceToken(match[1]) : null;
}

function validCredential(value:any):value is DeviceCredentialRecord {
  return Boolean(
    value &&
    value.schemaVersion === 1 &&
    value.scope === DEVICE_CREDENTIAL_SCOPE &&
    (value.profile === 'Bill' || value.profile === 'Aimee') &&
    /^inventory-[0-9a-f]{64}$/.test(String(value.inventoryKey || '')) &&
    /^[0-9a-f]{64}$/.test(String(value.tokenHash || '')) &&
    String(value.credentialId || '').trim()
  );
}

function serviceUnavailable(message:string) {
  return json({ok:false,error:message}, 503, {'Retry-After':'5'});
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

  const token = bearerToken(req);
  if (!token) {
    return json({ok:false,error:'A valid device-scoped bearer credential is required.'}, 401, {
      'WWW-Authenticate':'Bearer realm="Filament Inventory device feed"',
    });
  }

  const tokenHash = hashDeviceToken(token);
  const store = getStore(STORE_NAME, {consistency:'strong'});
  let credential:any;
  try {
    credential = await store.get(deviceCredentialKey(tokenHash), {type:'json'});
  } catch (error) {
    console.error('device-feed credential lookup failed', error);
    return serviceUnavailable('Device credential verification is temporarily unavailable.');
  }

  if (!validCredential(credential) || credential.tokenHash !== tokenHash) {
    return json({ok:false,error:'Device credential is invalid or revoked.'}, 401, {
      'WWW-Authenticate':'Bearer realm="Filament Inventory device feed"',
    });
  }

  // A device token resolves exactly one read-only private inventory scope. The
  // WS350 never receives the broader browser sync key and cannot select another
  // member/profile by changing request headers.
  let envelope:any;
  try {
    envelope = await store.get(credential.inventoryKey, {type:'json'});
  } catch (error) {
    console.error('device-feed inventory lookup failed', error);
    return serviceUnavailable('Inventory data is temporarily unavailable.');
  }
  if (!envelope?.state || !Array.isArray(envelope.state.spools)) {
    return json(unavailable(credential.profile));
  }

  const source:InventoryEnvelope = {
    key:credential.inventoryKey,
    updatedAt:String(envelope.updatedAt || ''),
    state:envelope.state,
  };
  return json(buildDeviceFeedV1(source, credential.profile, new Date()));
};

export const config:Config = {
  path:'/api/device-feed/v1',
  rateLimit:{windowLimit:60,windowSize:60,aggregateBy:['ip','domain']},
};
