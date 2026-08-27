import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const require = createRequire(import.meta.url);
const version = require('../app-version.js');
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('authoritative app and schema versions are explicit', () => {
  assert.equal(version.APP_VERSION, '9.5.0');
  assert.equal(version.DATA_SCHEMA_VERSION, 10);
  assert.equal(version.DISPLAY_VERSION, 'v9.5.0');
});

test('package metadata matches the authoritative app version', async () => {
  const pkg = JSON.parse(await read('package.json'));
  const lock = JSON.parse(await read('package-lock.json'));
  assert.equal(pkg.version, version.APP_VERSION);
  assert.equal(lock.version, version.APP_VERSION);
  assert.equal(lock.packages[''].version, version.APP_VERSION);
});

test('browser entrypoint loads version authority and user isolation before state consumers', async () => {
  const html = await read('index.html');
  const order = ['app-version.js', 'user-isolation.js', 'sync-client.js', 'household-client.js', 'ux-client.js', 'app.js'].map(name => html.indexOf(`/${name}`));
  assert.ok(order.every(index => index >= 0));
  assert.deepEqual(order, [...order].sort((a,b) => a-b));
  assert.match(html, /data-app-version/);
});

test('runtime code uses current app version and schema contract', async () => {
  const [app, household, ux] = await Promise.all([read('app.js'), read('household-client.js'), read('ux-client.js')]);
  assert.match(app, /FilamentInventoryVersion/);
  assert.match(app, /DATA_SCHEMA_VERSION/);
  assert.match(app, /appVersion:APP_VERSION/);
  assert.match(household, /FilamentInventoryVersion/);
  assert.match(household, /DATA_SCHEMA_VERSION/);
  assert.match(household, /APP_VERSION/);
  assert.match(ux, /FilamentInventoryVersion/);
  assert.match(ux, /DISPLAY_VERSION/);
});

test('stale user-facing release labels and backup names are gone', async () => {
  const files = await Promise.all(['index.html','app.js','household-client.js','ux-client.js','labels-client.js'].map(read));
  const combined = files.join('\n');
  const forbidden = [
    'Inventory control center · v3',
    'Household inventory control · v8',
    'Data, backup & install · v8',
    'Two-user household inventory · v8',
    'Personal experience · v9',
    'Physical spool labels · v7',
    'filament-inventory-v8-',
    'Full v8 inventory CSV exported.',
    'Complete v8 backup exported.',
    'v8 backup restored.',
    'const APP_VERSION = 3;',
  ];
  forbidden.forEach(value => assert.equal(combined.includes(value), false, `stale label remains: ${value}`));
});

test('PWA publication includes scan and printer command-center modules', async () => {
  const assets = await read('scripts/public-assets.mjs');
  const sw = await read('sw.js');
  for (const name of ['scan-core.js','scan-client.js','printer-core.js','printer-dashboard.js']) {
    assert.match(assets, new RegExp(`'${name.replace('.', '\\.').replace('-', '\\-')}'`));
    assert.match(sw, new RegExp(`/${name.replace('.', '\\.').replace('-', '\\-')}`));
  }
});
