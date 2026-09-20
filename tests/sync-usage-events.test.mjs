import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

import {mergeStates,mergeUsageEvents,normalizeState,normalizeUsageEvents} from '../netlify/functions/sync.mts';

const event = (id, observedAt, extra = {}) => ({
  eventId:id,
  spoolId:'S1',
  printerId:'P1S',
  projectId:'print-1',
  beforeGrams:600,
  afterGrams:500,
  consumedGrams:100,
  source:'PrinterReported',
  confidence:'Medium',
  beforeEvidenceId:'qe-start',
  afterEvidenceId:'qe-complete',
  observedAt,
  ...extra,
});

test('cloud state normalizes and retains UsageEvent ledger', () => {
  const state = normalizeState({
    version:6,
    spools:[{id:'S1'}],
    usageEvents:[event('u1','2026-09-01T12:00:00Z'),{eventId:'bad',spoolId:'S1',consumedGrams:0,observedAt:'2026-09-01T12:00:00Z'}],
  });
  assert.equal(state.version,6);
  assert.equal(state.usageEvents.length,1);
  assert.equal(state.usageEvents[0].eventId,'u1');
  assert.equal(state.usageEvents[0].beforeEvidenceId,'qe-start');
  assert.equal(state.usageEvents[0].afterEvidenceId,'qe-complete');
});

test('usage ledger merge keeps independent immutable events', () => {
  const result = mergeUsageEvents(
    [event('u1','2026-09-01T12:00:00Z')],
    [event('u2','2026-09-02T12:00:00Z')]
  );
  assert.deepEqual(result.rows.map(row=>row.eventId),['u1','u2']);
  assert.deepEqual(result.conflicts,[]);
});

test('identical usage events deduplicate by durable event ID', () => {
  const row = event('u1','2026-09-01T12:00:00Z');
  const result = mergeUsageEvents([row],[{...row}]);
  assert.equal(result.rows.length,1);
  assert.deepEqual(result.conflicts,[]);
});

test('conflicting duplicate event IDs are surfaced instead of silently overwritten', () => {
  const result = mergeUsageEvents(
    [event('u1','2026-09-01T12:00:00Z',{consumedGrams:100})],
    [event('u1','2026-09-01T12:00:00Z',{consumedGrams:90})]
  );
  assert.equal(result.rows.length,1);
  assert.deepEqual(result.conflicts,['u1']);
  assert.equal(result.rows[0].consumedGrams,100);
});

test('conflicting duplicate event IDs inside one payload are also surfaced', () => {
  const result = mergeUsageEvents(
    [],
    [
      event('u1','2026-09-01T12:00:00Z',{consumedGrams:100}),
      event('u1','2026-09-01T12:00:00Z',{consumedGrams:90}),
    ]
  );
  assert.equal(result.rows.length,1);
  assert.deepEqual(result.conflicts,['u1']);
  assert.equal(result.rows[0].consumedGrams,100);
});

test('two-way state merge preserves usage events from both devices and reports no conflict', () => {
  const remote = {version:6,spools:[{id:'S1'}],usageEvents:[event('u1','2026-09-01T12:00:00Z')]};
  const incoming = {version:6,spools:[{id:'S1'}],usageEvents:[event('u2','2026-09-02T12:00:00Z')]};
  const merged = mergeStates(remote,incoming);
  assert.deepEqual(merged.state.usageEvents.map(row=>row.eventId),['u1','u2']);
  assert.equal(merged.stats.usageEventConflicts,0);
});

test('sync client round-trips usageEvents as part of the authoritative private state', async () => {
  const source = await readFile(new URL('../sync-client.js',import.meta.url),'utf8');
  assert.match(source,/const VERSION = 6/);
  assert.match(source,/usageEvents:Array\.isArray\(local\.usageEvents\)/);
  assert.match(source,/usageEvents:state\.usageEvents \|\| \[\]/);
  assert.match(source,/usageEvents:Array\.isArray\(remote\.usageEvents\)/);
});

test('normalizer keeps ledger bounded and ordered by observation time', () => {
  const rows = normalizeUsageEvents([
    event('later','2026-09-03T12:00:00Z'),
    event('earlier','2026-09-01T12:00:00Z'),
  ]);
  assert.deepEqual(rows.map(row=>row.eventId),['earlier','later']);
});
