# Filament Inventory + Workshop OS

> **Retired on 24 October 2026.** Spools, projects and print history now live in Bambuddy (on the household Pi), which reads the printer and the AMS itself. filamentinventory.netlify.app serves only a retirement notice, and its APIs return 410. This repository is archived and read-only. It is kept because older Workshop OS 11.x and Waveshare Home builds may still read release files from it. The app's source and the old `netlify.toml` are kept in history.

Canonical repository target: azmusgb/filamentinventory. Inventory/PWA/API remain at existing root paths; Workshop OS lives under firmware/workshop-os. See docs/migration/2026-09-09/README.md for migration state and release blockers.

- Inventory owns durable spool identity, ownership/sharing, quantity evidence, placement, sync, readiness and grounded AI. Workshop OS owns device behavior and consumes the versioned, profile-scoped inventory contract.
- Unknown stays Unknown. Do not infer spool identity or AMS placement from color/material telemetry. Preserve provenance and private-profile isolation.
- Keep credentials server-side; device-scoped revocable credentials are the target. Existing sync-key compatibility is not proof of that target.
- Preserve implemented, built, tested, runtime, production, physical, accepted and stable as separate states. CI cannot grant physical acceptance.
- Keep UI13 separate until its exact artifact passes physical acceptance. Do not re-label rebuilt bytes as accepted.
- Preserve full-image recovery at 0x0 for cross-line partition migration, known-good rollback, hashes and historical evidence.
- Use PRs and exact-head gates. Do not delete/archive the source repository or switch device update URLs before release/recovery cutover is validated.
- Do not reorganize the PWA or alter inventory/device-contract semantics as part of repository migration.

## Agent orchestration

For substantial multi-agent engineering work, follow `docs/AGENT_ARCHITECTURE_V1.md`. Sub-agents are read-only by default; the orchestrator owns integration, release-state claims, and authority-boundary decisions.
