# Filament Inventory

A mobile-first, local-first filament inventory PWA for iPhone, iPad, and desktop.

## v5 highlights

- Secure cross-device sync with Netlify Functions + Netlify Blobs
- 256-bit capability key; raw key remains on user devices
- Cloud revision IDs and concurrent-edit detection
- Named device registry with last-seen activity
- Rolling cloud recovery snapshots
- Reversible restore of prior cloud revisions
- Per-spool newest-timestamp merge
- Measurement history union/deduplication
- Tombstones for permanent deletion propagation
- Offline-first local storage
- Archive/restore, mark-empty, weighing, reorder thresholds, drying and purchase metadata
- JSON backup/restore and CSV round-trip workflows

## Security model

The sync key is generated in the browser and sent only to the same-origin `/api/sync` endpoint over HTTPS. The Netlify Function hashes the key with SHA-256 and uses the hash to locate the private Blob. The raw key is not written to GitHub, Netlify Blob state, JSON backups, or CSV exports.

Because the key is the credential, save it in a password manager.

## Cloud recovery

v5 stores a rolling set of cloud snapshots before cloud-changing syncs and restores. Restoring a prior snapshot first snapshots the current cloud state, making recovery reversible.

## Inventory rule

Measured `gross - tare` weight is authoritative. Visual estimates are used only when a complete measurement is unavailable. Unknown remains unknown.

## Development

```bash
npm install
npx netlify dev
```

The site itself remains framework-free. `netlify/functions/sync.mts` provides the cloud API.
