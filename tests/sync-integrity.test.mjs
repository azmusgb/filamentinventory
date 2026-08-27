import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { mergeStates, normalizeState } from '../netlify/functions/sync.mts';

const at = minute => `2026-08-27T01:${String(minute).padStart(2, '0')}:00.000Z`;
const spool = (id, updatedAt, extra = {}) => ({
  id,
  brand: 'Test',
  material: 'PLA',
  colorName: 'Blue',
  updatedAt,
  ...extra,
});

test('normalizeState preserves household ownership and placement metadata', () => {
  const state = normalizeState({
    version: 9,
    spools: [spool('S001', at(1), {
      owner: 'Aimee',
      placementState: 'Loaded',
      printerName: 'P1S',
      feederName: 'AMS 1',
      feederSlot: '3',
      loadedAt: at(1),
    })],
    weighLog: [],
  });

  assert.equal(state.spools[0].owner, 'Aimee');
  assert.equal(state.spools[0].placementState, 'Loaded');
  assert.equal(state.spools[0].printerName, 'P1S');
  assert.equal(state.spools[0].feederName, 'AMS 1');
  assert.equal(state.spools[0].feederSlot, '3');
});

test('newer incoming spool wins without dropping household metadata', () => {
  const remote = { spools: [spool('S001', at(1), { owner: 'Bill', placementState: 'Stored' })], weighLog: [], tombstones: {} };
  const incoming = { spools: [spool('S001', at(2), { owner: 'Aimee', placementState: 'Loaded', printerName: 'X1C', feederName: 'AMS', feederSlot: '1' })], weighLog: [], tombstones: {} };
  const result = mergeStates(remote, incoming);

  assert.equal(result.state.spools.length, 1);
  assert.equal(result.state.spools[0].owner, 'Aimee');
  assert.equal(result.state.spools[0].placementState, 'Loaded');
  assert.equal(result.state.spools[0].printerName, 'X1C');
  assert.equal(result.stats.incomingWins, 1);
});

test('stale incoming spool cannot overwrite newer remote state', () => {
  const remote = { spools: [spool('S001', at(3), { owner: 'Aimee', placementState: 'Stored' })], weighLog: [], tombstones: {} };
  const incoming = { spools: [spool('S001', at(2), { owner: 'Bill', placementState: 'Loaded' })], weighLog: [], tombstones: {} };
  const result = mergeStates(remote, incoming);

  assert.equal(result.state.spools[0].owner, 'Aimee');
  assert.equal(result.state.spools[0].placementState, 'Stored');
  assert.equal(result.stats.remoteWins, 1);
});

test('newer tombstone removes an older spool and its measurement history', () => {
  const remote = {
    spools: [spool('S001', at(1))],
    weighLog: [{ id: 'S001', at: at(1), gross: 800, tare: 200, note: 'before delete' }],
    tombstones: {},
  };
  const incoming = { spools: [], weighLog: [], tombstones: { s001: at(2) } };
  const result = mergeStates(remote, incoming);

  assert.equal(result.state.spools.length, 0);
  assert.equal(result.state.weighLog.length, 0);
});

test('newer spool survives a stale tombstone', () => {
  const remote = { spools: [], weighLog: [], tombstones: { s001: at(1) } };
  const incoming = { spools: [spool('S001', at(2), { owner: 'Bill' })], weighLog: [], tombstones: {} };
  const result = mergeStates(remote, incoming);

  assert.equal(result.state.spools.length, 1);
  assert.equal(result.state.spools[0].id, 'S001');
});

test('measurement history is deduplicated across devices', () => {
  const row = { id: 'S001', at: at(1), gross: 800, tare: 200, note: 'same reading' };
  const remote = { spools: [spool('S001', at(1))], weighLog: [row], tombstones: {} };
  const incoming = { spools: [spool('S001', at(1))], weighLog: [{ ...row }], tombstones: {} };
  const result = mergeStates(remote, incoming);

  assert.equal(result.state.weighLog.length, 1);
});

test('full edit conflict path advances timestamp for forced household changes', async () => {
  const source = await readFile(new URL('../household-client.js', import.meta.url), 'utf8');
  assert.match(source, /const forcedChanged = pendingMeta\.has\(id\);/);
  assert.match(source, /const updatedAt = forcedChanged \? nowIso\(\)/);
});
