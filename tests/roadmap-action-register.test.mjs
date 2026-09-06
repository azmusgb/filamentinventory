import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('roadmap action register preserves authority, isolation and release gates', async () => {
  const doc = await read('docs/ROADMAP_ACTIONS_2026-09-06.md');
  assert.match(doc,/Grounded LLM behavioral acceptance/);
  assert.match(doc,/QuantityEvidence model/);
  assert.match(doc,/Placement evidence model/);
  assert.match(doc,/Device credential hardening/);
  assert.match(doc,/Household -> Member -> Private\/Shared Resources/);
  assert.match(doc,/Workshop OS physical acceptance/);
  assert.match(doc,/implemented -> built -> tested -> runtime validated -> production validated -> physically validated -> accepted -> stable/);
});
