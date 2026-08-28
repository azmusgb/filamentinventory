import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('V11 shell loads after feature clients and before app mutations', async () => {
  const html = await read('index.html');
  const order = ['personal-dashboard.js','inventory-command-client.js','spool-actions-client.js','bulk-actions-client.js','ui-v10-client.js','app-shell-client.js','app.js'].map(name => html.indexOf(`/${name}`));
  assert.ok(order.every(index => index >= 0), 'all V11 integration assets must be browser-loaded');
  assert.deepEqual(order, [...order].sort((a,b) => a-b));
});

test('feature clients delegate navigation to the V11 navigation API where available', async () => {
  const files = await Promise.all(['labels-client.js','scan-client.js','smart-weigh-client.js','print-readiness-client.js'].map(read));
  assert.ok(files.some(source => source.includes('FilamentInventoryNavigation')), 'workflow clients should use the centralized navigation API');
});

test('V11 profile switching preserves user-isolation routing instead of duplicating storage logic', async () => {
  const [shell, isolation] = await Promise.all([read('app-shell-client.js'),read('user-isolation.js')]);
  assert.match(shell, /localStorage\.setItem\('filament-current-user-v1'/);
  assert.doesNotMatch(shell, /Storage\.prototype\.setItem\s*=/);
  assert.match(isolation, /proto\.setItem=function\(key,value\)/);
  assert.match(isolation, /host\.location\.reload\(\)/);
  assert.match(isolation, /enforceUserState\(parsed,rawOwner\(\),schemaVersion\)/);
});

test('V11 workflows use native dialogs and no browser confirm or prompt APIs for Sync recovery', async () => {
  const [shell, sync] = await Promise.all([read('app-shell-client.js'),read('sync-client.js')]);
  assert.match(shell, /document\.createElement\('dialog'\)/);
  assert.match(shell, /\.showModal\(\)/);
  assert.doesNotMatch(sync, /\bconfirm\s*\(/);
  assert.doesNotMatch(sync, /\bprompt\s*\(/);
});

test('Activity, Labels, Weigh and Sync expose the consolidated V11 workflow contracts', async () => {
  const [audit, labels, weigh, sync] = await Promise.all([
    read('audit-client.js'), read('labels-client.js'), read('smart-weigh-client.js'), read('sync-client.js'),
  ]);
  assert.match(audit, /audit-toolbar/);
  assert.match(audit, /data-category/);
  assert.match(labels, /Select spools/);
  assert.match(labels, /Preview & print/);
  assert.match(weigh, /weigh-step/);
  assert.match(sync, /sync-advanced/);
});

test('V11 compatibility bridge only bootstraps workflow styles for cached documents', async () => {
  const bridge = await read('ui-v10-client.js');
  assert.match(bridge, /\/css\/components\/v11-workflows\.css/);
  assert.match(bridge, /FilamentInventoryNavigation\?\.sync/);
  assert.doesNotMatch(bridge, /localStorage\.setItem\(/);
  assert.doesNotMatch(bridge, /createElement\(['"]dialog['"]\)/);
});
