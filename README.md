# Filament Inventory

A mobile-first, local-first filament inventory PWA for iPhone, iPad, and desktop, with secure cloud sync and physical QR spool labels.

## v7 highlights

- Printable QR labels tied to spool IDs
- Dedicated Labels workspace with batch selection and print preview
- Three practical label sizes: 2 × 1 in, 2.25 × 1.25 in, and 1.5 × 1.5 in
- QR scan opens an on-device spool summary with **Weigh now** and **Find in inventory** actions
- QR payload contains only the public app URL and spool ID — never the private sync key
- Browser Print can print directly or save the label sheet as PDF
- Existing v6 key rotation/pairing, v5 recovery snapshots, and v4 merge/tombstone sync remain intact

## Physical workflow

1. Open **Labels**.
2. Select active spools or choose individual spools.
3. Pick a label size and print at 100% scale.
4. Attach the label to the spool or spool storage location.
5. Scan it with the phone Camera app.
6. Choose **Weigh now** or **Find in inventory**.

The device must still have the inventory locally or be connected through the normal Sync workflow to display private spool details.

## Security model

The QR code is deliberately non-secret. It contains a URL like:

`https://filamentinventory.netlify.app/?spool=S001&scan=1`

The sync capability key is never placed in QR labels, JSON/CSV exports, or public URLs.

## Cloud architecture

- `/api/sync` — normal merge/snapshot synchronization
- `/api/sync-admin` — key rotation and cloud deletion
- `/qr` — read-only QR SVG generation from a validated spool ID

## Inventory rule

Measured `gross - tare` weight is authoritative. Visual estimates are used only when a complete measurement is unavailable. Unknown remains unknown.

## Development

```bash
npm install
npx netlify dev
```
