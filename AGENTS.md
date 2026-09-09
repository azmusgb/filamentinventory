# Filament Inventory + Workshop OS

Canonical repository target: azmusgb/filamentinventory. Inventory/PWA/API remain at existing root paths; Workshop OS lives under firmware/workshop-os. See docs/migration/2026-09-09/README.md for migration state and release blockers.

- Inventory owns durable spool identity, ownership/sharing, quantity evidence, placement, sync, readiness and grounded AI. Workshop OS owns device behavior and consumes the versioned, profile-scoped inventory contract.
- Unknown stays Unknown. Do not infer spool identity or AMS placement from color/material telemetry. Preserve provenance and private-profile isolation.
- Keep credentials server-side; device-scoped revocable credentials are the target. Existing sync-key compatibility is not proof of that target.
- Preserve implemented, built, tested, runtime, production, physical, accepted and stable as separate states. CI cannot grant physical acceptance.
- Keep UI13 separate until its exact artifact passes physical acceptance. Do not re-label rebuilt bytes as accepted.
- Preserve full-image recovery at 0x0 for cross-line partition migration, known-good rollback, hashes and historical evidence.
- Use PRs and exact-head gates. Do not delete/archive the source repository or switch device update URLs before release/recovery cutover is validated.
- Do not reorganize the PWA or alter inventory/device-contract semantics as part of repository migration.
