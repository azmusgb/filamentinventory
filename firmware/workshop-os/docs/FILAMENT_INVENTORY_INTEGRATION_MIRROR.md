# Filament Inventory Integration Mirror

## Purpose

`azmusgb/bambuhelper-smart-display` remains the authoritative repository for Workshop OS firmware, WS350 hardware behavior, release provenance, recovery, and physical acceptance.

`azmusgb/filamentinventory` contains a history-preserved integration mirror under `firmware/workshop-os/`. That mirror exists so product-level contracts, deterministic reconstruction, candidate comparison, and recovery planning can be validated together with Filament Inventory.

The mirror is not an independent firmware release authority and must not be used to bypass the Workshop OS promotion and physical-acceptance process.

## Authority boundary

Workshop OS owns:

- WS350 firmware and touchscreen UX;
- Bambu printer and mapped-power controls;
- audio, microphone, BLE, and local hardware integration;
- networking and portal/session security;
- OTA, full-image recovery, and firmware artifact provenance;
- firmware release-state metadata and physical acceptance.

Filament Inventory owns:

- canonical spool identity and lifecycle;
- quantity evidence and provenance;
- ownership, household/member isolation, and sharing semantics;
- printer/AMS placement as inventory-domain state;
- print readiness, usage, forecasting, and activity;
- grounded Assistant behavior and evidence validation;
- the versioned, profile-scoped device-facing inventory contract.

Neither repository may silently become a second source of truth for the other's authoritative state.

## Candidate mapping

The integration mirror preserves the current candidate lineage for product-level validation only:

- Workshop OS v11.23 Network / Locale / Layout Expert RC2 -> PR #76 in this repository;
- Workshop OS v11.24 Audio Console RC1 -> PR #77 in this repository;
- later experimental Instrument UI / auto-orientation work may be preserved in the integration mirror without becoming an accepted release.

Repository relocation or successful mirror CI does not promote a candidate.

## Release-state rule

Keep these states distinct:

`implemented -> built -> tested -> runtime validated -> production validated -> physically validated -> accepted -> stable`

CI can prove deterministic reconstruction, contract checks, browser-JavaScript validation, native WS350 build, shared-target regression, and Full/OTA artifact generation. It does not prove physical acceptance.

## Recovery rule

Waveshare Home and Workshop OS use incompatible partition layouts. Cross-line migration remains an intentional full-image flash at offset `0x0`, not OTA.

Do not remove known-good recovery images, flashing instructions, artifact hashes, or rollback documentation until a replacement path is physically validated.

## Device-contract rule

Workshop OS must consume Filament Inventory through the versioned, minimal, redacted, profile-scoped device contract. The WS350 must not invent spool identity, owner, remaining quantity, location, or AMS placement and must not infer authoritative placement from color/material similarity alone.

Unknown remains `Unknown`.
