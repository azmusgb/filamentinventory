# Changelog

## v5 — Recovery-aware cloud sync

- Added cloud revision IDs and concurrent-edit visibility.
- Added device identity/naming and cloud device last-seen activity.
- Added cloud activity history for sync/restore operations.
- Added rolling cloud snapshots before cloud-changing syncs.
- Added snapshot browser and reversible cloud restore.
- Preserved capability-key security and local-first operation.
- Preserved per-record newest-timestamp merge semantics, measurement-log union, and deletion tombstones.
- Bumped service-worker cache to v5 while continuing to bypass `/api/*`.

## v4 — Secure cross-device sync

- Added Netlify Functions + Netlify Blobs synchronization.
- Added 256-bit capability-key model.
- Added per-record merge semantics, measurement-history union/deduplication, tombstones, automatic sync, manual sync, and offline recovery.

## v3 — Inventory operations

- Archive/restore lifecycle, mark empty with undo, history, CSV/JSON round-trip, sorting/filtering, drying date, deep spool links, and stronger PWA/security handling.
