import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const contract = require('../spool-contract-core.js');

test('normalizes canonical product and physical spool metadata without dropping compatible fields', () => {
  const spool = contract.normalizeSpool({id:' S042 ',brand:'Bambu Lab',productLine:'PLA Tough',material:'PLA',colorName:'Blue Grey',colorHex:'#667788',diameterMm:'1.75',manufacturerSku:' 123-ABC ',lotBatch:'LOT-9',startWeight:'1000',owner:'Aimee',placementState:'Loaded',printerName:'P1S',feederName:'AMS 1',feederSlot:'2',customFutureField:'preserved'});
  assert.equal(spool.id,'S042'); assert.equal(spool.productLine,'PLA Tough'); assert.equal(spool.diameterMm,1.75); assert.equal(spool.manufacturerSku,'123-ABC'); assert.equal(spool.owner,'Aimee'); assert.equal(spool.placementState,'Loaded'); assert.equal(spool.customFutureField,'preserved');
});

test('scale evidence is authoritative and visual evidence is explicitly estimated', () => {
  assert.deepEqual(contract.measurement({startWeight:1000,gross:742,tare:215,visualPercent:90}),{grams:527,percent:52.7,source:'Measured',evidence:'scale',measured:true});
  assert.deepEqual(contract.measurement({startWeight:1000,visualPercent:63}),{grams:630,percent:63,source:'Estimated',evidence:'visual',measured:false});
  assert.deepEqual(contract.measurement({startWeight:1000}),{grams:null,percent:null,source:'Unknown',evidence:'none',measured:false});
});

test('first-class quantity evidence takes precedence over legacy quantity fields', () => {
  const spool=contract.normalizeSpool({id:'S100',startWeight:1000,gross:900,tare:200,quantityEvidence:[{evidenceId:'qe-visual',method:'Visual estimate',remainingGrams:800,source:'intake',observedAt:'2026-09-08T12:00:00Z',confidence:'Low'},{evidenceId:'qe-scale',method:'Measured',grossGrams:710,tareGrams:210,source:'workshop-scale',observedAt:'2026-09-09T12:00:00Z',confidence:'Confirmed'}]});
  const result=contract.measurement(spool,Date.parse('2026-09-10T00:00:00Z'));
  assert.equal(result.grams,500); assert.equal(result.percent,50); assert.equal(result.source,'Measured'); assert.equal(result.evidence,'quantity-evidence'); assert.equal(result.evidenceId,'qe-scale'); assert.equal(result.method,'Measured');
});

test('quantity evidence preserves explicit Unknown instead of falling back to legacy values', () => {
  const spool=contract.normalizeSpool({id:'S101',startWeight:1000,gross:900,tare:200,quantityEvidence:[{evidenceId:'qe-unknown',method:'Unknown',source:'migration',observedAt:'2026-09-10T01:00:00Z'}]});
  const result=contract.measurement(spool,Date.parse('2026-09-10T02:00:00Z'));
  assert.equal(result.grams,null); assert.equal(result.source,'Unknown'); assert.equal(result.evidenceId,'qe-unknown'); assert.equal(result.verificationRequired,true);
});

test('newer independent physical-state evidence supersedes an older stronger observation', () => {
  const spool=contract.normalizeSpool({id:'S102',quantityEvidence:[
    {evidenceId:'measured-old',method:'Measured',grossGrams:650,tareGrams:200,observedAt:'2026-09-01T01:00:00Z'},
    {evidenceId:'estimated-new',method:'Printer-estimated usage',remainingGrams:200,observedAt:'2026-09-10T01:00:00Z'},
  ]});
  assert.equal(contract.strongestQuantityEvidence(spool).evidenceId,'estimated-new');
  assert.equal(contract.measurement(spool,Date.parse('2026-09-10T02:00:00Z')).grams,200);
});

test('terminal derived evidence represents current state even when its parent is a stronger measurement', () => {
  const spool=contract.normalizeSpool({id:'S-LINE',quantityEvidence:[
    {evidenceId:'scale-a',method:'Measured',grossGrams:800,tareGrams:200,remainingGrams:600,observedAt:'2026-09-10T10:00:00Z'},
    {evidenceId:'usage-b',method:'Printer-estimated usage',remainingGrams:420,observedAt:'2026-09-10T11:30:00Z',derivedFromEvidenceId:'scale-a'},
    {evidenceId:'usage-c',method:'Printer-estimated usage',remainingGrams:345,observedAt:'2026-09-10T12:30:00Z',derivedFromEvidenceId:'usage-b'},
  ]});
  const lineage=contract.quantityEvidenceLineage(spool);
  assert.deepEqual(lineage.terminals.map(row=>row.evidenceId),['usage-c']);
  assert.equal(lineage.selected.evidenceId,'usage-c');
  assert.equal(contract.measurement(spool,Date.parse('2026-09-10T12:31:00Z')).grams,345);
});

test('a later independent re-weigh becomes the current anchor without deleting prior lineage', () => {
  const spool=contract.normalizeSpool({id:'S-REWEIGH',quantityEvidence:[
    {evidenceId:'scale-a',method:'Measured',grossGrams:800,tareGrams:200,observedAt:'2026-09-10T10:00:00Z'},
    {evidenceId:'usage-b',method:'Printer-estimated usage',remainingGrams:420,observedAt:'2026-09-10T11:30:00Z',derivedFromEvidenceId:'scale-a'},
    {evidenceId:'scale-d',method:'Measured',grossGrams:538,tareGrams:200,observedAt:'2026-09-10T13:00:00Z'},
  ]});
  const lineage=contract.quantityEvidenceLineage(spool);
  assert.deepEqual(new Set(lineage.terminals.map(row=>row.evidenceId)),new Set(['usage-b','scale-d']));
  assert.deepEqual(lineage.currentHeads.map(row=>row.evidenceId),['scale-d']);
  assert.equal(lineage.selected.evidenceId,'scale-d');
  assert.equal(contract.measurement(spool,Date.parse('2026-09-10T13:01:00Z')).grams,338);
});

test('quantity evidence validation rejects cross-spool and internally impossible evidence', () => {
  const result=contract.validateSpool({id:'S103',quantityEvidence:[{evidenceId:'bad-owner',spoolId:'S999',method:'Measured',grossGrams:500,tareGrams:200},{evidenceId:'bad-weight',method:'Measured',grossGrams:100,tareGrams:200},{evidenceId:'duplicate',method:'Visual estimate',remainingGrams:200},{evidenceId:'duplicate',method:'Visual estimate',remainingGrams:180}]});
  assert.equal(result.valid,false); assert.equal(result.errors.some(issue=>issue.code==='quantity-evidence-spool-mismatch'),true); assert.equal(result.errors.some(issue=>issue.code==='quantity-evidence-gross-below-tare'),true); assert.equal(result.errors.some(issue=>issue.code==='duplicate-quantity-evidence-id'),true);
});

test('derived measured evidence warns when its source evidence is omitted', () => {
  const result=contract.validateSpool({id:'S104',quantityEvidence:[{evidenceId:'derived-1',method:'Calculated from measured',remainingGrams:333,observedAt:'2026-09-10T01:00:00Z'}]});
  assert.equal(result.valid,true); assert.equal(result.warnings.some(issue=>issue.code==='derived-evidence-missing-source'),true);
});

test('lineage validation rejects missing parent, self-reference and cycles', () => {
  const missing=contract.validateSpool({id:'S-MISS',quantityEvidence:[{evidenceId:'child',method:'Printer-estimated usage',remainingGrams:300,observedAt:'2026-09-10T01:00:00Z',derivedFromEvidenceId:'not-here'}]});
  assert.equal(missing.errors.some(issue=>issue.code==='quantity-evidence-parent-missing'),true);
  const self=contract.validateSpool({id:'S-SELF',quantityEvidence:[{evidenceId:'self',method:'Printer-estimated usage',remainingGrams:300,observedAt:'2026-09-10T01:00:00Z',derivedFromEvidenceId:'self'}]});
  assert.equal(self.errors.some(issue=>issue.code==='quantity-evidence-self-reference'),true);
  const cycle=contract.validateSpool({id:'S-CYCLE',quantityEvidence:[{evidenceId:'a',method:'Printer-estimated usage',remainingGrams:300,observedAt:'2026-09-10T01:00:00Z',derivedFromEvidenceId:'b'},{evidenceId:'b',method:'Printer-estimated usage',remainingGrams:290,observedAt:'2026-09-10T01:01:00Z',derivedFromEvidenceId:'a'}]});
  assert.equal(cycle.errors.some(issue=>issue.code==='quantity-evidence-cycle'),true);
});

test('state validation rejects derived evidence that references another spool', () => {
  const result=contract.validateState({profile:'Bill',spools:[{id:'S1',quantityEvidence:[{evidenceId:'e1',method:'Measured',grossGrams:500,tareGrams:200}]},{id:'S2',quantityEvidence:[{evidenceId:'e2',method:'Printer-estimated usage',remainingGrams:250,derivedFromEvidenceId:'e1'}]}]});
  assert.equal(result.valid,false);
  assert.equal(result.errors.some(issue=>issue.code==='quantity-evidence-parent-spool-mismatch'),true);
});

test('staleAfter marks selected evidence stale without discarding the measured value', () => {
  const spool=contract.normalizeSpool({id:'S105',startWeight:1000,quantityEvidence:[{evidenceId:'scale-stale',method:'Measured',grossGrams:700,tareGrams:200,observedAt:'2026-09-01T10:00:00Z',staleAfter:'2026-09-05T10:00:00Z',confidence:'Confirmed'}]});
  const assessment=contract.quantityEvidenceAssessment(spool,Date.parse('2026-09-10T10:00:00Z'));
  assert.equal(assessment.status,'stale'); assert.equal(assessment.stale,true); assert.equal(assessment.verificationRequired,true);
  const result=contract.measurement(spool,Date.parse('2026-09-10T10:00:00Z'));
  assert.equal(result.grams,500); assert.equal(result.source,'Measured'); assert.equal(result.stale,true); assert.equal(result.verificationRequired,true); assert.equal(contract.evidenceLabel(spool).includes('stale'),true);
});

test('contemporaneous independent conflicting heads are surfaced instead of silently treated as clean', () => {
  const spool=contract.normalizeSpool({id:'S106',quantityEvidence:[{evidenceId:'scale-a',method:'Measured',grossGrams:700,tareGrams:200,observedAt:'2026-09-10T10:00:00Z',confidence:'Confirmed'},{evidenceId:'scale-b',method:'Measured',grossGrams:650,tareGrams:200,observedAt:'2026-09-10T10:03:00Z',confidence:'Confirmed'}]});
  const assessment=contract.quantityEvidenceAssessment(spool,Date.parse('2026-09-10T10:04:00Z'));
  assert.equal(assessment.status,'conflict'); assert.equal(assessment.conflict,true); assert.equal(assessment.conflicts.length,1); assert.deepEqual(new Set(assessment.conflictEvidenceIds),new Set(['scale-a','scale-b']));
  const result=contract.measurement(spool,Date.parse('2026-09-10T10:04:00Z'));
  assert.equal(result.evidenceId,'scale-b'); assert.equal(result.conflict,true); assert.equal(result.verificationRequired,true); assert.equal(contract.validateSpool(spool).warnings.some(issue=>issue.code==='quantity-evidence-conflict'),true);
});

test('a parent and descendant are state progression, not conflicting observations', () => {
  const spool=contract.normalizeSpool({id:'S107',quantityEvidence:[{evidenceId:'scale-base',method:'Measured',grossGrams:700,tareGrams:200,observedAt:'2026-09-10T10:00:00Z'},{evidenceId:'calc-child',method:'Calculated from measured',remainingGrams:470,observedAt:'2026-09-10T10:02:00Z',derivedFromEvidenceId:'scale-base'}]});
  const assessment=contract.quantityEvidenceAssessment(spool,Date.parse('2026-09-10T10:03:00Z'));
  assert.equal(assessment.conflict,false); assert.equal(assessment.selected.evidenceId,'calc-child');
});

test('measurements outside the conflict window are history, not an automatic conflict', () => {
  const spool=contract.normalizeSpool({id:'S108',quantityEvidence:[{evidenceId:'scale-old',method:'Measured',grossGrams:700,tareGrams:200,observedAt:'2026-09-10T10:00:00Z'},{evidenceId:'scale-new',method:'Measured',grossGrams:600,tareGrams:200,observedAt:'2026-09-10T10:30:00Z'}]});
  assert.equal(contract.quantityEvidenceAssessment(spool,Date.parse('2026-09-10T10:31:00Z')).conflict,false); assert.equal(contract.strongestQuantityEvidence(spool).evidenceId,'scale-new');
});

test('lifecycle and stock state preserve low-stock attention even while a spool is loaded', () => {
  assert.equal(contract.lifecycle({archivedAt:'2026-08-28T12:00:00Z',placementState:'Loaded'}),'Archived'); assert.equal(contract.lifecycle({startWeight:1000,gross:200,tare:200,placementState:'Loaded'}),'Empty'); assert.equal(contract.lifecycle({startWeight:1000,gross:800,tare:200,placementState:'Loaded'}),'Loaded'); assert.equal(contract.lifecycle({startWeight:1000,gross:400,tare:200,reorderThreshold:250,placementState:'Stored'}),'Low'); assert.equal(contract.lifecycle({startWeight:1000,gross:900,tare:200,reorderThreshold:250,placementState:'Stored'}),'Available');
  const loadedLow={startWeight:1000,gross:400,tare:200,reorderThreshold:250,placementState:'Loaded'}; assert.equal(contract.lifecycle(loadedLow),'Loaded'); assert.equal(contract.stockState(loadedLow),'Low'); assert.equal(contract.reorderNeeded(loadedLow),true);
});

test('workflow summary separates lifecycle, stock, placement and evidence', () => {
  const summary=contract.workflowSummary({id:'S9',brand:'Bambu Lab',productLine:'PLA Basic',material:'PLA',colorName:'Blue Grey',startWeight:1000,visualPercent:20,reorderThreshold:250,placementState:'Loaded',printerName:'P1S',feederName:'AMS 1',feederSlot:'2'});
  assert.equal(summary.lifecycle,'Loaded'); assert.equal(summary.stock,'Low'); assert.equal(summary.reorderNeeded,true); assert.equal(summary.measurement.source,'Estimated'); assert.equal(summary.evidenceLabel,'Estimated · visual'); assert.equal(summary.placementLabel,'P1S · AMS 1 · Slot 2'); assert.equal(summary.productLabel,'Bambu Lab · PLA Basic · PLA');
});

test('validation rejects impossible weights and warns when measured filament exceeds nominal capacity', () => {
  const invalid=contract.validateSpool({id:'S1',startWeight:1000,gross:150,tare:200}); assert.equal(invalid.valid,false); assert.equal(invalid.errors.some(issue=>issue.code==='gross-below-tare'),true);
  const suspicious=contract.validateSpool({id:'S2',startWeight:1000,gross:1400,tare:200}); assert.equal(suspicious.valid,true); assert.equal(suspicious.warnings.some(issue=>issue.code==='remaining-above-nominal'),true);
});

test('state validation prevents duplicate spool ids and duplicate physical slot assignments', () => {
  const result=contract.validateState({profile:'Bill',spools:[{id:'S1',placementState:'Loaded',printerName:'P1S',feederName:'AMS 1',feederSlot:'1'},{id:'s1',placementState:'Stored'},{id:'S3',placementState:'Loaded',printerName:'P1S',feederName:'AMS 1',feederSlot:'1'}]});
  assert.equal(result.valid,false); assert.equal(result.errors.some(issue=>issue.code==='duplicate-id'),true); assert.equal(result.errors.some(issue=>issue.code==='slot-conflict'),true);
});