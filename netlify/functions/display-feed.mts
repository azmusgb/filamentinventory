import type { Config } from '@netlify/functions';
import { getDeployStore, getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';
import { buildDisplayFeed, type InventoryEnvelope } from '../lib/display-feed.mts';

declare const Netlify: any;

const STORE_NAME = 'filament-inventory-sync';
const KEY_HEADER = 'x-filament-sync-key';
const PROFILE_HEADER = 'x-filament-profile';

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(data, {
    status,
    headers:{
      'Cache-Control':'no-store',
      'Content-Type':'application/json; charset=utf-8',
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

function syncKey(req: Request): string | null {
  const key = String(req.headers.get(KEY_HEADER) || '').trim();
  return /^[A-Za-z0-9_-]{32,128}$/.test(key) ? key : null;
}

function profile(req: Request): 'Bill' | 'Aimee' | null {
  const value = String(req.headers.get(PROFILE_HEADER) || '').trim();
  return value === 'Bill' || value === 'Aimee' ? value : null;
}

function stateKey(key: string, owner: 'Bill' | 'Aimee'): string {
  const hash = createHash('sha256')
    .update(`${owner.toLowerCase()}:${key}`)
    .digest('hex');
  return `inventory-${hash}`;
}

export default async (req: Request) => {
  if (req.method !== 'GET') {
    return json({ok:false, error:'Method not allowed.'}, 405, {Allow:'GET'});
  }

  const key = syncKey(req);
  if (!key) {
    return json({ok:false, error:'A valid private sync key is required.'}, 401);
  }

  const owner = profile(req);
  if (!owner) {
    return json({ok:false, error:'A valid inventory profile is required.'}, 400);
  }

  const store = blobStore();
  const keyName = stateKey(key, owner);
  const envelope = await store.get(keyName, {type:'json'});

  // Do not enumerate inventory-* blobs or aggregate multiple private profiles.
  // A valid credential pair resolves exactly one existing cloud scope.
  if (!envelope?.state || !Array.isArray(envelope.state.spools)) {
    return json({ok:false, error:'Inventory feed is unavailable.'}, 404);
  }

  const source: InventoryEnvelope = {
    key:keyName,
    updatedAt:String(envelope.updatedAt || ''),
    state:envelope.state,
  };

  return json(buildDisplayFeed([source], new Date()));
};

export const config: Config = {
  path:'/api/display-feed',
  rateLimit:{windowLimit:60, windowSize:60, aggregateBy:['ip','domain']},
};
