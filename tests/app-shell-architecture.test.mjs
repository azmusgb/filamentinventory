import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('V11 defines one durable route map with task-specific widths', async () => {
  const js = await read('app-shell-client.js');
  for (const contract of [
    "dashboard:{label:'Home'",
    "inventory:{label:'Inventory'",
    "household:{label:'Printer'",
    "weigh:{label:'Weigh spool'",
    "history:{label:'Activity'",
    "labels:{label:'QR labels'",
    "sync:{label:'Sync devices'",
    "data:{label:'Backup & data'",
    "preferences:{label:'Preferences'",
    "width:'focus'",
    "width:'workbench'",
  ]) assert.ok(js.includes(contract), `missing V11 route contract: ${contract}`);
});

test('V11 centralizes navigation and separates destinations from quick actions', async () => {
  const js = await read('app-shell-client.js');
  for (const contract of [
    'FilamentInventoryNavigation',
    'function navigate(',
    'function syncNavigation(',
    'function ensureSidebar(',
    'Workspace',
    'Workflow',
    'Manage',
    'Devices & data',
    'Settings',
    'Can I print this?',
    'Scan spool',
    'Add spool',
  ]) assert.ok(js.includes(contract), `missing V11 navigation contract: ${contract}`);
});

test('V11 mobile navigation is singular and Scan is an action, not a route', async () => {
  const js = await read('app-shell-client.js');
  assert.match(js, /className = 'mobile-bottom-nav'/);
  assert.match(js, /data-bottom-view="dashboard"/);
  assert.match(js, /data-bottom-view="inventory"/);
  assert.match(js, /data-bottom-scan/);
  assert.match(js, /data-bottom-view="household"/);
  assert.match(js, /data-bottom-more/);
  assert.doesNotMatch(js, /data-bottom-view="scan"/);
  assert.match(js, /FilamentInventoryScanner\?\.open/);
});

test('V11 page hierarchy owns contextual actions and progressive disclosure', async () => {
  const js = await read('app-shell-client.js');
  for (const contract of [
    'PAGE_ACTIONS',
    'fi-page-header-actions',
    'inventoryAddBtn',
    'exportHistoryBtn',
    'installBtn',
    'spool-form-essentials',
    'spool-form-advanced',
    'inventory-filter-dialog',
    'data-group-danger',
  ]) assert.ok(js.includes(contract), `missing V11 page contract: ${contract}`);
});

test('V11 shell owns one profile switcher while user isolation owns reload and data routing', async () => {
  const [shell, isolation] = await Promise.all([read('app-shell-client.js'), read('user-isolation.js')]);
  assert.match(shell, /profile-switch-dialog/);
  assert.match(shell, /data-profile-owner/);
  assert.match(shell, /localStorage\.setItem\('filament-current-user-v1'/);
  assert.match(isolation, /key===CURRENT_USER_KEY/);
  assert.match(isolation, /host\.location\.reload\(\)/);
  assert.match(isolation, /physicalKey\(rawOwner\(\),key\)/);
});

test('V11 dialog and responsive shell invariants are explicit and accessibility-safe', async () => {
  const css = await read('css/components/v11.css');
  assert.match(css, /html\.fi-v11 dialog:not\(\[open\]\)\s*\{\s*display:\s*none/);
  assert.match(css, /dialog::backdrop/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /@media \(min-width: 960px\)/);
  assert.match(css, /@media \(max-width: 959px\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(css, /!important/);
});

test('V11 shell assets are published and activated without changing the data schema', async () => {
  const [assets, html, version] = await Promise.all([
    read('scripts/public-assets.mjs'),
    read('index.html'),
    read('app-version.js'),
  ]);
  assert.match(assets, /'css\/components\/v11\.css'/);
  assert.match(assets, /'css\/components\/v11-workflows\.css'/);
  assert.match(assets, /'app-shell-client\.js'/);
  assert.match(html, /href="\/css\/tokens\.css"/);
  assert.match(html, /href="\/css\/components\/v11\.css"/);
  assert.match(html, /src="\/app-shell-client\.js"/);
  assert.match(version, /DATA_SCHEMA_VERSION = 10/);
});
