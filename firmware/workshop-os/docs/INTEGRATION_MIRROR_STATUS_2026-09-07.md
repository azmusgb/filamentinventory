# Filament Inventory integration mirror status — 2026-09-07

This document records the relationship between the authoritative Workshop OS repository and the history-preserved integration mirror now present in `azmusgb/filamentinventory`.

## Authority

The authority model is unchanged:

- `azmusgb/bambuhelper-smart-display` owns Workshop OS firmware, release provenance, hardware control, OTA/recovery, and physical acceptance.
- `azmusgb/filamentinventory` owns inventory truth, evidence provenance, profile isolation, cloud/PWA behavior, Grounded Assistant behavior, and device-facing inventory data.

The `filamentinventory/firmware/workshop-os/` tree is an **integration mirror**, not a second firmware authority.

## Why the mirror exists

The mirror provides product-level evidence that the two systems can be validated together without discarding Workshop OS history. It supports:

- versioned device-contract checks;
- candidate reconstruction from a shared product repository;
- native `ws_lcd_350` builds;
- shared `jc3248w535` regression builds;
- Full/OTA evidence packaging;
- recovery/migration planning;
- future architecture evaluation.

Passing mirror CI does not accept or stabilize firmware.

## Exact candidate mapping

### v11.23 RC2

Authoritative source:

- PR #76
- branch `feature/v11-23-network-locale-layout`
- source head `757dd25d3921acd45b5d229c29d090d885914751`

Integration mirror evidence:

- mirror head `7723efad12c5a9f2274ac64df7e1d257cf2a4ad1`
- CI run `34083309921`: PASS
- Workshop OS Firmware Validate run `34083309936`: PASS
- artifact digest `sha256:fd3d98cd2ed8c84b7697d91a9366bad0f7a0051f1b14a8fd7f710bdda7404c78`

Physical WS350 acceptance remains pending on the authoritative candidate.

### v11.24 Audio

Authoritative source:

- PR #77
- branch `feature/v11-24-audio-console`
- source head `95d321fcf7a1cb5f1e703fccc196b9cee363d2db`

Integration mirror evidence:

- mirror head `ad1d7e9c78205be3d90c8ff76eee6d215f2c8ecd`
- CI run `34083331613`: PASS
- Workshop OS Firmware Validate run `34083331594`: PASS
- artifact digest `sha256:01cc4347b69ee5be1e2dfb528772867b2e5957c6b52418efe063172009e9a1b1`

v11.23 physical acceptance remains a prerequisite and speaker/microphone physical validation is still required.

### Instrument UI + Audio + Auto Orient

Preserved source evidence:

- branch `design/workshop-instrument-ui-v11-24`
- source head `45131faf7a0d3769f06631764dd21539ba67f1f7`

Integration mirror evidence:

- imported merge `1741ea263fd346d59b43165280267801ecd43eb8`
- current mirror head `87c0af8a959e8f08b2ed29d458bf02c001bc318d`
- CI run `34083353534`: PASS
- Workshop OS Firmware Validate run `34083353520`: PASS
- artifact digest `sha256:b1fd823621ac13daddbbcf8f5775ab66bf104a068eba556b784beffc1808e6a5`

This remains implementation evidence only. Runtime, four-orientation/touch-axis, speaker/microphone, and physical acceptance remain pending. If promoted later, it should be reconciled onto the then-accepted authoritative Workshop OS base rather than bypassing #76/#77 acceptance.

## Recovery boundary

Waveshare Home and Workshop OS use incompatible partition layouts. Cross-line migration uses the approved full-image flash at `0x0`, not OTA.

Do not archive or remove the authoritative Workshop OS repository, accepted recovery artifacts, or rollback documentation merely because the integration mirror exists.

## Release-state rule

Keep these states distinct:

`implemented -> built -> tested -> runtime validated -> production validated -> physically validated -> accepted -> stable`

The integration mirror adds software evidence; it does not advance the physical release state.
