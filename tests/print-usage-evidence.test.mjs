import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const core = require('../print-readiness-core.js');
const contract = require('../spool-contract-core.js');

const loadedLegacyMeasured = (overrides = {}) => ({
  id:'S1', material:'PLA', colorName:'Black', startWeight:1000,
  gross:850, tare:200, reorderThreshold:250,
  placementState:'Loaded', printerName:'P1S', feederName:'AMS 1', feederSlot:'1',
  updatedAt:'2026-09-10T10:00:00Z', ...overrides,
});

function planAndStart(state, grams = 200) {
  const plan = core.planJob(state,{jobName:'Evidence fixture',material:'PLA',color:'Black',grams,safetyMargin:0},'S1','2026-09-10T10:05:00Z');
  assert.equal(plan.changed,true);
  const start = core.startJob(plan.state,plan.job.id,'2026-09-10T10:10:00Z');
  assert.equal(start.changed,true);
  return start;
}

test('legacy measured state is materialized as durable first-class evidence at print start', () => {
  const start = planAndStart({spools:[loadedLegacyMeasured()],printJobs:[]});
  const evidence = start.spool.quantityEvidence;
  assert.equal(evidence.length,1);
  assert.equal(evidence[0].method,'Measured');
  assert.equal(evidence[0].grossGrams,850);
  assert.equal(evidence[0].tareGrams,200);
  assert.equal(evidence[0].remainingGrams,650);
  assert.equal(evidence[0].source,'legacy-scale-snapshot');
  assert.equal(evidence[0].observedAt,'2026-09-10T10:00:00Z');
  assert.equal(start.job.quantityEvidenceAtStart.evidenceId,evidence[0].evidenceId);
  assert.equal(start.job.quantityEvidenceAtStart.remainingGrams,650);
});

test('print completion appends printer-estimated usage derived from exact start evidence', () => {
  const spool = loadedLegacyMeasured({
    gross:null,
    quantityEvidence:[{
      evidenceId:'scale-verified',spoolId:'S1',method:'Measured',grossGrams:850,tareGrams:200,
      source:'workshop-scale',observedAt:'2026-09-10T10:00:00Z',confidence:'Confirmed',
    }],
  });
  const start = planAndStart({spools:[spool],printJobs:[]});
  assert.equal(start.job.quantityEvidenceAtStart.evidenceId,'scale-verified');
  const done = core.completeJob(start.state,start.job.id,287,'2026-09-10T12:00:00Z');
  assert.equal(done.changed,true);
  assert.equal(done.remainingAfter,363);
  assert.equal(done.quantityEvidence.method,'Printer-estimated usage');
  assert.equal(done.quantityEvidence.remainingGrams,363);
  assert.equal(done.quantityEvidence.derivedFromEvidenceId,'scale-verified');
  assert.equal(done.quantityEvidence.observedAt,'2026-09-10T12:00:00Z');
  assert.equal(done.quantityEvidence.source,`print-job:${start.job.id}`);
  assert.equal(done.quantityEvidence.spoolId,'S1');
  assert.equal(done.spool.quantityEvidence.length,2);
  assert.equal(done.spool.quantityEvidence[0].evidenceId,'scale-verified');
  assert.equal(done.job.completionEvidenceId,done.quantityEvidence.evidenceId);
  const current = contract.measurement(done.spool,Date.parse('2026-09-10T12:01:00Z'));
  assert.equal(current.evidenceId,done.quantityEvidence.evidenceId);
  assert.equal(current.grams,363);
  assert.equal(current.source,'Estimated');
});

test('legacy remaining field is compatibility mirror, not the authoritative evidence source after completion', () => {
  const start = planAndStart({spools:[loadedLegacyMeasured()],printJobs:[]});
  const done = core.completeJob(start.state,start.job.id,100,'2026-09-10T11:00:00Z');
  assert.equal(done.spool.estimatedRemainingGrams,550);
  assert.equal(done.spool.gross,null);
  const current = contract.measurement(done.spool,Date.parse('2026-09-10T11:01:00Z'));
  assert.equal(current.evidence,'quantity-evidence');
  assert.equal(current.method,'Printer-estimated usage');
  assert.equal(current.grams,550);
});

test('completion is idempotent and cannot append evidence twice', () => {
  const start = planAndStart({spools:[loadedLegacyMeasured()],printJobs:[]});
  const first = core.completeJob(start.state,start.job.id,100,'2026-09-10T11:00:00Z');
  assert.equal(first.changed,true);
  const count = first.spool.quantityEvidence.length;
  const second = core.completeJob(first.state,start.job.id,100,'2026-09-10T11:01:00Z');
  assert.equal(second.changed,false);
  assert.equal(second.reason,'job-already-completed');
  assert.equal(second.state.spools[0].quantityEvidence.length,count);
  assert.equal(second.state.spools[0].estimatedRemainingGrams,550);
});

test('completion refuses to fabricate remaining quantity when start state is unknown', () => {
  const state = {
    spools:[{id:'S1',material:'PLA',colorName:'Black',placementState:'Loaded',printerName:'P1S',quantityEvidence:[{evidenceId:'unknown-start',spoolId:'S1',method:'Unknown',source:'migration',observedAt:'2026-09-10T10:00:00Z'}]}],
    printJobs:[{id:'print-unknown',status:'in-progress',spoolId:'S1',plannedAt:'2026-09-10T09:00:00Z',startedAt:'2026-09-10T10:00:00Z',requiredGrams:50,remainingAtStart:null,quantityEvidenceAtStart:{evidenceId:'unknown-start',method:'Unknown',source:'Unknown',remainingGrams:null}}],
  };
  const done = core.completeJob(state,'print-unknown',25,'2026-09-10T11:00:00Z');
  assert.equal(done.changed,false);
  assert.equal(done.reason,'start-remaining-unknown');
  assert.equal(done.state.spools[0].quantityEvidence.length,1);
});

test('completion requires the exact start evidence to still exist on the same spool', () => {
  const state = {
    spools:[{id:'S1',material:'PLA',colorName:'Black',placementState:'Loaded',printerName:'P1S',quantityEvidence:[]}],
    printJobs:[{id:'print-missing-parent',status:'in-progress',spoolId:'S1',plannedAt:'2026-09-10T09:00:00Z',startedAt:'2026-09-10T10:00:00Z',requiredGrams:50,remainingAtStart:500,quantityEvidenceAtStart:{evidenceId:'removed-evidence',method:'Measured',source:'Measured',remainingGrams:500}}],
  };
  const done = core.completeJob(state,'print-missing-parent',25,'2026-09-10T11:00:00Z');
  assert.equal(done.changed,false);
  assert.equal(done.reason,'start-evidence-missing');
  assert.equal(done.state.spools[0].quantityEvidence.length,0);
});

test('completion cannot derive from evidence owned by another physical spool', () => {
  const state = {
    spools:[
      {id:'S1',material:'PLA',colorName:'Black',placementState:'Loaded',printerName:'P1S',quantityEvidence:[{evidenceId:'foreign-parent',spoolId:'S2',method:'Measured',grossGrams:700,tareGrams:200,remainingGrams:500,observedAt:'2026-09-10T10:00:00Z'}]},
    ],
    printJobs:[{id:'print-cross-spool',status:'in-progress',spoolId:'S1',plannedAt:'2026-09-10T09:00:00Z',startedAt:'2026-09-10T10:00:00Z',requiredGrams:50,remainingAtStart:500,quantityEvidenceAtStart:{evidenceId:'foreign-parent',method:'Measured',source:'Measured',remainingGrams:500}}],
  };
  const done = core.completeJob(state,'print-cross-spool',25,'2026-09-10T11:00:00Z');
  assert.equal(done.changed,false);
  assert.equal(done.reason,'start-evidence-spool-mismatch');
  assert.equal(done.state.spools[0].quantityEvidence.length,1);
});