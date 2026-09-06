import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('PrintRequirement acceptance template keeps validation stages distinct', async () => {
  const doc = await read('docs/PRINT_REQUIREMENT_ACCEPTANCE_RECORD_TEMPLATE.md');
  assert.match(doc,/Source SHA:/);
  assert.match(doc,/Production deployment identity:/);
  assert.match(doc,/Behavioral acceptance:/);
  assert.match(doc,/does not imply any WS350 physical acceptance/);
});
