import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProviderRequest, parseAssistantAnswer, sanitizeAssistantRequest, validateAssistantAnswer } from '../netlify/lib/inventory-assistant.mts';

function request(overrides={}) {
  return {
    version:1,
    task:'filament-inventory-assistant',
    question:'How much black PLA is left?',
    profile:'Bill',
    inventory:[{
      id:'B001',brand:'Bambu Lab',material:'PLA',colorName:'Black',location:'Rack A',confidence:'Confirmed',
      remainingGrams:420,remainingPercent:42,remainingSource:'Measured',reorderNeeded:false,loaded:false,loadedDetail:'',
      notes:'must never leave the browser contract',
    }],
    localGrounding:{intent:'remaining',evidenceIds:['B001'],fallbackAnswer:'B001 has 420 g remaining (42% by measured).'},
    ...overrides,
  };
}

test('assistant request sanitizer keeps only bounded grounding fields', () => {
  const sanitized=sanitizeAssistantRequest(request());
  assert.ok(sanitized);
  assert.equal(sanitized.profile,'Bill');
  assert.equal(sanitized.inventory.length,1);
  assert.equal(sanitized.inventory[0].id,'B001');
  assert.equal('notes' in sanitized.inventory[0],false);
});

test('assistant request sanitizer rejects wrong task, profile and empty question', () => {
  assert.equal(sanitizeAssistantRequest(request({task:'other'})),null);
  assert.equal(sanitizeAssistantRequest(request({profile:'Mallory'})),null);
  assert.equal(sanitizeAssistantRequest(request({question:'   '})),null);
});

test('provider request disables storage and requires strict structured output', () => {
  const sanitized=sanitizeAssistantRequest(request());
  assert.ok(sanitized);
  const body=buildProviderRequest(sanitized,'gpt-5.6-luna');
  assert.equal(body.model,'gpt-5.6-luna');
  assert.equal(body.store,false);
  assert.equal(body.reasoning.effort,'low');
  assert.equal(body.text.format.type,'json_schema');
  assert.equal(body.text.format.strict,true);
  assert.match(body.instructions,/untrusted data/i);
});

test('model answer may cite only the deterministic local evidence slice', () => {
  const sanitized=sanitizeAssistantRequest(request());
  assert.ok(sanitized);
  assert.deepEqual(validateAssistantAnswer({answer:'B001 has 420 g remaining.',evidenceIds:['B001'],confidence:'high'},sanitized),{
    answer:'B001 has 420 g remaining.',evidenceIds:['B001'],confidence:'high',
  });
  assert.equal(validateAssistantAnswer({answer:'B001 has 420 g remaining.',evidenceIds:['PHANTOM'],confidence:'high'},sanitized),null);
  assert.equal(validateAssistantAnswer({answer:'B001 has 999 g remaining.',evidenceIds:['B001'],confidence:'high'},sanitized),null);
});

test('provider output parser accepts Responses API output_text content', () => {
  const sanitized=sanitizeAssistantRequest(request());
  assert.ok(sanitized);
  const provider={output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({answer:'B001 has 420 g remaining.',evidenceIds:['B001'],confidence:'high'})}]}]};
  assert.equal(parseAssistantAnswer(provider,sanitized)?.answer,'B001 has 420 g remaining.');
});
