import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
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
  'labels-client.js',
  'sync-client.js',
];

test('V11 keeps presentation in shared stylesheets instead of runtime style islands', async () => {
  const files = await Promise.all(RUNTIME_STYLE_FILES.map(read));
  for (let i = 0; i < files.length; i++) {
    assert.doesNotMatch(files[i], /createElement\(['"]style['"]\)/, `${RUNTIME_STYLE_FILES[i]} still injects runtime CSS`);
    assert.doesNotMatch(files[i], /\.textContent\s*=\s*`[\s\S]*?@media/, `${RUNTIME_STYLE_FILES[i]} still embeds a stylesheet template`);
  }
});

test('V10 compatibility bridge is retired from presentation ownership', async () => {
  const bridge = await read('ui-v10-client.js');
  assert.match(bridge, /compatibility bridge/);
  assert.match(bridge, /retired:true/);
  assert.match(bridge, /ensureWorkflowStyles/);
  assert.match(bridge, /classList\.add\('fi-v11'\)/);
  for (const retiredOwner of ['profileMenuButton','mobileBottomNav','inventoryFilterDialog','activitySwitcherV10','data-group-featured']) {
    assert.doesNotMatch(bridge, new RegExp(retiredOwner), `V10 bridge still owns ${retiredOwner}`);
  }
});

test('V11 semantic styles own shell, dialogs, Home and selected-target safety surfaces', async () => {
  const css = await read('css/components/v11.css');
  for (const contract of ['.fi-desktop-sidebar','.mobile-bottom-nav','.profile-chip','.fi-home-dashboard','.fi-selected-targets','dialog:not([open])']) {
    assert.ok(css.includes(contract), `missing V11 shell CSS contract: ${contract}`);
  }
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(css, /!important/);
});

test('V11 workflow stylesheet owns guided task surfaces and print labels', async () => {
  const css = await read('css/components/v11-workflows.css');
  for (const contract of ['.weigh-step','.audit-toolbar','.labels-workflow','.sync-status','@media print']) {
    assert.ok(css.includes(contract), `missing V11 workflow CSS contract: ${contract}`);
  }
});

test('V11 tokens remain the canonical custom-property authority', async () => {
  const tokens = await read('css/tokens.css');
  for (const token of ['--color-bg:','--color-surface:','--color-text:','--color-accent:','--layout-sidebar:','--layout-focus:','--layout-standard:','--layout-workbench:','--label-w:','--label-h:']) {
    assert.ok(tokens.includes(token), `missing V11 token: ${token}`);
  }
});

test('V11 remains presentation-only on data schema 10', async () => {
  const version = await read('app-version.js');
  assert.match(version, /DATA_SCHEMA_VERSION = 10/);
});
