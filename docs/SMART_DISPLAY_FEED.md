# Smart Display inventory feed

`GET /api/display-feed` is the stable, deliberately redacted device-facing read contract for Workshop OS and other constrained workshop displays.

The authoritative contract is documented in `docs/DEVICE_API_CONTRACT_V1.md`.

## Authentication

The feed uses the same private cloud-scope credentials as inventory sync for compatibility, sent as request headers rather than URL query parameters:

- `x-filament-sync-key`: the existing private sync key
- `x-filament-profile`: `Bill` or `Aimee`

The endpoint hashes that credential pair with the same scope rule used by `/api/sync` and reads exactly one `inventory-<sha256>` envelope. It does **not** enumerate or combine other profiles.

Do not put the sync key in the feed URL. Provision this secret only from a trusted device/LAN. A future hardening increment should replace sync-key reuse with a device-scoped read credential.

## Contract v1

The response retains the original presentation fields and adds machine-readable version/capability/summary fields so firmware never needs to parse counts from UI strings.

Example response:

```json
{
  "contractVersion": 1,
  "capabilities": [
    "inventory-summary",
    "queue-summary",
    "staleness"
  ],
  "summary": {
    "spools": 42,
    "loaded": 4,
    "low": 3,
    "unknown": 2,
    "queue": 2
  },
  "title": "Filament Inventory",
  "subtitle": "Workshop",
  "status": "3 spools low",
  "metrics": [
    {"label":"Spools","value":"42"},
    {"label":"Loaded","value":"4"},
    {"label":"Low","value":"3"},
    {"label":"Queue","value":"2"}
  ],
  "footer": "Queue 2 · Next PETG · Updated 10:43 PM",
  "generatedAt": "2026-08-30T02:43:00.000Z",
  "sourceUpdatedAt": "2026-08-30T02:42:00.000Z",
  "stale": false
}
```

## Evidence rules

Remaining quantity follows the same authority order as the main inventory application:

1. valid measured `gross - tare`;
2. explicit `estimatedRemainingGrams`;
3. `visualPercent` applied to nominal/start weight;
4. otherwise unknown.

Unknown remains unknown and is not automatically classified low. Loaded state comes only from explicit placement state; material/color similarity is never evidence of AMS placement.

## Privacy boundary

The feed returns decision-level aggregate data only. It does **not** return spool IDs, profile/owner names, printer identities, brand names, colors, notes, sync keys, device metadata, audit history, or other record-level inventory data.

Record-level Assistant evidence must use a separately designed least-privilege endpoint rather than widening this summary feed.

## Compatibility

Consumers must ignore unknown additive fields. Breaking semantic or shape changes require a new contract version.
