import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACCEPTANCE_CASES,
  CATEGORY_COUNTS,
  FIXTURE,
  FIXTURE_VERSION,
} from './fixtures/assistant-acceptance-v1.mjs';

const expectedTotal = Object.values(CATEGORY_COUNTS).reduce((sum, value) => sum + value, 0);
const profileIds = Object.fromEntries(Object.entries(FIXTURE.profiles).map(([profile, rows]) => [
  profile,
  new Set(rows.map(row => row.id)),
]));

test('Grounded LLM acceptance corpus v1 contains the locked 120-case distribution', () => {
  assert.equal(expectedTotal,120);
  assert.equal(ACCEPTANCE_CASES.length,120);
  const counts = {};
  for (const row of ACCEPTANCE_CASES) counts[row.category] = (counts[row.category] || 0) + 1;
  assert.deepEqual(counts,CATEGORY_COUNTS);
});

test('every acceptance case is uniquely identified, versioned, profile-scoped and non-mutating', () => {
  const ids = new Set();
  for (const row of ACCEPTANCE_CASES) {
    assert.match(row.id,/^[FQPNUAI]-\d{3}$/);
    assert.ok(!ids.has(row.id),`duplicate case id ${row.id}`);
    ids.add(row.id);
    assert.ok(row.profileScope === 'Bill' || row.profileScope === 'Aimee');
    assert.equal(row.fixtureVersion,FIXTURE_VERSION);
    assert.equal(row.expectedExecutionMode,'grounded-model');
    assert.equal(row.fallbackExpectation,'local-on-invalid-model');
    assert.equal(row.mutationAllowed,false);
    assert.ok(String(row.question || '').trim(),`${row.id} missing question`);
    assert.ok(String(row.expectedResultClass || '').trim(),`${row.id} missing expected result class`);
    assert.ok(Array.isArray(row.permittedEvidenceIds),`${row.id} evidence IDs must be an array`);
    assert.ok(Array.isArray(row.forbiddenClaims),`${row.id} forbidden claims must be an array`);
  }
});

test('permitted evidence never crosses the active profile boundary', () => {
  for (const row of ACCEPTANCE_CASES) {
    const allowed = profileIds[row.profileScope];
    assert.ok(allowed,`missing fixture profile ${row.profileScope}`);
    for (const evidenceId of row.permittedEvidenceIds) {
      assert.ok(allowed.has(evidenceId),`${row.id} permits cross-profile or nonexistent evidence ${evidenceId}`);
    }
  }
});

test('fixture IDs are globally unique so mirrored isolation checks cannot alias records', () => {
  const all = [];
  for (const rows of Object.values(FIXTURE.profiles)) all.push(...rows.map(row => row.id));
  assert.equal(new Set(all).size,all.length);
});

test('quantity fixture includes measured, estimated and unknown evidence for both profiles', () => {
  for (const [profile, rows] of Object.entries(FIXTURE.profiles)) {
    assert.ok(rows.some(row => row.remainingSource === 'Measured'),`${profile} missing measured quantity evidence`);
    assert.ok(rows.some(row => row.remainingGrams === null),`${profile} missing Unknown quantity evidence`);
    assert.ok(rows.some(row => row.remainingGrams !== null && row.remainingSource !== 'Measured'),`${profile} missing estimated quantity evidence`);
  }
});

test('placement fixture includes stored, AMS-loaded and explicit external-spool examples', () => {
  const all = Object.values(FIXTURE.profiles).flat();
  assert.ok(all.some(row => row.loaded === false));
  assert.ok(all.some(row => row.loadedDetail.includes('AMS')));
  assert.ok(all.some(row => row.loadedDetail.includes('External spool')));
});

test('acceptance corpus preserves the roadmap families that must fail closed', () => {
  assert.equal(ACCEPTANCE_CASES.filter(row => row.category === 'nonexistent').length,10);
  assert.equal(ACCEPTANCE_CASES.filter(row => row.category === 'unsupportedNumeric').length,10);
  assert.equal(ACCEPTANCE_CASES.filter(row => row.category === 'adversarial').length,10);
  assert.equal(ACCEPTANCE_CASES.filter(row => row.category === 'isolation').length,15);
});
