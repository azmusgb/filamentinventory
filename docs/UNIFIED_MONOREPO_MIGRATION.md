# Monorepo consolidation

On 2026-09-09 the user explicitly authorized `azmusgb/filamentinventory` as the surviving repository. The smallest migration updates the existing `firmware/workshop-os/` subtree and leaves web/API paths intact.

See [current migration evidence and blockers](migration/2026-09-09/README.md). The prior integration record below is historical; its requirement for authorization is now satisfied. Hardware acceptance, artifact integrity, recovery, and release validation remain mandatory. Superseded candidate sequencing does not grant UI13 acceptance.

---

# Unified Filament Inventory + Workshop OS Repository Integration

Status: **INTEGRATION IMPORT COMPLETE — AUTHORITY CUTOVER NOT APPROVED**

This document records the completed history-preserving import of Workshop OS into `azmusgb/filamentinventory` for unified product-level CI and contract validation. The import is an integration mechanism, not an authority change.

## Current authority model

The active authority split remains:

- `azmusgb/filamentinventory` — inventory/cloud/product authority;
- `azmusgb/bambuhelper-smart-display` — Workshop OS firmware/device authority.

The imported `firmware/workshop-os/` tree is a history-preserved integration mirror. It supports cross-product validation, but production firmware changes, candidate promotion, physical acceptance, and stable release authority remain in `azmusgb/bambuhelper-smart-display` unless the project authority model is explicitly changed.

## Integration work completed

The Filament Inventory repository now contains:

- history-preserved Workshop OS source under `firmware/workshop-os/`;
- root firmware validation capable of reconstructing the current accepted baseline and later candidate layers;
- immutable pinned upstream materialization;
- native `ws_lcd_350` build validation;
- shared `jc3248w535` regression validation;
- Full/OTA evidence packaging with SHA-backed artifacts;
- preserved Waveshare Home recovery material;
- mirrored candidate branches for v11.23 RC2, v11.24 Audio, and Instrument UI + Audio + Auto Orient.

This proves that the integrated repository can reconstruct and test the firmware line. It does not make the mirror authoritative.

## Mirrored candidate evidence

### v11.23 RC2 mirror

- integration head: `7723efad12c5a9f2274ac64df7e1d257cf2a4ad1`
- CI: PASS — run `34083309921`
- Workshop OS Firmware Validate: PASS — run `34083309936`
- artifact digest: `sha256:fd3d98cd2ed8c84b7697d91a9366bad0f7a0051f1b14a8fd7f710bdda7404c78`
- authoritative firmware candidate remains PR #76 / `feature/v11-23-network-locale-layout` in `azmusgb/bambuhelper-smart-display`
- physical WS350 acceptance: **pending**

### v11.24 Audio mirror

- integration head: `ad1d7e9c78205be3d90c8ff76eee6d215f2c8ecd`
- CI: PASS — run `34083331613`
- Workshop OS Firmware Validate: PASS — run `34083331594`
- artifact digest: `sha256:01cc4347b69ee5be1e2dfb528772867b2e5957c6b52418efe063172009e9a1b1`
- authoritative firmware candidate remains PR #77 / `feature/v11-24-audio-console` in `azmusgb/bambuhelper-smart-display`
- speaker/microphone physical validation: **pending**
- v11.23 physical acceptance remains prerequisite

### Instrument UI + Audio + Auto Orient mirror

- imported design source: `45131faf7a0d3769f06631764dd21539ba67f1f7` from `design/workshop-instrument-ui-v11-24`
- integration merge: `1741ea263fd346d59b43165280267801ecd43eb8`
- current integration head: `87c0af8a959e8f08b2ed29d458bf02c001bc318d`
- CI: PASS — run `34083353534`
- Workshop OS Firmware Validate: PASS — run `34083353520`
- artifact digest: `sha256:b1fd823621ac13daddbbcf8f5775ab66bf104a068eba556b784beffc1808e6a5`
- runtime, four-orientation/touch-axis, speaker/microphone, and physical validation: **pending**

## Gates required before any authority cutover

Do not mark `azmusgb/bambuhelper-smart-display` superseded, read-only, or archival until all of the following are deliberately satisfied:

- project instructions explicitly change the firmware authority assignment;
- v11.23 RC2 completes real-device physical acceptance on its authoritative source line;
- dependent v11.24 audio acceptance is completed;
- QMI8658 orientation/touch-axis behavior is physically validated if that candidate is promoted;
- cross-line Waveshare Home -> Workshop OS full-image migration is physically proven;
- recovery and rollback procedures are verified from the intended future authority location;
- exact source/candidate provenance is mapped so no release identity is lost;
- future firmware CI/release workflows are proven authoritative in the chosen location;
- the former firmware repository is retained for historical links and recovery provenance even if later archived.

Until those gates are satisfied, the two repositories remain active with distinct authority.

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

Repository integration does not accept or stabilize firmware.

Keep these states distinct:

`implemented -> built -> tested -> runtime validated -> production validated -> physically validated -> accepted -> stable`

Current integration CI proves reconstruction/build/test/artifact evidence only. It does not grant runtime, physical, accepted, or stable status.
