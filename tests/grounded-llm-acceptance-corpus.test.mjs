import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { acceptanceCorpus, CATEGORY_COUNTS } from '../acceptance/grounded-llm-v1/corpus.mjs';
import { acceptanceFixtures, FIXTURE_VERSION } from '../acceptance/grounded-llm-v1/fixtures.mjs';

const require = createRequire(import.meta.url);
const llm = require('../llm-core.js');
const normalize = value => String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

test('Grounded LLM Acceptance Suite v1 corpus is fixed, versioned, and complete', () => {
  assert.equal(acceptanceCorpus.schemaVersion, 1);
  assert.equal(acceptanceCorpus.corpusVersion, 'grounded-llm-acceptance-v1');
  assert.equal(acceptanceCorpus.fixtureVersion, FIXTURE_VERSION);
  assert.equal(acceptanceFixtures.fixtureVersion, FIXTURE_VERSION);
  assert.equal(acceptanceFixtures.synthetic, true);
  assert.equal(acceptanceCorpus.synthetic, true);
  assert.equal(acceptanceCorpus.cases.length, 120);

  const counts = {};
  const ids = new Set();
  for (const item of acceptanceCorpus.cases) {
    counts[item.category] = (counts[item.category] || 0) + 1;
    assert.ok(item.id && !ids.has(item.id), `duplicate or blank case id: ${item.id}`);
    ids.add(item.id);
    assert.ok(CATEGORY_COUNTS[item.category], `unexpected category: ${item.category}`);
    assert.ok(['Bill','Aimee'].includes(item.profile), `${item.id}: invalid profile`);
    assert.equal(item.fixtureVersion, FIXTURE_VERSION, `${item.id}: fixture version drift`);
    assert.equal(item.expected?.profileScope, item.profile, `${item.id}: profile scope mismatch`);
    assert.equal(item.expected?.expectedExecutionMode, 'validated-grounded', `${item.id}: execution mode`);
    assert.ok(Array.isArray(item.expected?.permittedEvidenceIds), `${item.id}: permittedEvidenceIds`);
    assert.ok(Array.isArray(item.expected?.forbiddenClaims), `${item.id}: forbiddenClaims`);
    assert.ok(item.expected?.fallbackExpectation, `${item.id}: fallbackExpectation`);
  }
  assert.deepEqual(counts, CATEGORY_COUNTS);
  assert.deepEqual(acceptanceCorpus.categoryCounts, CATEGORY_COUNTS);
});

test('all 120 deterministic local baselines obey result, evidence, numeric, and profile contracts', () => {
  const failures = [];

  for (const item of acceptanceCorpus.cases) {
    try {
      const source = acceptanceFixtures.profiles[item.profile];
      assert.ok(source, `${item.id}: missing profile fixture`);
      const state = structuredClone(source);
      const snapshot = llm.buildSnapshot(state);
      const result = llm.answerLocal(item.question, snapshot);

      assert.equal(snapshot.profile, item.profile, `${item.id}: snapshot profile`);
      assert.equal(result.intent, item.expected.resultClass, `${item.id}: result class`);

      const permitted = new Set(item.expected.permittedEvidenceIds);
      const actualEvidence = (result.evidence || []).map(row => row.id).filter(Boolean);
      for (const id of actualEvidence) {
        assert.ok(permitted.has(id), `${item.id}: evidence ${id} not permitted`);
      }
      if (permitted.size > 0 && ['remaining','remaining-unknown','location','count','search','loaded','low-stock'].includes(result.intent)) {
        assert.ok(actualEvidence.length > 0, `${item.id}: expected grounded evidence`);
      }
      if (permitted.size === 0) {
        assert.deepEqual(actualEvidence, [], `${item.id}: unexpected evidence`);
      }

      const answer = normalize(result.answer);
      for (const forbidden of item.expected.forbiddenClaims) {
        const claim = normalize(forbidden);
        assert.ok(!answer.includes(claim), `${item.id}: forbidden claim leaked: ${forbidden}`);
      }

      const oppositePrefix = item.profile === 'Bill' ? 'A-' : 'B-';
      assert.ok(actualEvidence.every(id => !id.startsWith(oppositePrefix)), `${item.id}: cross-profile evidence`);

      if (item.category === 'nonexistent_entity') {
        assert.equal(result.intent, 'not-found', `${item.id}: nonexistent entity must remain not-found`);
        assert.equal(/\b\d+(?:\.\d+)?\s*(?:g|%)\b/i.test(result.answer), false, `${item.id}: nonexistent entity gained numeric claim`);
      }
      if (item.category === 'quantity_unknown' && result.intent === 'remaining-unknown') {
        assert.equal(/\b\d+(?:\.\d+)?\s*g\b/i.test(result.answer), false, `${item.id}: Unknown gained gram value`);
      }
      if (item.category === 'placement_loaded') {
        assert.equal(result.intent, 'loaded', `${item.id}: placement result`);
        assert.ok(/marked as loaded|don't infer|won't infer|loaded/i.test(result.answer), `${item.id}: loaded response missing explicit-state language`);
      }
    } catch (error) {
      failures.push(`${item.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  assert.deepEqual(failures, [], failures.join('\n'));
});

test('mirrored profile-isolation cases never permit opposite-profile evidence', () => {
  const isolation = acceptanceCorpus.cases.filter(item => item.category === 'profile_isolation');
  assert.equal(isolation.length, 15);
  for (const item of isolation) {
    const oppositePrefix = item.profile === 'Bill' ? 'A-' : 'B-';
    assert.ok(
      item.expected.permittedEvidenceIds.every(id => !id.startsWith(oppositePrefix)),
      `${item.id}: corpus itself permits opposite-profile evidence`,
    );
  }
});
