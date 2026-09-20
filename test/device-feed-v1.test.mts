import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeviceFeedV1 } from '../netlify/lib/device-feed-v1.mts';

test('device feed preserves measured evidence history and explicit placement', () => {
  const now = new Date('2026-09-17T22:00:00Z');
  const feed = buildDeviceFeedV1({
    key:'inventory-bill',
    updatedAt:'2026-09-17T21:55:00Z',
    state:{spools:[{
      id:'spool-1', material:'PETG', color:'#112233',
      quantityEvidence:[
        {
          evidenceId:'qe-1',
          method:'Measured',
          remainingGrams:612,
          grossGrams:850,
          tareGrams:238,
          source:'scale',
          observedAt:'2026-09-17T21:54:00Z',
          staleAfter:'2026-09-18T21:54:00Z',
          confidence:'Confirmed',
        },
      ],
      placement:{state:'Loaded',printerId:'p1',feederId:'ams1',slot:2,external:false,observedAt:'2026-09-17T21:53:00Z'},
    }]},
  }, 'Bill', now);

  assert.equal(feed.schemaVersion, 1);
  assert.equal(feed.scope.id, 'Bill');
  assert.equal(feed.inventory.spools[0].spoolId, 'spool-1');
  assert.equal(feed.inventory.spools[0].quantity.evidenceId, 'qe-1');
  assert.equal(feed.inventory.spools[0].quantity.method, 'Measured');
  assert.equal(feed.inventory.spools[0].quantity.remainingGrams, 612);
  assert.equal(feed.inventory.spools[0].quantity.status, 'Current');
  assert.equal(feed.inventory.spools[0].quantity.evidenceCount, 1);
  assert.equal(feed.inventory.spools[0].quantity.verificationRequired, false);
  assert.equal(feed.inventory.spools[0].stockState, 'Available');
  assert.equal(feed.inventory.spools[0].placement.slot, 2);
  assert.equal(feed.inventory.spools[0].placement.status, 'Current');
  assert.equal(feed.inventory.spools[0].placement.verificationRequired, false);
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
  assert.equal(spool.quantity.status, 'Unknown');
  assert.equal(spool.quantity.verificationRequired, true);
  assert.equal(spool.stockState, 'Unknown');
  assert.equal(spool.placement.state, 'Unknown');
  assert.equal(spool.placement.status, 'Unknown');
  assert.equal(spool.placement.verificationRequired, true);
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

  const quantity = feed.inventory.spools[0].quantity;
  assert.equal(quantity.remainingGrams, 740);
  assert.equal(quantity.method, 'CalculatedFromMeasured');
  assert.equal(quantity.status, 'Current');
});

test('device feed selects the current terminal evidence instead of treating history as one object', () => {
  const feed = buildDeviceFeedV1({
    key:'inventory-bill',
    updatedAt:'2026-09-17T21:59:00Z',
    state:{spools:[{
      spoolId:'spool-history',
      material:'PLA',
      quantityEvidence:[
        {
          evidenceId:'qe-measured',
          method:'Measured',
          grossGrams:820,
          tareGrams:220,
          remainingGrams:600,
          source:'scale',
          observedAt:'2026-09-17T20:00:00Z',
          confidence:'Confirmed',
        },
        {
          evidenceId:'qe-usage',
          derivedFromEvidenceId:'qe-measured',
          method:'Printer-estimated usage',
          remainingGrams:540,
          source:'print-job',
          observedAt:'2026-09-17T21:50:00Z',
          confidence:'High',
        },
      ],
    }]},
  }, 'Bill', new Date('2026-09-17T22:00:00Z'));

  const quantity = feed.inventory.spools[0].quantity;
  assert.equal(quantity.evidenceCount, 2);
  assert.equal(quantity.evidenceId, 'qe-usage');
  assert.equal(quantity.method, 'PrinterEstimatedUsage');
  assert.equal(quantity.remainingGrams, 540);
  assert.equal(quantity.status, 'Current');
  assert.equal(quantity.conflict, false);
});

test('device feed surfaces conflicting current quantity evidence', () => {
  const feed = buildDeviceFeedV1({
    key:'inventory-bill',
    updatedAt:'2026-09-17T21:59:00Z',
    state:{spools:[{
      id:'spool-conflict',
      quantityEvidence:[
        {
          evidenceId:'qe-a',
          method:'Measured',
          remainingGrams:600,
          observedAt:'2026-09-17T21:52:00Z',
          confidence:'Confirmed',
        },
        {
          evidenceId:'qe-b',
          method:'Measured',
          remainingGrams:520,
          observedAt:'2026-09-17T21:54:00Z',
          confidence:'Confirmed',
        },
      ],
    }]},
  }, 'Bill', new Date('2026-09-17T22:00:00Z'));

  const quantity = feed.inventory.spools[0].quantity;
  assert.equal(quantity.status, 'Conflict');
  assert.equal(quantity.conflict, true);
  assert.deepEqual(quantity.conflictEvidenceIds.sort(), ['qe-a','qe-b']);
  assert.equal(quantity.verificationRequired, true);
  assert.ok(feed.attention.some(row => row.kind === 'quantity-conflict' && row.spoolId === 'spool-conflict'));
});

test('device feed respects evidence staleAfter rather than inventing a freshness deadline', () => {
  const feed = buildDeviceFeedV1({
    key:'inventory-bill',
    updatedAt:'2026-09-17T21:59:00Z',
    state:{spools:[{
      id:'spool-stale',
      quantityEvidence:[
        {
          evidenceId:'qe-stale',
          method:'Measured',
          remainingGrams:410,
          observedAt:'2026-09-17T21:50:00Z',
          staleAfter:'2026-09-17T21:55:00Z',
          confidence:'Confirmed',
        },
      ],
    }]},
  }, 'Bill', new Date('2026-09-17T22:00:00Z'));

  const quantity = feed.inventory.spools[0].quantity;
  assert.equal(quantity.status, 'Stale');
  assert.equal(quantity.verificationRequired, true);
  assert.equal(quantity.staleAfter, '2026-09-17T21:55:00.000Z');
  assert.ok(feed.attention.some(row => row.kind === 'quantity-stale' && row.spoolId === 'spool-stale'));
});

test('device feed surfaces invalid quantity lineage without discarding the numeric observation', () => {
  const feed = buildDeviceFeedV1({
    key:'inventory-bill',
    updatedAt:'2026-09-17T21:59:00Z',
    state:{spools:[{
      id:'spool-invalid-lineage',
      quantityEvidence:[
        {
          evidenceId:'qe-child',
          derivedFromEvidenceId:'missing-parent',
          method:'Printer-estimated usage',
          remainingGrams:390,
          observedAt:'2026-09-17T21:54:00Z',
          confidence:'High',
        },
      ],
    }]},
  }, 'Bill', new Date('2026-09-17T22:00:00Z'));

  const quantity = feed.inventory.spools[0].quantity;
  assert.equal(quantity.remainingGrams, 390);
  assert.equal(quantity.status, 'InvalidLineage');
  assert.equal(quantity.verificationRequired, true);
  assert.ok(feed.attention.some(row => row.kind === 'quantity-lineage-invalid' && row.spoolId === 'spool-invalid-lineage'));
});


test('canonical feeder placement kind is projected with durable identifiers', () => {
  const feed = buildDeviceFeedV1({
    key:'inventory-bill',
    updatedAt:'2026-09-17T21:59:00Z',
    state:{spools:[{
      id:'spool-placement',
      placement:{
        kind:'feeder',
        printerId:'printer-p1s',
        feederId:'ams-1',
        slot:3,
        source:'manual-load',
        observedAt:'2026-09-17T21:58:00Z',
      },
    }]},
  }, 'Bill', new Date('2026-09-17T22:00:00Z'));

  const placement = feed.inventory.spools[0].placement;
  assert.equal(placement.status, 'Current');
  assert.equal(placement.state, 'Loaded');
  assert.equal(placement.printerId, 'printer-p1s');
  assert.equal(placement.feederId, 'ams-1');
  assert.equal(placement.slot, 3);
  assert.equal(placement.external, false);
  assert.equal(placement.source, 'manual-load');
  assert.equal(placement.verificationRequired, false);
});

test('canonical external placement remains explicit and never invents feeder assignment', () => {
  const feed = buildDeviceFeedV1({
    key:'inventory-bill',
    updatedAt:'2026-09-17T21:59:00Z',
    state:{spools:[{
      id:'spool-external',
      placement:{
        kind:'external',
        printerId:'printer-p1s',
        source:'manual-load',
        observedAt:'2026-09-17T21:58:00Z',
      },
    }]},
  }, 'Bill', new Date('2026-09-17T22:00:00Z'));

  const placement = feed.inventory.spools[0].placement;
  assert.equal(placement.status, 'Current');
  assert.equal(placement.state, 'Loaded');
  assert.equal(placement.printerId, 'printer-p1s');
  assert.equal(placement.feederId, null);
  assert.equal(placement.slot, null);
  assert.equal(placement.external, true);
  assert.equal(placement.verificationRequired, false);
});

test('malformed canonical placement is surfaced as conflict instead of partially trusted', () => {
  const feed = buildDeviceFeedV1({
    key:'inventory-bill',
    updatedAt:'2026-09-17T21:59:00Z',
    state:{spools:[{
      id:'spool-placement-conflict',
      placement:{
        kind:'feeder',
        printerId:'printer-p1s',
        feederId:'ams-1',
        observedAt:'2026-09-17T21:58:00Z',
      },
    }]},
  }, 'Bill', new Date('2026-09-17T22:00:00Z'));

  const placement = feed.inventory.spools[0].placement;
  assert.equal(placement.status, 'Conflict');
  assert.equal(placement.state, 'Loaded');
  assert.equal(placement.slot, null);
  assert.equal(placement.verificationRequired, true);
  assert.ok(feed.attention.some(row => row.kind === 'placement-conflict' && row.spoolId === 'spool-placement-conflict'));
});

test('legacy loaded placement preserves loaded fact but requires canonical verification', () => {
  const feed = buildDeviceFeedV1({
    key:'inventory-bill',
    updatedAt:'2026-09-17T21:59:00Z',
    state:{spools:[{
      id:'spool-legacy-loaded',
      placementState:'Loaded',
      printerName:'P1S',
      feederName:'AMS 1',
      feederSlot:'2',
      loadedAt:'2026-09-17T21:58:00Z',
    }]},
  }, 'Bill', new Date('2026-09-17T22:00:00Z'));

  const placement = feed.inventory.spools[0].placement;
  assert.equal(placement.state, 'Loaded');
  assert.equal(placement.status, 'Conflict');
  assert.equal(placement.printerId, null);
  assert.equal(placement.feederId, null);
  assert.equal(placement.slot, null);
  assert.equal(placement.verificationRequired, true);
});


test('stock state is evidence-backed and does not classify stale or conflicting quantity as low', () => {
  const feed = buildDeviceFeedV1({
    key:'inventory-bill',
    updatedAt:'2026-09-17T21:59:00Z',
    state:{spools:[
      {
        id:'spool-low',
        reorderThreshold:250,
        quantityEvidence:[{
          evidenceId:'qe-low',
          method:'Measured',
          remainingGrams:200,
          observedAt:'2026-09-17T21:58:00Z',
          staleAfter:'2026-09-18T21:58:00Z',
        }],
      },
      {
        id:'spool-stale-low',
        reorderThreshold:250,
        quantityEvidence:[{
          evidenceId:'qe-stale-low',
          method:'Measured',
          remainingGrams:100,
          observedAt:'2026-09-17T20:00:00Z',
          staleAfter:'2026-09-17T21:00:00Z',
        }],
      },
    ]},
  }, 'Bill', new Date('2026-09-17T22:00:00Z'));

  assert.equal(feed.inventory.spools[0].stockState, 'Low');
  assert.equal(feed.inventory.spools[1].stockState, 'Unknown');
});
