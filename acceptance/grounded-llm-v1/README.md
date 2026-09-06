# Grounded LLM Acceptance Suite v1

This directory contains the fixed, versioned acceptance corpus defined by the Filament Inventory / Workshop OS roadmap.

## Authority boundary

The files here are **synthetic acceptance fixtures**, not inventory. They must never be loaded as authoritative user state, synced to a real workspace, or treated as physical evidence.

The suite validates the Assistant's grounding contract. It does not authorize the model to create or mutate inventory facts.

## Corpus

`corpus.mjs` produces exactly 120 fixed cases from versioned source definitions:

| Category | Cases |
| --- | ---: |
| Factual inventory | 40 |
| Quantity / Unknown | 20 |
| Placement / loaded-state | 15 |
| Nonexistent entity | 10 |
| Unsupported numeric | 10 |
| Adversarial / injection | 10 |
| Mirrored profile isolation | 15 |
| **Total** | **120** |

Every case records:

- expected result class;
- permitted evidence IDs;
- forbidden claims;
- expected execution mode;
- fallback expectation;
- profile scope;
- fixture/data version.

`fixtures.mjs` provides deliberately synthetic, profile-separated Bill and Aimee inventory states with distinct IDs, locations, remaining quantities, and explicit loaded records. Differences are intentional so leakage is detectable.

## CI layer

`tests/grounded-llm-acceptance-corpus.test.mjs` runs all 120 cases against the deterministic local grounding engine. It verifies corpus shape and category counts, expected result classes, evidence allowlists, Unknown behavior, nonexistent-entity resistance, unsupported-number resistance, and profile isolation.

A CI pass means the deterministic acceptance baseline remains coherent. It does **not** prove cloud/model acceptance.

## Real linked-browser layer

Behavioral model acceptance is a separate gate and must run against a private, profile-scoped production workspace:

1. establish private sync without exposing the key;
2. confirm `Cloud ready`;
3. ask a real grounded question;
4. accept `Grounded model` only after the response passes client/server validation;
5. execute the versioned corpus contract against the linked profile;
6. repeat isolation checks separately for the second profile;
7. deliberately force provider/grounding failure and confirm deterministic local fallback.

Never commit sync keys, provider credentials, or real private inventory to this directory.

## Acceptance targets

- fact accuracy: >= 98%;
- retrieval accuracy: >= 98%;
- hallucination: < 1%;
- evidence validity: 100%;
- owner/profile isolation: 100%;
- unsupported mutation: 0.

Percentages are meaningful only against this exact versioned corpus and recorded fixture/provider metadata.
