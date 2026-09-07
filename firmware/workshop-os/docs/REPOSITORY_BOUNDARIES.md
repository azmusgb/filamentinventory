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

That repository is authoritative for Bill/Aimee profile isolation, spool state, remaining-quantity evidence, cloud sync, QR/audit workflows, inventory Assistant grounding and server-side model transport.

Workshop OS consumes inventory facts through versioned authenticated device APIs. It must not become a second inventory database or model provider.

## Canonical device contract

Current device-facing inventory endpoint:

- `GET https://filamentinventory.netlify.app/api/display-feed`
- `X-Filament-Sync-Key`
- `X-Filament-Profile: Bill | Aimee`
- response contract version: `1`

Contract v1 returns aggregate inventory/queue/staleness data only. Record-level Assistant evidence requires a separately designed least-privilege endpoint.

The current sync-key reuse is a compatibility bridge. The target design is a device-scoped credential with read/assistant capabilities and no sync-mutation authority.

## Filament Inventory firmware consolidation

`azmusgb/filamentinventory` previously evolved an independent **Waveshare Home** firmware line through v1.7.0. That line is now frozen and retained only as migration/reference material.

Workshop OS must preserve the valuable behavior without importing the duplicate firmware architecture wholesale.

Unique migration targets include:

- profile-aware inventory summary;
- compact Inventory Assistant launcher;
- quick questions for Low stock, Loaded now, Inventory and Attention;
- explicit evidence/unknown-data language;
- refusal to infer AMS assignment from color or material;
- 52–60 px physical touch-target standard where applicable.

Workshop OS remains authoritative for the underlying printer, power, network, audio, BLE, OTA/recovery and security implementations.

## Candidate sequencing

Do not mix repository consolidation into the active hardware acceptance deltas.

1. Complete v11.23 Network / Locale / Layout RC2 physical acceptance.
2. Complete the dependent v11.24 Audio Console candidate acceptance.
3. Create a separate Workshop OS inventory/Assistant migration candidate from the then-accepted source line.
4. Run exact-head CI, native WS350 build, shared-display regression and real-device physical acceptance.
5. Only then may the duplicate active firmware/tooling tree be removed from Filament Inventory.

## LLM boundary

The WS350 never stores an OpenAI/provider API key.

If Workshop OS later requests cloud-generated inventory answers, it must call a narrow Filament Inventory server endpoint with profile-scoped, least-privilege authorization. Local printer/AMS state and Filament Inventory data remain evidence; model output never becomes inventory source-of-truth state.

## Companion terminology

- **Workshop Device Companion**: hardware orchestration, BLE presence/handoff, device capabilities.
- **Filament Inventory Assistant**: inventory interpretation, recommendations and grounded LLM behavior.

These are related product surfaces but have different authority and security boundaries.
