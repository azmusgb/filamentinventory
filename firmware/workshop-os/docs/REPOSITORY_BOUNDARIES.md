# Workshop OS subsystem boundaries

`firmware/workshop-os/` is the authoritative firmware subsystem inside the canonical `azmusgb/filamentinventory` monorepo.

## This subsystem owns

- WS350 firmware and hardware-facing runtime behavior;
- touch/navigation UX and physical interaction contracts;
- Bambu printer control and mapped smart-plug power control;
- audio, microphone, BLE/device-companion behavior;
- local portal/session security, networking, device management and recovery;
- OTA/full-flash packaging and firmware release provenance;
- hardware builds, regression builds, framebuffer capture and physical acceptance;
- the Workshop Device Companion protocol and hardware orchestration plane.

## This subsystem does not own

Inventory-domain authority remains outside the firmware subtree in the root Filament Inventory application/cloud/domain layers.

Workshop OS must not become a second inventory database, quantity authority, ownership authority, placement authority, or model provider. In particular, it must not invent:

- spool identity;
- owner/profile scope;
- remaining quantity;
- printer/AMS/slot placement;
- measured weight;
- inventory recommendations presented as facts.

Unknown remains unknown. Similar color/material telemetry is not enough to assign a spool to an AMS slot.

## Canonical device contract

Current device-facing inventory endpoint:

- `GET https://filamentinventory.netlify.app/api/display-feed`
- `X-Filament-Sync-Key`
- `X-Filament-Profile: Bill | Aimee`
- response contract version: `1`

Contract v1 is redacted and profile-scoped. The current sync-key reuse is a compatibility bridge; the target is a revocable device-scoped credential with read/assistant capabilities and no broad inventory mutation authority.

## Monorepo relationship

The former standalone `azmusgb/bambuhelper-smart-display` repository has been history-preserved into this subtree. The canonical active development path is now this monorepo.

The former repository must remain available as historical/recovery provenance until recovery links, accepted artifacts, and cross-line migration evidence are fully verified. Repository relocation itself does not change firmware acceptance state.

## Candidate sequencing

The current candidate chain remains explicit:

1. v11.23 Network / Locale / Layout RC2 — software validated, physical WS350 acceptance pending.
2. v11.24 Audio Console — software validated, dependent on v11.23 physical acceptance; speaker/microphone physical validation pending.
3. Workshop Instrument UI + Audio + QMI8658 Auto Orient — software validated, but runtime, four-orientation/touch-axis, speaker/microphone, and physical acceptance remain pending.

Do not merge or promote a later candidate merely because the monorepo can reconstruct and build it.

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
