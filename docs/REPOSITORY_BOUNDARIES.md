# Repository boundaries

This repository is the authoritative product boundary for **Filament Inventory**.

It now also contains a history-preserved Workshop OS integration mirror under `firmware/workshop-os/` so product-level contracts and firmware reconstruction can be tested together. That mirror does **not** replace the current firmware authority.

## Filament Inventory authority

`azmusgb/filamentinventory` owns:

- canonical spool identity and lifecycle;
- remaining-quantity evidence, measurement precedence, and inventory calculations;
- current Bill/Aimee profile isolation plus the target `Household -> Member -> Private/Shared Resources` migration;
- QR/intake, physical-spool workflows, and inventory labels;
- printer/AMS relationships as inventory-domain placement data;
- print requirements/readiness, reservations, print jobs, usage, and forecasting;
- cloud sync, recovery snapshots, backup/import/export, and audit/history;
- the Filament Inventory PWA and Netlify backend;
- Grounded Assistant evidence construction, validation, server-side model transport, and deterministic fallback;
- versioned, authenticated device-facing inventory APIs.

Bill/Aimee remains a **transitional implementation**, not the permanent household domain model. Future sharing or ownership transfer must be explicit and auditable and must not weaken private-state isolation during migration.

## Workshop OS authority

Production Workshop OS firmware for the WS350 remains owned by:

- `azmusgb/bambuhelper-smart-display`

That repository remains authoritative for WS350 firmware, touch/navigation behavior, Bambu and mapped-power controls, audio/microphone/BLE, networking, local portal/session security, OTA/full-image recovery, firmware release provenance, native hardware builds, and physical acceptance.

The imported `firmware/workshop-os/` tree in this repository is an **integration mirror** used for unified contract checks, reconstruction, candidate comparison, and recovery planning. It must not become a competing release authority unless the project authority model is explicitly changed.

## Device contract

Workshop OS consumes inventory facts through explicit authenticated APIs rather than becoming a second inventory authority.

Current device-facing inventory contract:

- `GET /api/display-feed`
- `X-Filament-Sync-Key`
- `X-Filament-Profile: Bill | Aimee`
- response contract version: `1`

The current sync-key reuse is a compatibility bridge. The target hardening increment is a revocable device-scoped credential with narrower read/assistant permissions and no inventory mutation authority.

The contract must remain versioned, minimal, redacted, profile-scoped, freshness-aware, and explicit about unknown state.

## Physical-state rule

Neither subsystem may silently invent physical truth.

- Unknown inventory quantity remains `Unknown`.
- A spool is not assigned to an AMS slot solely because color or material resembles printer telemetry.
- One physical spool may occupy at most one explicit placement: `Spool -> Printer -> Feeder/AMS -> Slot`.
- External-spool paths must be represented explicitly.
- Archived, empty, or inactive spools cannot remain loaded.
- Stale or conflicting evidence must be surfaced rather than silently reconciled by the LLM.

## LLM boundary

The LLM interprets and explains authoritative inventory evidence; it does not create authoritative inventory facts.

- provider secrets remain server-side;
- the WS350 never stores an OpenAI/provider API key;
- profile isolation is mandatory;
- fabricated evidence identifiers are rejected;
- unsupported numeric, placement, ownership, or loaded-state claims are rejected or downgraded;
- configured transport is not reported as Grounded model success until a validated profile-scoped model response succeeds;
- deterministic/local fallback remains available.

## Legacy firmware and recovery

The historical `firmware/waveshare-home/` tree and `WaveshareHome-ESP32S3-1.6.0-fullflash/` recovery material are retained for migration/reference/recovery only. They are not active competing firmware authorities.

Waveshare Home and Workshop OS use incompatible partition layouts. Cross-line migration remains a **full-image flash at `0x0`**, not OTA.

Do not remove the known-good recovery image, flashing procedure, artifact identity/hash, or rollback documentation until the replacement path is physically proven.

## Release-state rule

Repository location and CI do not promote release state. Keep these states distinct:

`implemented -> built -> tested -> runtime validated -> production validated -> physically validated -> accepted -> stable`

CI can prove source reconstruction, security checks, native builds, regression builds, and artifact packaging. It does **not** prove WS350 physical acceptance.
