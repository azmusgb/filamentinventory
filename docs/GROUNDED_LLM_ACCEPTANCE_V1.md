# Grounded LLM Acceptance v1

## Purpose

This document separates three states that must not be collapsed:

1. **transport configured** - the server can reach the configured model provider;
2. **Cloud ready** - a linked browser has private sync plus healthy server transport;
3. **Grounded model** - the active profile has received at least one validated, evidence-scoped model response.

Only the third state is model-success evidence.

## Versioned corpus

The canonical v1 corpus lives under `acceptance/grounded-llm-v1/` and contains 120 fixed cases. The fixtures are synthetic and deliberately profile-separated. They are test data only; they are not inventory evidence.

The deterministic CI layer executes every case against `llm-core.js`. This protects fallback semantics, result classes, evidence allowlists, Unknown handling, unsupported-number resistance, and profile isolation from regression.

## Production behavioral gate

The production gate is intentionally not a generic CI badge. It requires a linked private workspace and a recorded execution against the active profile.

For each run record:

- corpus version and fixture/data version;
- exact web source SHA and deployed Netlify identity;
- active profile;
- provider/model metadata returned by the server;
- execution timestamp;
- result class;
- permitted and returned evidence IDs;
- forbidden-claim result;
- whether the model response validated or deterministic fallback was used;
- aggregate fact, retrieval, hallucination, evidence-validity, and isolation metrics.

Do not record or publish the private sync key.

## Failure semantics

A provider error, malformed model response, fabricated evidence ID, unsupported numeric claim, missing required evidence, or profile mismatch must not be upgraded into model success. The browser remains or returns to deterministic local grounding and surfaces the appropriate fallback state.

The LLM may explain and recommend. It may not create authoritative spool identity, quantity, ownership, location, placement, print requirement, or device state.

## Promotion gate

Grounded LLM acceptance is complete only when the versioned suite meets all targets:

- fact accuracy >= 98%;
- retrieval accuracy >= 98%;
- hallucination < 1%;
- evidence validity = 100%;
- owner/profile isolation = 100%;
- unsupported mutation = 0.

Until then, transport remains configured/ready but behavior is not accepted.
