import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const require = createRequire(import.meta.url);
const core = require('../print-readiness-core.js');
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const measured = (overrides = {}) => ({
  id:'S1',
  material:'PLA',
  colorName:'Black',
  startWeight:1000,
  gross:850,
  tare:200,
  reorderThreshold:250,
  updatedAt:'2026-08-28T12:00:00Z',
  ...overrides,
});

test('measured sufficient inventory outranks a loaded visual estimate', () => {
  const spools = [
    measured({id:'S1',gross:850,tare:200,placementState:'Stored'}),
    {id:'S2',material:'PLA',colorName:'Matte Black',startWeight:1000,visualPercent:90,placementState:'Loaded',printerName:'P1S',feederName:'AMS 1',feederSlot:'1'},
  ];
  const result = core.evaluate(spools,{material:'PLA',color:'Black',grams:300,safetyMargin:10},Date.parse('2026-08-28T13:00:00Z'));
  assert.equal(result.status,'ready');
  assert.equal(result.required,330);
  assert.equal(result.recommended.spool.id,'S1');
  assert.equal(result.recommended.measurement.source,'Measured');
  assert.equal(result.recommended.quantityConfidence,'authoritative');
});

test('estimated sufficient inventory is explicitly provisional instead of ready', () => {
  const result = core.evaluate([
    {id:'S1',material:'PLA',colorName:'Black',startWeight:1000,visualPercent:80,placementState:'Loaded'},
  ],{material:'PLA',color:'Black',grams:300,safetyMargin:10});
  assert.equal(result.status,'estimate-ready');
  assert.equal(result.recommended.grams,800);
  assert.equal(result.recommended.verificationRequired,true);
  assert.equal(result.recommended.quantityConfidence,'provisional');
});

test('unknown matching spool requests measurement before print commitment', () => {
  const result = core.evaluate([{id:'S1',material:'PLA',colorName:'Black'}],{material:'PLA',color:'Black',grams:300,safetyMargin:10});
  assert.equal(result.status,'measurement-needed');
  assert.equal(result.recommended.spool.id,'S1');
  assert.equal(result.recommended.measurement.source,'Unknown');
});

test('known insufficient inventory reports not enough', () => {
  const result = core.evaluate([measured({gross:450,tare:210})],{material:'PLA',color:'Black',grams:286,safetyMargin:10});
  assert.equal(result.status,'not-enough');
  assert.equal(result.recommended.grams,240);
});

test('archived and wrong-material spools are excluded and specialized materials remain exact', () => {
  const spools = [
    measured({id:'S1',material:'PETG'}),
    measured({id:'S2',material:'PLA',archivedAt:'2026-01-01'}),
    measured({id:'S3',material:'PLA+'}),
    measured({id:'S4',material:'Nylon-CF'}),
  ];
  assert.equal(core.evaluate(spools,{material:'PLA',color:'Black',grams:100,safetyMargin:0}).status,'no-match');
  assert.deepEqual(core.evaluate(spools,{material:'PLA+',color:'Black',grams:100,safetyMargin:0}).candidates.map(row => row.spool.id),['S3']);
  assert.deepEqual(core.evaluate(spools,{material:'Nylon-CF',color:'Black',grams:100,safetyMargin:0}).candidates.map(row => row.spool.id),['S4']);
});

test('placement recommendation recognizes loaded spool and infers an open AMS slot conservatively', () => {
  const loaded = measured({id:'S1',placementState:'Loaded',printerName:'P1S',feederName:'AMS 1',feederSlot:'2'});
  assert.deepEqual(core.placementRecommendation(loaded,[loaded],{}),{
    status:'already-loaded',printer:'P1S',feeder:'AMS 1',slot:'2',label:'P1S · AMS 1 · Slot 2',
  });

  const stored = measured({id:'S9',placementState:'Stored'});
  const occupied = [1,2,3].map(slot => measured({id:`L${slot}`,placementState:'Loaded',printerName:'P1S',feederName:'AMS 1',feederSlot:String(slot)}));
  const recommendation = core.placementRecommendation(stored,[stored,...occupied],{});
  assert.equal(recommendation.status,'recommended');
  assert.equal(recommendation.printer,'P1S');
  assert.equal(recommendation.feeder,'AMS 1');
  assert.equal(recommendation.slot,'4');
});

test('planned print persists requirement, evidence and placement but cannot start before load and scale verification', () => {
  const state = {spools:[{id:'S1',material:'PLA',colorName:'Black',startWeight:1000,visualPercent:80,placementState:'Stored'}],printJobs:[]};
  const plan = core.planJob(state,{jobName:'Bracket',material:'PLA',color:'Black',grams:300,safetyMargin:10},'S1','2026-08-28T14:00:00Z');
  assert.equal(plan.changed,true);
  assert.equal(plan.job.jobName,'Bracket');
  assert.equal(plan.job.requiredGrams,330);
  assert.equal(plan.job.evidenceAtPlan,'Estimated');
  assert.equal(plan.job.verificationRequired,true);
  assert.equal(state.printJobs.length,0);

  const start = core.startJob(plan.state,plan.job.id,'2026-08-28T14:05:00Z');
  assert.equal(start.changed,false);
  assert.equal(start.reason,'not-loaded');
});

test('starting a job requires loaded measured evidence and enough headroom', () => {
  const state = {spools:[measured({placementState:'Loaded',printerName:'P1S',feederName:'AMS 1',feederSlot:'1'})],printJobs:[]};
  const plan = core.planJob(state,{jobName:'Fixture',material:'PLA',color:'Black',grams:300,safetyMargin:10},'S1','2026-08-28T14:00:00Z');
  const start = core.startJob(plan.state,plan.job.id,'2026-08-28T14:10:00Z');
  assert.equal(start.changed,true);
  assert.equal(start.job.status,'in-progress');
  assert.equal(start.job.remainingAtStart,650);
  assert.equal(start.job.evidenceAtStart,'Measured');
});

test('completing a print converts the stale scale reading into a usage estimate and records consumption', () => {
  const state = {spools:[measured({placementState:'Loaded',printerName:'P1S',feederName:'AMS 1',feederSlot:'1'})],printJobs:[]};
  const plan = core.planJob(state,{jobName:'Fixture',material:'PLA',color:'Black',grams:300,safetyMargin:10},'S1','2026-08-28T14:00:00Z');
  const start = core.startJob(plan.state,plan.job.id,'2026-08-28T14:10:00Z');
  const done = core.completeJob(start.state,start.job.id,287,'2026-08-28T16:00:00Z');
  assert.equal(done.changed,true);
  assert.equal(done.job.status,'completed');
  assert.equal(done.job.consumedGrams,287);
  assert.equal(done.remainingAfter,363);
  assert.equal(done.spool.gross,null);
  assert.equal(done.spool.tare,200);
  assert.equal(done.spool.estimatedRemainingGrams,363);
  assert.equal(done.spool.remainingEvidenceSource,'print-job');
  assert.equal(done.spool.lastPrintJobId,done.job.id);
  assert.equal(core.measurement(done.spool).source,'Estimated');
  assert.equal(core.measurement(done.spool).evidence,'usage');
});

test('completion rejects impossible consumption instead of silently clamping inventory', () => {
  const state = {spools:[measured({placementState:'Loaded',printerName:'P1S'})],printJobs:[]};
  const plan = core.planJob(state,{material:'PLA',color:'Black',grams:100,safetyMargin:0},'S1','2026-08-28T14:00:00Z');
  const start = core.startJob(plan.state,plan.job.id,'2026-08-28T14:05:00Z');
  const done = core.completeJob(start.state,start.job.id,900,'2026-08-28T15:00:00Z');
  assert.equal(done.changed,false);
  assert.equal(done.reason,'consumption-exceeds-start');
});

test('V11 shell lazy-loads readiness modules and exposes one print-check action', async () => {
  const shell = await read('app-shell-client.js');
  const client = await read('print-readiness-client.js');
  assert.match(shell,/print-readiness-core\.js/);
  assert.match(shell,/print-readiness-client\.js/);
  assert.match(shell,/const scriptLoads = new Map\(\)/);
  assert.match(shell,/action === 'print' && await ensurePrintReadiness\(\)/);
  assert.match(client,/(?:dataset\.printReadiness\s*=|data-print-readiness)/);
  assert.match(client,/\[data-print-readiness\]/);
  assert.match(client,/Can I print this\?/);
  assert.match(client,/data-print-plan/);
  assert.match(client,/data-print-start/);
  assert.match(client,/data-print-complete/);
});

test('print intelligence dialog remains labelled and live-announced', async () => {
  const client = await read('print-readiness-client.js');
  assert.match(client,/aria-labelledby','printReadinessTitle'/);
  assert.match(client,/id="printReadinessTitle"/);
  assert.match(client,/role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(client,/host\.dataset\.hasResult\s*=\s*'1'/);
  assert.match(client,/function hasRecheckableQuery\(\)/);
  assert.match(client,/if\(hasRecheckableQuery\(\)\)render\(\)/);
  assert.match(client,/dialog\.showModal\(\)/);
});
