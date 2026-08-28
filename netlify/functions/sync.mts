import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { createHash, randomBytes } from 'node:crypto';
import { reconcileConcurrentState } from '../lib/sync-reconcile.mts';

declare const Netlify: any;

const STORE_NAME = 'filament-inventory-sync';
const MAX_SPOOLS = 5000;
const MAX_LOGS = 5000;
const MAX_AUDIT = 1500;
const MAX_PRINT_JOBS = 250;
const MAX_BODY_BYTES = 2_000_000;
const MAX_SNAPSHOTS = 12;
const MAX_ACTIVITY = 24;
const MAX_DEVICES = 16;
const KEY_HEADER = 'x-filament-sync-key';
const PROFILE_HEADER = 'x-filament-profile';

type Device = { id:string; name:string };
type DeviceActivity = { id:string; name:string; lastSeenAt:string; lastAction:string };
type Activity = { at:string; deviceId:string; deviceName:string; type:string; summary:string };
type Envelope = {
  protocol:number;
  revision:string;
  updatedAt:string;
  state:any;
  devices:DeviceActivity[];
  activity:Activity[];
};

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
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(key)) return null;
  return key;
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

function snapshotKey(hash: string, envelope: Envelope): string {
  const stamp = envelope.updatedAt.replace(/[-:.TZ]/g,'').slice(0,14);
  return `${snapshotPrefix(hash)}${stamp}-${envelope.revision}`;
}

function timestamp(value: unknown): number {
  const n = Date.parse(String(value || ''));
  return Number.isFinite(n) ? n : 0;
}

function recordTime(spool: any): number {
  return Math.max(timestamp(spool?.updatedAt), timestamp(spool?.createdAt));
}

function printJobTime(job: any): number {
  return Math.max(
    timestamp(job?.updatedAt),
    timestamp(job?.completedAt),
    timestamp(job?.cancelledAt),
    timestamp(job?.startedAt),
    timestamp(job?.plannedAt),
  );
}

function normalizeTombstones(value: unknown): Record<string,string> {
  const out: Record<string,string> = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [id, at] of Object.entries(value as Record<string,unknown>)) {
    const key = String(id || '').trim().toLowerCase();
    const when = String(at || '');
    if (key && timestamp(when)) out[key] = when;
  }
  return out;
}

function normalizeAuditLog(value: unknown): any[] {
  const map = new Map<string,any>();
  for (const row of Array.isArray(value) ? value : []) {
    const id = String(row?.id || '').trim().slice(0,120);
    const at = String(row?.at || '');
    const type = String(row?.type || '').trim().slice(0,50);
    const summary = String(row?.summary || '').trim().slice(0,240);
    if (!id || !timestamp(at) || !type || !summary) continue;
    const normalized = {
      id, at, type, summary,
      actor:String(row?.actor || 'Unknown').trim().slice(0,40) || 'Unknown',
      device:String(row?.device || '').trim().slice(0,60),
      spoolId:String(row?.spoolId || '').trim().slice(0,64),
      owner:String(row?.owner || '').trim().slice(0,40),
      changes:Array.isArray(row?.changes) ? row.changes.slice(0,12).map((change:any) => ({
        field:String(change?.field || '').trim().slice(0,60),
        from:String(change?.from ?? '').slice(0,120),
        to:String(change?.to ?? '').slice(0,120),
      })).filter((change:any) => change.field) : [],
    };
    const old = map.get(id);
    if (!old || timestamp(at) >= timestamp(old.at)) map.set(id, normalized);
  }
  return [...map.values()].sort((a,b) => timestamp(a.at) - timestamp(b.at)).slice(-MAX_AUDIT);
}

export function normalizePrintJobs(value: unknown): any[] {
  const map = new Map<string,any>();
  for (const raw of Array.isArray(value) ? value : []) {
    const id = String(raw?.id || '').trim().slice(0,120);
    const spoolId = String(raw?.spoolId || '').trim().slice(0,64);
    const plannedAt = String(raw?.plannedAt || '');
    const status = ['planned','in-progress','completed','cancelled'].includes(String(raw?.status)) ? String(raw.status) : 'planned';
    if (!id || !spoolId || !timestamp(plannedAt)) continue;
    const normalized = {
      ...raw,
      id,
      spoolId,
      status,
      jobName:String(raw?.jobName || '').trim().slice(0,100),
      material:String(raw?.material || '').trim().slice(0,80),
      color:String(raw?.color || '').trim().slice(0,80),
      plannedAt,
      updatedAt:String(raw?.updatedAt || raw?.completedAt || raw?.cancelledAt || raw?.startedAt || plannedAt),
    };
    const old = map.get(id);
    if (!old || printJobTime(normalized) >= printJobTime(old)) map.set(id, normalized);
  }
  return [...map.values()]
    .sort((a,b) => printJobTime(a) - printJobTime(b) || String(a.id).localeCompare(String(b.id)))
    .slice(-MAX_PRINT_JOBS);
}

export function mergePrintJobs(remoteValue: unknown, incomingValue: unknown): any[] {
  return normalizePrintJobs([
    ...(Array.isArray(remoteValue) ? remoteValue : []),
    ...(Array.isArray(incomingValue) ? incomingValue : []),
  ]);
}

export function normalizeState(value: any) {
  const spools = Array.isArray(value?.spools) ? value.spools.filter((s:any) => s && String(s.id || '').trim()).slice(0, MAX_SPOOLS) : [];
  const weighLog = Array.isArray(value?.weighLog) ? value.weighLog.filter((x:any) => x && String(x.id || '').trim()).slice(-MAX_LOGS) : [];
  return {
    version:Math.max(Number(value?.version) || 0, 5),
    spools,
    weighLog,
    auditLog:normalizeAuditLog(value?.auditLog),
    printJobs:normalizePrintJobs(value?.printJobs),
    tombstones:normalizeTombstones(value?.tombstones),
  };
}

function revision(): string {
  return randomBytes(6).toString('hex');
}

function sanitizeDevice(value: any): Device {
  const id = String(value?.id || '').replace(/[^A-Za-z0-9_-]/g,'').slice(0,64);
  const name = String(value?.name || 'Device').trim().slice(0,60) || 'Device';
  return { id:id || 'unknown', name };
}

function updateDevices(devices: DeviceActivity[], device: Device, action: string, at: string): DeviceActivity[] {
  const map = new Map<string,DeviceActivity>();
  for (const row of Array.isArray(devices) ? devices : []) {
    if (row?.id) map.set(String(row.id), row);
  }
  map.set(device.id, { id:device.id, name:device.name, lastSeenAt:at, lastAction:action });
  return [...map.values()].sort((a,b) => timestamp(b.lastSeenAt) - timestamp(a.lastSeenAt)).slice(0, MAX_DEVICES);
}

function addActivity(activity: Activity[], device: Device, type: string, summary: string, at: string): Activity[] {
  const row = { at, deviceId:device.id, deviceName:device.name, type, summary:String(summary || '').slice(0,120) };
  return [row, ...(Array.isArray(activity) ? activity : [])].slice(0, MAX_ACTIVITY);
}

function asEnvelope(raw: any): Envelope | null {
  if (!raw) return null;
  if (raw.state && Array.isArray(raw.state.spools)) {
    return {
      protocol:Math.max(Number(raw.protocol) || 0, 5),
      revision:String(raw.revision || revision()),
      updatedAt:String(raw.updatedAt || new Date().toISOString()),
      state:normalizeState(raw.state),
      devices:Array.isArray(raw.devices) ? raw.devices.slice(0,MAX_DEVICES) : [],
      activity:Array.isArray(raw.activity) ? raw.activity.slice(0,MAX_ACTIVITY) : [],
    };
  }
  if (Array.isArray(raw.spools)) {
    return {
      protocol:5,
      revision:revision(),
      updatedAt:String(raw.updatedAt || new Date().toISOString()),
      state:normalizeState(raw),
      devices:[],
      activity:[],
    };
  }
  return null;
}

export function mergeStates(remoteRaw: any, incomingRaw: any) {
  const remote = normalizeState(remoteRaw || {});
  const incoming = normalizeState(incomingRaw || {});
  const tombstones: Record<string,string> = { ...remote.tombstones };
  let deletedApplied = 0;
  for (const [id, at] of Object.entries(incoming.tombstones)) {
    if (timestamp(at) >= timestamp(tombstones[id])) {
      if (timestamp(at) > timestamp(tombstones[id])) deletedApplied++;
      tombstones[id] = at;
    }
  }

  const byId = new Map<string,any>();
  let incomingWins = 0;
  let remoteWins = 0;
  for (const spool of remote.spools) {
    const key = String(spool.id).trim().toLowerCase();
    byId.set(key, spool);
  }
  for (const spool of incoming.spools) {
    const key = String(spool.id).trim().toLowerCase();
    const old = byId.get(key);
    if (!old || recordTime(spool) >= recordTime(old)) {
      if (old && JSON.stringify(old) !== JSON.stringify(spool)) incomingWins++;
      byId.set(key, spool);
    } else if (JSON.stringify(old) !== JSON.stringify(spool)) {
      remoteWins++;
    }
  }

  const spools = [...byId.entries()]
    .filter(([id, spool]) => !tombstones[id] || timestamp(tombstones[id]) < recordTime(spool))
    .map(([, spool]) => spool)
    .slice(0, MAX_SPOOLS);

  const liveIds = new Set(spools.map((s:any) => String(s.id).trim().toLowerCase()));
  const deletedIds = new Set(Object.entries(tombstones).filter(([id, at]) => !liveIds.has(id) && timestamp(at) > 0).map(([id]) => id));
  const logMap = new Map<string,any>();
  for (const row of [...remote.weighLog, ...incoming.weighLog]) {
    const id = String(row.id || '').trim().toLowerCase();
    if (!id || deletedIds.has(id)) continue;
    const key = [id, String(row.at || ''), String(row.gross ?? ''), String(row.tare ?? ''), String(row.note || '')].join('|');
    logMap.set(key, row);
  }
  const weighLog = [...logMap.values()].sort((a,b) => timestamp(a.at) - timestamp(b.at)).slice(-MAX_LOGS);
  const auditLog = normalizeAuditLog([...remote.auditLog, ...incoming.auditLog]);
  const printJobs = mergePrintJobs(remote.printJobs, incoming.printJobs);
  const version = Math.max(Number(remote.version) || 0, Number(incoming.version) || 0, 5);

  return {
    state:{ version, spools, weighLog, auditLog, printJobs, tombstones },
    stats:{ incomingWins, remoteWins, deletedApplied }
  };
}

function publicMeta(envelope: Envelope | null) {
  if (!envelope) return { revision:'', updatedAt:null, devices:[], activity:[] };
  return {
    revision:envelope.revision,
    updatedAt:envelope.updatedAt,
    devices:envelope.devices,
    activity:envelope.activity,
  };
}

async function saveSnapshot(store: ReturnType<typeof getStore>, hash: string, envelope: Envelope | null) {
  if (!envelope) return;
  await store.setJSON(snapshotKey(hash, envelope), envelope);
  const listed = await store.list({ prefix:snapshotPrefix(hash) });
  const keys = listed.blobs.map(x => x.key).sort().reverse();
  for (const key of keys.slice(MAX_SNAPSHOTS)) await store.delete(key);
}

async function listSnapshots(store: ReturnType<typeof getStore>, hash: string) {
  const listed = await store.list({ prefix:snapshotPrefix(hash) });
  const keys = listed.blobs.map(x => x.key).sort().reverse().slice(0, MAX_SNAPSHOTS);
  const rows:any[] = [];
  for (const key of keys) {
    const item = asEnvelope(await store.get(key, { type:'json' }));
    if (!item) continue;
    rows.push({
      revision:item.revision,
      createdAt:item.updatedAt,
      spoolCount:item.state.spools.length,
      logCount:item.state.weighLog.length,
      printJobCount:item.state.printJobs.length,
    });
  }
  return rows;
}

async function getSnapshotByRevision(store: ReturnType<typeof getStore>, hash: string, wanted: string) {
  const listed = await store.list({ prefix:snapshotPrefix(hash) });
  const match = listed.blobs.find(x => x.key.endsWith(`-${wanted}`));
  if (!match) return null;
  return asEnvelope(await store.get(match.key, { type:'json' }));
}

export default async (req: Request) => {
  if (!isProduction()) return json({ ok:false, error:'Sync is available only on the production site.' }, 403);
  if (!validOrigin(req)) return json({ ok:false, error:'Invalid request origin.' }, 403);
  const key = syncKey(req);
  if (!key) return json({ ok:false, error:'A valid private sync key is required.' }, 401);
  const owner = profile(req);
  if (!owner) return json({ ok:false, error:'A valid inventory profile is required.' }, 400);

  const hash = hashKey(key, owner);
  const store = getStore(STORE_NAME, { consistency:'strong' });
  const blobKey = stateKey(hash);
  const url = new URL(req.url);
  const view = url.searchParams.get('view') || 'state';

  if (req.method === 'GET') {
    const current = asEnvelope(await store.get(blobKey, { type:'json' }));
    if (view === 'snapshots') {
      const snapshots = await listSnapshots(store, hash);
      return json({ ok:true, exists:Boolean(current), snapshots, meta:publicMeta(current) });
    }
    if (view === 'meta') {
      return json({ ok:true, exists:Boolean(current), meta:publicMeta(current) });
    }
    return json({ ok:true, exists:Boolean(current), state:current?.state || null, meta:publicMeta(current) });
  }

  if (req.method === 'POST') {
    const length = Number(req.headers.get('content-length') || 0);
    if (length > MAX_BODY_BYTES) return json({ ok:false, error:'Sync payload is too large.' }, 413);
    let body: any;
    try { body = await req.json(); } catch { return json({ ok:false, error:'Invalid JSON body.' }, 400); }

    const action = String(body?.action || 'sync');
    const device = sanitizeDevice(body?.device);
    const current = asEnvelope(await store.get(blobKey, { type:'json' }));

    if (action === 'restore') {
      const wanted = String(body?.revision || '').trim();
      if (!wanted) return json({ ok:false, error:'A snapshot revision is required.' }, 400);
      const snapshot = await getSnapshotByRevision(store, hash, wanted);
      if (!snapshot) return json({ ok:false, error:'That cloud snapshot no longer exists.' }, 404);

      await saveSnapshot(store, hash, current);
      const at = new Date().toISOString();
      const restored:Envelope = {
        protocol:5,
        revision:revision(),
        updatedAt:at,
        state:normalizeState(snapshot.state),
        devices:updateDevices(current?.devices || snapshot.devices, device, 'restore', at),
        activity:addActivity(current?.activity || snapshot.activity, device, 'restore', `Restored revision ${wanted}`, at),
      };
      await store.setJSON(blobKey, restored);
      return json({ ok:true, state:restored.state, meta:publicMeta(restored), restoredFrom:wanted });
    }

    if (!body?.state || !Array.isArray(body.state.spools)) return json({ ok:false, error:'A valid sync state is required.' }, 400);
    const baseRevision = String(body?.baseRevision || '');
    const concurrent = Boolean(current && baseRevision && baseRevision !== current.revision);
    const baseEnvelope = concurrent ? await getSnapshotByRevision(store, hash, baseRevision) : null;
    const twoWayMerged = mergeStates(current?.state, body.state);
    const reconciliation = baseEnvelope && current
      ? reconcileConcurrentState(baseEnvelope.state, current.state, body.state, twoWayMerged.state)
      : {
          state:twoWayMerged.state,
          stats:{ threeWaySpools:0, mergedSpools:0, conflictedSpools:0, conflictingFields:0, conflictIds:[] as string[] },
        };
    const merged = {
      state:reconciliation.state,
      stats:{ ...twoWayMerged.stats, ...reconciliation.stats, baseRecovered:Boolean(baseEnvelope) },
    };
    const currentFingerprint = current ? JSON.stringify(current.state) : '';
    const nextFingerprint = JSON.stringify(merged.state);
    const changed = currentFingerprint !== nextFingerprint;

    if (!changed && current) {
      const at = new Date().toISOString();
      const touched:Envelope = {
        ...current,
        devices:updateDevices(current.devices, device, 'sync', at),
        activity:addActivity(current.activity, device, 'sync', 'No inventory changes', at),
      };
      await store.setJSON(blobKey, touched);
      return json({ ok:true, state:touched.state, meta:publicMeta(touched), merge:{...merged.stats, concurrent, changed:false} });
    }

    await saveSnapshot(store, hash, current);
    const at = new Date().toISOString();
    const next:Envelope = {
      protocol:5,
      revision:revision(),
      updatedAt:at,
      state:merged.state,
      devices:updateDevices(current?.devices || [], device, 'sync', at),
      activity:addActivity(current?.activity || [], device, 'sync', `${merged.state.spools.length} spools · ${merged.state.weighLog.length} measurements · ${merged.state.printJobs.length} print jobs`, at),
    };
    await store.setJSON(blobKey, next);
    return json({ ok:true, state:next.state, meta:publicMeta(next), merge:{...merged.stats, concurrent, changed:true} });
  }

  return json({ ok:false, error:'Method not allowed.' }, 405, { Allow:'GET, POST' });
};

export const config: Config = {
  path:'/api/sync',
  rateLimit:{ windowLimit:60, windowSize:60, aggregateBy:['ip','domain'] }
};
