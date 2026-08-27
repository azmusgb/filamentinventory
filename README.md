# Filament Inventory

A mobile-first, local-first filament inventory PWA for iPhone, iPad, and desktop, with secure cloud sync, physical QR spool labels, two-person ownership, and printer/AMS placement tracking.

## v8 highlights

- Two-owner household inventory for **Bill** and **Aimee**
- Existing pre-v8 spools migrate to Bill by default
- Per-spool ownership stored with the synchronized spool record
- Stored vs Loaded physical state
- Printer, AMS/feeder, slot/bay, and loaded timestamp fields
- Owner filter on the main Inventory view
- Household dashboard with Bill vs Aimee counts and known filament totals
- Printer / AMS board showing what is loaded right now
- Quick move workflow to load, move, or unload a spool
- Slot collision protection so one assignment cannot silently contain two spools
- Ownership transfer between Bill and Aimee
- Print finder ranked by owner, material, color, remaining grams, and already-loaded printer state
- Household-aware CSV report and complete v8 JSON backup/restore
- Existing QR labels, secure sync, key rotation, recovery snapshots, and deletion tombstones remain intact

## Household model

Every spool has an `owner` of either:

- `Bill`
- `Aimee`

The app keeps one synchronized inventory rather than two disconnected databases. Reports, filters, and the household workspace separate the stock by owner while still allowing the two collections to be searched and managed together.

A local **New spools default to** selector controls which owner is preselected when adding a spool on that device.

## Printer / AMS model

Each spool also carries a physical placement state:

- `Stored`
- `Loaded`

Loaded spools can include:

- `printerName`
- `feederName` — AMS, AMS Lite, external holder, or another feed system
- `feederSlot` — slot/bay identifier
- `loadedAt`

Because these fields live directly on the spool record, they are covered by the existing newest-record synchronization behavior and cloud recovery snapshots.

## Household workflow

1. Open **Household**.
2. Choose whether new spools on this device default to Bill or Aimee.
3. Use **Quick move** to assign a spool to a printer / feeder / slot.
4. Use the **Printer / AMS board** to see what is loaded now.
5. Use **Bill vs Aimee report** for owner-level totals.
6. Use **Find filament for a print** to rank candidate spools.
7. Transfer ownership from the household spool list when needed.

## Backup behavior

The Household workspace provides a **complete v8 JSON backup** that includes owner and printer/AMS metadata, plus a household-aware CSV export.

Use the Household backup for the most complete v8 round-trip because the legacy core serializer predates the new household fields.

## Physical QR workflow

The Labels workspace still produces QR labels that contain only the public app URL and spool ID. QR labels never contain the private sync key.

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
