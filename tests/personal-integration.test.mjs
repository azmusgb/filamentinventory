import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('personal dashboard assets load after household/audit layers and before app', async () => {
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

test('personal dashboard switches isolated workspace through the current-user boundary', async () => {
  const source = await readFile(new URL('../personal-dashboard.js', import.meta.url), 'utf8');
  assert.match(source, /localStorage\.setItem\(CURRENT_USER_KEY, owner\)/);
  assert.doesNotMatch(source, /householdSelect\.dispatchEvent/);
});

test('personal dashboard describes private rather than shared inventory', async () => {
  const source = await readFile(new URL('../personal-dashboard.js', import.meta.url), 'utf8');
  assert.match(source, /Private inventory only/);
  assert.doesNotMatch(source, /Shared household inventory/);
  assert.doesNotMatch(source, /Shared activity/);
});

test('personal add action opens the existing add-spool flow only once', async () => {
  const source = await readFile(new URL('../personal-dashboard.js', import.meta.url), 'utf8');
  assert.match(source, /function addSpool\(\) \{ const button = document\.getElementById\('addTopBtn'\) \|\| document\.getElementById\('heroAddBtn'\); button\?\.click\(\); \}/);
  assert.doesNotMatch(source, /\.click\(\) \|\| document\.getElementById\('heroAddBtn'\)/);
});

test('PWA manifest list includes both personal command center assets', async () => {
  const source = await readFile(new URL('../scripts/public-assets.mjs', import.meta.url), 'utf8');
  assert.match(source, /'personal-core\.js'/);
  assert.match(source, /'personal-dashboard\.js'/);
});
