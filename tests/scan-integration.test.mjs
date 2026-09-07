import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('browser loads scan core and client around existing private UI layers', async () => {
  const html = await read('index.html');
  const names = ['intake-core.js','scan-core.js','user-isolation.js','labels-client.js','intake-client.js','scan-client.js','app-shell-client.js','app.js'];
  const positions = names.map(name => html.indexOf(`/${name}`));
  assert.ok(positions.every(index => index >= 0));
  assert.deepEqual(positions, [...positions].sort((a,b) => a-b));
});

test('scanner is progressive and preserves an iPhone-safe fallback', async () => {
  const client = await read('scan-client.js');
  assert.match(client, /BarcodeDetector/);
  assert.match(client, /getUserMedia/);
  assert.match(client, /Apple Camera or Code Scanner/);
  assert.match(client, /system QR scanner is the most reliable option/);
  assert.match(client, /qrManualId/);
  assert.match(client, /liveScanningSupported\(\)/);
  assert.doesNotMatch(client, /https:\/\/.*(?:cdn|unpkg|jsdelivr)/i);
});

test('active-workspace scans open physical spool mode without a page reload', async () => {
  const client = await read('scan-client.js');
  assert.match(client, /function openPhysicalSpool\(id\)/);
  assert.match(client, /FilamentInventorySpoolActions/);
  assert.match(client, /actions\.openPhysical/);
  assert.match(client, /const exists=core\.stateHasSpool\(state,parsed\.spoolId\)/);
  assert.match(client, /Opening spool controls/);
  assert.match(client, /if\(!openPhysicalSpool\(parsed\.spoolId\)\)location\.assign\(target\)/);
});

test('scanner fails closed at private profile boundaries', async () => {
  const client = await read('scan-client.js');
  assert.doesNotMatch(client, /core\.resolveProfile/);
  assert.doesNotMatch(client, /Switching to .*private inventory/);
  assert.match(client, /showUnknown\(parsed\.spoolId\)/);
  assert.match(client, /reconcileIncomingLegacyScan/);
  assert.match(client, /core\.stateHasSpool\(readState\(\),spoolId\)/);
  assert.match(client, /profile:current/);
});

test('scanner exposes a small public adapter for shell and physical-spool workflows', async () => {
  const client = await read('scan-client.js');
  assert.match(client, /globalThis\.FilamentInventoryScanner=Object\.freeze/);
  assert.match(client, /open:openScanner/);
  assert.match(client, /close:closeScanner/);
  assert.match(client, /process:processScanValue/);
});

test('scanner has one direct found-spool path and one explicit unknown-spool recovery path', async () => {
  const client = await read('scan-client.js');
  assert.match(client, /function openPhysicalSpool\(id\)/);
  assert.match(client, /function showUnknown\(id\)/);
  assert.match(client, /data-unknown-sync/);
  assert.match(client, /data-unknown-add/);
  assert.doesNotMatch(client, /function openEditFromScan|function openPlacementFromScan|scanOpenSpoolBtn|scanEditBtn|scanPlacementBtn/);
  assert.match(client, /core\.stateHasSpool\(state,parsed\.spoolId\)/);
  assert.doesNotMatch(client, /core\.resolveProfile/);
});

test('legacy QR profile hints remain non-secret metadata and never grant scanner access', async () => {
  const [labels, qr, client] = await Promise.all([read('labels-client.js'), read('netlify/functions/qr.mts'), read('scan-client.js')]);
  assert.match(labels, /profile=\$\{encodeURIComponent/);
  assert.match(labels, /filament-user/);
  assert.match(qr, /searchParams\.get\('profile'\)/);
  assert.match(qr, /filament-user/);
  assert.match(qr, /\['Bill','Aimee'\]/);
  assert.doesNotMatch(qr, /sync-key|syncKey|filament-sync/i);
  assert.doesNotMatch(client, /parsed\.profile\s*\|\|/);
  assert.doesNotMatch(client, /profile:parsed\.profile/);
});

test('deployment permits only same-origin camera access and still blocks microphone and geolocation', async () => {
  const netlify = await read('netlify.toml');
  assert.match(netlify, /Permissions-Policy = "camera=\(self\), microphone=\(\), geolocation=\(\)"/);
});

test('PWA and CI publish the scanner modules without pinning one cache generation', async () => {
  const [assets, sw, ci] = await Promise.all([read('scripts/public-assets.mjs'), read('sw.js'), read('.github/workflows/ci.yml')]);
  for (const file of ['scan-core.js','scan-client.js']) {
    assert.ok(assets.includes(`'${file}'`));
    assert.ok(sw.includes(`/${file}`));
    assert.ok(ci.includes(`dist/${file}`));
  }
  assert.match(sw, /const CACHE = 'filament-inventory-v\d+'/);
});
