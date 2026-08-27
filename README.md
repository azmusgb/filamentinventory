# Filament Inventory

A mobile-first, local-first filament inventory PWA for iPhone, iPad, and desktop, with secure cloud sync, physical QR spool labels, two-person ownership, printer/AMS placement tracking, and per-user experience customization.

## v9 highlights

- New **Customize** workspace with separate local UX profiles for **Bill** and **Aimee**
- Midnight, Light, OLED Black, High Contrast, and Follow System themes
- Cyan, Violet, Green, Amber, and Rose accent presets
- Compact, Comfortable, and Roomy information density
- Small, Standard, Large, and Extra Large text sizes
- Reduced-motion mode and optional larger touch targets
- Inventory Cards or List layout
- Per-profile default landing view
- Per-profile owner scope, default sort, lifecycle filter, and remembered inventory filters
- Per-profile preferred QR label size
- Dashboard controls for welcome/quick actions, priority queue, and distribution/material charts
- Per-profile local app title
- Export/import of UX preferences separately from inventory backups
- Existing secure sync, household ownership, printer/AMS placement, QR labels, recovery snapshots, key rotation, and tombstones remain unchanged

## Preference model

UX preferences are intentionally **not stored in the shared cloud inventory**. Each browser keeps two local profiles:

- `Bill`
- `Aimee`

That allows the same person to use different layouts on different devices and lets Bill and Aimee have independent preferences without changing shared spool records.

Examples:

- Bill can use **OLED Black + Compact + Inventory as the default tab** on an iPhone.
- Aimee can use **Light + Roomy + Dashboard as the default tab** on an iPad.
- Both still see and edit the same synchronized household inventory.

Preferences can be exported/imported from the Customize workspace when a similar setup is wanted on another browser.

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

The Household workspace provides a **complete v8+ JSON backup** that includes owner and printer/AMS metadata, plus a household-aware CSV export.

The Customize workspace separately exports local UX preferences. This separation prevents a phone-specific theme/layout from altering another device's working experience.

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
