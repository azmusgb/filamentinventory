import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { mergeBackupStates, mergeTombstones, normalizeTombstones } = require('../state-merge.js');

const at = minute => `2026-08-27T03:${String(minute).padStart(2, '0')}:00.000Z`;
const spool = (id, updatedAt, extra = {}) => ({ id, brand: 'Test', material: 'PLA', updatedAt, ...extra });

test('incoming backup tombstone deletes an older local spool and its logs', () => {
  const current = {
    version: 9,
    spools: [spool('S001', at(1))],
    weighLog: [{ id: 'S001', at: at(1), gross: 800, tare: 200, note: 'before delete' }],
    tombstones: {},
  };
  const incoming = { version: 9, spools: [], weighLog: [], tombstones: { s001: at(2) } };
  const merged = mergeBackupStates(current, incoming);

  assert.deepEqual(merged.spools, []);
  assert.deepEqual(merged.weighLog, []);
  assert.equal(merged.tombstones.s001, at(2));
});

test('newer local tombstone blocks a stale spool from an incoming backup', () => {
  const current = { version: 9, spools: [], weighLog: [], tombstones: { s001: at(3) } };
  const incoming = { version: 9, spools: [spool('S001', at(2))], weighLog: [], tombstones: {} };
  const merged = mergeBackupStates(current, incoming);

  assert.deepEqual(merged.spools, []);
  assert.equal(merged.tombstones.s001, at(3));
});

test('a newer spool intentionally survives an older tombstone', () => {
  const current = { version: 9, spools: [], weighLog: [], tombstones: { s001: at(1) } };
  const incoming = { version: 9, spools: [spool('S001', at(2), { owner: 'Aimee' })], weighLog: [], tombstones: {} };
  const merged = mergeBackupStates(current, incoming);

  assert.equal(merged.spools.length, 1);
  assert.equal(merged.spools[0].owner, 'Aimee');
});

test('newer local spool cannot be overwritten by a stale backup row', () => {
  const current = { version: 9, spools: [spool('S001', at(3), { owner: 'Aimee' })], weighLog: [], tombstones: {} };
  const incoming = { version: 9, spools: [spool('S001', at(2), { owner: 'Bill' })], weighLog: [], tombstones: {} };
  const merged = mergeBackupStates(current, incoming);

  assert.equal(merged.spools[0].owner, 'Aimee');
  assert.equal(merged.spools[0].updatedAt, at(3));
});

test('newer incoming backup row wins by spool timestamp', () => {
  const current = { version: 9, spools: [spool('S001', at(1), { owner: 'Bill' })], weighLog: [], tombstones: {} };
  const incoming = { version: 9, spools: [spool('S001', at(2), { owner: 'Aimee' })], weighLog: [], tombstones: {} };
  const merged = mergeBackupStates(current, incoming);

  assert.equal(merged.spools[0].owner, 'Aimee');
});

test('measurement history deduplicates while preserving unrelated live rows', () => {
  const same = { id: 'S001', at: at(1), gross: 800, tare: 200, note: 'same' };
  const current = {
    version: 9,
    spools: [spool('S001', at(1)), spool('S002', at(1))],
    weighLog: [same, { id: 'S002', at: at(1), gross: 900, tare: 200, note: 'other' }],
    tombstones: {},
  };
  const incoming = { version: 9, spools: [spool('S001', at(1))], weighLog: [{ ...same }], tombstones: {} };
  const merged = mergeBackupStates(current, incoming);

  assert.equal(merged.weighLog.length, 2);
  assert.deepEqual(merged.weighLog.map(row => row.id).sort(), ['S001', 'S002']);
});

test('newest valid tombstone wins per spool id', () => {
  const merged = mergeTombstones({ S001: at(1), bad: 'not-a-date' }, { s001: at(2), S002: at(3) });
  assert.deepEqual(merged, { s001: at(2), s002: at(3) });
  assert.deepEqual(normalizeTombstones(null), {});
});

test('backup metadata merges without lowering the state version', () => {
  const merged = mergeBackupStates(
    { version: 9, spools: [], weighLog: [], tombstones: {}, meta: { local: true, shared: 'current' } },
    { version: 8, spools: [], weighLog: [], tombstones: {}, meta: { backup: true, shared: 'incoming' } },
  );

  assert.equal(merged.version, 9);
  assert.deepEqual(merged.meta, { local: true, backup: true, shared: 'incoming' });
});
