import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('browser loads isolation before sync and private state consumers', async () => {
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
  assert.match(server, /hashKey\(key, owner\)/);
  assert.match(admin, /hashKey\(key, owner\)/);
  assert.match(server, /owner\.toLowerCase\(\).*:\$\{key\}/);
  assert.match(admin, /owner\.toLowerCase\(\).*:\$\{key\}/);
});

test('V11 exposes one persistent profile boundary while isolation owns storage routing and reload', async () => {
  const [isolation, shell] = await Promise.all([read('user-isolation.js'),read('app-shell-client.js')]);
  assert.match(isolation, /OWNERS=Object\.freeze\(\['Bill','Aimee'\]\)/);
  assert.match(isolation, /physicalKey\(rawOwner\(\),key\)/);
  assert.match(isolation, /key===CURRENT_USER_KEY/);
  assert.match(isolation, /host\.location\.reload\(\)/);
  assert.match(shell, /profile-switch-dialog/);
  assert.match(shell, /Private inventories/);
  assert.match(shell, /separate spools, activity, backups and cloud sync/i);
  assert.doesNotMatch(shell, /Transfer ownership|Both owners|ownerReportV8|ownerFilterV8/);
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
  assert.match(ci, /contents: read/);
  assert.doesNotMatch(ci, /apply-user-isolation-integration/);
});
