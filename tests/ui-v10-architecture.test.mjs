import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const RUNTIME_STYLE_FILES = [
  'user-isolation.js',
  'personal-dashboard.js',
  'ux-client.js',
  'audit-client.js',
  'intake-client.js',
  'scan-client.js',
  'printer-dashboard.js',
];

test('v10 keeps runtime presentation in ui-system.css rather than JavaScript style tags', async () => {
  const files = await Promise.all(RUNTIME_STYLE_FILES.map(read));
  for (let i = 0; i < files.length; i++) {
    assert.doesNotMatch(files[i], /createElement\(['"]style['"]\)/, `${RUNTIME_STYLE_FILES[i]} still injects runtime CSS`);
    assert.doesNotMatch(files[i], /\.textContent\s*=\s*`[\s\S]*?@media/, `${RUNTIME_STYLE_FILES[i]} still embeds a stylesheet template`);
  }
});

test('v10 client provides the simplified application information architecture', async () => {
  const client = await read('ui-v10-client.js');
  for (const contract of [
    'profileMenuButton',
    'mobileBottomNav',
    'inventoryFilterDialog',
    'spool-form-essentials',
    'spool-form-advanced',
    'activitySwitcherV10',
    'data-group-v10',
  ]) assert.ok(client.includes(contract), `missing v10 IA contract: ${contract}`);
  assert.match(client, /data-bottom-view="dashboard"/);
  assert.match(client, /data-bottom-view="inventory"/);
  assert.match(client, /data-bottom-view="household"/);
});

test('v10 UI system enforces readable mobile typography and bottom navigation safe areas', async () => {
  const css = await read('ui-system.css');
  assert.match(css, /\.mobile-bottom-nav/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /\.inventory-compact-controls/);
  assert.match(css, /\.spool-form-advanced/);
  assert.match(css, /\.activity-switcher-v10/);
  assert.match(css, /\.data-group-v10/);
  assert.match(css, /V10 COMPONENT FOUNDATIONS/);
  assert.match(css, /\.printer-command \{ display:grid; \}/);
  assert.match(css, /\.qr-scanner-body \{ display:grid; \}/);
  assert.match(css, /\.intake-banner \{ display:grid; \}/);
  const marker = css.indexOf('V10 PRODUCT UI');
  assert.ok(marker >= 0, 'v10 UI authority marker must exist');
  const v10 = css.slice(marker);
  assert.doesNotMatch(v10, /font-size:\s*[789]px(?:;|\})/, 'v10 UI should not introduce sub-10px typography');
  assert.match(v10, /font-size:\s*11px/);
});

test('v10 is a UI release only and keeps data schema 10', async () => {
  const [version, pkg] = await Promise.all([read('app-version.js'), read('package.json')]);
  assert.match(version, /APP_VERSION = '10\.0\.0'/);
  assert.match(version, /DATA_SCHEMA_VERSION = 10/);
  assert.match(pkg, /"version": "10\.0\.0"/);
});