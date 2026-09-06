# Implementation decisions — 2026-09-06

These decisions are derived from the current roadmap, repository evidence, and product authority rules. They are intended to keep near-term implementation coherent while target-domain migrations proceed.

## Decision 1 — fail closed on absent print requirements

Print readiness must not convert missing or invalid required quantity into `0 g`. Until a first-class `PrintRequirement` object exists, the deterministic core treats missing, invalid, zero, and negative grams as `Undetermined` and performs no candidate ranking.

## Decision 2 — preserve current spool fields during evidence migration

The existing gross, tare, estimated remaining, visual estimate, evidence-source timestamp, and placement fields remain compatibility inputs while first-class evidence objects are introduced. Migration must not discard known provenance or silently reinterpret estimates as measured facts.

## Decision 3 — additive migrations before destructive cleanup

`QuantityEvidence`, Placement evidence, Household/Member, and UsageEvent changes should first be additive with read compatibility and deterministic validation. Legacy fields/paths may be retired only after migrated data and all active write paths are proven authoritative.

## Decision 4 — device feed remains narrow

`/api/display-feed` remains a redacted, profile-scoped decision feed. Record-level Assistant evidence should use a separate least-privilege contract instead of widening the summary endpoint. Device credentials should become revocable and device-scoped before Assistant-enabled stable firmware.

## Decision 5 — firmware acceptance remains physical

Software gates may prove reconstruction, builds, contracts, and regressions. They do not promote the WS350 candidate chain to accepted/stable state without real-device validation and recorded recovery evidence.
