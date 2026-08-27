# Changelog

## v6 — Pairing and key lifecycle

- Added private pairing links using URL fragments.
- Fixed fresh-device onboarding so cloud data can populate an empty browser directly.
- Added key rotation to revoke every device still using the prior capability key.
- New replacement keys stay client-side during rotation; only the SHA-256 hash is sent to the admin Function.
- Added a separate rate-limited `/api/sync-admin` Function for destructive/security operations.
- Added cloud JSON download from the Sync screen.
- Added explicit cloud wipe with typed confirmation and pre-wipe backup.
- Preserved v5 revisions, activity, device names, rolling snapshots, reversible restore, tombstones, and merge behavior.
- Bumped the offline cache to v6.

## v5 — Cloud recovery and device visibility

- Added cloud revision IDs and concurrent-edit detection.
- Added named device registry and recent cloud activity.
- Added rolling recovery snapshots and reversible snapshot restore.

## v4 — Secure cross-device sync

- Added Netlify Functions + Netlify Blobs synchronization.
- Added browser-generated capability keys, record merge behavior, measurement-history union, and deletion tombstones.

## v3 — Inventory operations

- Added archive/restore lifecycle, Mark Empty with undo, full measurement history, sorting/filtering, drying date, deep spool links, CSV round-trip, and safer PWA behavior.
