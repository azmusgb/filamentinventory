import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('browser loads inventory command core and client before app mutations', async () => {
  const html = await read('index.html');
  const names = ['inventory-command-core.js','inventory-command-client.js','app.js'];
  const positions = names.map(name => html.indexOf(`/${name}`));
  assert.ok(positions.every(value => value >= 0), 'all command assets must be browser-loaded');
  assert.deepEqual(positions, [...positions].sort((a,b) => a-b));
});

test('command surface reuses authoritative inventory controls instead of forking inventory logic', async () => {
  const client = await read('inventory-command-client.js');
  for (const id of ['searchInput','materialFilter','statusFilter','locationFilter','lifecycleFilter','sortSelect','inventoryGrid']) assert.ok(client.includes(id));
  assert.match(client, /Reorder needed/);
  assert.match(client, /Unknown/);
  assert.match(client, /data-action=\\?"weigh/);
  assert.match(client, /inventoryAddBtn/);
  assert.doesNotMatch(client, /injectStyles|createElement\(['"]style['"]\)/);
});

test('command surface refreshes for same-document and cross-tab routed inventory writes', async () => {
  const client = await read('inventory-command-client.js');
  assert.match(client, /const priorSetItem = Storage\.prototype\.setItem/);
  assert.match(client, /Storage\.prototype\.setItem = function/);
  assert.match(client, /physicalKey\?\.\(STORAGE_KEY, currentUser\(\)\)/);
  assert.match(client, /isInventoryStorageKey\(key\)/);
  assert.match(client, /window\.addEventListener\('storage'.*isInventoryStorageKey\(event\.key\)/s);
});

test('command surface supports fast keyboard find without hijacking typed form input', async () => {
  const client = await read('inventory-command-client.js');
  assert.match(client, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(client, /event\.key\.toLowerCase\(\) === 'k'/);
  assert.match(client, /event\.key === '\/'/);
  assert.match(client, /input, textarea, select/);
  assert.match(client, /focusSearch/);
});

test('UI system owns command surface presentation including mobile composition', async () => {
  const css = await read('ui-system.css');
  for (const selector of ['.fi-ui .inventory-command','.fi-ui .inventory-command-modes','.fi-ui .inventory-command-spool','.inventory-command-hidden']) assert.ok(css.includes(selector), `missing command selector ${selector}`);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /@media \(max-width: 480px\)/);
});

test('PWA and CI publish the command modules', async () => {
  const [assets, sw, ci] = await Promise.all([read('scripts/public-assets.mjs'), read('sw.js'), read('.github/workflows/ci.yml')]);
  for (const file of ['inventory-command-core.js','inventory-command-client.js']) {
    assert.ok(assets.includes(`'${file}'`));
    assert.ok(sw.includes(`/${file}`));
    assert.ok(ci.includes(`dist/${file}`));
  }
  assert.match(sw, /filament-inventory-v24/);
});

test('v9.8 remains a UI/interaction release on schema 10', async () => {
  const version = await read('app-version.js');
  assert.match(version, /APP_VERSION = '9\.8\.0'/);
  assert.match(version, /DATA_SCHEMA_VERSION = 10/);
});
