import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

import {mergeStates,mergeUsageEvents,normalizeState,normalizeUsageEvents} from '../netlify/functions/sync.mts';

const event = (id, observedAt, extra = {}) => ({
  eventId:id,
  spoolId:'S1',
  printerId:'P1S',
  projectId:'project-1',
  printJobId:'print-1',
  beforeGrams:600,
  afterGrams:500,
  consumedGrams:100,
  source:'Reported',
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

test('legacy aliases normalize to the same immutable UsageEvent payload', () => {
  const canonical = event('u1','2026-09-01T12:00:00Z');
  const legacy = {
    usageEventId:'u1',
    spoolId:'S1',
    printer:'P1S',
    projectId:'project-1',
    jobId:'print-1',
    beforeGrams:600,
    afterGrams:500,
    consumedGrams:100,
    source:'PrinterReported',
    confidence:'Medium',
    beforeEvidenceId:'qe-start',
    afterEvidenceId:'qe-complete',
    timestamp:'2026-09-01T12:00:00Z',
    ignoredLegacyField:'must-not-affect-equality',
  };
  const result = mergeUsageEvents([canonical],[legacy]);
  assert.equal(result.rows.length,1);
  assert.deepEqual(result.conflicts,[]);
  assert.equal(result.rows[0].eventId,'u1');
  assert.equal(result.rows[0].projectId,'project-1');
  assert.equal(result.rows[0].printJobId,'print-1');
  assert.equal('ignoredLegacyField' in result.rows[0],false);
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

test('state merge preserves same-payload UsageEvent conflict evidence before normalization', () => {
  const result = mergeStates(
    {version:6,spools:[{id:'S1'}],usageEvents:[]},
    {
      version:6,
      spools:[{id:'S1'}],
      usageEvents:[
        event('u1','2026-09-01T12:00:00Z',{consumedGrams:100}),
        event('u1','2026-09-01T12:00:00Z',{consumedGrams:90}),
      ],
    }
  );
  assert.equal(result.stats.usageEventConflicts,1);
  assert.deepEqual(result.stats.usageEventConflictIds,['u1']);
  assert.equal(result.state.usageEvents.length,1);
  assert.equal(result.state.usageEvents[0].consumedGrams,100);
});

test('state merge surfaces invalid UsageEvents instead of silently discarding them', () => {
  const result = mergeStates(
    {version:6,spools:[{id:'S1'}],usageEvents:[]},
    {
      version:6,
      spools:[{id:'S1'}],
      usageEvents:[
        event('bad-delta','2026-09-01T12:00:00Z',{beforeGrams:400,afterGrams:500,consumedGrams:100}),
        event('bad-consumption','2026-09-02T12:00:00Z',{consumedGrams:0}),
      ],
    }
  );
  assert.equal(result.stats.usageEventInvalids,2);
  assert.deepEqual(result.stats.usageEventInvalidIssues.map(issue=>issue.code),[
    'usage-event-negative-consumption',
    'usage-event-consumption-required',
  ]);
  assert.equal(result.state.usageEvents.length,0);
});

test('sync normalization constrains UsageEvent provenance and confidence to canonical values', () => {
  const [row] = normalizeUsageEvents([event('u1','2026-09-01T12:00:00Z',{
    source:'not-a-real-source',
    confidence:'certain-ish',
  })]);
  assert.equal(row.source,'Unknown');
  assert.equal(row.confidence,'Unknown');
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
