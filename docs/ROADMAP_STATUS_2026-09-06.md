# Roadmap implementation status — 2026-09-06

This snapshot reconciles the product roadmap with the current repositories. It distinguishes what exists in code from what has completed behavioral, production, or physical acceptance.

## Phase status

| Phase | Current implementation | Acceptance status | Remaining gap |
| --- | --- | --- | --- |
| 0 — Current software train | V11/mobile baseline merged at `0e2a79cc80be1c0bd9f16956d007aaa8111bf916`; post-merge CI and exact production smoke passed. | **Software gate passed** | Preserve this SHA as the production-verified baseline while later work advances. |
| 1 — Grounded LLM acceptance | Deterministic grounding, server transport, structured output validation, evidence-ID validation, numeric-claim rejection, and Local fallback paths exist. Versioned 120-case acceptance corpus is defined. | **Behavioral acceptance pending** | Run the full corpus through real linked, profile-scoped production data/model execution and record results. |
| 2 — Workshop OS release train | Canonical firmware repo remains `azmusgb/bambuhelper-smart-display`; physically accepted source baseline is v11.22. Direct candidate is v11.23 RC2. Multiple later candidates are stacked beyond that physical gate. | **Physical gate pending** | Physically accept the direct candidate chain before stable promotion. CI or stacked builds do not substitute for WS350 acceptance. |
| 3 — Assistant migration | Filament Inventory already exposes `/api/display-feed` contract v1 and documents the device boundary. | **Partially implemented; migration acceptance pending** | Consume the versioned feed from canonical Workshop OS, add device-scoped credentials before Assistant-enabled stable promotion, and physically validate migration/recovery. |
| 4 — Inventory capture | Guided spool intake, QR workflows, canonical spool IDs, gross/tare fields, estimates, and evidence-oriented UI/tests already exist. | **Transitional implementation** | Replace field-level quantity semantics with first-class `QuantityEvidence` history/provenance where required; preserve conflicts/staleness rather than collapsing to one value. |
| 5 — Printer / AMS placement | Explicit `placementState`, printer/feeder/slot fields, printer registry/UI, conflict checks, and external-spool presentation exist. | **Transitional implementation** | Move toward canonical Placement evidence objects with source/freshness/conflict semantics and one-spool/one-placement integrity across all write paths. |
| 6 — Print readiness | Deterministic print-readiness, reservations, measured-vs-estimated confidence, load checks, print planning/start/completion, and queue logic exist. Missing, invalid, zero, or negative required quantity now fails closed as `Undetermined` in the deterministic readiness core instead of being treated as a zero-gram requirement. | **Implemented but not roadmap-accepted** | Make `PrintRequirement` provenance first-class and complete acceptance against evidence/uncertainty rules. |
| 7 — Assistant v2 | Browser Assistant already explains deterministic grounding and uses validated provider output. | **Partial** | Broaden constrained recommendation/explanation only after acceptance evidence is versioned and profile-safe. |
| 8 — Usage + forecasting | Print-job completion records consumption and creates usage-derived remaining estimates. | **Partial** | Introduce canonical auditable `UsageEvent` history and derive forecasts/cost/depletion from that ledger. |
| 9 — Household model | Bill/Aimee profile isolation and preferences exist. | **Transitional** | Evolve to `Household -> Member -> Private/Shared Resources` with explicit sharing and auditable transfer semantics. |
| 10 — Automation | Attention/low-stock/readiness surfaces exist in deterministic code. | **Partial** | Add low-noise deduplicated notification policy only after authoritative evidence and household scope are stable. |
| 11 — Product finish | V11/V12 responsive/mobile UX, PWA, accessibility tests, offline/sync recovery work, and workflow-specific styling exist. | **Ongoing rail** | Continue finish without treating visual polish as a substitute for data, recovery, isolation, or physical correctness. |

## Important reconciliation notes

### The roadmap currently understates implemented inventory capability

Phases 4–6 are not greenfield. The repository already contains canonical spool-contract code, guided intake, printer/AMS surfaces, print readiness, queue/reservation logic, and extensive tests. The target architecture is still materially stricter than those transitional representations, so the correct status is **implemented/partial but not target-complete**, not simply `PLANNED`.

### The firmware roadmap currently understates the candidate stack

The accepted Workshop OS baseline remains v11.22 and the direct-to-main physical gate remains v11.23 RC2, but follow-on work has continued in stacked candidates beyond v11.24. Those later candidates are implementation evidence, not acceptance evidence. They must remain non-authoritative until their dependency chain is physically accepted.

### Device contract work has started already

`docs/DEVICE_API_CONTRACT_V1.md`, `netlify/functions/display-feed.mts`, and `netlify/lib/display-feed.mts` already establish a redacted profile-scoped device feed. The roadmap should describe Phase 3 as a migration/credential/physical-acceptance phase rather than implying no device contract exists yet.

## Architecture gaps that should stay visible

- `QuantityEvidence` is a target domain object; current quantity representation still relies heavily on spool fields such as gross/tare, estimated remaining grams, visual percent, source timestamps, and related metadata.
- Placement is explicit today but is not yet a fully independent evidence object with source, confidence, freshness, and conflict history.
- Bill/Aimee remains a hard-coded transitional profile model in important paths.
- Print requirement quantity now fails closed when absent, but requirement data is not yet a first-class provenance object across the whole product.
- The device feed still authenticates with the private profile sync credential for compatibility; the target is a revocable device-scoped credential with least authority.

## Release-state rule

Keep these states distinct:

`implemented -> built -> tested -> runtime validated -> production validated -> physically validated -> accepted -> stable`

The current repository contains substantial implementation beyond the last accepted roadmap phase. That is acceptable only if the product continues to report those later changes as candidates/partial work rather than silently treating them as accepted state.
