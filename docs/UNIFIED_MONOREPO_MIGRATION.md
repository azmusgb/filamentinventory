# Unified Filament Inventory + Workshop OS Monorepo Migration

Status: **SOFTWARE CUTOVER COMPLETE — PHYSICAL/RECOVERY RETIREMENT GATES REMAIN**

This document records the completed repository consolidation from two active repositories to one canonical product repository while preserving inventory truth, firmware history, evidence provenance, user isolation, recovery, and release-state discipline.

## Canonical repository

`azmusgb/filamentinventory` is now the single canonical repository for the complete workshop product.

- Existing Filament Inventory PWA/cloud remains at the repository root.
- Workshop OS is history-preserved under `firmware/workshop-os/`.
- Root `.github/workflows/` is the active GitHub Actions authority.
- Historical Waveshare Home and former standalone Workshop OS materials remain retained for provenance/recovery.

The repository consolidation does **not** collapse subsystem authority:

- root inventory/cloud/domain code owns spool identity, quantity evidence, household/profile semantics, ownership/sharing, placement, usage/activity, print readiness, forecasting, Grounded Assistant behavior, PWA, and device-facing inventory data;
- `firmware/workshop-os/` owns WS350 firmware, touchscreen UX, printer/device controls, hardware integrations, audio/mic/BLE, networking, OTA/recovery, firmware artifacts, and physical acceptance;
- shared contracts/documentation define the narrow boundary between those domains.

No firmware code may become authoritative for inventory truth. No cloud/PWA code may invent physical device state.

## Completed migration evidence

Software cutover completed through merged monorepo changes including:

- history-preserving Workshop OS import under `firmware/workshop-os/`;
- removal of obsolete active Waveshare Home root release workflows;
- root Workshop OS firmware validation with candidate-aware reconstruction;
- immutable pinned upstream materialization;
- native `ws_lcd_350` build validation;
- shared `jc3248w535` regression validation;
- Full and OTA evidence packaging with SHA-backed artifacts;
- preservation of legacy recovery material;
- explicit candidate branches for v11.23 RC2, v11.24 Audio, and Instrument UI + Audio + Auto Orient.

Canonical `main` after the candidate-validation fix:

`4f96ed5f6ead22bba5e1cb399511557b6fb87a69`

## Current candidate evidence

### v11.23 RC2

- monorepo head: `7723efad12c5a9f2274ac64df7e1d257cf2a4ad1`
- CI: PASS
- Workshop OS Firmware Validate: PASS — run `34083309936`
- artifact digest: `sha256:fd3d98cd2ed8c84b7697d91a9366bad0f7a0051f1b14a8fd7f710bdda7404c78`
- physical WS350 acceptance: **pending**

### v11.24 Audio

- monorepo head: `ad1d7e9c78205be3d90c8ff76eee6d215f2c8ecd`
- CI: PASS
- Workshop OS Firmware Validate: PASS — run `34083331594`
- artifact digest: `sha256:01cc4347b69ee5be1e2dfb528772867b2e5957c6b52418efe063172009e9a1b1`
- speaker/microphone physical validation: **pending**
- v11.23 physical acceptance remains prerequisite

### Instrument UI + Audio + Auto Orient

- imported design merge: `1741ea263fd346d59b43165280267801ecd43eb8`
- current monorepo head: `87c0af8a959e8f08b2ed29d458bf02c001bc318d`
- CI: PASS
- Workshop OS Firmware Validate: PASS — run `34083353520`
- artifact digest: `sha256:b1fd823621ac13daddbbcf8f5775ab66bf104a068eba556b784beffc1808e6a5`
- runtime/axis/touch/speaker/microphone physical validation: **pending**

## Gates still open

The repository migration is complete as a software/source-control cutover, but the following are deliberately **not** claimed complete:

- real-device v11.23 RC2 physical acceptance;
- v11.24 speaker/microphone physical acceptance;
- QMI8658 four-orientation and touch-axis physical validation;
- cross-line Waveshare Home -> Workshop OS full-image migration validation on real hardware;
- final verification of rollback/recovery links and procedures from the unified repository;
- Grounded Assistant behavioral acceptance against real profile-scoped production execution;
- device-scoped least-privilege credential replacement for the compatibility sync key;
- archival/read-only retirement of `azmusgb/bambuhelper-smart-display`.

The former firmware repository should be marked superseded/read-only only after the recovery and physical migration gates above are evidenced. It should not be deleted or have history rewritten.

## Recovery invariant

Waveshare Home and Workshop OS use incompatible partition layouts. Cross-line migration uses the approved **full-image flash at `0x0`**, not OTA.

Preserve:

- known-good recovery image;
- exact artifact identity/hash;
- flashing procedure;
- rollback documentation;
- accepted physical baseline.

Do not remove legacy recovery capability until the replacement path is physically proven.

## Release-state invariant

Repository migration itself does not accept or stabilize firmware.

Keep these states distinct:

`implemented -> built -> tested -> runtime validated -> production validated -> physically validated -> accepted -> stable`

Current candidate CI proves reconstruction/build/test/artifact evidence. It does not grant runtime, physical, accepted, or stable status.
