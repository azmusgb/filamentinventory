# QuantityEvidence design draft

This draft is intentionally non-authoritative and is not wired into runtime state yet. It records the migration constraints discovered while reviewing the current quantity, weigh-log, sync, readiness, and Assistant paths.

## Goal

Represent remaining filament as evidence history rather than a single collapsed spool value, while preserving existing data and keeping every current caller correct during migration.

## Proposed record shape

A quantity evidence record should carry, at minimum:

- durable `id` for merge/deduplication;
- `spoolId` when stored outside the spool, or an implicit owning spool when nested;
- `method`: `measured`, `calculated-measured`, `printer-usage`, `visual`, `imported`, or `unknown`;
- `remainingGrams` when known;
- `grossGrams` and `tareGrams` when applicable;
- `observedAt` / source timestamp;
- `recordedAt`;
- source/origin metadata suitable for audit without storing secrets;
- confidence/quality for non-measured evidence;
- optional relationship to the print/usage event that produced an estimate;
- status needed to preserve superseded/rejected/conflicting evidence rather than deleting it.

The exact persisted schema requires a separate implementation review before it becomes authoritative.

## Current compatibility inputs

Runtime quantity is currently derived from spool fields in this order:

1. valid `gross - tare` -> Measured;
2. `estimatedRemainingGrams` -> usage-derived estimate;
3. `visualPercent` -> visual estimate;
4. otherwise Unknown.

`weighLog` separately retains measurement history. Those fields and logs must remain readable during an additive migration.

## Critical merge requirement

The current local backup merge selects spool records by record timestamp, and server three-way reconciliation treats ordinary spool fields independently while placement is handled as an atomic group. A future evidence array must **not** be merged as one last-writer-wins field: concurrent evidence additions would lose valid history.

Before evidence history becomes authoritative, both local and server reconciliation must merge evidence records by stable evidence ID, preserve independent concurrent additions, detect incompatible updates to the same evidence ID, and keep profile scope unchanged.

## Migration sequence

1. Define/validate the evidence record and merge functions with deterministic tests.
2. Add evidence history as an additive state field while retaining legacy spool quantity fields and `weighLog`.
3. Backfill evidence only from data that actually exists; do not invent timestamps, tare, source, or grams.
4. Dual-write new measured and usage-derived updates only after merge behavior is proven.
5. Change the canonical measurement selector to consume evidence history first while retaining legacy fallback.
6. Move readiness, display feed, printer surfaces, and Assistant grounding through that single canonical selector.
7. Retire legacy authority only after migration, sync, import/export, and production validation are complete.

## Non-goals

- Do not infer quantity from color/material matching.
- Do not convert visual/imported estimates into measured evidence.
- Do not silently discard contradictory evidence.
- Do not broaden device or Assistant access as part of this migration.
