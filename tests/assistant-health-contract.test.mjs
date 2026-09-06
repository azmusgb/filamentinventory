import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(testDir,'..');

const functionSource=await readFile(path.join(root,'netlify','functions','inventory-assistant.mts'),'utf8');
const clientSource=await readFile(path.join(root,'llm-transport-client.js'),'utf8');

test('Assistant GET health is non-billable and does not require private inventory credentials',()=>{
  const getRoute=functionSource.indexOf("if (req.method === 'GET')");
  const privateKeyGate=functionSource.indexOf('const key = syncKey(req)');
  const providerCall=functionSource.indexOf('await callProvider(');

  assert.ok(getRoute>=0,'GET health route must exist');
  assert.ok(privateKeyGate>getRoute,'GET health must resolve before private sync credential validation');
  assert.ok(providerCall>privateKeyGate,'provider calls must remain behind authenticated POST validation');
  assert.match(functionSource,/configured:Boolean\(String\(process\.env\.OPENAI_API_KEY \|\| ''\)\.trim\(\)\)/);
  assert.match(functionSource,/model:modelName\(\)/);
  assert.match(functionSource,/provider:'openai-responses'/);
  assert.match(functionSource,/storesResponses:false/);
  assert.match(functionSource,/Allow:'GET, POST'/);
});

test('browser health probing never sends the private sync key and is rate-conscious',()=>{
  const start=clientSource.indexOf('async function checkHealth');
  const end=clientSource.indexOf('async function transport',start);
  assert.ok(start>=0&&end>start,'health and authenticated transport functions must both exist');

  const health=clientSource.slice(start,end);
  assert.match(health,/method:'GET'/);
  assert.match(health,/cache:'no-store'/);
  assert.doesNotMatch(health,/X-Filament-Sync-Key/);
  assert.doesNotMatch(health,/X-Filament-Profile/);
  assert.match(clientSource,/const HEALTH_TTL_MS=60000/);
  assert.match(clientSource,/serverConfigured=result\?\.transport\?\.configured===true/);
});

test('authenticated model requests still carry one captured profile-scoped private sync credential set',()=>{
  const start=clientSource.indexOf('async function transport');
  const transport=clientSource.slice(start);
  assert.match(transport,/method:'POST'/);
  assert.match(transport,/const requestProfile=profile\(\)/);
  assert.match(transport,/'X-Filament-Sync-Key':key/);
  assert.match(transport,/'X-Filament-Profile':requestProfile/);
  assert.match(transport,/String\(payload\?\.profile\|\|''\)!==requestProfile/);
  assert.match(transport,/profile\(\)!==requestProfile/);
});
