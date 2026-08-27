import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const core = require('../weigh-core.js');

test('saved tare outranks a similar-spool inference', () => {
  const saved = core.tareSuggestion({id:'S1', tare:214}, {grams:222, samples:4, confidence:'high'});
  assert.equal(saved.grams, 214);
  assert.equal(saved.source, 'confirmed');
  assert.match(saved.detail, /this spool/i);
});

test('inferred tare stays explicitly suggested rather than becoming measured state', () => {
  const result = core.tareSuggestion({id:'S2', tare:null}, {grams:221, sampleCount:3, confidence:'medium'});
  assert.deepEqual(result, {
    grams:221,
    source:'inferred',
    title:'Suggested tare',
    detail:'Inferred from 3 similar spools. Confirm before using.',
    confidence:'medium',
    samples:3,
  });
});

test('preview matches authoritative gross minus tare and reports reorder impact', () => {
  const spool = {id:'S3', startWeight:1000, reorderThreshold:250};
  assert.deepEqual(core.preview(spool, 430, 210), {
    ok:true, gross:430, tare:210, grams:220, percent:22, threshold:250,
    reorder:true, margin:-30, stock:'Low', impact:'30 g below reorder threshold',
  });
});

test('preview caps physical filament at nominal starting amount', () => {
  const result = core.preview({id:'S4', startWeight:1000}, 1400, 200);
  assert.equal(result.grams, 1000);
  assert.equal(result.percent, 100);
  assert.equal(result.stock, 'Nearly full');
});

test('loaded unknown spools rank ahead of stored measured rows for next measurement', () => {
  const now = Date.parse('2026-08-27T18:00:00Z');
  const spools = [
    {id:'A', placementState:'Stored', gross:700, tare:200, startWeight:1000, updatedAt:'2026-08-27T17:00:00Z'},
    {id:'B', placementState:'Loaded', startWeight:1000, updatedAt:'2026-08-27T17:00:00Z'},
    {id:'C', placementState:'Stored', startWeight:1000, updatedAt:'2026-08-20T17:00:00Z'},
  ];
  const log = [{id:'A', at:'2026-08-27T17:00:00Z', gross:700, tare:200}];
  assert.deepEqual(core.nextToMeasure(spools, log, 3, now).map(row => row.id), ['B','C','A']);
  assert.equal(core.reasonFor(spools[1], log, now), 'Loaded · remaining unknown');
});

test('quick spool choices prefer loaded then recently measured and avoid duplicates', () => {
  const spools = [
    {id:'S1', placementState:'Stored', updatedAt:'2026-08-27T10:00:00Z'},
    {id:'S2', placementState:'Loaded', updatedAt:'2026-08-26T10:00:00Z'},
    {id:'S3', placementState:'Stored', updatedAt:'2026-08-27T12:00:00Z'},
  ];
  const log = [
    {id:'S1', at:'2026-08-27T13:00:00Z'},
    {id:'S2', at:'2026-08-27T14:00:00Z'},
  ];
  assert.deepEqual(core.quickSpools(spools, log, 3).map(row => row.id), ['S2','S1','S3']);
});

test('archived spools never enter quick or next-to-measure lists', () => {
  const spools = [{id:'ACTIVE'}, {id:'OLD', archivedAt:'2026-08-01T00:00:00Z', placementState:'Loaded'}];
  assert.deepEqual(core.quickSpools(spools, [], 10).map(row => row.id), ['ACTIVE']);
  assert.deepEqual(core.nextToMeasure(spools, [], 10).map(row => row.id), ['ACTIVE']);
});
