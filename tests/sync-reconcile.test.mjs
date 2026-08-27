import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileConcurrentState, reconcileSpoolRecord } from '../netlify/functions/sync-reconcile.mts';

const at = minute => `2026-08-27T02:${String(minute).padStart(2, '0')}:00.000Z`;
const spool = (updatedAt, extra = {}) => ({
  id: 'S001',
  owner: 'Bill',
  brand: 'Test',
  material: 'PLA',
  colorName: 'Blue',
  placementState: 'Stored',
  printerName: '',
  feederName: '',
  feederSlot: '',
  loadedAt: null,
  gross: 800,
  tare: 200,
  createdAt: at(0),
  updatedAt,
  ...extra,
});

test('independent owner and weight edits are both preserved', () => {
  const base = spool(at(1));
  const remote = spool(at(2), { owner: 'Aimee' });
  const incoming = spool(at(3), { gross: 700 });
  const result = reconcileSpoolRecord(base, remote, incoming);

  assert.equal(result.record.owner, 'Aimee');
  assert.equal(result.record.gross, 700);
  assert.equal(result.record.updatedAt, at(3));
  assert.deepEqual(result.conflicts, []);
});

test('independent placement and color edits are both preserved', () => {
  const base = spool(at(1));
  const remote = spool(at(2), {
    placementState: 'Loaded',
    printerName: 'P1S',
    feederName: 'AMS 1',
    feederSlot: '2',
    loadedAt: at(2),
  });
  const incoming = spool(at(3), { colorName: 'Red' });
  const result = reconcileSpoolRecord(base, remote, incoming);

  assert.equal(result.record.colorName, 'Red');
  assert.equal(result.record.placementState, 'Loaded');
  assert.equal(result.record.printerName, 'P1S');
  assert.equal(result.record.feederName, 'AMS 1');
  assert.equal(result.record.feederSlot, '2');
  assert.deepEqual(result.conflicts, []);
});

test('conflicting placement edits resolve atomically to newest side', () => {
  const base = spool(at(1));
  const remote = spool(at(2), {
    placementState: 'Loaded',
    printerName: 'P1S',
    feederName: 'AMS 1',
    feederSlot: '1',
    loadedAt: at(2),
  });
  const incoming = spool(at(3), {
    placementState: 'Loaded',
    printerName: 'X1C',
    feederName: 'AMS 2',
    feederSlot: '4',
    loadedAt: at(3),
  });
  const result = reconcileSpoolRecord(base, remote, incoming);

  assert.equal(result.record.printerName, 'X1C');
  assert.equal(result.record.feederName, 'AMS 2');
  assert.equal(result.record.feederSlot, '4');
  assert.ok(result.conflicts.includes('placement'));
});

test('same-field conflict resolves to newer record and is reported', () => {
  const base = spool(at(1), { notes: 'base' });
  const remote = spool(at(2), { notes: 'remote' });
  const incoming = spool(at(3), { notes: 'incoming' });
  const result = reconcileSpoolRecord(base, remote, incoming);

  assert.equal(result.record.notes, 'incoming');
  assert.ok(result.conflicts.includes('notes'));
});

test('state reconciliation replaces two-way LWW with a three-way merged spool', () => {
  const baseSpool = spool(at(1));
  const remoteSpool = spool(at(2), { owner: 'Aimee' });
  const incomingSpool = spool(at(3), { gross: 700 });
  const twoWayWinner = incomingSpool;

  const result = reconcileConcurrentState(
    { spools: [baseSpool] },
    { spools: [remoteSpool] },
    { spools: [incomingSpool] },
    { version: 5, spools: [twoWayWinner], weighLog: [], tombstones: {} },
  );

  assert.equal(result.state.spools[0].owner, 'Aimee');
  assert.equal(result.state.spools[0].gross, 700);
  assert.equal(result.stats.threeWaySpools, 1);
  assert.equal(result.stats.conflictedSpools, 0);
});

test('records removed by tombstone are not resurrected by reconciliation', () => {
  const baseSpool = spool(at(1));
  const remoteSpool = spool(at(2), { owner: 'Aimee' });
  const incomingSpool = spool(at(3), { gross: 700 });

  const result = reconcileConcurrentState(
    { spools: [baseSpool] },
    { spools: [remoteSpool] },
    { spools: [incomingSpool] },
    { version: 5, spools: [], weighLog: [], tombstones: { s001: at(4) } },
  );

  assert.deepEqual(result.state.spools, []);
  assert.equal(result.stats.threeWaySpools, 0);
});

test('same-field conflicts are counted and bounded by spool id', () => {
  const baseSpool = spool(at(1), { notes: 'base' });
  const remoteSpool = spool(at(2), { notes: 'remote' });
  const incomingSpool = spool(at(3), { notes: 'incoming' });

  const result = reconcileConcurrentState(
    { spools: [baseSpool] },
    { spools: [remoteSpool] },
    { spools: [incomingSpool] },
    { version: 5, spools: [incomingSpool], weighLog: [], tombstones: {} },
  );

  assert.equal(result.stats.conflictedSpools, 1);
  assert.equal(result.stats.conflictingFields, 1);
  assert.deepEqual(result.stats.conflictIds, ['S001']);
});
