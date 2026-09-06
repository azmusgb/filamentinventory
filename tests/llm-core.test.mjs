import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const LLM=require('../llm-core.js');

const state={
  profile:'Bill',
  spools:[
    {id:'S1',brand:'Inland',material:'PLA+',colorName:'Black',startWeight:1000,gross:600,tare:200,reorderThreshold:250,location:'AMS A1',confidence:'Confirmed'},
    {id:'S2',brand:'Overture',material:'PETG',colorName:'Blue',startWeight:1000,visualPercent:20,reorderThreshold:250,location:'Rack A',confidence:'High'},
    {id:'S3',brand:'Polymaker',material:'PLA',colorName:'Purple',startWeight:1000,gross:null,tare:null,visualPercent:null,location:'Dry box',confidence:'High'},
  ]
};

test('measurement prioritizes gross minus tare',()=>{
  assert.deepEqual(LLM.measurement(state.spools[0]),{grams:400,percent:40,source:'Measured'});
});

test('low-stock uses per-spool reorder threshold',()=>{
  const result=LLM.answerLocal('What is low?',LLM.buildSnapshot(state));
  assert.equal(result.intent,'low-stock');
  assert.match(result.answer,/S2/);
  assert.doesNotMatch(result.answer,/S1:/);
});

test('remaining unknown is not hallucinated',()=>{
  const result=LLM.answerLocal('How much S3 is left?',LLM.buildSnapshot(state));
  assert.equal(result.intent,'remaining-unknown');
  assert.match(result.answer,/unknown/i);
  assert.doesNotMatch(result.answer,/\b\d+\s*g\b/i);
});

test('specific nonexistent material does not degrade into a loose color match',()=>{
  const result=LLM.answerLocal('How much purple ASA do I have?',LLM.buildSnapshot(state));
  assert.equal(result.intent,'not-found');
  assert.equal(result.evidence.length,0);
  assert.doesNotMatch(result.answer,/\b\d+\s*g\b/i);
});

test('loaded answers only use explicit placement evidence',()=>{
  const result=LLM.answerLocal('What is loaded in the AMS?',LLM.buildSnapshot(state));
  assert.equal(result.intent,'loaded');
  assert.deepEqual(result.matchedSpoolIds,['S1']);
});

test('model response with fabricated evidence id is rejected',()=>{
  const snapshot=LLM.buildSnapshot(state);
  const local=LLM.answerLocal('black PLA',snapshot);
  assert.equal(LLM.validateTransportResponse({answer:'Invented',evidenceIds:['FAKE']},snapshot,local),null);
});

test('acceptance suite covers hallucination and profile grounding',()=>{
  const suite=LLM.runAcceptanceSuite(state);
  assert.equal(suite.total,6);
  assert.equal(suite.passed,6);
});