import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('personal dashboard layer loads after household/audit layers and before v10/app orchestration', async () => {
  const html = await read('index.html');
  const personalCore = html.indexOf('/personal-core.js');
  const isolation = html.indexOf('/user-isolation.js');
  const household = html.indexOf('/household-client.js');
  const audit = html.indexOf('/audit-client.js');
  const personal = html.indexOf('/personal-dashboard.js');
  const v10 = html.indexOf('/ui-v10-client.js');
  const app = html.indexOf('/app.js');
  assert.ok(personalCore >= 0 && personalCore < isolation, 'personal-core.js must load before the user isolation boundary');
  assert.ok(isolation < household, 'user-isolation.js must load before household/client UI');
  assert.ok(personal > audit && personal < v10 && v10 < app, 'personal dashboard must feed the v10 UI controller before app mutations');
});

test('dashboard uses the global isolated workspace switch instead of a duplicate profile selector', async () => {
  const source = await read('personal-dashboard.js');
  assert.doesNotMatch(source, /id="personalUser"/);
  assert.doesNotMatch(source, /Working as/);
  assert.match(source, /userBoundary/);
  assert.match(source, /Private inventory/);
});

test('dashboard consolidates metrics and empty-state analytics without a second command center or runtime stylesheet', async () => {
  const [source, css] = await Promise.all([read('personal-dashboard.js'), read('ui-system.css')]);
  assert.match(source, /canonicalMetrics/);
  assert.doesNotMatch(source, /createElement\(['"]style['"]\)/);
  assert.match(source, /data\.empty|dataset\.empty/);
  assert.match(source, /\+ Add first spool/);
  assert.match(source, /Restore backup/);
  assert.match(css, /#personalCommandCenter/);
  assert.match(css, /#dashboardView\[data-empty="true"\]/);
});

test('v10 mobile navigation is a native-style bottom bar with Home, Spools, Add, Printer and More', async () => {
  const [client, css] = await Promise.all([read('ui-v10-client.js'), read('ui-system.css')]);
  assert.match(client, /mobileBottomNav/);
  assert.match(client, /data-bottom-view="dashboard"/);
  assert.match(client, /data-bottom-view="inventory"/);
  assert.match(client, /data-bottom-add/);
  assert.match(client, /data-bottom-view="household"/);
  assert.match(client, /data-bottom-more/);
  assert.match(client, /mobileMoreSheetV10/);
  assert.match(css, /\.mobile-bottom-nav/);
  assert.match(css, /safe-area-inset-bottom/);
});

test('dashboard actively removes obsolete shared-household language from visible surfaces', async () => {
  const source = await read('personal-dashboard.js');
  assert.match(source, /Recent activity/);
  assert.match(source, /Private activity ledger/);
  assert.match(source, /separate history · separate sync & backups/);
  assert.doesNotMatch(source, /Shared household inventory/);
  assert.doesNotMatch(source, /Shared activity/);
});

test('personal add action opens the existing add-spool flow only once', async () => {
  const source = await read('personal-dashboard.js');
  assert.match(source, /function addSpool\(\) \{ const button = document\.getElementById\('addTopBtn'\) \|\| document\.getElementById\('heroAddBtn'\); button\?\.click\(\); \}/);
  assert.doesNotMatch(source, /\.click\(\) \|\| document\.getElementById\('heroAddBtn'\)/);
});

test('PWA manifest list includes personal core, consolidated dashboard and v10 controller assets', async () => {
  const source = await read('scripts/public-assets.mjs');
  assert.match(source, /'personal-core\.js'/);
  assert.match(source, /'personal-dashboard\.js'/);
  assert.match(source, /'ui-v10-client\.js'/);
});