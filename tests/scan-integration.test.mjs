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

test('active-inventory scans open physical spool mode without a page reload', async () => {
  const client = await read('scan-client.js');
  assert.match(client, /function openPhysicalSpool\(id\)/);
  assert.match(client, /FilamentInventorySpoolActions/);
  assert.match(client, /actions\.openPhysical/);
  assert.match(client, /state=readState\(\),exists=core\.stateHasSpool/);
  assert.match(client, /if\(exists\)\{/);
  assert.match(client, /Opening spool controls/);
  assert.match(client, /if\(!openPhysicalSpool\(parsed\.spoolId\)\)location\.assign\(target\)/);
});

test('scanner never discovers or routes into another private profile', async () => {
  const client = await read('scan-client.js');
  assert.doesNotMatch(client, /allProfileStates/);
  assert.doesNotMatch(client, /physicalKey/);
  assert.doesNotMatch(client, /core\.resolveProfile/);
  assert.doesNotMatch(client, /Switching to .*private inventory/);
  assert.match(client, /active private inventory/);
  assert.match(client, /showUnknown\(parsed\.spoolId\)/);
});

test('scanner invalidates stale camera work when the active profile changes', async () => {
  const client = await read('scan-client.js');
  assert.match(client, /scannerProfile/);
  assert.match(client, /scannerSession/);
  assert.match(client, /activeProfileMatches/);
  assert.match(client, /Inventory changed/);
  assert.match(client, /session!==scannerSession/);
  assert.match(client, /startCamera\(\{automatic:true,session\}\)/);
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
  assert.match(client, /Review intake/);
  assert.doesNotMatch(client, /function openEditFromScan|function openPlacementFromScan|scanOpenSpoolBtn|scanEditBtn|scanPlacementBtn/);
});

test('physical QR labels encode durable spool identity only', async () => {
  const [labels, qr, core] = await Promise.all([read('labels-client.js'), read('netlify/functions/qr.mts'), read('scan-core.js')]);
  assert.match(labels, /\/qr\?spool=\$\{encodeURIComponent\(spool\.id\)\}/);
  assert.match(labels, /durable spool ID/);
  assert.doesNotMatch(labels, /profile=\$\{encodeURIComponent|filament-user/);
  assert.doesNotMatch(qr, /searchParams\.get\('profile'\)|filament-user|\['Bill','Aimee'\]/);
  assert.doesNotMatch(core.match(/function buildSpoolTarget[\s\S]*?\n  }/)?.[0] || '', /filament-user|profile/);
  assert.doesNotMatch(qr, /sync-key|syncKey|filament-sync/i);
});

test('label quantity presentation does not invent a 1000 g nominal weight', async () => {
  const labels = await read('labels-client.js');
  assert.match(labels, /const start = .* : null;/);
  assert.match(labels, /const grams = Math\.max\(0, Number\(spool\.gross\) - Number\(spool\.tare\)\)/);
  assert.match(labels, /const grams = start === null \? null : Math\.round/);
  assert.doesNotMatch(labels, /startWeight\).*: 1000/);
});

test('scanner controls remain finger-sized and keyboard-visible', async () => {
  const [client, css] = await Promise.all([read('scan-client.js'), read('css/components/scan.css')]);
  assert.match(client, /<span>Scan<\/span>/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /focus-visible/);
  assert.match(css, /min-height:clamp\(250px,46vh,380px\)/);
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
  assert.ok(assets.includes("'css/components/scan.css'"));
  assert.ok(sw.includes('/css/components/scan.css'));
  assert.match(sw, /const CACHE = 'filament-inventory-v\d+'/);
});