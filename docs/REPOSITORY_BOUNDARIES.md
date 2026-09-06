# Repository boundaries

This repository is the authoritative product boundary for **Filament Inventory**.

## This repository owns

- canonical spool identity and lifecycle;
- remaining-quantity evidence, measurement precedence, and inventory calculations;
- current Bill/Aimee profile isolation plus the target household/member/private/shared-resource domain migration;
- QR/intake, physical-spool workflows, and inventory labels;
- printer/AMS relationships as inventory-domain placement data;
- print requirements/readiness, reservations, print jobs, usage, and forecasting;
- cloud sync, recovery snapshots, backup/import/export, and audit/history;
- the Filament Inventory PWA and its Netlify backend;
- inventory LLM grounding, evidence validation, and server-side model transport;
- versioned, authenticated device-facing inventory APIs.

Bill/Aimee is the **current transitional implementation**, not the permanent household domain model. Future sharing or ownership transfer must be explicit and auditable and must not weaken current private-state isolation during migration.

## This repository does not own

Production firmware for the Waveshare ESP32-S3-Touch-LCD-3.5 is owned by:

- `azmusgb/bambuhelper-smart-display` — **Waveshare Workshop OS**

That repository owns WS350 touch behavior, printer and mapped-power controls, audio/microphone, BLE/device companion behavior, networking, OTA/recovery, hardware builds, and physical acceptance.

The historical `firmware/waveshare-home` line in this repository is retained only as a migration/reference/recovery source. **Waveshare Home 1.7.0 is the final feature release of that independent firmware line.** New WS350 product features belong in Workshop OS after any unique behavior is migrated.

Legacy source/recovery material may remain here temporarily; it must not be described or operated as a competing active firmware authority.

## Cross-repository contract

Workshop OS consumes inventory through explicit authenticated APIs rather than becoming a second inventory authority.

Current device contract:

- `GET /api/display-feed`
- `X-Filament-Sync-Key`
- `X-Filament-Profile: Bill | Aimee`
- response contract version: `1`

The current credential is intentionally compatible with the existing private sync scope. The target hardening increment is a revocable device-scoped credential with narrower read/assistant permissions before expanding device access.

The device contract should remain versioned, minimal, redacted, profile-scoped, freshness-aware, and explicit about unknown state.

## LLM boundary

The LLM interprets and explains inventory state; it never becomes the source of truth for inventory state.

- provider secrets remain server-side;
- the browser sends only relevant grounded evidence to the server transport;
- the WS350 never stores an OpenAI/provider API key;
- profile isolation is mandatory;
- fabricated evidence identifiers are rejected;
- unsupported numeric/placement/ownership claims are rejected or downgraded;
- unknown inventory quantities remain unknown;
- configured transport is not reported as Grounded model success until a validated profile-scoped model response succeeds.

## Migration / recovery rule

Do not delete historical firmware releases, rewrite release history, or remove the known-good recovery path merely to simplify the repository.

Port unique Waveshare Home 1.7.0 behavior into Workshop OS, physically accept the resulting Workshop OS candidate, verify the cross-line **full-image flash at `0x0`** and recovery path, then remove duplicate active firmware/tooling from this repository in a separate cleanup change.

Cross-line Waveshare Home -> Workshop OS migration is **not OTA-compatible** because the partition layouts differ.
