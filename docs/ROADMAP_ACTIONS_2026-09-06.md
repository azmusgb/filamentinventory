# Roadmap action register — 2026-09-06

This register records the next implementation work in dependency order without promoting unaccepted state.

## Gate order

1. **PrintRequirement fail-closed behavior** — ensure missing/invalid/non-positive quantity remains `Undetermined`; preserve existing reservation and start safeguards.
2. **Grounded LLM behavioral acceptance** — execute the locked 120-case suite through the real profile-scoped model path. Corpus/CI structure alone is not acceptance.
3. **QuantityEvidence model** — introduce first-class quantity evidence/history with migration from current gross/tare/estimate fields and explicit conflict/staleness handling.
4. **Placement evidence model** — separate physical placement evidence from identity, enforce one-spool/one-placement across every write path, and surface stale/conflicting evidence.
5. **Device credential hardening** — replace broad profile sync credentials on device-facing access with revocable least-privilege device credentials before Assistant-enabled stable firmware.
6. **Household domain migration** — evolve Bill/Aimee transitional paths toward `Household -> Member -> Private/Shared Resources` with explicit sharing/transfer auditability.
7. **UsageEvent ledger and forecasting** — derive depletion/cost/forecasting from auditable usage events rather than collapsed current-state fields.
8. **Workshop OS physical acceptance** — physically validate the direct candidate chain on WS350 before any stable/source/static-channel promotion.

## Non-negotiable release interpretation

A merged implementation is not automatically production validated, physically validated, accepted, or stable. Each action above must preserve the release ladder:

`implemented -> built -> tested -> runtime validated -> production validated -> physically validated -> accepted -> stable`

Where a stage does not apply (for example, WS350 physical validation for a web-only deterministic helper), record that explicitly rather than silently skipping the distinction.
