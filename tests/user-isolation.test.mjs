import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const users = require('../user-isolation.js');

test('physical inventory and sync keys are distinct per user', () => {
  assert.notEqual(users.physicalKey('Bill', users.INVENTORY_KEY), users.physicalKey('Aimee', users.INVENTORY_KEY));
  assert.notEqual(users.physicalKey('Bill', users.SYNC_KEY), users.physicalKey('Aimee', users.SYNC_KEY));
  assert.notEqual(users.physicalKey('Bill', users.SYNC_SETTINGS_KEY), users.physicalKey('Aimee', users.SYNC_SETTINGS_KEY));
});

test('legacy combined inventory splits by owner without cross-user rows', () => {
  const legacy = {
    version:9,
    meta:{lastBackupAt:'2026-08-01T00:00:00.000Z'},
    spools:[
      {id:'S1',owner:'Bill',brand:'Inland'},
      {id:'S2',owner:'Aimee',brand:'Polymaker'},
      {id:'S3',brand:'Legacy defaults to Bill'},
    ],
    weighLog:[
      {id:'S1',at:'2026-08-01T01:00:00.000Z'},
      {id:'S2',at:'2026-08-01T02:00:00.000Z'},
    ],
    auditLog:[
      {id:'a1',at:'2026-08-01T01:00:00.000Z',type:'edit',summary:'Bill edit',spoolId:'S1',owner:'Bill'},
      {id:'a2',at:'2026-08-01T02:00:00.000Z',type:'edit',summary:'Aimee edit',spoolId:'S2',owner:'Aimee'},
    ],
    tombstones:{deadbill:'2026-08-01T03:00:00.000Z'},
  };
  const split = users.splitLegacyState(legacy, {schemaVersion:10, at:'2026-08-27T00:00:00.000Z'});
  assert.deepEqual(split.Bill.spools.map(row => row.id), ['S1','S3']);
  assert.deepEqual(split.Aimee.spools.map(row => row.id), ['S2']);
  assert.deepEqual(split.Bill.weighLog.map(row => row.id), ['S1']);
  assert.deepEqual(split.Aimee.weighLog.map(row => row.id), ['S2']);
  assert.deepEqual(split.Bill.auditLog.map(row => row.id), ['a1']);
  assert.deepEqual(split.Aimee.auditLog.map(row => row.id), ['a2']);
  assert.equal(split.Bill.profile, 'Bill');
  assert.equal(split.Aimee.profile, 'Aimee');
  assert.equal(split.Bill.version, 10);
  assert.equal(split.Aimee.version, 10);
});

test('write boundary rejects rows owned by the other user', () => {
  const incoming = {
    version:9,
    spools:[
      {id:'B1',owner:'Bill'},
      {id:'A1',owner:'Aimee'},
      {id:'LEGACY'},
    ],
    weighLog:[{id:'B1'},{id:'A1'},{id:'LEGACY'}],
    auditLog:[
      {id:'ab',owner:'Bill',spoolId:'B1'},
      {id:'aa',owner:'Aimee',spoolId:'A1'},
    ],
  };
  const bill = users.enforceUserState(incoming, 'Bill', 10);
  assert.deepEqual(bill.spools.map(row => row.id), ['B1','LEGACY']);
  assert.ok(bill.spools.every(row => row.owner === 'Bill'));
  assert.deepEqual(bill.weighLog.map(row => row.id), ['B1','LEGACY']);
  assert.deepEqual(bill.auditLog.map(row => row.id), ['ab']);
  assert.equal(bill.profile, 'Bill');
  assert.equal(bill.version, 10);
});

test('isolated empty state is explicitly profile-scoped', () => {
  const state = users.emptyState('Aimee', 10);
  assert.equal(state.profile, 'Aimee');
  assert.equal(state.version, 10);
  assert.deepEqual(state.spools, []);
  assert.deepEqual(state.weighLog, []);
  assert.deepEqual(state.auditLog, []);
});
