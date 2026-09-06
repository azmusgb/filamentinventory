# Repository boundaries

This repository is the authoritative product boundary for **Filament Inventory**.

## This repository owns

- Bill and Aimee profile isolation and private inventory state;
- spool lifecycle, remaining-quantity evidence and measurement precedence;
- cloud sync, recovery snapshots, QR workflows and audit/history;
- printer/AMS inventory relationships as inventory-domain data;
- the Filament Inventory PWA and its Netlify backend;
- inventory LLM grounding, evidence validation and server-side model transport;
- versioned, authenticated device-facing inventory APIs.

## This repository does not own

Production firmware for the Waveshare ESP32-S3-Touch-LCD-3.5 is owned by:

- `azmusgb/bambuhelper-smart-display` — **Waveshare Workshop OS**

That repository owns WS350 touch behavior, printer and mapped-power controls, audio/microphone, BLE/device companion behavior, OTA/recovery, hardware builds and physical acceptance.

The historical `firmware/waveshare-home` line in this repository is retained only as a migration/reference source. **Waveshare Home 1.7.0 is the final feature release of that independent firmware line.** New WS350 product features must be implemented in Workshop OS after any unique behavior is migrated.

## Cross-repository contract

Workshop OS must consume Filament Inventory through explicit authenticated APIs rather than by becoming a second inventory authority.

Current device contract:

- `GET /api/display-feed`
- `X-Filament-Sync-Key`
- `X-Filament-Profile: Bill | Aimee`
- response contract version: `1`

The current credential is intentionally compatible with the existing private sync scope. A future hardening increment should introduce a device-scoped credential with narrower read/assistant permissions before expanding device access.

## LLM boundary

The LLM interprets and explains inventory state; it never becomes the source of truth for inventory state.

- provider secrets remain server-side;
- the browser sends only relevant grounded evidence to the server transport;
- the WS350 never stores an OpenAI/provider API key;
- profile isolation is mandatory;
- fabricated evidence identifiers are rejected;
- unknown inventory quantities remain unknown.

## Migration rule

Do not delete historical firmware releases or rewrite release history. Port unique 1.7.0 behavior into Workshop OS, physically accept the resulting Workshop OS candidate, then remove the duplicate active firmware/tooling tree from this repository in a separate cleanup change.
