import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('browser loads printer planning before private command-center UI and app mutations', async () => {
  const html = await read('index.html');
  const order = ['printer-core.js','household-client.js','scan-client.js','printer-dashboard.js','app.js'].map(name => html.indexOf(`/${name}`));
  assert.ok(order.every(index => index >= 0));
  assert.deepEqual(order, [...order].sort((a,b) => a-b));
});

test('private command center replaces legacy household composition and preserves scan placement selector', async () => {
  const client = await read('printer-dashboard.js');
  assert.match(client, /Printer \/ AMS command center/);
  assert.match(client, /private inventory/);
  assert.match(client, /id=\"moveSpoolV8\"/);
  assert.match(client, /Quick load \/ move/);
  assert.match(client, /Needs attention/);
  assert.doesNotMatch(client, /Bill vs Aimee report/);
  assert.doesNotMatch(client, /Transfer ownership/);
  assert.doesNotMatch(client, /Both owners/);
});

test('placement writes continue through the existing local state boundary for audit and sync', async () => {
  const client = await read('printer-dashboard.js');
  assert.match(client, /localStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(state\)\)/);
  assert.match(client, /updatedAt:nowIso\(\)/);
  assert.match(client, /placementState:'Stored'/);
  assert.match(client, /placementState:'Loaded'/);
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

test('PWA and CI publish printer command-center assets', async () => {
  const [assets, sw, ci] = await Promise.all([read('scripts/public-assets.mjs'), read('sw.js'), read('.github/workflows/ci.yml')]);
  for (const name of ['printer-core.js','printer-dashboard.js']) {
    assert.match(assets, new RegExp(`'${name.replace('.', '\\.').replace('-', '\\-')}'`));
    assert.match(sw, new RegExp(`/${name.replace('.', '\\.').replace('-', '\\-')}`));
    assert.match(ci, new RegExp(`dist/${name.replace('.', '\\.').replace('-', '\\-')}`));
  }
});
