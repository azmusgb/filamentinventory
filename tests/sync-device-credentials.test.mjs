import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../sync-client.js', import.meta.url), 'utf8');

test('Sync UI exposes revocable WS350 device access without placing browser sync key on the device', () => {
  assert.match(source, /DEVICE_CREDENTIAL_API = '\/api\/device-credentials'/);
  assert.match(source, /WS350 device access/);
  assert.match(source, /Create device token/);
  assert.match(source, /read-only token/);
  assert.match(source, /broader private sync key/);
  assert.match(source, /issueWorkshopDeviceCredential/);
  assert.match(source, /revokeWorkshopDeviceCredential/);
  assert.match(source, /loadDeviceCredentials/);
});

test('device token is shown once with explicit least-authority language', () => {
  assert.match(source, /Workshop OS device token/);
  assert.match(source, /Read-only and profile-scoped/);
  assert.match(source, /It is shown only once and can be revoked here/);
});

test('browser device credential management remains scoped by the active private sync profile', () => {
  assert.match(source, /'X-Filament-Sync-Key':key/);
  assert.match(source, /'X-Filament-Profile':currentProfile\(\)/);
  assert.match(source, /body:JSON\.stringify\(\{action,\.\.\.extra\}\)/);
});

test('forgetting the browser sync key also clears local device-credential metadata', () => {
  assert.match(source, /deviceCredentialRows = \[\];[\s\S]*clearTimeout\(syncTimer\)/);
});
