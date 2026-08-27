import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('browser loads contextual spool actions before app mutations', async () => {
  const html = await read('index.html');
  const names = ['spool-actions-core.js','user-isolation.js','inventory-command-client.js','spool-actions-client.js','app.js'];
  const positions = names.map(name => html.indexOf(`/${name}`));
  assert.ok(positions.every(index => index >= 0), 'all spool-action assets must be browser-loaded');
  assert.deepEqual(positions, [...positions].sort((a,b) => a-b));
});

test('physical spool mode adapts existing mutation surfaces instead of creating a second inventory engine', async () => {
  const client = await read('spool-actions-client.js');
  for (const contract of ['button[data-action','moveSpoolV8','movePrinterV8','labelSearch','data-label-id','printLabelsBtn','scan-extended-actions','printer-slot-actions']) {
    assert.ok(client.includes(contract), `missing authoritative UI adapter contract: ${contract}`);
  }
  assert.match(client, /Physical spool/);
  assert.match(client, /Physical location/);
  assert.match(client, /This physical-spool view reuses the authoritative inventory/);
  assert.doesNotMatch(client, /localStorage\.setItem\(/, 'feature must not write inventory state directly');
  assert.doesNotMatch(client, /injectStyles|createElement\(['"]style['"]\)/, 'presentation belongs to ui-system.css');
});

test('physical spool mode progressively replaces card clutter while preserving native controls in the DOM', async () => {
  const client = await read('spool-actions-client.js');
  const css = await read('ui-system.css');
  assert.match(client, /spool-action-bar/);
  assert.match(client, /data-spool-primary/);
  assert.match(client, /data-spool-actions-open/);
  assert.match(client, />Open spool</);
  assert.match(css, /\.spool-actions-enhanced[\s\S]*\.spool-card[\s\S]*\.card-actions/);
  assert.match(css, /\.fi-ui \.spool-action-dialog/);
  assert.match(css, /\.fi-ui \.spool-action-bar/);
  assert.match(css, /\.fi-ui \.inventory-command-more/);
});

test('QR arrivals for known spools open physical spool mode and consume one-shot scan intent', async () => {
  const client = await read('spool-actions-client.js');
  assert.match(client, /function openIncomingScan\(\)/);
  assert.match(client, /url\.searchParams\.get\('scan'\) !== '1'/);
  assert.match(client, /url\.searchParams\.get\('spool'\)/);
  assert.match(client, /if \(!id \|\| !findSpool\(id\)\) return false/);
  assert.match(client, /scanSpoolDialog/);
  assert.match(client, /cleanIncomingScanUrl/);
  assert.match(client, /history\.replaceState/);
  assert.match(client, /openIncomingScan\(\);/);
});

test('physical spool mode offers scan-another without duplicating scanner logic', async () => {
  const client = await read('spool-actions-client.js');
  assert.match(client, /data-spool-sheet-action="scan"/);
  assert.match(client, /FilamentInventoryScanner\?\.open/);
  assert.match(client, /qrScanLaunch/);
  assert.doesNotMatch(client, /BarcodeDetector|getUserMedia/, 'scanner implementation remains owned by scan-client.js');
});

test('contextual actions extend inventory, recent-command, Printer AMS and scan surfaces', async () => {
  const client = await read('spool-actions-client.js');
  for (const enhancer of ['enhanceInventoryCards','enhanceCommandRecent','enhancePrinterSlots','enhanceScanDialog']) assert.match(client, new RegExp(`function ${enhancer}`));
  assert.match(client, /globalThis\.FilamentInventorySpoolActions/);
  assert.match(client, /actions\.prepend\(button\)/, 'Open spool should lead the scanned-spool action row');
});

test('observer refresh only enhances surrounding surfaces and cannot self-render the open dialog', async () => {
  const client = await read('spool-actions-client.js');
  const match = client.match(/function refresh\(\) \{([\s\S]*?)\n  \}\n\n  function queueRefresh/);
  assert.ok(match, 'refresh function must remain inspectable');
  assert.doesNotMatch(match[1], /renderDialog|spoolActionDialog/, 'DOM observer refresh must not rewrite its own dialog');
});

test('PWA and CI publish the contextual action modules without pinning one cache generation', async () => {
  const [assets, sw, ci] = await Promise.all([read('scripts/public-assets.mjs'), read('sw.js'), read('.github/workflows/ci.yml')]);
  for (const file of ['spool-actions-core.js','spool-actions-client.js']) {
    assert.ok(assets.includes(`'${file}'`));
    assert.ok(sw.includes(`/${file}`));
    assert.ok(ci.includes(`dist/${file}`));
  }
  assert.match(sw, /const CACHE = 'filament-inventory-v\d+'/);
});

test('physical spool mode remains an interaction layer on schema 10', async () => {
  const version = await read('app-version.js');
  assert.match(version, /DATA_SCHEMA_VERSION = 10/);
});
