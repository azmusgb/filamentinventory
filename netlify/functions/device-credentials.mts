import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { randomBytes } from 'node:crypto';
import {
  DEVICE_CREDENTIAL_SCOPE,
  MAX_DEVICE_CREDENTIALS,
  deviceCredentialIndexKey,
  deviceCredentialKey,
  hashDeviceToken,
  inventoryKeyForScope,
  publicCredential,
  sanitizeDevice,
  scopeHash,
  type DeviceCredentialIndexRow,
  type DeviceCredentialRecord,
} from '../lib/device-credential.mts';

declare const Netlify:any;

const STORE_NAME = 'filament-inventory-sync';
const KEY_HEADER = 'x-filament-sync-key';
const PROFILE_HEADER = 'x-filament-profile';
const MAX_BODY_BYTES = 16_000;

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

function isProduction() {
  return Netlify.context?.deploy?.context === 'production';
}

function validOrigin(req:Request) {
  const origin = req.headers.get('origin');
  return !origin || origin === new URL(req.url).origin;
}

function syncKey(req:Request):string|null {
  const key = String(req.headers.get(KEY_HEADER) || '').trim();
  return /^[A-Za-z0-9_-]{32,128}$/.test(key) ? key : null;
}

function profile(req:Request):'Bill'|'Aimee'|null {
  const value = String(req.headers.get(PROFILE_HEADER) || '').trim();
  return value === 'Bill' || value === 'Aimee' ? value : null;
}

function newToken():string {
  return `fi_dev_${randomBytes(32).toString('base64url')}`;
}

function newCredentialId():string {
  return randomBytes(10).toString('hex');
}

async function readIndex(store:any, scope:string):Promise<DeviceCredentialIndexRow[]> {
  const raw = await store.get(deviceCredentialIndexKey(scope), {type:'json'});
  return Array.isArray(raw) ? raw.filter(Boolean).slice(0, MAX_DEVICE_CREDENTIALS) : [];
}

export default async (req:Request) => {
  if (!isProduction()) {
    return json({ok:false,error:'Device credential management is available only on the production site.'}, 403);
  }
  if (!validOrigin(req)) return json({ok:false,error:'Invalid request origin.'}, 403);
  if (req.method !== 'POST') return json({ok:false,error:'Method not allowed.'}, 405, {Allow:'POST'});

  const key = syncKey(req);
  if (!key) return json({ok:false,error:'A valid private sync key is required.'}, 401);
  const owner = profile(req);
  if (!owner) return json({ok:false,error:'A valid inventory profile is required.'}, 400);

  const length = Number(req.headers.get('content-length') || 0);
  if (length > MAX_BODY_BYTES) return json({ok:false,error:'Device credential request is too large.'}, 413);

  let body:any;
  try { body = await req.json(); }
  catch { return json({ok:false,error:'Invalid JSON body.'}, 400); }

  const store = getStore(STORE_NAME, {consistency:'strong'});
  const scope = scopeHash(key, owner);
  const inventoryKey = inventoryKeyForScope(scope);
  const inventory = await store.get(inventoryKey, {type:'json'});
  if (!inventory?.state || !Array.isArray(inventory.state.spools)) {
    return json({ok:false,error:'The current cloud inventory was not found for this profile.'}, 404);
  }

  const action = String(body?.action || '').trim();
  const current = await readIndex(store, scope);

  if (action === 'list') {
    return json({ok:true,credentials:current.map(publicCredential)});
  }

  if (action === 'issue') {
    if (current.length >= MAX_DEVICE_CREDENTIALS) {
      return json({ok:false,error:'Device credential limit reached. Revoke an unused device before adding another.'}, 409);
    }
    const device = sanitizeDevice(body?.device);
    const token = newToken();
    const tokenHash = hashDeviceToken(token);
    const createdAt = new Date().toISOString();
    const credentialId = newCredentialId();

    const record:DeviceCredentialRecord = {
      schemaVersion:1,
      credentialId,
      tokenHash,
      scope:DEVICE_CREDENTIAL_SCOPE,
      profile:owner,
      inventoryKey,
      deviceId:device.id,
      deviceName:device.name,
      createdAt,
    };
    const row:DeviceCredentialIndexRow = {
      credentialId,
      tokenHash,
      deviceId:device.id,
      deviceName:device.name,
      createdAt,
    };

    await store.setJSON(deviceCredentialKey(tokenHash), record);
    await store.setJSON(deviceCredentialIndexKey(scope), [row, ...current]);

    // Raw token is returned exactly once. Only its SHA-256 hash is persisted.
    return json({
      ok:true,
      token,
      credential:publicCredential(row),
      warning:'Save this device token now. It cannot be retrieved again.',
    }, 201);
  }

  if (action === 'revoke') {
    const credentialId = String(body?.credentialId || '').trim();
    if (!credentialId) return json({ok:false,error:'credentialId is required.'}, 400);
    const row = current.find(item => item.credentialId === credentialId);
    if (!row) return json({ok:false,error:'Device credential was not found.'}, 404);

    await store.delete(deviceCredentialKey(row.tokenHash));
    const remaining = current.filter(item => item.credentialId !== credentialId);
    if (remaining.length) await store.setJSON(deviceCredentialIndexKey(scope), remaining);
    else await store.delete(deviceCredentialIndexKey(scope));

    return json({ok:true,revoked:true,credentialId});
  }

  return json({ok:false,error:'Unknown device credential action.'}, 400);
};

export const config:Config = {
  path:'/api/device-credentials',
  rateLimit:{windowLimit:20,windowSize:60,aggregateBy:['ip','domain']},
};
