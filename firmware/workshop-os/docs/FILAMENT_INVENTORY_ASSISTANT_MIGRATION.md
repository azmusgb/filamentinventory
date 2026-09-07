# Filament Inventory Assistant migration plan

This document defines the post-v11.24 migration of the useful **Waveshare Home v1.7.0** inventory/Assistant behavior into canonical **Workshop OS**.

It is planning/governance only. It does not alter firmware behavior and must not be interpreted as physical acceptance.

## Preconditions

Do not implement this migration on the active v11.23 or v11.24 hardware-candidate branches.

Start only after:

1. v11.23 Network / Locale / Layout RC2 is physically accepted and promoted;
2. v11.24 Audio Console is rebased/promoted against the accepted base and physically accepted;
3. `filamentinventory` contract v1 is deployed and verified in production.

## Product intent

The WS350 provides a compact, glanceable inventory intelligence surface. Free-text composition and rich conversation remain companion/web responsibilities.

Initial physical Assistant surface:

- `Low stock`
- `Loaded now`
- `Inventory`
- `Attention`
- explicit `Back`

No tiny on-screen keyboard is required for this phase.

## Source-of-truth rules

Workshop OS must not infer inventory facts.

- Filament Inventory owns spool/profile state.
- Live Bambu telemetry owns observed AMS slot state.
- Unknown quantity remains unknown.
- Similar color/material is never sufficient evidence for a spool-to-AMS assignment.
- Conflicting inventory and live-device evidence must be presented as a discrepancy, not silently reconciled by guessing.

## Data contract

Use Filament Inventory contract v1 for aggregate state:

`GET https://filamentinventory.netlify.app/api/display-feed`

Headers:

- `X-Filament-Sync-Key`
- `X-Filament-Profile: Bill | Aimee`

Expected fields:

- `contractVersion`
- `capabilities`
- `summary.spools`
- `summary.loaded`
- `summary.low`
- `summary.unknown`
- `summary.queue`
- `stale`
- legacy presentation fields for compatibility

Firmware must reject unsupported breaking contract versions rather than parse arbitrary payloads.

## Record-level Assistant evidence

Do not expand `/api/display-feed` to expose spool identities merely to recreate the v1.7.0 attention list.

If record-level evidence is required, Filament Inventory should provide a separate least-privilege endpoint with:

- profile-scoped authorization;
- bounded result count;
- only fields needed for the requested device intent;
- stable evidence identifiers;
- no notes/audit history/full inventory export;
- no model-provider secret on the device.

## Cloud LLM phase

Cloud-generated WS350 answers are optional and follow aggregate/local behavior.

If enabled later:

1. Workshop OS sends a narrow question/intent to a Filament Inventory server endpoint.
2. Filament Inventory selects and validates the allowed evidence.
3. Provider execution remains server-side.
4. Returned evidence identifiers are validated before display.
5. On timeout/provider/auth failure, Workshop OS falls back to deterministic local/device-feed responses.

The WS350 must never receive or store `OPENAI_API_KEY`.

## Physical UX contract

- Primary controls target approximately 52–60 px hit areas where layout permits.
- Back is explicit and at least 52 px high on the Assistant screen.
- No ordinary navigation relies on hidden long press.
- Answer/footer regions must not overlap at the maximum supported text length.
- Offline/stale/profile state must be visible rather than implied.
- Model use, if present, must be distinguishable from local deterministic grounding.

## Security direction

Compatibility phase may use the current Filament Inventory private profile credential.

Preferred follow-on:

- device-specific credential;
- `inventory:read-summary` capability;
- optional `inventory:read-attention` capability;
- optional `assistant:ask` capability;
- no sync-write/key-rotation/delete authority.

Provision long-lived credentials only through the trusted management flow. Do not put credentials in URLs, BLE advertisements, screenshots or diagnostic bundles.

## Cross-line migration / installation

Do not assume Waveshare Home v1.7.0 OTA images and Workshop OS OTA images are mutually compatible.

Before providing a migration path, compare and verify:

- partition layout;
- bootloader expectations;
- OTA metadata;
- NVS/settings compatibility;
- rollback/recovery behavior.

Default migration assumption is **USB full flash** until compatibility is proven. Existing v1.7.0 release assets remain historical/recovery artifacts.

## Acceptance gate

A future Assistant migration candidate must pass:

- deterministic reconstruction from the accepted Workshop OS baseline;
- exact-head repository validation;
- native `ws_lcd_350` build;
- shared `jc3248w535` regression build or explicit board-N/A proof;
- existing printer/power/security/recovery regression contracts;
- profile switching between Bill and Aimee;
- low/unknown/loading evidence tests;
- stale/offline API behavior;
- no cross-profile data leakage;
- no inferred AMS assignment;
- real-device touch/layout acceptance;
- verified USB recovery/migration procedure.

Only after this gate is passed should the duplicate active `filamentinventory/firmware/waveshare-home` tree be removed.
