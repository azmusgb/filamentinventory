import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DEVICE_CREDENTIAL_SCOPE,
  deviceCredentialIndexKey,
  deviceCredentialKey,
  hashDeviceToken,
  inventoryKeyForScope,
  publicCredential,
  revokeDeviceCredentials,
  sanitizeDevice,
  scopeHash,
  validDeviceToken,
} from '../netlify/lib/device-credential.mts';

test('device token validation accepts only the device credential namespace', () => {
  const token = 'fi_dev_' + 'A'.repeat(43);
  assert.equal(validDeviceToken(token), token);
  assert.equal(validDeviceToken('A'.repeat(43)), null);
  assert.equal(validDeviceToken('fi_dev_short'), null);
  assert.equal(validDeviceToken('fi_dev_' + '!'.repeat(43)), null);
});

test('device credential hashing and inventory scope binding are deterministic', () => {
  const token = 'fi_dev_' + 'B'.repeat(43);
  const tokenHash = hashDeviceToken(token);
  assert.match(tokenHash, /^[0-9a-f]{64}$/);
  assert.equal(deviceCredentialKey(tokenHash), `device-credential-${tokenHash}`);

  const bill = scopeHash('x'.repeat(32), 'Bill');
  const aimee = scopeHash('x'.repeat(32), 'Aimee');
  assert.notEqual(bill, aimee);
  assert.equal(inventoryKeyForScope(bill), `inventory-${bill}`);
});

test('public credential metadata never returns the token hash', () => {
  const row = {
    credentialId:'cred-1',
    tokenHash:'f'.repeat(64),
    deviceId:'ws350',
    deviceName:'Workshop Display',
    createdAt:'2026-09-20T05:00:00Z',
  };
  const publicRow = publicCredential(row);
  assert.deepEqual(publicRow, {
    credentialId:'cred-1',
    deviceId:'ws350',
    deviceName:'Workshop Display',
    createdAt:'2026-09-20T05:00:00Z',
    scope:DEVICE_CREDENTIAL_SCOPE,
  });
  assert.equal('tokenHash' in publicRow, false);
});

test('device metadata is bounded and sanitized', () => {
  assert.deepEqual(sanitizeDevice({id:'ws 350/primary',name:'  Workshop Display  '}), {
    id:'ws350primary',
    name:'Workshop Display',
  });
});

test('scope revocation deletes every credential mapping and the index', async () => {
  const deleted = [];
  const scope = 'a'.repeat(64);
  const rows = [
    {credentialId:'one',tokenHash:'1'.repeat(64),deviceId:'d1',deviceName:'One',createdAt:'2026-09-20T05:00:00Z'},
    {credentialId:'two',tokenHash:'2'.repeat(64),deviceId:'d2',deviceName:'Two',createdAt:'2026-09-20T05:00:00Z'},
  ];
  const store = {
    async get(key) {
      assert.equal(key, deviceCredentialIndexKey(scope));
      return rows;
    },
    async delete(key) { deleted.push(key); },
  };

  const result = await revokeDeviceCredentials(store, scope);
  assert.equal(result.revoked, 2);
  assert.deepEqual(deleted, [
    deviceCredentialKey('1'.repeat(64)),
    deviceCredentialKey('2'.repeat(64)),
    deviceCredentialIndexKey(scope),
  ]);
});

test('device feed accepts only a bearer device credential, not the browser sync key', async () => {
  const source = await readFile(new URL('../netlify/functions/device-feed-v1.mts', import.meta.url), 'utf8');
  assert.match(source, /authorization/i);
  assert.match(source, /Bearer/);
  assert.match(source, /validDeviceToken/);
  assert.match(source, /deviceCredentialKey/);
  assert.doesNotMatch(source, /x-filament-sync-key/i);
  assert.doesNotMatch(source, /x-filament-profile/i);
  assert.doesNotMatch(source, /store\.list\(/);
});

test('credential management requires the browser sync scope and supports issue list revoke', async () => {
  const source = await readFile(new URL('../netlify/functions/device-credentials.mts', import.meta.url), 'utf8');
  assert.match(source, /x-filament-sync-key/i);
  assert.match(source, /x-filament-profile/i);
  assert.match(source, /action === 'issue'/);
  assert.match(source, /action === 'list'/);
  assert.match(source, /action === 'revoke'/);
  assert.match(source, /Raw token is returned exactly once/);
  assert.doesNotMatch(source, /store\.list\(/);
});

test('sync scope rotation and wipe revoke device credentials', async () => {
  const source = await readFile(new URL('../netlify/functions/sync-admin.mts', import.meta.url), 'utf8');
  assert.match(source, /revokeDeviceCredentials/);
  const calls = source.match(/revokeDeviceCredentials\(store, oldHash\)/g) || [];
  assert.ok(calls.length >= 3, 'rotate plus both wipe paths must revoke device credentials');
});
