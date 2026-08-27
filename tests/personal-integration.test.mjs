import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('personal dashboard layer loads after household/audit layers and before app', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const personalCore = html.indexOf('/personal-core.js');
  const isolation = html.indexOf('/user-isolation.js');
  const household = html.indexOf('/household-client.js');
  const audit = html.indexOf('/audit-client.js');
  const personal = html.indexOf('/personal-dashboard.js');
  const app = html.indexOf('/app.js');
  assert.ok(personalCore >= 0 && personalCore < isolation, 'personal-core.js must load before the user isolation boundary');
  assert.ok(isolation < household, 'user-isolation.js must load before household/client UI');
  assert.ok(personal > audit && personal < app, 'personal-dashboard.js must layer after audit and before app');
});

test('dashboard uses the global isolated workspace switch instead of a duplicate profile selector', async () => {
  const source = await readFile(new URL('../personal-dashboard.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /id="personalUser"/);
  assert.doesNotMatch(source, /Working as/);
  assert.match(source, /userBoundary/);
  assert.match(source, /Private inventory/);
});

test('dashboard consolidates metrics and empty-state analytics rather than injecting a second command center', async () => {
  const source = await readFile(new URL('../personal-dashboard.js', import.meta.url), 'utf8');
  assert.match(source, /canonicalMetrics/);
  assert.match(source, /#personalCommandCenter\{display:none!important\}/);
  assert.match(source, /#dashboardView\[data-empty="true"\] #metrics/);
  assert.match(source, /#dashboardView\[data-empty="true"\] #auditDashboardCard/);
  assert.match(source, /#dashboardView\[data-empty="true"\]>\.grid-2/);
  assert.match(source, /\+ Add first spool/);
  assert.match(source, /Restore backup/);
});

test('mobile navigation exposes four primary destinations plus More', async () => {
  const source = await readFile(new URL('../personal-dashboard.js', import.meta.url), 'utf8');
  assert.match(source, /PRIMARY_MOBILE_VIEWS = new Set\(\['dashboard', 'inventory', 'weigh', 'household'\]\)/);
  assert.match(source, /mobile-more-tab/);
  assert.match(source, /data-mobile-more-view/);
  assert.match(source, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
});

test('dashboard actively removes obsolete shared-household language from visible surfaces', async () => {
  const source = await readFile(new URL('../personal-dashboard.js', import.meta.url), 'utf8');
  assert.match(source, /Recent activity/);
  assert.match(source, /Private activity ledger/);
  assert.match(source, /separate history · separate sync & backups/);
  assert.doesNotMatch(source, /Shared household inventory/);
  assert.doesNotMatch(source, /Shared activity/);
});

test('personal add action opens the existing add-spool flow only once', async () => {
  const source = await readFile(new URL('../personal-dashboard.js', import.meta.url), 'utf8');
  assert.match(source, /function addSpool\(\) \{ const button = document\.getElementById\('addTopBtn'\) \|\| document\.getElementById\('heroAddBtn'\); button\?\.click\(\); \}/);
  assert.doesNotMatch(source, /\.click\(\) \|\| document\.getElementById\('heroAddBtn'\)/);
});

test('PWA manifest list includes both personal core and consolidated dashboard assets', async () => {
  const source = await readFile(new URL('../scripts/public-assets.mjs', import.meta.url), 'utf8');
  assert.match(source, /'personal-core\.js'/);
  assert.match(source, /'personal-dashboard\.js'/);
});