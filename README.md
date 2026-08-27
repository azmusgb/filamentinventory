# Filament Inventory

A mobile-first, local-first filament inventory PWA for iPhone, iPad, and desktop. The app provides **separate private inventory workspaces for Bill and Aimee**, profile-scoped cloud sync, physical QR spool labels, printer/AMS placement tracking, bulk spool operations, recovery snapshots, audit history, and per-user experience customization.

## Current highlights

- Private Bill and Aimee inventory workspaces
- Separate spool records, measurement history, audit history, backups, sync settings, and cloud namespaces per user
- One-tap user workspace switching with routed local storage
- Migration of legacy owner-tagged inventory into isolated user states
- Mobile-first inventory command surface
- Multi-select bulk actions for moving, storing, QR labeling, archiving, and restoring spools
- Printer / AMS placement tracking
- Physical QR spool lookup and labels
- Secure cloud merge/snapshot synchronization
- Per-user themes, density, text sizing, filters, sorting, dashboard options, and default views
- CI, weekly grouped dependency maintenance, and production smoke verification

## Private user model

The app has two supported inventory profiles:

- `Bill`
- `Aimee`

They are **not two filters over one live shared inventory**. The active profile is an isolation boundary.

`user-isolation.js` routes the logical inventory and sync storage keys to profile-specific physical keys. It also filters inventory, measurement history, audit history, and ownership-sensitive state so the active workspace contains only that user's records.

The UI reflects that boundary directly:

- separate spools;
- separate measurement and audit history;
- separate backups;
- separate sync key/settings storage;
- separate printer / AMS assignments;
- no cross-user ownership-transfer controls in the active private workspace.

Switching between Bill and Aimee changes the active routed workspace and reloads the application so data from the previous user is not retained as the working state.

## Legacy migration

Older releases could contain one owner-tagged inventory. On first migration to user isolation, the app splits that state into Bill and Aimee partitions using the recorded spool/audit ownership evidence.

Legacy data is not treated as proof that the two current workspaces should remain combined. After migration, each user operates through their own routed state.

## Cloud isolation

Cloud sync is profile-scoped as well as key-protected.

The browser sends both:

- `X-Filament-Sync-Key`
- `X-Filament-Profile` (`Bill` or `Aimee`)

The production sync function validates the profile and derives the cloud storage identity from **profile + private sync key**. Therefore Bill and Aimee remain in different cloud namespaces even when a migrated setup begins with the same legacy private sync key.

Cloud state includes the active user's:

- spools;
- measurement history;
- audit history;
- tombstones;
- device activity;
- recovery snapshots.

The sync service uses strong-consistency Netlify Blobs storage, bounded state/log sizes, profile-bound snapshots, and merge reconciliation for concurrent device updates.

## Printer / AMS model

Each spool can be physically:

- `Stored`
- `Loaded`

Loaded spools can include:

- `printerName`
- `feederName` — AMS, AMS Lite, external holder, or another feed system
- `feederSlot` — slot/bay identifier
- `loadedAt`

These assignments remain inside the active user's private inventory state and are synchronized with that user's cloud namespace.

## Bulk spool workflow

The inventory supports explicit multi-select operations for common physical-management tasks. Selected spools can be handled together for actions such as:

- moving to a printer/feed location;
- marking stored;
- producing QR labels;
- archiving;
- restoring archived records.

Bulk actions continue through the same user-isolation and audit paths as single-spool changes.

## Customization model

UX preferences are local to the browser and independently maintained for Bill and Aimee. They are intentionally separate from cloud inventory state.

Available preferences include:

- Midnight, Light, OLED Black, High Contrast, and Follow System themes;
- Cyan, Violet, Green, Amber, and Rose accents;
- Compact, Comfortable, and Roomy information density;
- Small, Standard, Large, and Extra Large text sizes;
- reduced-motion mode;
- optional larger touch targets;
- Inventory Cards or List layout;
- default landing view;
- default sort and lifecycle filters;
- remembered inventory filters;
- preferred QR label size;
- dashboard visibility controls;
- local app title.

Preferences can be exported/imported separately from inventory backups.

## Physical QR workflow

QR labels contain only the public application URL and spool ID. They do **not** contain the private cloud sync key.

The `/qr` function validates spool IDs and produces read-only QR SVG output.

## Backup and recovery

Backups operate on the active user's routed inventory state. Cloud sync also maintains bounded recovery snapshots before cloud-changing sync/restore operations.

UX preference export remains separate from inventory backup so device-specific presentation choices are not mixed with inventory evidence.

## Inventory rule

Measured `gross - tare` weight is authoritative. Visual estimates are used only when a complete measurement is unavailable. Unknown remains unknown.

## Cloud architecture

- `/api/sync` — profile-scoped merge, device activity, and recovery snapshots
- `/api/sync-admin` — profile-scoped key rotation and cloud deletion
- `/qr` — read-only QR SVG generation from a validated spool ID

## Quality gates

Pull requests and pushes to `main` run the repository CI gate:

1. dependency installation;
2. static validation;
3. tests;
4. production build;
5. deploy-output verification;
6. deploy-artifact upload.

After successful `main` CI, **Production Smoke** verifies the live Netlify deployment. It checks that production has caught up to the committed app version, critical public assets are reachable, and the deployed security/cache headers match the repository contract. The same smoke check also runs once daily.

Dependabot checks npm and GitHub Actions dependencies weekly with minor/patch updates grouped to reduce maintenance noise.

## Development

```bash
npm install
npx netlify dev
```

Run the full local repository gate with:

```bash
npm run ci
```
