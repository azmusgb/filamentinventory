import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('browser loads printer planning before private Printer UI and app mutations', async () => {
  const html = await read('index.html');
  const order = ['printer-core.js','household-client.js','scan-client.js','printer-dashboard.js','app-shell-client.js','app.js'].map(name => html.indexOf(`/${name}`));
  assert.ok(order.every(index => index >= 0));
  assert.deepEqual(order, [...order].sort((a,b) => a-b));
});

test('V11 Printer is registry-first while preserving authoritative placement controls', async () => {
  const client = await read('printer-dashboard.js');
  assert.match(client, /<h2 id="householdTitle">Printers & loaded filament<\/h2>/);
  assert.match(client, /Configure each printer once/);
  assert.match(client, /<h3>My printers<\/h3>/);
  assert.match(client, /data-printer-add/);
  assert.match(client, /id="printerConfigManufacturer"/);
  assert.match(client, /id="printerFeederRows"/);
  assert.match(client, /Current printer, feeder and slot occupancy/);
  assert.match(client, /id="moveSpoolV8"/);
  assert.match(client, /id="movePrinterV8"/);
  assert.match(client, /id="moveFeederV8"/);
  assert.match(client, /id="moveSlotV8"/);
  assert.match(client, /Load \/ move spool/);
  assert.match(client, /Needs attention/);
  assert.match(client, /data-printer-scan/);
  assert.match(client, /private inventory/);
  assert.doesNotMatch(client, /Bill vs Aimee report|Transfer ownership|Both owners/);
});

test('placement writes continue through one local state boundary for audit and sync', async () => {
  const client = await read('printer-dashboard.js');
  const writes = client.match(/localStorage\.setItem\(STORAGE_KEY/g) || [];
  assert.equal(writes.length,1,'Printer should centralize persistence in writeState');
  assert.match(client, /function writeState\(value\).*localStorage\.setItem\(STORAGE_KEY,\s*JSON\.stringify\(value\)\)/s);
  assert.match(client, /function setPlacement\(id, placement\)/);
  assert.match(client, /updatedAt:nowIso\(\)/);
  assert.match(client, /placementState:'Stored'/);
  assert.match(client, /placementState:'Loaded'/);
  assert.match(client, /printerId/);
  assert.match(client, /feederId/);
  assert.doesNotMatch(client, /fetch\(/);
});

test('scan to Printer AMS routes through physical spool mode and the authoritative placement workflow', async () => {
  const [scan, actions] = await Promise.all([read('scan-client.js'), read('spool-actions-client.js')]);
  assert.match(scan, /function openPhysicalSpool\(id\)/);
  assert.match(scan, /FilamentInventorySpoolActions/);
  assert.match(actions, /if \(action === 'placement'\) \{ openPlacement\(id\); return; \}/);
  assert.match(actions, /switchView\('household'\)/);
  assert.match(actions, /\$\('moveSpoolV8'\)/);
});

test('PWA and CI publish Printer command assets', async () => {
  const [assets, sw, ci] = await Promise.all([read('scripts/public-assets.mjs'), read('sw.js'), read('.github/workflows/ci.yml')]);
  for (const name of ['printer-core.js','printer-dashboard.js']) {
    assert.match(assets, new RegExp(`'${name.replace('.', '\\.').replace('-', '\\-')}'`));
    assert.match(sw, new RegExp(`/${name.replace('.', '\\.').replace('-', '\\-')}`));
    assert.match(ci, new RegExp(`dist/${name.replace('.', '\\.').replace('-', '\\-')}`));
  }
});
