# Changelog

## v3 — 2026-08-26

- Added archive/restore lifecycle so history is retained when a spool is finished.
- Added permanent delete only for already archived spools.
- Added Mark Empty with undo.
- Added inventory sorting, lifecycle filtering, and reorder-first mode.
- Added full measurement-history view and history CSV export.
- Added CSV merge import for Google Sheets / Excel round-tripping.
- Added JSON merge vs replace restore behavior.
- Added last-dried date.
- Added per-spool deep links and quick focus behavior.
- Added backup-age and local-data health indicators.
- Added PWA install prompt support and iOS install guidance.
- Improved service-worker update/cache behavior.
- Added CSP and tighter Netlify cache/security headers.
- Preserved migration compatibility with existing v1/v2 local data.

## v2

- Added measurement history, reorder thresholds, purchase metadata, opened/bagged state, and richer exports.
- Fixed null values being interpreted as numeric zero.

## v1

- Initial mobile-first local filament inventory dashboard with the photo-audited starter inventory.
