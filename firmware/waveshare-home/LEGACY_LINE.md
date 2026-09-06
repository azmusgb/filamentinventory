# Waveshare Home firmware line — frozen

The independent **Waveshare Home** firmware line in this repository is frozen after **v1.7.0**.

## Status

- `v1.7.0` remains a valid historical/recovery release.
- Existing source and tooling are retained temporarily as migration/reference material.
- No new product features should be added to this firmware line.
- Hardware-facing development now belongs in `azmusgb/bambuhelper-smart-display` under **Waveshare Workshop OS**.

## Migration targets

Unique behavior that must be preserved in Workshop OS before this tree is removed from the active repository surface:

- Filament Inventory profile-aware summary;
- compact Inventory Assistant launcher and four quick questions;
- low-stock / loaded / inventory / attention semantics;
- explicit evidence language and unknown-data behavior;
- refusal to infer AMS placement from material or color;
- 52–60 px touch-target standard for primary physical controls;
- any still-useful inventory integration behavior not already present in Workshop OS.

Do **not** port the duplicate firmware architecture wholesale. Workshop OS remains authoritative for printer control, smart-plug control, touch/navigation, audio/microphone, BLE, OTA/recovery, authentication and physical acceptance.

## Removal gate

Remove the duplicate active firmware tree, old RC migration scripts and Waveshare-specific release workflows only after:

1. unique v1.7.0 behavior is implemented in Workshop OS;
2. the Workshop OS candidate passes exact-head firmware CI;
3. the real WS350 passes physical acceptance;
4. a safe cross-line installation/recovery procedure is documented and verified.

Historical GitHub releases and Git history must remain intact.
