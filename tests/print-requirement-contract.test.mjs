import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('PrintRequirement fail-closed behavior stays visible in the roadmap and contract docs', async () => {
  const [roadmap, contract] = await Promise.all([
    read('docs/ROADMAP_STATUS_2026-09-06.md'),
    read('docs/PRINT_REQUIREMENT_EVIDENCE_V1.md'),
  ]);
  assert.match(roadmap,/fails closed as `Undetermined`/);
  assert.match(roadmap,/first-class provenance object/);
  assert.match(contract,/missing \/ blank[\s\S]*`undetermined`/);
  assert.match(contract,/must not infer required grams/);
  assert.match(contract,/source timestamp/);
});
