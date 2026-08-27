import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('browser loads isolation before sync and household state consumers', async () => {
  const html = await read('index.html');
  const isolation = html.indexOf('/user-isolation.js');
  const sync = html.indexOf('/sync-client.js');
  const household = html.indexOf('/household-client.js');
  const app = html.indexOf('/app.js');
  assert.ok(isolation >= 0);
  assert.ok(isolation < sync);
  assert.ok(isolation < household);
  assert.ok(isolation < app);
});

test('sync and security requests are profile-scoped', async () => {
  const [sync, security, server, admin] = await Promise.all([
    read('sync-client.js'),
    read('security-client.js'),
    read('netlify/functions/sync.mts'),
    read('netlify/functions/sync-admin.mts'),
  ]);
  assert.match(sync, /X-Filament-Profile/);
  assert.match(security, /X-Filament-Profile/);
  assert.match(security, /filament-user=/);
  assert.match(server, /x-filament-profile/);
  assert.match(admin, /x-filament-profile/);
  assert.match(server, /hashKey\(key, profile\)/);
  assert.match(admin, /hashKey\(key, profile\)/);
});

test('active UI has a persistent profile boundary and removes cross-user transfer controls', async () => {
  const isolation = await read('user-isolation.js');
  assert.match(isolation, /Private inventory workspace/);
  assert.match(isolation, /Separate spools · separate history · separate backups · separate cloud sync/);
  assert.match(isolation, /data-v8-transfer/);
  assert.match(isolation, /ownerReportV8/);
  assert.match(isolation, /ownerFilterV8/);
  assert.match(isolation, /location\.reload\(\)/);
});

test('PWA and deploy output include the isolation boundary', async () => {
  const [assets, sw, netlify, ci] = await Promise.all([
    read('scripts/public-assets.mjs'),
    read('sw.js'),
    read('netlify.toml'),
    read('.github/workflows/ci.yml'),
  ]);
  assert.match(assets, /'user-isolation\.js'/);
  assert.match(sw, /\/user-isolation\.js/);
  assert.match(netlify, /\/user-isolation\.js/);
  assert.match(ci, /dist\/user-isolation\.js/);
});
