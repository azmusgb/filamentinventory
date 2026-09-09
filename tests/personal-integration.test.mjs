import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('personal dashboard loads after isolation and audit layers before V11 shell orchestration', async () => {
  const html = await read('index.html');
  const personalCore = html.indexOf('/personal-core.js');
  const isolation = html.indexOf('/user-isolation.js');
  const audit = html.indexOf('/audit-client.js');
  const personal = html.indexOf('/personal-dashboard.js');
  const shell = html.indexOf('/app-shell-client.js');
  const app = html.indexOf('/app.js');
  assert.ok(personalCore >= 0 && personalCore < isolation, 'personal-core.js must load before the user isolation boundary');
  assert.ok(isolation < audit && audit < personal, 'isolated activity must exist before dashboard composition');
  assert.ok(personal < shell && shell < app, 'dashboard composition must feed the V11 shell before app mutations');
});

test('dashboard consumes the global isolated profile identity instead of creating a duplicate switcher', async () => {
  const [dashboard, shell] = await Promise.all([read('personal-dashboard.js'),read('app-shell-client.js')]);
  assert.doesNotMatch(dashboard, /id="personalUser"|Working as|profile-switch-dialog/);
  assert.match(dashboard, /FilamentInventoryUsers\?\.currentUser/);
  assert.match(dashboard, /FilamentInventoryProfileUI\?\.read/);
  assert.match(shell, /profile-switch-dialog/);
  assert.match(shell, /data-profile-owner/);
});

test('dashboard is one Workshop Command Center surface with a deliberate zero-spool state', async () => {
  const [source, css] = await Promise.all([read('personal-dashboard.js'), read('css/components/home-v12.css')]);
  assert.doesNotMatch(source, /createElement\(['"]style['"]\)/);
  assert.match(source, /fi-home-dashboard/);
  assert.match(source, /Workshop command center/);
  assert.match(source, /dataset\.empty/);
  assert.match(source, /Add first spool/);
  assert.match(source, /Scan spool/);
  assert.match(source, /print\.hidden = empty/);
  assert.match(source, /No inventory yet/);
  assert.doesNotMatch(source, /Restore backup/);
  assert.match(css, /\.fi-home-empty/);
});

test('Workshop Command Center promotes status, evidence-backed actions, and physical placement context', async () => {
  const [source, css, bootstrap, assets, sw] = await Promise.all([
    read('personal-dashboard.js'),
    read('css/components/home-v12.css'),
    read('ui-v10-client.js'),
    read('scripts/public-assets.mjs'),
    read('sw.js'),
  ]);
  assert.match(source, /workshopStatus/);
  assert.match(source, /workshopInbox/);
  assert.match(source, /data-home-status-title/);
  assert.match(source, /data-home-status-detail/);
  assert.match(source, /data-home-metric="spools"/);
  assert.match(source, /data-home-metric="loaded"/);
  assert.match(source, /data-home-metric="known"/);
  assert.match(source, /data-home-metric="attention"/);
  assert.match(source, /Only evidence-backed exceptions appear here/);
  assert.match(source, /Unknown stays unknown/);
  assert.match(source, /evidenceLabel/);
  assert.match(source, /loadedLabel/);
  assert.match(css, /\.fi-workshop-status/);
  assert.match(css, /\.fi-workshop-metrics/);
  assert.match(css, /\.fi-inbox-row/);
  assert.doesNotMatch(css, /!important/);
  for (const content of [bootstrap,assets,sw]) assert.ok(content.includes('home-v12.css'),'Workshop Command Center stylesheet must ship through bootstrap/build/offline surfaces');
});

test('V11 mobile navigation is owned by the shell and exposes Home, Inventory, Scan, Printer and More', async () => {
  const [shell, personal, css] = await Promise.all([read('app-shell-client.js'), read('personal-dashboard.js'), read('css/components/v11.css')]);
  assert.match(shell, /mobile-bottom-nav/);
  assert.match(shell, /data-bottom-view="dashboard"/);
  assert.match(shell, /data-bottom-view="inventory"/);
  assert.match(shell, /data-bottom-scan/);
  assert.match(shell, /data-bottom-view="household"/);
  assert.match(shell, /data-bottom-more/);
  assert.doesNotMatch(personal, /mobile-bottom-nav|data-bottom-view|data-bottom-more/);
  assert.match(css, /\.mobile-bottom-nav/);
  assert.match(css, /safe-area-inset-bottom/);
});

test('dashboard language is operational, trust-aware, and free of obsolete shared-household framing', async () => {
  const source = await read('personal-dashboard.js');
  for (const expected of ['Workshop Inbox','Loaded now','All caught up','No inventory yet','Workshop status','Quantity unknown']) assert.ok(source.includes(expected),`missing dashboard copy: ${expected}`);
  for (const stale of ['Shared household inventory','Shared activity','Bill + Aimee','Transfer ownership']) assert.equal(source.includes(stale),false,`stale shared copy remains: ${stale}`);
});

test('dashboard does not create a competing add-spool implementation', async () => {
  const source = await read('personal-dashboard.js');
  assert.doesNotMatch(source, /showModal\(.*spoolDialog|new FormData|spools\.push/);
  assert.match(source, /id="heroAddBtn"/);
});

test('PWA manifest publishes personal core, consolidated dashboard, V11 shell and compatibility bridge', async () => {
  const source = await read('scripts/public-assets.mjs');
  for (const asset of ['personal-core.js','personal-dashboard.js','app-shell-client.js','ui-v10-client.js']) assert.ok(source.includes(`'${asset}'`),`missing ${asset}`);
});
