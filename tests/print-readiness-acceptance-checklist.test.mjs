import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Print Readiness checklist does not overstate downstream acceptance', async () => {
  const doc = await read('docs/PRINT_READINESS_ACCEPTANCE_CHECKLIST.md');
  assert.match(doc,/- \[x\] Missing required quantity/);
  assert.match(doc,/- \[ \] Exact-head CI passes/);
  assert.match(doc,/- \[ \] Post-merge `main` CI passes/);
  assert.match(doc,/- \[ \] Production smoke passes/);
  assert.match(doc,/must not imply later stages/);
});
