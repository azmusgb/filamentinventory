# Smart Display inventory feed

`GET /api/display-feed` provides a deliberately redacted view of one cloud-synced filament-inventory profile for small workshop displays such as the Waveshare ESP32-S3 3.5-inch Smart Display firmware.

## Authentication

The feed uses the same private cloud-scope credentials as inventory sync, but they are sent as request headers rather than URL query parameters:

- `x-filament-sync-key`: the existing private sync key
- `x-filament-profile`: `Bill` or `Aimee`

The endpoint hashes that credential pair with the same scope rule used by `/api/sync` and reads exactly one `inventory-<sha256>` envelope. It does **not** enumerate or combine other profiles.

Do not put the sync key in the feed URL. The BambuHelper Smart Display v7 client stores the header value locally and sends it only with the HTTPS feed request. Because the device configuration portal itself is local plain HTTP, provision this secret only from a trusted LAN.

## Display payload

The response contains only decision-level aggregate data:

- active spool count
- loaded spool count
- low/empty spool count
- planned/in-progress print-job count
- next planned material, when available
- latest cloud-update time and stale-data indication

It does **not** return spool IDs, profile/owner names, printer identities, brand names, colors, notes, sync keys, device metadata, audit history, or other record-level inventory data.

Example response:

```json
{
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

The schema is intentionally compatible with the BambuHelper Smart Display v6/v7 metric-card feed contract.
