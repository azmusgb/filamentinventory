import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('V11.1 shell uses real browser history for user navigation and restores Home from an empty view hash', async () => {
  const shell = await read('app-shell-client.js');
  assert.match(shell, /function routeFromLocation\(\)/);
  assert.match(shell, /return requested && ROUTES\[requested\] \? requested : 'dashboard'/);
  assert.match(shell, /navigate\(view,\{historyMode:'push',focus:true\}\)/);
  assert.match(shell, /window\.addEventListener\('popstate',restore\)/);
  assert.match(shell, /window\.addEventListener\('hashchange',restore\)/);
  assert.match(shell, /restoreRouteFromHistory\(\)/);
  assert.match(shell, /if \(target !== current\)/, 'same-route taps should not create duplicate history entries');
});

test('V11.1 preferences save automatically and flush pending edits before navigation or backgrounding', async () => {
  const preferences = await read('profile-preferences-client.js');
  assert.match(preferences, /Saved automatically/);
  assert.match(preferences, /function scheduleSave\(\)/);
  assert.match(preferences, /setTimeout\(\(\)=>\{saveTimer=0;persistForm\(\);\},450\)/);
  assert.match(preferences, /function flushPendingSave\(\)/);
  assert.match(preferences, /document\.addEventListener\('fi:navigation',flushPendingSave\)/);
  assert.match(preferences, /window\.addEventListener\('pagehide',flushPendingSave\)/);
  assert.match(preferences, /visibilitychange/);
  assert.match(preferences, /previewAppearance/);
  assert.match(preferences, /persistForm/);
});

test('profile switcher uses each profiles normalized identity and escapes personalized labels', async () => {
  const [shell,preferences] = await Promise.all([read('app-shell-client.js'),read('profile-preferences-client.js')]);
  assert.match(preferences, /const readFor=/);
  assert.match(preferences, /Object\.freeze\(\{read,readFor,write/);
  assert.match(shell, /FilamentInventoryProfileUI\?\.readFor\?\.\(forOwner\)/);
  assert.match(shell, /esc\(identity\.initials\)/);
  assert.match(shell, /esc\(identity\.displayName\)/);
  assert.match(shell, /const option=profileIdentity\(name\)/);
  assert.match(shell, /document\.addEventListener\('fi:profile-updated',ensureProfileMenu\)/);
});

test('retired V10 bridge is dormant on native V11 documents but remains available for cached legacy documents', async () => {
  const bridge = await read('ui-v10-client.js');
  assert.match(bridge, /isNativeV11Document/);
  assert.match(bridge, /link\[href=\"\/css\/components\/v11\.css\"\]/);
  assert.match(bridge, /if \(isNativeV11Document\(\)\) return/);
  assert.match(bridge, /retired:true/);
  assert.match(bridge, /active:\(\) => !isNativeV11Document\(\)/);
});

test('V11 PWA registration and v40 cache publish guided spool intake with the current shell offline', async () => {
  const [sw,pwa,version] = await Promise.all([read('sw.js'),read('pwa-client.js'),read('app-version.js')]);
  assert.match(sw, /const CACHE = 'filament-inventory-v40'/);
  for (const asset of ['/pwa-client.js','/profile-preferences-client.js','/spool-intake-client.js','/css/components/spool-intake.css','/app-shell-client.js','/ui-v10-client.js']) assert.ok(sw.includes(asset), `missing PWA asset ${asset}`);
  assert.match(pwa, /navigator\.serviceWorker\.register\(SW_URL, \{scope:'\/'\}\)/);
  assert.match(pwa, /FilamentInventoryPWA/);
  assert.match(version, /ensurePwaRuntime/);
  assert.match(version, /ensureSpoolIntakeRuntime/);
  assert.match(version, /script\.src = src/);
});
