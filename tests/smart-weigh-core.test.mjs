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
