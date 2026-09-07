# Repository boundaries

`azmusgb/filamentinventory` is the **single canonical repository** for Filament Inventory + Workshop OS.

Repository consolidation does not collapse subsystem authority. The monorepo contains distinct authoritative domains with explicit interfaces between them.

## Inventory / cloud authority

The root application, cloud functions, domain modules, tests, and inventory-facing documentation own:

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

`firmware/workshop-os/` owns:

- WS350 firmware and hardware-facing runtime behavior;
- touchscreen UX and physical interaction contracts;
- Bambu printer control and mapped smart-plug control;
- audio, microphone, BLE/device-companion behavior;
- local portal/session security, networking, device settings, OTA, full-image recovery, and rollback behavior;
- native WS350 builds, shared-target regression builds, framebuffer/device validation, release artifacts, and physical acceptance evidence.

Workshop OS is **not** authoritative for spool identity, owner, quantity, inventory placement truth, Grounded Assistant evidence, or cloud profile state. It consumes those facts through explicit versioned interfaces.

## Device contract

Current device-facing inventory contract:

- `GET /api/display-feed`
- `X-Filament-Sync-Key`
- `X-Filament-Profile: Bill | Aimee`
- response contract version: `1`

The current sync-key reuse is a compatibility bridge. The target hardening increment is a revocable device-scoped credential with narrower read/assistant permissions and no inventory mutation authority.

The device contract must remain versioned, minimal, redacted, profile-scoped, freshness-aware, and explicit about unknown state.

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

## Legacy firmware and former repository

The historical `firmware/waveshare-home/` tree and `WaveshareHome-ESP32S3-1.6.0-fullflash/` recovery material are retained for migration/reference/recovery only. They are not active competing firmware authorities.

The former `azmusgb/bambuhelper-smart-display` repository is now historical provenance for Workshop OS history and release references. Do not delete or rewrite it until the unified repository's recovery references and physical cross-line migration path are fully verified.

Cross-line Waveshare Home -> Workshop OS migration remains a **full-image flash at `0x0`**, not OTA, because the partition layouts differ.

## Release-state rule

Repository location never promotes release state. Keep these states distinct:

`implemented -> built -> tested -> runtime validated -> production validated -> physically validated -> accepted -> stable`

CI can prove source reconstruction, security checks, native builds, regression builds, and artifact packaging. It does **not** prove WS350 physical acceptance.
