# Contributing

Filament Inventory is the source of truth for physical filament inventory. Changes are evaluated first for data integrity, provenance, user isolation, recoverability, and release evidence—not only for feature completeness.

## Before changing code

1. Inspect the current `main` implementation and relevant tests.
2. Identify the authoritative writer/contract before adding another runtime layer.
3. Distinguish current implementation from target architecture.
4. Prefer the smallest complete coherent change.
5. Do not retire compatibility or recovery paths until the replacement is validated.

## Repository boundary

This repository owns inventory, spool identity, quantity evidence, profile isolation, QR/intake, printer/AMS inventory relationships, sync/recovery, print readiness, forecasting, grounded AI, and device-facing inventory data.

WS350 / Workshop OS firmware and hardware controls belong in the canonical `azmusgb/filamentinventory` repository under `firmware/workshop-os/`. The former `azmusgb/bambuhelper-smart-display` repository is retained only for historical provenance, migration evidence, recovery references, and legacy links.

The legacy Waveshare Home tree in this repository is retained only for migration/reference and recovery history.

## Truth rules

Do not silently infer authoritative physical state.

- Unknown stays `Unknown`.
- Do not assign a spool to a slot from color/material similarity.
- One physical spool has one durable canonical ID.
- One physical spool may occupy at most one Printer → Feeder/AMS → Slot placement.
- Remaining quantity must retain its evidence class; measured and estimated values are not equivalent.
- Private profile state must not leak across users.
- The LLM may explain authoritative data; it must not manufacture authoritative facts.

## Development

```bash
npm install
npm run ci
```

The full repository gate includes static validation, tests, production build/deploy-output verification, and browser interaction/visual regression through CI.

For local Netlify integration:

```bash
npx netlify dev
```

## Pull requests

Use a branch and pull request rather than pushing feature work directly to `main`.

A PR should state:

- problem and exact change set;
- authoritative implementation affected;
- schema/sync/import/recovery compatibility;
- profile-isolation impact;
- exact-head validation evidence;
- highest release state actually reached;
- remaining gates and non-goals.

Do not report a gate as passed unless it actually ran and passed.

## Release states

Keep these states distinct:

`implemented -> built -> tested -> runtime validated -> production validated -> physically validated -> accepted -> stable`

CI passing proves software validation; it does not prove WS350 physical acceptance. Netlify configuration proves transport/configuration, not Grounded LLM behavioral success.

Target release flow is:

`main -> candidate -> acceptance -> stable`

## Data-model changes

For schema/domain changes, explicitly review:

- compatibility and migration;
- backup/import/export behavior;
- cloud/local merge semantics;
- referential integrity;
- provenance and conflict preservation;
- profile/household isolation;
- auditability and rollback.

Additive migrations are preferred when replacing transitional state.

## UI changes

Review hierarchy, density, touch targets, responsive behavior, keyboard/focus behavior, reduced motion, loading/empty/error states, offline/reconnect behavior, and stale-client recovery.

Primary PWA navigation should remain compact: Home, Inventory, Printer, Assistant, Activity, with lower-frequency tools behind contextual actions or More.

## Firmware / recovery changes

Do not use this repository to create a second active WS350 firmware authority. Cross-line Waveshare Home → Workshop OS migration uses the approved full-image flash at `0x0`, not OTA, because the partition layouts differ.

Preserve the known-good recovery image/procedure and exact artifact identity until Workshop OS migration/recovery is physically proven.
