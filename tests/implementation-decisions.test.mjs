import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('implementation decisions preserve migration and device authority boundaries', async () => {
  const doc = await read('docs/IMPLEMENTATION_DECISIONS_2026-09-06.md');
  assert.match(doc,/missing, invalid, zero, and negative grams as `Undetermined`/);
  assert.match(doc,/additive with read compatibility/);
  assert.match(doc,/must not discard known provenance/);
  assert.match(doc,/separate least-privilege contract/);
  assert.match(doc,/without real-device validation/);
});
