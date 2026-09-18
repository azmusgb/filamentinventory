import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const core = require('../print-readiness-core.js');

const baseSpool = overrides => ({
  id:'S1',
  material:'PLA',
  colorName:'Black',
  startWeight:1000,
  reorderThreshold:250,
  placementState:'Loaded',
  printerName:'P1S',
  feederName:'AMS 1',
  feederSlot:'1',
  ...overrides,
});

test('current measured first-class evidence can produce clean ready and is cited', () => {
  const now = Date.parse('2026-09-10T12:00:00Z');
  const spool = baseSpool({quantityEvidence:[{
    evidenceId:'qe-current',
    method:'Measured',
    grossGrams:800,
    tareGrams:200,
    source:'smart-weigh',
    observedAt:'2026-09-10T11:00:00Z',
    staleAfter:'2026-09-11T11:00:00Z',
    confidence:'Confirmed',
  }]});
  const result = core.evaluate([spool], {material:'PLA',color:'Black',grams:300,safetyMargin:10}, now);
  assert.equal(result.status, 'ready');
  assert.equal(result.recommended.verificationRequired, false);
  assert.equal(result.recommended.evidence.evidenceId, 'qe-current');
  assert.equal(result.recommended.evidence.method, 'Measured');
  assert.equal(result.recommended.evidence.status, 'current');
});

test('stale measured evidence is enough numerically but becomes ready-with-caveat', () => {
  const now = Date.parse('2026-09-10T12:00:00Z');
  const spool = baseSpool({quantityEvidence:[{
    evidenceId:'qe-stale',
    method:'Measured',
    grossGrams:800,
    tareGrams:200,
    source:'smart-weigh',
    observedAt:'2026-09-01T11:00:00Z',
    staleAfter:'2026-09-05T11:00:00Z',
    confidence:'Confirmed',
  }]});
  const result = core.evaluate([spool], {material:'PLA',color:'Black',grams:300,safetyMargin:10}, now);
  assert.equal(result.status, 'ready-with-caveat');
  assert.equal(result.recommended.quantityConfidence, 'caveated');
  assert.equal(result.recommended.verificationRequired, true);
  assert.equal(result.recommended.evidence.stale, true);
});

test('conflicting measured evidence cannot produce clean ready', () => {
  const now = Date.parse('2026-09-10T12:04:00Z');
  const spool = baseSpool({quantityEvidence:[
    {evidenceId:'qe-a',method:'Measured',grossGrams:800,tareGrams:200,observedAt:'2026-09-10T12:00:00Z',confidence:'Confirmed'},
    {evidenceId:'qe-b',method:'Measured',grossGrams:750,tareGrams:200,observedAt:'2026-09-10T12:03:00Z',confidence:'Confirmed'},
  ]});
  const result = core.evaluate([spool], {material:'PLA',color:'Black',grams:300,safetyMargin:10}, now);
  assert.equal(result.status, 'ready-with-caveat');
  assert.equal(result.recommended.evidence.conflict, true);
  assert.equal(result.recommended.verificationRequired, true);
});

test('job plan snapshots exact quantity evidence metadata', () => {
  const spool = baseSpool({quantityEvidence:[{
    evidenceId:'qe-plan',method:'Measured',grossGrams:800,tareGrams:200,source:'smart-weigh',observedAt:'2026-09-10T11:00:00Z',staleAfter:'2026-09-11T11:00:00Z',confidence:'Confirmed',
  }]});
  const planned = core.planJob({spools:[spool],printJobs:[]},{jobName:'Bracket',material:'PLA',color:'Black',grams:300,safetyMargin:10},'S1','2026-09-10T12:00:00Z');
  assert.equal(planned.changed, true);
  assert.equal(planned.job.quantityEvidenceAtPlan.evidenceId, 'qe-plan');
  assert.equal(planned.job.quantityEvidenceAtPlan.method, 'Measured');
  assert.equal(planned.job.quantityEvidenceAtPlan.observedAt, '2026-09-10T11:00:00Z');
});

test('start is blocked when measured evidence is stale', () => {
  const spool = baseSpool({quantityEvidence:[{
    evidenceId:'qe-start-stale',method:'Measured',grossGrams:800,tareGrams:200,observedAt:'2026-08-01T11:00:00Z',staleAfter:'2026-08-02T11:00:00Z',confidence:'Confirmed',
  }]});
  const state = {spools:[spool],printJobs:[{
    id:'job-1',status:'planned',jobName:'Bracket',spoolId:'S1',material:'PLA',color:'Black',modelGrams:300,safetyMargin:0,requiredGrams:300,plannedAt:'2026-09-10T12:00:00Z',updatedAt:'2026-09-10T12:00:00Z',
  }]};
  const result = core.startEligibility(state,'job-1');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'quantity-evidence-stale');
});

test('start is blocked when measured evidence conflicts', () => {
  const spool = baseSpool({quantityEvidence:[
    {evidenceId:'qe-start-a',method:'Measured',grossGrams:800,tareGrams:200,observedAt:'2026-09-10T12:00:00Z',confidence:'Confirmed'},
    {evidenceId:'qe-start-b',method:'Measured',grossGrams:750,tareGrams:200,observedAt:'2026-09-10T12:03:00Z',confidence:'Confirmed'},
  ]});
  const state = {spools:[spool],printJobs:[{
    id:'job-2',status:'planned',jobName:'Bracket',spoolId:'S1',material:'PLA',color:'Black',modelGrams:300,safetyMargin:0,requiredGrams:300,plannedAt:'2026-09-10T12:04:00Z',updatedAt:'2026-09-10T12:04:00Z',
  }]};
  const result = core.startEligibility(state,'job-2');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'quantity-evidence-conflict');
});

test('fallback readiness calculation does not invent a 1000 g nominal weight', () => {
  const result = core.measurement({id:'S9',gross:700,tare:200});
  assert.equal(result.grams, 500);
  assert.equal(result.percent, null);
});