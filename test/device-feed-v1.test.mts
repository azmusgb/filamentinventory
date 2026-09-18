import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeviceFeedV1 } from '../netlify/lib/device-feed-v1.mts';

test('device feed preserves measured evidence and explicit placement', () => {
  const now = new Date('2026-09-17T22:00:00Z');
  const feed = buildDeviceFeedV1({
    key:'inventory-bill',
    updatedAt:'2026-09-17T21:55:00Z',
    state:{spools:[{
      id:'spool-1', material:'PETG', color:'#112233',
      quantityEvidence:{method:'Measured',remainingGrams:612,grossGrams:850,tareGrams:238,source:'scale',observedAt:'2026-09-17T21:54:00Z',confidence:1},
      placement:{state:'Loaded',printerId:'p1',feederId:'ams1',slot:2,external:false,observedAt:'2026-09-17T21:53:00Z'},
    }]},
  }, 'Bill', now);

  assert.equal(feed.schemaVersion, 1);
  assert.equal(feed.scope.id, 'Bill');
  assert.equal(feed.inventory.spools[0].spoolId, 'spool-1');
  assert.equal(feed.inventory.spools[0].quantity.method, 'Measured');
  assert.equal(feed.inventory.spools[0].quantity.remainingGrams, 612);
  assert.equal(feed.inventory.spools[0].placement.slot, 2);
  assert.equal(feed.readiness.state, 'Undetermined');
});

test('device feed never invents quantity or placement', () => {
  const feed = buildDeviceFeedV1({
    key:'inventory-aimee',
    updatedAt:'2026-09-17T20:00:00Z',
    state:{spools:[{id:'spool-2',material:'PLA'}]},
  }, 'Aimee', new Date('2026-09-17T22:00:00Z'));

  const spool = feed.inventory.spools[0];
  assert.equal(spool.quantity.remainingGrams, null);
  assert.equal(spool.quantity.method, 'Unknown');
  assert.equal(spool.placement.state, 'Unknown');
  assert.equal(feed.freshness.stale, true);
  assert.ok(feed.unknowns.includes('Quantity unknown for spool spool-2'));
  assert.ok(feed.unknowns.includes('Placement unknown for spool spool-2'));
});

test('legacy gross and tare are classified as calculated from measured', () => {
  const feed = buildDeviceFeedV1({
    key:'inventory-bill',
    updatedAt:'2026-09-17T21:59:00Z',
    state:{spools:[{id:'spool-3',gross:980,tare:240,weighedAt:'2026-09-17T21:58:00Z'}]},
  }, 'Bill', new Date('2026-09-17T22:00:00Z'));
  assert.equal(feed.inventory.spools[0].quantity.remainingGrams, 740);
  assert.equal(feed.inventory.spools[0].quantity.method, 'CalculatedFromMeasured');
});
