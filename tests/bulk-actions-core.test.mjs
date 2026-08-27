import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const bulk = require('../bulk-actions-core.js');

const state = {
  spools:[
    {id:'A1', location:'Rack A', placementState:'Loaded', printerName:'P1', feederName:'AMS', feederSlot:'1', loadedAt:'2026-08-01T00:00:00Z'},
    {id:'A2', location:'Rack B', placementState:'Stored'},
    {id:'Z9', location:'Archive', archivedAt:'2026-07-01T00:00:00Z'},
  ],
};

test('selection summary adapts mixed active and archived rows', () => {
  const summary = bulk.selectionSummary(state, ['A1','Z9','missing']);
  assert.equal(summary.count, 2);
  assert.equal(summary.activeCount, 1);
  assert.equal(summary.archivedCount, 1);
  assert.equal(summary.loadedCount, 1);
  assert.equal(summary.canArchive, true);
  assert.equal(summary.canRestore, true);
});

test('move location updates only selected active spools', () => {
  const result = bulk.moveLocation(state, ['A1','Z9'], 'Dry box', '2026-08-27T12:00:00Z');
  assert.equal(result.changed, 1);
  assert.equal(result.state.spools[0].location, 'Dry box');
  assert.equal(result.state.spools[0].placementState, 'Loaded');
  assert.equal(result.state.spools[2].location, 'Archive');
});

test('mark stored clears physical placement atomically', () => {
  const result = bulk.markStored(state, ['A1'], 'Shelf 2', '2026-08-27T12:01:00Z');
  const spool = result.state.spools[0];
  assert.equal(result.changed, 1);
  assert.equal(spool.location, 'Shelf 2');
  assert.equal(spool.placementState, 'Stored');
  assert.equal(spool.printerName, '');
  assert.equal(spool.feederName, '');
  assert.equal(spool.feederSlot, '');
  assert.equal(spool.loadedAt, null);
});

test('archive and restore affect only valid lifecycle rows', () => {
  const archived = bulk.archive(state, ['A2','Z9'], '2026-08-27T12:02:00Z');
  assert.equal(archived.changed, 1);
  assert.equal(archived.state.spools[1].archivedAt, '2026-08-27T12:02:00Z');
  assert.equal(archived.state.spools[2].archivedAt, '2026-07-01T00:00:00Z');

  const restored = bulk.restore(archived.state, ['A2','Z9'], '2026-08-27T12:03:00Z');
  assert.equal(restored.changed, 2);
  assert.equal(restored.state.spools[1].archivedAt, null);
  assert.equal(restored.state.spools[2].archivedAt, null);
});

test('blank move location is a no-op', () => {
  const result = bulk.moveLocation(state, ['A1'], '   ', '2026-08-27T12:04:00Z');
  assert.equal(result.changed, 0);
  assert.equal(result.state, state);
});
