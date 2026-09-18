import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDisplayFeed } from '../netlify/lib/display-feed.mts';

test('display feed emits a redacted profile-scoped evidence contract', () => {
  const now = new Date('2026-08-30T02:30:00.000Z');
  const feed = buildDisplayFeed([
    {
      key:'inventory-alpha',
      updatedAt:'2026-08-30T02:25:00.000Z',
      state:{
        spools:[
          {
            id:'A1', spoolId:'spool-a1', owner:'Person A', reorderThreshold:250,
            quantityEvidence:[{evidenceId:'e1',method:'Measured',remainingGrams:300,observedAt:'2026-08-30T02:20:00Z'}],
            placement:{kind:'feeder',printerId:'p1',feederId:'ams1',slot:1}, material:'PLA', colorName:'Black',
          },
          {
            id:'A2', spoolId:'spool-a2', owner:'Person A', reorderThreshold:250,
            quantityEvidence:[{evidenceId:'e2',method:'Printer-estimated usage',remainingGrams:100,observedAt:'2026-08-30T02:21:00Z'}],
            placement:{kind:'unloaded'}, material:'PETG', colorName:'Blue',
          },
          {id:'A3', spoolId:'spool-a3', archivedAt:'2026-08-01T00:00:00Z', estimatedRemainingGrams:50},
        ],
        printJobs:[
          {id:'J1', status:'planned', plannedAt:'2026-08-31T12:00:00Z', material:'PETG'},
          {id:'J2', status:'completed', plannedAt:'2026-08-29T12:00:00Z', material:'PLA'},
        ],
      },
    },
  ], now, {profileId:'Person A'});

  assert.equal(feed.contractVersion, 1);
  assert.equal(feed.schemaVersion, '1.0');
  assert.equal(feed.sourceAuthority, 'filamentinventory');
  assert.equal(feed.profileScope, 'Person A');
  assert.equal(feed.freshness, 'fresh');
  assert.deepEqual(feed.capabilities, [
    'inventory-summary',
    'quantity-evidence-summary',
    'placement-summary',
    'queue-summary',
    'staleness',
    'readiness-undetermined',
  ]);
  assert.deepEqual(feed.summary, {spools:2, loaded:1, low:1, unknown:0, queue:1});
  assert.deepEqual(feed.evidence, {measured:1, calculated:0, estimated:1, unknown:0, conflicting:0});
  assert.deepEqual(feed.placement, {loaded:1, external:0, feeder:1, unknown:0, conflicting:0});
  assert.deepEqual(feed.readiness, {state:'undetermined', reason:'No print requirement was supplied to the device summary.'});
  assert.equal(feed.status, '1 spool low');

  const serialized = JSON.stringify(feed);
  assert.doesNotMatch(serialized, /spool-a1|spool-a2|A1|A2|Black|Blue/);
});

test('visual estimate without known nominal weight remains Unknown', () => {
  const feed = buildDisplayFeed([
    {
      key:'inventory-alpha',
      updatedAt:'2026-08-30T02:25:00.000Z',
      state:{
        spools:[
          {id:'A1', placementState:'Stored', material:'PLA', visualPercent:80},
          {id:'A2', placementState:'Stored', gross:350, tare:200, reorderThreshold:250},
        ],
        printJobs:[],
      },
    },
  ], new Date('2026-08-30T02:30:00.000Z'));

  assert.equal(feed.summary.spools, 2);
  assert.equal(feed.summary.unknown, 1);
  assert.equal(feed.summary.low, 1);
  assert.equal(feed.evidence.unknown, 1);
});

test('explicit conflicting quantity evidence is surfaced instead of silently chosen', () => {
  const feed = buildDisplayFeed([
    {
      key:'inventory-alpha',
      updatedAt:'2026-08-30T02:25:00.000Z',
      state:{spools:[{
        id:'A1', placementState:'Stored',
        quantityEvidence:[
          {evidenceId:'m1',method:'Measured',remainingGrams:500,observedAt:'2026-08-30T02:20:00Z'},
          {evidenceId:'v1',method:'Visual estimate',remainingGrams:250,observedAt:'2026-08-30T02:21:00Z'},
        ],
      }], printJobs:[]},
    },
  ], new Date('2026-08-30T02:30:00.000Z'));

  assert.equal(feed.evidence.conflicting, 1);
  assert.match(feed.status, /needs review/);
});

test('invalid canonical placement is surfaced as conflict and never counted loaded', () => {
  const feed = buildDisplayFeed([
    {
      key:'inventory-alpha',
      updatedAt:'2026-08-30T02:25:00.000Z',
      state:{spools:[{
        id:'A1',
        placement:{kind:'feeder',printerId:'p1',feederId:'ams1'},
        quantityEvidence:[{evidenceId:'e1',method:'Measured',remainingGrams:500,observedAt:'2026-08-30T02:20:00Z'}],
      }], printJobs:[]},
    },
  ], new Date('2026-08-30T02:30:00.000Z'));

  assert.equal(feed.summary.loaded, 0);
  assert.equal(feed.placement.conflicting, 1);
});

test('display feed marks old cloud data stale', () => {
  const feed = buildDisplayFeed([
    {
      key:'inventory-alpha',
      updatedAt:'2026-08-30T01:00:00.000Z',
      state:{spools:[{id:'A1', placementState:'Stored', estimatedRemainingGrams:900}], printJobs:[]},
    },
  ], new Date('2026-08-30T02:30:00.000Z'));

  assert.equal(feed.stale, true);
  assert.equal(feed.freshness, 'stale');
  assert.match(feed.status, /data may be stale/);
});

test('display feed handles an empty cloud store without inventing readiness', () => {
  const feed = buildDisplayFeed([], new Date('2026-08-30T02:30:00.000Z'));
  assert.equal(feed.contractVersion, 1);
  assert.equal(feed.freshness, 'unknown');
  assert.equal(feed.status, 'No synced inventory');
  assert.deepEqual(feed.summary, {spools:0, loaded:0, low:0, unknown:0, queue:0});
  assert.equal(feed.readiness.state, 'undetermined');
  assert.equal(feed.stale, true);
});

test('display feed function resolves one authenticated sync scope and never enumerates inventories', () => {
  const source = readFileSync(new URL('../netlify/functions/display-feed.mts', import.meta.url), 'utf8');

  assert.match(source, /x-filament-sync-key/);
  assert.match(source, /x-filament-profile/);
  assert.match(source, /createHash\('sha256'\)/);
  assert.match(source, /inventory-\$\{hash\}/);
  assert.match(source, /store\.get\(keyName/);
  assert.match(source, /profileId:owner/);
  assert.doesNotMatch(source, /store\.list\(/);
  assert.doesNotMatch(source, /searchParams\.get\(['"](?:key|profile)['"]\)/);
});
