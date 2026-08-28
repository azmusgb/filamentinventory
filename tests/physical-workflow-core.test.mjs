import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const workflow = require('../physical-workflow-core.js');

test('estimated spool recommends verification before physical use', () => {
  const summary = workflow.summary({
    id:'S1', brand:'Bambu Lab', productLine:'PLA Basic', material:'PLA', colorName:'Blue Grey',
    startWeight:1000, visualPercent:64, placementState:'Stored', location:'Rack A', owner:'Bill',
  });
  assert.equal(summary.measurement.source, 'Estimated');
  assert.equal(summary.evidenceLabel, 'Estimated · visual');
  assert.equal(summary.recommendation.key, 'weigh');
  assert.equal(summary.steps.find(step => step.key === 'verify').state, 'attention');
  assert.equal(summary.steps.find(step => step.key === 'placement').state, 'ready');
});

test('measured loaded spool advances to use and retains low-stock attention separately', () => {
  const summary = workflow.summary({
    id:'S2', brand:'Inland', material:'PLA+', colorName:'Black', startWeight:1000,
    gross:420, tare:200, reorderThreshold:250,
    placementState:'Loaded', printerName:'P1S', feederName:'AMS 1', feederSlot:'1', owner:'Bill',
  });
  assert.equal(summary.lifecycle, 'Loaded');
  assert.equal(summary.stock, 'Low');
  assert.equal(summary.reorderNeeded, true);
  assert.equal(summary.measurement.source, 'Measured');
  assert.equal(summary.recommendation.key, 'use');
});

test('mark used is guarded by measured and loaded state', () => {
  const base = {profile:'Bill', spools:[
    {id:'S1', placementState:'Stored', gross:800, tare:200},
    {id:'S2', placementState:'Loaded', printerName:'P1S', visualPercent:80},
    {id:'S3', placementState:'Loaded', printerName:'P1S', gross:800, tare:200},
  ]};
  assert.equal(workflow.markUsed(base, 'S1').reason, 'not-loaded');
  assert.equal(workflow.markUsed(base, 'S2').reason, 'not-measured');

  const at = '2026-08-28T18:00:00.000Z';
  const result = workflow.markUsed(base, 'S3', at);
  assert.equal(result.changed, true);
  assert.equal(result.spool.lastUsedAt, at);
  assert.equal(result.spool.updatedAt, at);
  assert.equal(result.state.spools.find(row => row.id === 'S3').lastUsedAt, at);
  assert.equal(base.spools.find(row => row.id === 'S3').lastUsedAt, undefined);
});

test('product details surface richer canonical metadata without mandatory noise', () => {
  const details = workflow.productDetails({
    id:'S4', owner:'Aimee', productLine:'PLA Tough', diameterMm:1.75,
    manufacturerSku:'SKU-77', lotBatch:'LOT-4', spoolType:'Plastic',
  });
  assert.deepEqual(details.map(row => row.label), ['Product line','Diameter','Manufacturer SKU','Lot / batch','Spool format','Owner']);
});
