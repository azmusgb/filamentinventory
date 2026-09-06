import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('PrintRequirement migration notes forbid inferred backfill of unknown requirements', async () => {
  const doc = await read('docs/PRINT_REQUIREMENT_MIGRATION_NOTES.md');
  assert.match(doc,/migration should be additive/);
  assert.match(doc,/No migration should backfill unknown required grams by inference/);
  assert.match(doc,/unknown or absent requirements remain Unknown/);
});
