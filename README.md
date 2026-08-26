# Filament Inventory

A mobile-first filament inventory PWA for tracking 3D-printing spools from iPhone, iPad, or desktop.

## v4 highlights

- Secure cross-device sync using Netlify Functions + Netlify Blobs
- High-entropy capability key: the raw sync key is stored only on your devices and is never committed to GitHub
- Per-spool merge logic based on the newest `updatedAt` timestamp
- Measurement history union/deduplication across devices
- Tombstones so permanent deletions propagate instead of reappearing
- Offline-first local storage with debounced automatic cloud sync when online
- Copyable sync key for onboarding another device
- Active/archive lifecycle management, mark-empty + undo, restore, and permanent delete
- Gross-minus-tare authoritative weight tracking
- Search, filters, sorting, reorder thresholds, drying date, purchase metadata
- JSON backup/restore, inventory CSV import/export, measurement CSV export
- PWA/offline support with API requests excluded from service-worker caching

## Sync security model

The sync key is a random 256-bit capability generated in the browser. The browser sends the key only to the same-origin `/api/sync` function in an HTTPS request header. The function validates the format, hashes the key with SHA-256, and uses the hash as the private Netlify Blob key. The raw key is not stored in GitHub, Netlify Blobs, JSON backups, or CSV exports.

Because the key is the credential, save it in a password manager. If you remove it from every device and lose the key, the cloud copy cannot be located again. Local browser data and exported backups remain usable.

## Data behavior

Inventory remains usable offline from browser `localStorage`. When sync is enabled, edits are merged with the cloud state after a short debounce and when the device returns online.

Measured gross − tare weight is authoritative. Visual estimates remain useful for unweighed spools, and unknown values remain unknown rather than being converted to zero.

## Netlify

The static site publishes from the repository root. Netlify Functions live in `netlify/functions`, and `@netlify/blobs` provides the site-scoped sync store. No application framework build is required.

## Local development

Use Netlify CLI so Functions and Blobs are emulated correctly:

```bash
npm install
npx netlify dev
```
