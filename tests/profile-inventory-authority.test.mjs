import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const users = require('../user-isolation.js');

test('Bill starter state is a real profile-scoped state rather than an in-memory-only fallback', () => {
  const state = users.starterState('Bill', 10, {at:'2026-08-28T23:55:00.000Z'});
  assert.equal(state.profile, 'Bill');
  assert.equal(state.version, 10);
  assert.equal(state.meta.starterInventory, true);
  assert.ok(state.spools.length > 0);
  assert.ok(state.spools.every(spool => spool.owner === 'Bill'));
  assert.ok(state.spools.some(spool => spool.id === 'C01' && spool.colorName === 'Purple' && spool.visualPercent === 65));
  assert.deepEqual(state.printJobs, []);
});

test('Aimee never receives Bill starter rows', () => {
  const state = users.starterState('Aimee', 10, {at:'2026-08-28T23:55:00.000Z'});
  assert.equal(state.profile, 'Aimee');
  assert.deepEqual(state.spools, []);
  assert.deepEqual(state.printJobs, []);
});

test('write-boundary enforcement keeps print jobs inside the owning profile', () => {
  const incoming = {
    version:10,
    spools:[{id:'B1',owner:'Bill'},{id:'A1',owner:'Aimee'}],
    weighLog:[],
    auditLog:[],
    printJobs:[
      {id:'PB',spoolId:'B1',status:'planned',plannedAt:'2026-08-28T20:00:00.000Z'},
      {id:'PA',spoolId:'A1',status:'planned',plannedAt:'2026-08-28T20:00:00.000Z'},
    ],
  };
  const bill = users.enforceUserState(incoming, 'Bill', 10);
  assert.deepEqual(bill.spools.map(row => row.id), ['B1']);
  assert.deepEqual(bill.printJobs.map(row => row.id), ['PB']);
});
