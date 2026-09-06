# Roadmap implementation status — 2026-09-06

This snapshot reconciles the product roadmap with the current repositories. It distinguishes what exists in code from what has completed behavioral, production, or physical acceptance.

## Current verified Filament Inventory baseline

Current `main` after PrintRequirement hardening:

- source SHA: `8aff15a10007614e498099ec6cf78312453a14c3`;
- PR #107 merged: missing/blank/invalid/non-positive required grams fail closed as `Undetermined`;
- post-merge CI run #780: passed, including static validation, tests, production build, deploy-output verification, browser interaction/visual regression, and artifact upload;
- Production Smoke run #647: passed against the merged `main` lineage.

That is **production-validation evidence**, not WS350 physical acceptance and not Grounded LLM behavioral acceptance.

## Phase status

| Phase | Current implementation | Acceptance status | Remaining gap |
| --- | --- | --- | --- |
| 0 — Current software train | V11/V12 PWA baseline plus PrintRequirement fail-closed hardening are merged on current production-validated `main`. | **Production validated** | Preserve exact-SHA evidence as later work advances; do not call software validation physical acceptance. |
| 1 — Grounded LLM acceptance | Deterministic grounding, server transport, structured output validation, evidence-ID validation, numeric-claim rejection, and local fallback paths exist. Versioned 120-case acceptance corpus is defined. | **Behavioral acceptance pending** | Run the full corpus through real linked, profile-scoped production data/model execution and record results. |
| 2 — Workshop OS release train | Canonical firmware repo remains `azmusgb/bambuhelper-smart-display`; physically accepted source baseline is v11.22. Direct candidate chain continues beyond that baseline. | **Physical gate pending** | Physically accept the direct candidate chain before stable promotion. CI or stacked builds do not substitute for WS350 acceptance. |
| 3 — Assistant migration | Filament Inventory exposes `/api/display-feed` contract v1 and documents the device boundary. | **Partially implemented; migration acceptance pending** | Consume the versioned feed from canonical Workshop OS, add device-scoped credentials before Assistant-enabled stable promotion, and physically validate migration/recovery. |
| 4 — Inventory capture | Guided spool intake, QR workflows, canonical spool IDs, gross/tare fields, estimates, and evidence-oriented UI/tests already exist. | **Transitional implementation** | Implement first-class additive `QuantityEvidence` history/provenance with stable evidence IDs and conflict-safe sync. Tracked by issue #108. |
| 5 — Printer / AMS placement | Explicit placement state, printer/feeder/slot fields, printer registry/UI, conflict checks, and external-spool presentation exist. | **Transitional implementation** | Move toward canonical placement evidence/source/freshness/conflict semantics while preserving one-spool/one-placement integrity across all write paths. |
| 6 — Print readiness | Deterministic print-readiness, reservations, measured-vs-estimated confidence, load checks, print planning/start/completion, and queue logic exist. Missing, invalid, zero, or negative required quantity now fails closed as `Undetermined`. | **Implemented + production validated; target provenance incomplete** | Make `PrintRequirement` provenance first-class and complete acceptance against evidence/uncertainty rules. |
| 7 — Assistant v2 | Browser Assistant explains deterministic grounding and uses validated provider output. | **Partial** | Broaden constrained recommendation/explanation only after acceptance evidence is versioned and profile-safe. |
| 8 — Usage + forecasting | Print-job completion records consumption and creates usage-derived remaining estimates. | **Partial** | Introduce canonical auditable `UsageEvent` history and derive forecasts/cost/depletion from that ledger. |
| 9 — Household model | Bill/Aimee profile isolation and preferences exist. | **Transitional** | Evolve to `Household -> Member -> Private/Shared Resources` with explicit sharing and auditable transfer semantics. |
| 10 — Automation | Attention/low-stock/readiness surfaces exist in deterministic code. | **Partial** | Add low-noise deduplicated notification policy only after authoritative evidence and household scope are stable. |
| 11 — Product finish | V11/V12 responsive/mobile UX, PWA, accessibility tests, offline/sync recovery work, and workflow-specific styling exist. | **Ongoing rail** | Continue finish without treating visual polish as a substitute for data, recovery, isolation, or physical correctness. |

## Important reconciliation notes

### Inventory phases are not greenfield

Phases 4–6 already contain substantial implementation: canonical spool-contract code, guided intake, printer/AMS surfaces, print readiness, queue/reservation logic, and extensive tests. The target architecture is stricter than these transitional representations, so status must remain **implemented/partial but not target-complete** rather than simply `PLANNED` or `DONE`.

### QuantityEvidence migration is now an explicit tracked increment

Issue #108 tracks the migration from collapsed spool quantity fields + `weighLog` toward first-class evidence history. The key sequencing rule is merge-first: concurrent evidence additions must survive local backup merge and cloud reconciliation before new runtime writers begin treating the evidence array as authoritative.

Do not add a naive last-writer-wins `quantityEvidence: []` field to the current sync model.

### Firmware authority is separate

The accepted Workshop OS baseline and active hardware candidate chain live in `azmusgb/bambuhelper-smart-display`. The retained `firmware/waveshare-home` tree in this repository is historical/migration/recovery material only.

Legacy Waveshare Home acceptance work should not remain an active competing product roadmap in this repository.

### Device contract work has already started

`docs/DEVICE_API_CONTRACT_V1.md`, `netlify/functions/display-feed.mts`, and `netlify/lib/display-feed.mts` establish a redacted profile-scoped device feed. Phase 3 is therefore a migration/credential/physical-acceptance phase, not a greenfield device-contract phase.

## Architecture gaps that should stay visible

- `QuantityEvidence` is a target domain object; current quantity representation still relies heavily on gross/tare, estimated remaining grams, visual percent, source timestamps, and measurement logs.
- Placement is explicit today but is not yet a fully independent evidence object with source, confidence, freshness, and conflict history.
- Bill/Aimee remains a hard-coded transitional profile model in important paths.
- Print requirement quantity now fails closed when absent, but requirement data is not yet a first-class provenance object across the whole product.
- The current device feed still authenticates with the private profile sync credential for compatibility; the target is a revocable device-scoped credential with least authority.
- Repository `main` remains unprotected by GitHub branch protection/ruleset enforcement; issue #27 remains the governance blocker even though PR + `Validate` is the working discipline.

## GitHub / repository hygiene state

- No open pull requests at the time of this refresh.
- Open issues should represent only current work or real external/physical gates; stale release-era trackers should be condensed or closed rather than accumulating alongside the current roadmap.
- The repository still has a large number of historical feature/validation branches. Safe branch pruning should delete only refs whose work is merged/superseded and whose unique recovery/history value has been checked. Branch deletion is repository bookkeeping, not a substitute for preserving release tags/artifacts/recovery documentation.
- Legacy firmware source/tooling must not be removed until Workshop OS parity and cross-line physical migration/recovery are proven.

## Release-state rule

Keep these states distinct:

`implemented -> built -> tested -> runtime validated -> production validated -> physically validated -> accepted -> stable`

The repository contains implementation beyond the last physically accepted product state. That is acceptable only while later changes remain explicitly described as production-validated, candidate, partial, or pending rather than silently promoted to `accepted`/`stable`.
