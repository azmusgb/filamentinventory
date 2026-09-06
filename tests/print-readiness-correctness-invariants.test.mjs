import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Print Readiness correctness invariants keep requirement and inventory authority separate', async () => {
  const doc = await read('docs/PRINT_READINESS_CORRECTNESS_INVARIANTS.md');
  assert.match(doc,/Required grams are authoritative input evidence/);
  assert.match(doc,/produce `Undetermined` and no spool recommendation/);
  assert.match(doc,/Unknown inventory quantity remains Unknown/);
  assert.match(doc,/Starting requires explicit loaded placement and current measured quantity evidence/);
  assert.match(doc,/must not masquerade as a new scale measurement/);
});
