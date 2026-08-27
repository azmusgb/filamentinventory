import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('v10 UI controller loads after feature clients and before app mutations', async () => {
  const html = await read('index.html');
  const order = ['personal-dashboard.js','inventory-command-client.js','spool-actions-client.js','bulk-actions-client.js','ui-v10-client.js','app.js'].map(name => html.indexOf(`/${name}`));
  assert.ok(order.every(index => index >= 0), 'all v10 UI assets must be browser-loaded');
  assert.deepEqual(order, [...order].sort((a,b) => a-b));
});

test('runtime clients no longer inject competing CSS authorities', async () => {
  const files = ['user-isolation.js','ux-client.js','audit-client.js','personal-dashboard.js','intake-client.js','scan-client.js','printer-dashboard.js'];
  for (const path of files) {
    const source = await read(path);
    assert.doesNotMatch(source, /createElement\(['"]style['"]\)/, `${path} still injects a style element`);
    assert.doesNotMatch(source, /function injectStyles\s*\(/, `${path} still contains injectStyles`);
    assert.doesNotMatch(source, /const injectStyles\s*=\s*\(\)\s*=>/, `${path} still contains injectStyles`);
  }
});

test('v10 interaction architecture covers the critique priorities without new CRUD logic', async () => {
  const client = await read('ui-v10-client.js');
  for (const contract of [
    'profileMenuButton','mobileBottomNav','mobileMoreSheetV10','inventoryFilterDialog','inventoryFilterOpen',
    'spool-form-advanced','activitySwitcherV10','data-group-featured','data-group-danger',
  ]) assert.ok(client.includes(contract), `missing v10 contract: ${contract}`);
  assert.match(client, /ESSENTIAL_FIELD_IDS/);
  assert.match(client, /localStorage\.setItem\(CURRENT_USER_KEY/);
  assert.doesNotMatch(client, /localStorage\.setItem\(['"]filament-inventory-v1/);
  assert.doesNotMatch(client, /Storage\.prototype\.setItem\s*=/);
  assert.match(client, /if \(button\.innerHTML !== markup\) button\.innerHTML = markup/);
});

test('authoritative UI system owns v10 layout, typography and responsive composition', async () => {
  const css = await read('ui-system.css');
  for (const contract of [
    'V10 PRODUCT UI', '.profile-chip', '.mobile-bottom-nav', '.inventory-compact-controls', '.inventory-filter-dialog',
    '.spool-form-advanced', '.activity-switcher-v10', '.data-group-v10', '.fi-v10 #dashboardView',
    '.fi-v10 .spool-card .meta > div:not(:nth-child(2))', '@media (max-width: 720px)',
  ]) assert.ok(css.includes(contract), `missing v10 UI-system contract: ${contract}`);
  assert.match(css, /font-size:\s*11px/);
});

test('v10 remains schema 10 while PWA and deploy contracts publish the UI controller', async () => {
  const [version, assets, sw, ci, netlify, pkg, lock] = await Promise.all([
    read('app-version.js'), read('scripts/public-assets.mjs'), read('sw.js'), read('.github/workflows/ci.yml'), read('netlify.toml'), read('package.json'), read('package-lock.json'),
  ]);
  assert.match(version, /APP_VERSION = '10\.0\.0'/);
  assert.match(version, /DATA_SCHEMA_VERSION = 10/);
  assert.match(assets, /'ui-v10-client\.js'/);
  assert.match(sw, /\/ui-v10-client\.js/);
  assert.match(sw, /filament-inventory-v26/);
  assert.match(ci, /dist\/ui-v10-client\.js/);
  assert.match(netlify, /for = "\/ui-v10-client\.js"/);
  assert.equal(JSON.parse(pkg).version, '10.0.0');
  const lockJson = JSON.parse(lock);
  assert.equal(lockJson.version, '10.0.0');
  assert.equal(lockJson.packages[''].version, '10.0.0');
});
