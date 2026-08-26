import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';

declare const Netlify: any;

const STORE_NAME = 'filament-inventory-sync';
const MAX_SPOOLS = 5000;
const MAX_LOGS = 5000;
const MAX_BODY_BYTES = 2_000_000;
const KEY_HEADER = 'x-filament-sync-key';

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

function stateKey(key: string): string {
  return `inventory-${createHash('sha256').update(key).digest('hex')}`;
}

function timestamp(value: unknown): number {
  const n = Date.parse(String(value || ''));
  return Number.isFinite(n) ? n : 0;
}

function recordTime(spool: any): number {
  return Math.max(timestamp(spool?.updatedAt), timestamp(spool?.createdAt));
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

function normalizeState(value: any) {
  const spools = Array.isArray(value?.spools) ? value.spools.filter((s:any) => s && String(s.id || '').trim()).slice(0, MAX_SPOOLS) : [];
  const weighLog = Array.isArray(value?.weighLog) ? value.weighLog.filter((x:any) => x && String(x.id || '').trim()).slice(-MAX_LOGS) : [];
  return { version:Number(value?.version) || 4, spools, weighLog, tombstones:normalizeTombstones(value?.tombstones) };
}

function mergeStates(remoteRaw: any, incomingRaw: any) {
  const remote = normalizeState(remoteRaw || {});
  const incoming = normalizeState(incomingRaw || {});
  const tombstones: Record<string,string> = { ...remote.tombstones };
  for (const [id, at] of Object.entries(incoming.tombstones)) {
    if (timestamp(at) >= timestamp(tombstones[id])) tombstones[id] = at;
  }

  const byId = new Map<string,any>();
  for (const spool of [...remote.spools, ...incoming.spools]) {
    const key = String(spool.id).trim().toLowerCase();
    const old = byId.get(key);
    if (!old || recordTime(spool) >= recordTime(old)) byId.set(key, spool);
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

  return { version:4, updatedAt:new Date().toISOString(), spools, weighLog, tombstones };
}

export default async (req: Request) => {
  if (!isProduction()) return json({ ok:false, error:'Sync is available only on the production site.' }, 403);
  if (!validOrigin(req)) return json({ ok:false, error:'Invalid request origin.' }, 403);
  const key = syncKey(req);
  if (!key) return json({ ok:false, error:'A valid private sync key is required.' }, 401);

  const store = getStore(STORE_NAME, { consistency:'strong' });
  const blobKey = stateKey(key);

  if (req.method === 'GET') {
    const state = await store.get(blobKey, { type:'json' });
    return json({ ok:true, exists:Boolean(state), state:state || null });
  }

  if (req.method === 'POST') {
    const length = Number(req.headers.get('content-length') || 0);
    if (length > MAX_BODY_BYTES) return json({ ok:false, error:'Sync payload is too large.' }, 413);
    let body: any;
    try { body = await req.json(); } catch { return json({ ok:false, error:'Invalid JSON body.' }, 400); }
    if (!body || !body.state || !Array.isArray(body.state.spools)) return json({ ok:false, error:'A valid sync state is required.' }, 400);
    const remote = await store.get(blobKey, { type:'json' });
    const merged = mergeStates(remote, body.state);
    await store.setJSON(blobKey, merged);
    return json({ ok:true, state:merged });
  }

  return json({ ok:false, error:'Method not allowed.' }, 405, { Allow:'GET, POST' });
};

export const config: Config = {
  path:'/api/sync',
  rateLimit:{ windowLimit:20, windowSize:60, aggregateBy:['ip','domain'] }
};
