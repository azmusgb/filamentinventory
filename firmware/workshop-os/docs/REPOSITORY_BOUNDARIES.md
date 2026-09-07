# Workshop OS integration-mirror boundaries

This subtree is a **history-preserved integration mirror** of Workshop OS inside `azmusgb/filamentinventory`.

The authoritative Workshop OS firmware repository remains:

- `azmusgb/bambuhelper-smart-display`

Use this subtree for product-level contract checks, reconstruction, integration testing, and recovery planning. Do not treat it as the production firmware release authority unless the project authority model is explicitly changed.

## Authoritative Workshop OS scope

The authoritative firmware repository owns:

- WS350 firmware and hardware-facing runtime behavior;
- touch/navigation UX and physical interaction contracts;
- Bambu printer control and mapped smart-plug power control;
- audio, microphone, BLE/device-companion behavior;
- local portal/session security, networking, device management and recovery;
- OTA/full-flash packaging and firmware release provenance;
- hardware builds, regression builds, framebuffer capture and physical acceptance;
- the Workshop Device Companion protocol and hardware orchestration plane.

## Inventory boundary

Filament inventory data, cloud synchronization, evidence provenance, ownership/profile state, print readiness, and inventory LLM behavior are owned by the root Filament Inventory product.

Workshop OS must not become a second inventory database, quantity authority, ownership authority, placement authority, or model provider. In particular, it must not invent:

- spool identity;
- owner/profile scope;
- remaining quantity;
- printer/AMS/slot placement;
- measured weight;
- inventory recommendations presented as facts.

Unknown remains unknown. Similar color/material telemetry is not enough to assign a spool to an AMS slot.

## Device contract

Current device-facing inventory endpoint:

- `GET https://filamentinventory.netlify.app/api/display-feed`
- `X-Filament-Sync-Key`
- `X-Filament-Profile: Bill | Aimee`
- response contract version: `1`

Contract v1 is redacted and profile-scoped. The current sync-key reuse is a compatibility bridge; the target is a revocable device-scoped credential with read/assistant capabilities and no broad inventory mutation authority.

## Integration-mirror relationship

The Workshop OS history was imported here so unified CI can prove that inventory/cloud changes and firmware contracts can coexist without losing source provenance.

The mirror has successfully reconstructed and built the current firmware candidate stack, but source-of-truth firmware changes and physical acceptance remain anchored in `azmusgb/bambuhelper-smart-display`.

Mirrored candidate references:

1. v11.23 RC2 mirror — integration head `7723efad12c5a9f2274ac64df7e1d257cf2a4ad1`; authoritative source PR #76 / `feature/v11-23-network-locale-layout`.
2. v11.24 Audio mirror — integration head `ad1d7e9c78205be3d90c8ff76eee6d215f2c8ecd`; authoritative source PR #77 / `feature/v11-24-audio-console`.
3. Instrument UI + Audio + QMI8658 Auto Orient mirror — integration head `87c0af8a959e8f08b2ed29d458bf02c001bc318d`; source design branch `design/workshop-instrument-ui-v11-24`.

Do not merge or promote a later candidate merely because the integration mirror can reconstruct and build it.

## LLM boundary

The WS350 never stores an OpenAI/provider API key.

If Workshop OS requests cloud-generated inventory answers, it must call a narrow Filament Inventory server endpoint with profile-scoped, least-privilege authorization. Local printer/device telemetry and Filament Inventory data remain evidence; model output never becomes inventory source-of-truth state.

## Recovery rule

Waveshare Home and Workshop OS use incompatible partition layouts. Cross-line migration uses the approved full image at `0x0`, not OTA.

Preserve the known-good recovery image, flashing procedure, artifact identity/hash, and rollback documentation until the replacement path is physically proven.

## Release-state rule

Keep these states distinct:

`implemented -> built -> tested -> runtime validated -> production validated -> physically validated -> accepted -> stable`

GitHub Actions passing native builds and packaging is software evidence only. It is not physical acceptance of the WS350.
