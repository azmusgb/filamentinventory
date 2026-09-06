import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const core = require('../print-readiness-core.js');

const measured = () => ({
  id:'S1',
  material:'PLA',
  colorName:'Black',
  startWeight:1000,
  gross:850,
  tare:200,
  reorderThreshold:250,
  updatedAt:'2026-09-06T12:00:00Z',
});

function assertUndetermined(query, expectedReason, expectedState) {
  const result = core.evaluate([measured()], query, Date.parse('2026-09-06T13:00:00Z'));
  assert.equal(result.status,'undetermined');
  assert.equal(result.reason,expectedReason);
  assert.equal(result.requirement.quantityState,expectedState);
  assert.equal(result.requirement.quantityKnown,false);
  assert.equal(result.required,null);
  assert.equal(result.recommended,null);
  assert.deepEqual(result.candidates,[]);
  assert.match(result.message,/positive slicer or model filament estimate/i);
  return result;
}

test('missing print quantity is Undetermined instead of treating the requirement as zero grams', () => {
  const result = assertUndetermined(
    {material:'PLA',color:'Black',safetyMargin:10},
    'required-quantity-missing',
    'missing',
  );
  assert.equal(result.needed,null);
});

test('blank print quantity is Undetermined and remains distinct from explicit zero', () => {
  const result = assertUndetermined(
    {material:'PLA',color:'Black',grams:'',safetyMargin:10},
    'required-quantity-missing',
    'missing',
  );
  assert.equal(result.needed,null);
});

test('non-numeric print quantity is Undetermined as invalid requirement evidence', () => {
  const result = assertUndetermined(
    {material:'PLA',color:'Black',grams:'not-a-number',safetyMargin:10},
    'required-quantity-invalid',
    'invalid',
  );
  assert.equal(result.needed,null);
});

test('explicit zero grams is Undetermined as non-positive rather than missing', () => {
  const result = assertUndetermined(
    {material:'PLA',color:'Black',grams:0,safetyMargin:10},
    'required-quantity-non-positive',
    'non-positive',
  );
  assert.equal(result.needed,0);
});

test('valid positive grams preserve deterministic readiness and safety-margin calculation', () => {
  const result = core.evaluate(
    [measured()],
    {material:'PLA',color:'Black',grams:300,safetyMargin:10},
    Date.parse('2026-09-06T13:00:00Z'),
  );
  assert.equal(result.status,'ready');
  assert.equal(result.requirement.quantityState,'known');
  assert.equal(result.requirement.quantityKnown,true);
  assert.equal(result.needed,300);
  assert.equal(result.required,330);
  assert.equal(result.recommended.spool.id,'S1');
});

test('planning fails closed without positive required grams and does not mutate print jobs', () => {
  const state = {spools:[measured()],printJobs:[]};
  const result = core.planJob(state,{material:'PLA',color:'Black'},'S1','2026-09-06T13:00:00Z');
  assert.equal(result.changed,false);
  assert.equal(result.reason,'grams-required');
  assert.equal(result.requirement.quantityState,'missing');
  assert.deepEqual(result.state.printJobs,[]);
  assert.deepEqual(state.printJobs,[]);
});
