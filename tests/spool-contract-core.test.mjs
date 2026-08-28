import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const contract = require('../spool-contract-core.js');

test('normalizes canonical product and physical spool metadata without dropping compatible fields', () => {
  const spool = contract.normalizeSpool({
    id:' S042 ',
    brand:'Bambu Lab',
    productLine:'PLA Tough',
    material:'PLA',
    colorName:'Blue Grey',
    colorHex:'#667788',
    diameterMm:'1.75',
    manufacturerSku:' 123-ABC ',
    lotBatch:'LOT-9',
    startWeight:'1000',
    owner:'Aimee',
    placementState:'Loaded',
    printerName:'P1S',
    feederName:'AMS 1',
    feederSlot:'2',
    customFutureField:'preserved',
  });

  assert.equal(spool.id, 'S042');
  assert.equal(spool.productLine, 'PLA Tough');
  assert.equal(spool.diameterMm, 1.75);
  assert.equal(spool.manufacturerSku, '123-ABC');
  assert.equal(spool.owner, 'Aimee');
  assert.equal(spool.placementState, 'Loaded');
  assert.equal(spool.customFutureField, 'preserved');
});

test('scale evidence is authoritative and visual evidence is explicitly estimated', () => {
  const measured = contract.measurement({startWeight:1000,gross:742,tare:215,visualPercent:90});
  assert.deepEqual(measured, {grams:527,percent:52.7,source:'Measured',evidence:'scale',measured:true});

  const estimated = contract.measurement({startWeight:1000,visualPercent:63});
  assert.deepEqual(estimated, {grams:630,percent:63,source:'Estimated',evidence:'visual',measured:false});

  const unknown = contract.measurement({startWeight:1000});
  assert.deepEqual(unknown, {grams:null,percent:null,source:'Unknown',evidence:'none',measured:false});
});

test('lifecycle and stock state preserve low-stock attention even while a spool is loaded', () => {
  assert.equal(contract.lifecycle({archivedAt:'2026-08-28T12:00:00Z',placementState:'Loaded'}), 'Archived');
  assert.equal(contract.lifecycle({startWeight:1000,gross:200,tare:200,placementState:'Loaded'}), 'Empty');
  assert.equal(contract.lifecycle({startWeight:1000,gross:800,tare:200,placementState:'Loaded'}), 'Loaded');
  assert.equal(contract.lifecycle({startWeight:1000,gross:400,tare:200,reorderThreshold:250,placementState:'Stored'}), 'Low');
  assert.equal(contract.lifecycle({startWeight:1000,gross:900,tare:200,reorderThreshold:250,placementState:'Stored'}), 'Available');

  const loadedLow = {startWeight:1000,gross:400,tare:200,reorderThreshold:250,placementState:'Loaded'};
  assert.equal(contract.lifecycle(loadedLow), 'Loaded');
  assert.equal(contract.stockState(loadedLow), 'Low');
  assert.equal(contract.reorderNeeded(loadedLow), true);
});

test('workflow summary separates lifecycle, stock, placement and evidence', () => {
  const summary = contract.workflowSummary({
    id:'S9', brand:'Bambu Lab', productLine:'PLA Basic', material:'PLA', colorName:'Blue Grey',
    startWeight:1000, visualPercent:20, reorderThreshold:250,
    placementState:'Loaded', printerName:'P1S', feederName:'AMS 1', feederSlot:'2',
  });
  assert.equal(summary.lifecycle, 'Loaded');
  assert.equal(summary.stock, 'Low');
  assert.equal(summary.reorderNeeded, true);
  assert.equal(summary.measurement.source, 'Estimated');
  assert.equal(summary.evidenceLabel, 'Estimated · visual');
  assert.equal(summary.placementLabel, 'P1S · AMS 1 · Slot 2');
  assert.equal(summary.productLabel, 'Bambu Lab · PLA Basic · PLA');
});

test('validation rejects impossible weights and warns when measured filament exceeds nominal capacity', () => {
  const invalid = contract.validateSpool({id:'S1',startWeight:1000,gross:150,tare:200});
  assert.equal(invalid.valid, false);
  assert.equal(invalid.errors.some(issue => issue.code === 'gross-below-tare'), true);

  const suspicious = contract.validateSpool({id:'S2',startWeight:1000,gross:1400,tare:200});
  assert.equal(suspicious.valid, true);
  assert.equal(suspicious.warnings.some(issue => issue.code === 'remaining-above-nominal'), true);
});

test('state validation prevents duplicate spool ids and duplicate physical slot assignments', () => {
  const result = contract.validateState({
    profile:'Bill',
    spools:[
      {id:'S1',placementState:'Loaded',printerName:'P1S',feederName:'AMS 1',feederSlot:'1'},
      {id:'s1',placementState:'Stored'},
      {id:'S3',placementState:'Loaded',printerName:'P1S',feederName:'AMS 1',feederSlot:'1'},
    ],
  });

  assert.equal(result.valid, false);
  assert.equal(result.errors.some(issue => issue.code === 'duplicate-id'), true);
  assert.equal(result.errors.some(issue => issue.code === 'slot-conflict'), true);
});
