import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('issue 106 implementation note preserves the fail-closed scope', async () => {
  const doc = await read('docs/ISSUE_106_IMPLEMENTATION.md');
  assert.match(doc,/absent required grams could previously normalize to `0`/);
  assert.match(doc,/only a positive numeric gram requirement enters candidate ranking/);
  assert.match(doc,/does not infer grams from any other field/);
  assert.match(doc,/first-class `PrintRequirement` object/);
});
