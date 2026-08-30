import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDisplayFeed } from '../netlify/lib/display-feed.mts';

test('display feed aggregates active inventory without exposing spool identity', () => {
  const now = new Date('2026-08-30T02:30:00.000Z');
  const feed = buildDisplayFeed([
    {
      key:'inventory-alpha',
      updatedAt:'2026-08-30T02:25:00.000Z',
      state:{
        spools:[
          {id:'A1', owner:'Person A', placementState:'Loaded', gross:500, tare:200, reorderThreshold:250, material:'PLA', colorName:'Black'},
          {id:'A2', owner:'Person A', placementState:'Stored', estimatedRemainingGrams:100, reorderThreshold:250, material:'PETG', colorName:'Blue'},
          {id:'A3', owner:'Person A', placementState:'Stored', archivedAt:'2026-08-01T00:00:00Z', estimatedRemainingGrams:50},
        ],
        printJobs:[
          {id:'J1', status:'planned', plannedAt:'2026-08-31T12:00:00Z', material:'PETG'},
          {id:'J2', status:'completed', plannedAt:'2026-08-29T12:00:00Z', material:'PLA'},
        ],
      },
    },
    {
      key:'inventory-beta',
      updatedAt:'2026-08-30T02:20:00.000Z',
      state:{
        spools:[
          {id:'B1', owner:'Person B', placementState:'Stored', visualPercent:80, startWeight:1000, reorderThreshold:250, brand:'Secret Brand'},
        ],
        printJobs:[],
      },
    },
  ], now);

  assert.deepEqual(feed.metrics, [
    {label:'Spools', value:'3'},
    {label:'Loaded', value:'1'},
    {label:'Low', value:'1'},
    {label:'Queue', value:'1'},
  ]);
  assert.equal(feed.status, '1 spool low');
  assert.match(feed.footer, /Queue 1/);
  assert.match(feed.footer, /Next PETG/);
  assert.equal(feed.stale, false);

  const serialized = JSON.stringify(feed);
  assert.doesNotMatch(serialized, /Person A|Person B|A1|A2|B1|Secret Brand|Black|Blue/);
});

test('display feed marks old cloud data stale', () => {
  const feed = buildDisplayFeed([
    {
      key:'inventory-alpha',
      updatedAt:'2026-08-30T01:00:00.000Z',
      state:{
        spools:[{id:'A1', placementState:'Stored', estimatedRemainingGrams:900}],
        printJobs:[],
      },
    },
  ], new Date('2026-08-30T02:30:00.000Z'));

  assert.equal(feed.stale, true);
  assert.match(feed.status, /data may be stale/);
});

test('display feed handles an empty cloud store', () => {
  const feed = buildDisplayFeed([], new Date('2026-08-30T02:30:00.000Z'));
  assert.equal(feed.status, 'No synced inventory');
  assert.deepEqual(feed.metrics.map(metric => metric.value), ['0','0','0','0']);
  assert.equal(feed.stale, true);
});

test('display feed function resolves one authenticated sync scope and never enumerates inventories', () => {
  const source = readFileSync(new URL('../netlify/functions/display-feed.mts', import.meta.url), 'utf8');

  assert.match(source, /x-filament-sync-key/);
  assert.match(source, /x-filament-profile/);
  assert.match(source, /createHash\('sha256'\)/);
  assert.match(source, /inventory-\$\{hash\}/);
  assert.match(source, /store\.get\(keyName/);
  assert.doesNotMatch(source, /store\.list\(/);
  assert.doesNotMatch(source, /searchParams\.get\(['"](?:key|profile)['"]\)/);
});
