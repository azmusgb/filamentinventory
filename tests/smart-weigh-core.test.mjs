import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const core = require('../smart-weigh-core.js');

test('preferred and loaded unknown spools rank first', () => {
  const spools = [
    {id:'S1', visualPercent:50},
    {id:'S2', placementState:'Loaded'},
    {id:'S3', gross:700, tare:200, placementState:'Loaded'},
  ];
  assert.deepEqual(core.rankSpools(spools, [], 'S1').map(row => row.id), ['S1','S2','S3']);
});

test('confirmed tare outranks inference', () => {
  assert.deepEqual(core.tareSuggestion({id:'S1', tare:212}, []), {grams:212, source:'confirmed', count:1, confidence:'authoritative'});
});

test('similar spool tare uses median and remains explicitly inferred', () => {
  const target = {id:'S1', brand:'Bambu Lab', material:'PLA Basic', spoolType:'Plastic'};
  const peers = [210,212,214].map((tare, index) => ({id:`P${index}`, brand:'Bambu Lab', material:'PLA Basic', spoolType:'Plastic', tare}));
  assert.deepEqual(core.tareSuggestion(target, peers), {grams:212, source:'similar-strong', count:3, confidence:'strong'});
});

test('preview reports threshold delta without mutation', () => {
  const spool = {startWeight:1000, reorderThreshold:250};
  const result = core.preview(spool, 748, 212);
  assert.deepEqual(result, {valid:true, grams:536, percent:53.6, threshold:250, delta:286, reorder:false});
  assert.equal(spool.gross, undefined);
});

test('preview never invents nominal filament weight when it is unknown', () => {
  const result = core.preview({id:'S5', reorderThreshold:250}, 748, 212);
  assert.deepEqual(result, {valid:true, grams:536, percent:null, threshold:250, delta:286, reorder:false});
});

test('canonical measurement preserves known measured grams while percent stays unknown without nominal weight', () => {
  const result = core.canonicalMeasurement({id:'S6', gross:748, tare:212});
  assert.equal(result.grams, 536);
  assert.equal(result.percent, null);
  assert.equal(result.source, 'Measured');
});

test('measuredEvidence emits first-class measured provenance with deterministic gross minus tare', () => {
  const result = core.measuredEvidence({id:'S7', startWeight:1000}, 748, 212, {
    evidenceId:'qe-s7-1',
    observedAt:'2026-09-10T06:30:00Z',
    source:'workshop-scale',
  });

  assert.equal(result.evidenceId, 'qe-s7-1');
  assert.equal(result.spoolId, 'S7');
  assert.equal(result.method, 'Measured');
  assert.equal(result.grossGrams, 748);
  assert.equal(result.tareGrams, 212);
  assert.equal(result.remainingGrams, 536);
  assert.equal(result.source, 'workshop-scale');
  assert.equal(result.confidence, 'Confirmed');
});

test('latest measurement timestamp can come from first-class quantity evidence', () => {
  const at = core.latestMeasurementAt({
    id:'S8',
    quantityEvidence:[{
      evidenceId:'qe-s8',
      method:'Measured',
      grossGrams:700,
      tareGrams:200,
      observedAt:'2026-09-10T05:00:00Z',
    }],
  }, [{id:'S8', at:'2026-09-01T05:00:00Z'}]);

  assert.equal(at, Date.parse('2026-09-10T05:00:00Z'));
});
