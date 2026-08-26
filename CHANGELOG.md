# Changelog

## v4 — Secure cross-device sync

- Added Netlify Functions + Netlify Blobs cloud synchronization.
- Added a 256-bit capability-key model with no credentials committed to GitHub.
- Added same-origin `/api/sync` endpoint with strong-consistency blob reads/writes.
- Added per-record merge semantics so newer spool edits win instead of replacing the whole inventory.
- Added measurement-history union/deduplication across devices.
- Added tombstones so permanent deletes propagate correctly.
- Added automatic debounced sync, manual Sync now, online-recovery sync, copy-key onboarding, and forget-key controls.
- Raw sync keys are excluded from JSON/CSV exports and cloud data.
- Service worker now bypasses `/api/*` so private responses are never cached.
- Added package metadata for current Netlify Blobs/Functions dependencies.

## v3 — Inventory operations

- Archive/restore lifecycle instead of destructive normal deletion.
- Mark Empty with undo.
- Measurement-history view and CSV export.
- Sorting, lifecycle filtering, reorder priority, drying date, and deep spool links.
- JSON merge/replace and CSV round-trip import/export.
- PWA update handling and stronger Netlify headers.
