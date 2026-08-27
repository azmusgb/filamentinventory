import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('browser loads scan core and client around existing private UI layers', async () => {
  const html = await read('index.html');
  const names = ['intake-core.js','scan-core.js','user-isolation.js','labels-client.js','intake-client.js','scan-client.js','app.js'];
  const positions = names.map(name => html.indexOf(`/${name}`));
  assert.ok(positions.every(value => value >= 0));
  assert.deepEqual(positions, [...positions].sort((a,b) => a-b));
});

test('scanner is progressive and preserves an iPhone-safe fallback', async () => {
  const client = await read('scan-client.js');
  assert.match(client, /BarcodeDetector/);
  assert.match(client, /getUserMedia/);
  assert.match(client, /Camera or Control Center/);
  assert.match(client, /Code Scanner/);
  assert.match(client, /qrManualId/);
  assert.doesNotMatch(client, /https:\/\/.*(?:cdn|unpkg|jsdelivr)/i);
});

test('scan result sheet adds edit placement and scan-again actions', async () => {
  const client = await read('scan-client.js');
  assert.match(client, />Edit spool</);
  assert.match(client, />Printer \/ AMS</);
  assert.match(client, />Scan another</);
  assert.match(client, /reconcileIncomingLegacyScan/);
  assert.match(client, /resolveProfile/);
});

test('new QR labels encode profile while never embedding sync credentials', async () => {
  const [labels, qr] = await Promise.all([read('labels-client.js'), read('netlify/functions/qr.mts')]);
  assert.match(labels, /profile=\$\{encodeURIComponent/);
  assert.match(labels, /filament-user/);
  assert.match(qr, /searchParams\.get\('profile'\)/);
  assert.match(qr, /filament-user/);
  assert.match(qr, /\['Bill','Aimee'\]/);
  assert.doesNotMatch(qr, /sync-key|syncKey|filament-sync/i);
});

test('deployment permits only same-origin camera access and still blocks microphone and geolocation', async () => {
  const netlify = await read('netlify.toml');
  assert.match(netlify, /Permissions-Policy = "camera=\(self\), microphone=\(\), geolocation=\(\)"/);
});

test('PWA and CI publish the scanner modules', async () => {
  const [assets, sw, ci] = await Promise.all([read('scripts/public-assets.mjs'), read('sw.js'), read('.github/workflows/ci.yml')]);
  for (const file of ['scan-core.js','scan-client.js']) {
    assert.ok(assets.includes(`'${file}'`));
    assert.ok(sw.includes(`/${file}`));
    assert.ok(ci.includes(`dist/${file}`));
  }
  assert.match(sw, /filament-inventory-v22/);
});
