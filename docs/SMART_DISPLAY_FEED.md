# Smart Display inventory feed

`GET /api/display-feed` provides a deliberately redacted aggregate view of the cloud-synced filament inventory for small workshop displays such as the Waveshare ESP32-S3 3.5-inch Smart Display firmware.

The endpoint reads current `inventory-*` envelopes from the existing `filament-inventory-sync` Netlify Blobs store and returns only decision-level aggregate data:

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
