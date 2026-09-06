import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';
import { buildProviderRequest, parseAssistantAnswer, sanitizeAssistantRequest } from '../lib/inventory-assistant.mts';

declare const Netlify: any;

const STORE_NAME = 'filament-inventory-sync';
const KEY_HEADER = 'x-filament-sync-key';
const PROFILE_HEADER = 'x-filament-profile';
const MAX_BODY_BYTES = 80_000;
const PROVIDER_TIMEOUT_MS = 15_000;

function json(data:unknown, status = 200, headers:HeadersInit = {}):Response {
  return Response.json(data, {status, headers:{'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8',...headers}});
}

function isProduction():boolean {
  return Netlify.context?.deploy?.context === 'production';
}

function validOrigin(req:Request):boolean {
  const origin = req.headers.get('origin');
  return !origin || origin === new URL(req.url).origin;
}

function syncKey(req:Request):string | null {
  const key = String(req.headers.get(KEY_HEADER) || '').trim();
  return /^[A-Za-z0-9_-]{32,128}$/.test(key) ? key : null;
}

function profile(req:Request):'Bill' | 'Aimee' | null {
  const value = String(req.headers.get(PROFILE_HEADER) || '').trim();
  return value === 'Bill' || value === 'Aimee' ? value : null;
}

function hashKey(key:string, owner:'Bill' | 'Aimee'):string {
  return createHash('sha256').update(`${owner.toLowerCase()}:${key}`).digest('hex');
}

function modelName():string {
  const configured = String(process.env.OPENAI_MODEL || '').trim();
  return /^[A-Za-z0-9._:-]{1,100}$/.test(configured) ? configured : 'gpt-5.6-luna';
}

async function hasLinkedInventory(key:string, owner:'Bill' | 'Aimee'):Promise<boolean> {
  const hash = hashKey(key, owner);
  const store = getStore(STORE_NAME, {consistency:'strong'});
  const current = await store.get(`inventory-${hash}`, {type:'json'});
  return Boolean(current);
}

async function callProvider(body:unknown, apiKey:string, signal:AbortSignal):Promise<any> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method:'POST',
    headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw new Error(`Provider request failed (${response.status}).`);
  return response.json();
}

export default async (req:Request) => {
  if (!isProduction()) return json({ok:false,error:'Model assistance is available only on the production site.'},403);
  if (!validOrigin(req)) return json({ok:false,error:'Invalid request origin.'},403);
  if (req.method !== 'POST') return json({ok:false,error:'Method not allowed.'},405,{Allow:'POST'});

  const key = syncKey(req);
  if (!key) return json({ok:false,error:'A valid private sync key is required.'},401);
  const owner = profile(req);
  if (!owner) return json({ok:false,error:'A valid inventory profile is required.'},400);
  if (!(await hasLinkedInventory(key, owner))) return json({ok:false,error:'This private key is not linked to the selected inventory.'},403);

  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json({ok:false,error:'Assistant request is too large.'},413);
  let parsed:any;
  try { parsed = JSON.parse(raw); }
  catch { return json({ok:false,error:'Invalid JSON body.'},400); }
  const request = sanitizeAssistantRequest(parsed);
  if (!request || request.profile !== owner) return json({ok:false,error:'Invalid grounded assistant request.'},400);

  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) return json({ok:false,error:'Grounded model transport is not configured.'},503);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  const abort = () => controller.abort();
  if (req.signal.aborted) controller.abort();
  else req.signal.addEventListener('abort', abort, {once:true});
  try {
    const model = modelName();
    const provider = await callProvider(buildProviderRequest(request, model), apiKey, controller.signal);
    const answer = parseAssistantAnswer(provider, request);
    if (!answer) return json({ok:false,error:'Model output failed grounding validation.'},502);
    return json({ok:true,...answer,model});
  } catch (error) {
    if (controller.signal.aborted) return json({ok:false,error:'Grounded model request timed out.'},504);
    console.warn('Inventory assistant provider failure', error instanceof Error ? error.message : String(error));
    return json({ok:false,error:'Grounded model transport is temporarily unavailable.'},502);
  } finally {
    clearTimeout(timeout);
    req.signal.removeEventListener('abort', abort);
  }
};

export const config:Config = {
  path:'/api/inventory-assistant',
  rateLimit:{windowLimit:12,windowSize:60,aggregateBy:['ip','domain']},
};
