import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { createHash, randomBytes } from 'node:crypto';

declare const Netlify: any;

const STORE_NAME = 'filament-inventory-sync';
const KEY_HEADER = 'x-filament-sync-key';
const PROFILE_HEADER = 'x-filament-profile';
const MAX_BODY_BYTES = 32_000;
const MAX_ACTIVITY = 24;
const MAX_DEVICES = 16;

type Device = { id:string; name:string };
type DeviceActivity = { id:string; name:string; lastSeenAt:string; lastAction:string };
type Activity = { at:string; deviceId:string; deviceName:string; type:string; summary:string };

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(data, { status, headers:{ 'Cache-Control':'no-store', 'Content-Type':'application/json; charset=utf-8', ...headers } });
}

function isProduction(): boolean {
  return Netlify.context?.deploy?.context === 'production';
}

function validOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  return !origin || origin === new URL(req.url).origin;
}

function syncKey(req: Request): string | null {
  const key = String(req.headers.get(KEY_HEADER) || '').trim();
  return /^[A-Za-z0-9_-]{32,128}$/.test(key) ? key : null;
}

function profile(req: Request): 'Bill' | 'Aimee' | null {
  const value = String(req.headers.get(PROFILE_HEADER) || '').trim();
  return value === 'Bill' || value === 'Aimee' ? value : null;
}

function hashKey(key: string, owner: 'Bill' | 'Aimee'): string {
  return createHash('sha256').update(`${owner.toLowerCase()}:${key}`).digest('hex');
}

function stateKey(hash: string): string {
  return `inventory-${hash}`;
}

function snapshotPrefix(hash: string): string {
  return `snapshot-${hash}-`;
}

function revision(): string {
  return randomBytes(6).toString('hex');
}

function sanitizeDevice(value: any): Device {
  const id = String(value?.id || '').replace(/[^A-Za-z0-9_-]/g,'').slice(0,64) || 'unknown';
  const name = String(value?.name || 'Device').trim().slice(0,60) || 'Device';
  return {id, name};
}

function timestamp(value: unknown): number {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function updateDevices(devices: DeviceActivity[], device: Device, action: string, at: string): DeviceActivity[] {
  const map = new Map<string,DeviceActivity>();
  for (const row of Array.isArray(devices) ? devices : []) if (row?.id) map.set(String(row.id), row);
  map.set(device.id, {id:device.id, name:device.name, lastSeenAt:at, lastAction:action});
  return [...map.values()].sort((a,b) => timestamp(b.lastSeenAt) - timestamp(a.lastSeenAt)).slice(0, MAX_DEVICES);
}

function addActivity(activity: Activity[], device: Device, type: string, summary: string, at: string): Activity[] {
  const row:Activity = {at, deviceId:device.id, deviceName:device.name, type, summary:summary.slice(0,120)};
  return [row, ...(Array.isArray(activity) ? activity : [])].slice(0, MAX_ACTIVITY);
}

function publicMeta(envelope: any) {
  return {
    revision:String(envelope?.revision || ''),
    updatedAt:envelope?.updatedAt || null,
    devices:Array.isArray(envelope?.devices) ? envelope.devices : [],
    activity:Array.isArray(envelope?.activity) ? envelope.activity : [],
  };
}

async function listSnapshotKeys(store: ReturnType<typeof getStore>, hash: string) {
  const listed = await store.list({prefix:snapshotPrefix(hash)});
  return listed.blobs.map(item => item.key);
}

async function copySnapshots(store: ReturnType<typeof getStore>, oldHash: string, newHash: string) {
  const oldPrefix = snapshotPrefix(oldHash);
  const newPrefix = snapshotPrefix(newHash);
  const keys = await listSnapshotKeys(store, oldHash);
  for (const key of keys) {
    const payload = await store.get(key, {type:'json'});
    if (payload) await store.setJSON(`${newPrefix}${key.slice(oldPrefix.length)}`, payload);
  }
  return keys;
}

async function deleteCloudScope(store: ReturnType<typeof getStore>, hash: string, snapshotKeys?: string[]) {
  const keys = snapshotKeys || await listSnapshotKeys(store, hash);
  for (const key of keys) await store.delete(key);
  await store.delete(stateKey(hash));
  return keys.length;
}

export default async (req: Request) => {
  if (!isProduction()) return json({ok:false, error:'Cloud security controls are available only on the production site.'}, 403);
  if (!validOrigin(req)) return json({ok:false, error:'Invalid request origin.'}, 403);
  if (req.method !== 'POST') return json({ok:false, error:'Method not allowed.'}, 405, {Allow:'POST'});

  const key = syncKey(req);
  if (!key) return json({ok:false, error:'A valid private sync key is required.'}, 401);
  const owner = profile(req);
  if (!owner) return json({ok:false, error:'A valid inventory profile is required.'}, 400);

  const length = Number(req.headers.get('content-length') || 0);
  if (length > MAX_BODY_BYTES) return json({ok:false, error:'Security request is too large.'}, 413);

  let body:any;
  try { body = await req.json(); }
  catch { return json({ok:false, error:'Invalid JSON body.'}, 400); }

  const action = String(body?.action || '');
  const device = sanitizeDevice(body?.device);
  const oldHash = hashKey(key, owner);
  const store = getStore(STORE_NAME, {consistency:'strong'});
  const current = await store.get(stateKey(oldHash), {type:'json'});

  if (action === 'rotate') {
    if (!current?.state || !Array.isArray(current.state.spools)) return json({ok:false, error:'The current cloud inventory was not found.'}, 404);
    const newHash = String(body?.newKeyHash || '').trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(newHash)) return json({ok:false, error:'A valid new key hash is required.'}, 400);
    if (newHash === oldHash) return json({ok:false, error:'The new sync key must be different from the old key.'}, 400);

    const collision = await store.get(stateKey(newHash), {type:'json'});
    if (collision) return json({ok:false, error:'A cloud inventory already exists for the new key. Generate another key and retry.'}, 409);

    const at = new Date().toISOString();
    const rotated = {
      ...current,
      protocol:6,
      revision:revision(),
      updatedAt:at,
      devices:updateDevices(current.devices, device, 'key-rotate', at),
      activity:addActivity(current.activity, device, 'key-rotate', 'Rotated the sync key and revoked the previous key.', at),
    };

    const oldSnapshotKeys = await copySnapshots(store, oldHash, newHash);
    await store.setJSON(stateKey(newHash), rotated);
    const verify = await store.get(stateKey(newHash), {type:'json'});
    if (!verify?.state) return json({ok:false, error:'The new cloud key could not be verified. The old key remains active.'}, 500);

    await deleteCloudScope(store, oldHash, oldSnapshotKeys);
    return json({ok:true, rotated:true, meta:publicMeta(rotated)});
  }

  if (action === 'wipe') {
    if (!current) {
      const removedSnapshots = await deleteCloudScope(store, oldHash);
      return json({ok:true, deleted:true, removedSnapshots, existed:false});
    }
    const removedSnapshots = await deleteCloudScope(store, oldHash);
    return json({ok:true, deleted:true, removedSnapshots, existed:true});
  }

  return json({ok:false, error:'Unknown security action.'}, 400);
};

export const config: Config = {
  path:'/api/sync-admin',
  rateLimit:{windowLimit:10, windowSize:60, aggregateBy:['ip','domain']},
};
