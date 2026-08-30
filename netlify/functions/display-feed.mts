import type { Config } from '@netlify/functions';
import { getDeployStore, getStore } from '@netlify/blobs';
import { buildDisplayFeed, type InventoryEnvelope } from '../lib/display-feed.mts';

declare const Netlify: any;

const STORE_NAME = 'filament-inventory-sync';

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

export default async (req: Request) => {
  if (req.method !== 'GET') {
    return json({ok:false, error:'Method not allowed.'}, 405, {Allow:'GET'});
  }

  const store = blobStore();
  const listed = await store.list({prefix:'inventory-'});
  const envelopes: InventoryEnvelope[] = [];

  for (const item of listed.blobs) {
    const envelope = await store.get(item.key, {type:'json'});
    if (!envelope?.state || !Array.isArray(envelope.state.spools)) continue;
    envelopes.push({
      key:item.key,
      updatedAt:String(envelope.updatedAt || ''),
      state:envelope.state,
    });
  }

  return json(buildDisplayFeed(envelopes, new Date()));
};

export const config: Config = {
  path:'/api/display-feed',
  rateLimit:{windowLimit:60, windowSize:60, aggregateBy:['ip','domain']},
};
