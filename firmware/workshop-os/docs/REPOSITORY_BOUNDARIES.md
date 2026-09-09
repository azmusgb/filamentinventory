# Repository boundaries

This repository is the authoritative product boundary for **Waveshare Workshop OS** on the WS350.

## This repository owns

- WS350 firmware and hardware-facing runtime behavior;
- touch/navigation UX and physical interaction contracts;
- Bambu printer control and mapped smart-plug power control;
- audio, microphone and BLE/device-companion behavior;
- local portal/session security, device management and recovery;
- OTA/full-flash packaging and firmware release provenance;
- hardware builds, regression builds, framebuffer capture and physical acceptance;
- the Workshop Device Companion protocol and hardware orchestration plane.

## This repository does not own

Filament inventory data, cloud synchronization or inventory LLM behavior are owned by:

- `azmusgb/filamentinventory` — **Filament Inventory**

That repository is authoritative for profile isolation, spool state, remaining-quantity evidence, cloud sync, QR/audit workflows, inventory Assistant grounding and server-side model transport.

Workshop OS consumes inventory facts through versioned authenticated device APIs. It must not become a second inventory database, quantity authority, ownership authority, placement authority, or model provider.

## Filament Inventory integration mirror

`azmusgb/filamentinventory` now contains a history-preserved integration mirror of Workshop OS under `firmware/workshop-os/`.

That mirror is used for product-level contract validation, reconstruction, shared CI, candidate comparison, and recovery planning. It is **not** the current production firmware authority and does not replace this repository's physical-acceptance or release responsibilities.

Mirrored CI may be cited as additional software evidence only when it is tied to an exact source/candidate mapping. It must not be used to promote firmware independently of the authoritative Workshop OS candidate line.

## Canonical device contract

Current device-facing inventory endpoint:

- `GET https://filamentinventory.netlify.app/api/display-feed`
- `X-Filament-Sync-Key`
- `X-Filament-Profile: Bill | Aimee`
- response contract version: `1`

Contract v1 returns aggregate inventory/queue/staleness data only. Record-level Assistant evidence requires a separately designed least-privilege endpoint.

The current sync-key reuse is a compatibility bridge. The target design is a device-scoped credential with read/assistant capabilities and no sync-mutation authority.

## Filament Inventory firmware consolidation

`azmusgb/filamentinventory` previously evolved an independent **Waveshare Home** firmware line through v1.7.0. That line is frozen and retained only as migration/reference/recovery material.

Workshop OS must preserve valuable behavior without importing duplicate firmware authority. Unique migration targets include:

- profile-aware inventory summary;
- compact Inventory Assistant launcher;
- quick questions for Low stock, Loaded now, Inventory and Attention;
- explicit evidence/unknown-data language;
- refusal to infer AMS assignment from color or material;
- 52–60 px physical touch-target standard where applicable.

Workshop OS remains authoritative for the underlying printer, power, network, audio, BLE, OTA/recovery and security implementations.

## Candidate sequencing

Do not mix repository integration with physical-acceptance promotion.

1. Complete v11.23 Network / Locale / Layout RC2 physical acceptance in authoritative PR #76.
2. Complete the dependent v11.24 Audio Console candidate acceptance in authoritative PR #77.
3. Rebase/recreate later Instrument UI/Auto Orient work on the then-accepted authoritative source line if it remains desired.
4. Create the Workshop OS inventory/Assistant migration candidate from the then-accepted source line.
5. Run exact-head CI, native WS350 build, shared-display regression and real-device physical acceptance.
6. Consider any future firmware-authority migration only as a separate deliberate architecture change with proven recovery/rollback.

## LLM boundary

The WS350 never stores an OpenAI/provider API key.

If Workshop OS later requests cloud-generated inventory answers, it must call a narrow Filament Inventory server endpoint with profile-scoped, least-privilege authorization. Local printer/AMS state and Filament Inventory data remain evidence; model output never becomes inventory source-of-truth state.

## Recovery rule

Waveshare Home and Workshop OS use incompatible partition layouts. Cross-line migration uses the approved full image at `0x0`, not OTA.

Preserve the known-good recovery image, flashing procedure, artifact identity/hash, and rollback documentation until the replacement path is physically proven.

## Release-state rule

Keep these states distinct:

`implemented -> built -> tested -> runtime validated -> production validated -> physically validated -> accepted -> stable`

CI or integration-mirror success does not prove WS350 physical acceptance.
