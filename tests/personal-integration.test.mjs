import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('personal dashboard assets load after household/audit layers and before app', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const personalCore = html.indexOf('/personal-core.js');
  const household = html.indexOf('/household-client.js');
  const audit = html.indexOf('/audit-client.js');
  const personal = html.indexOf('/personal-dashboard.js');
  const app = html.indexOf('/app.js');
  assert.ok(personalCore >= 0 && personalCore < household, 'personal-core.js must load before household/client UI');
  assert.ok(personal > audit && personal < app, 'personal-dashboard.js must layer after audit and before app');
});

test('personal dashboard switches the shared current profile through household control', async () => {
  const source = await readFile(new URL('../personal-dashboard.js', import.meta.url), 'utf8');
  assert.match(source, /document\.getElementById\('currentUserV8'\)/);
  assert.match(source, /householdSelect\.dispatchEvent\(new Event\('change',\{bubbles:true\}\)\)/);
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