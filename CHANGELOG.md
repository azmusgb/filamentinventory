# Changelog

## v8 — Household ownership + printer / AMS placement

- Added two-owner inventory support for Bill and Aimee.
- Existing pre-v8 spools migrate to Bill by default.
- Added a per-device default owner for newly added spools.
- Added owner filter and owner / placement badges to Inventory cards.
- Added Stored vs Loaded physical state on every spool.
- Added printer, AMS/feeder, slot/bay, and loaded timestamp metadata.
- Added a Printer / AMS board showing currently loaded spools.
- Added Quick move controls to load, move, and unload spools.
- Added slot conflict handling to prevent two spools from silently occupying the same assignment.
- Added Bill vs Aimee reporting, owner transfers, and household spool search.
- Added a print-finder ranking workflow using owner, material, color, remaining grams, and already-loaded printer state.
- Added household-aware CSV export and complete v8 JSON backup/restore.
- Preserved v7 QR labels, v6 pairing/key lifecycle, v5 recovery snapshots, and v4 merge/tombstone synchronization.
- Bumped the offline cache to v8.

## v7 — Physical spool workflow

- Added printable QR labels for physical spools.
- Added a dedicated Labels workspace with search, active-spool selection, preview, and batch printing.
- Added 2 × 1 in, 2.25 × 1.25 in, and 1.5 × 1.5 in label sizes.
- Added a read-only `/qr` Function that generates high-error-correction SVG QR codes.
- QR codes contain only the public app URL and spool ID; sync keys are never embedded.
- Added scan-to-open spool summary from the iPhone/Android camera app.
- Added scan-to-weigh and scan-to-find-in-inventory quick actions.
- Added missing-spool guidance for newly connected devices.
- Added direct copyable spool links.
- Added print-to-PDF support through the browser print dialog.
- Bumped the offline cache to v7 while keeping dynamic QR generation out of the private sync APIs.

## v6 — Pairing and key lifecycle

- Added private pairing links using URL fragments.
- Added key rotation/revocation, cloud backup download, and explicit cloud wipe through a separate admin Function.

## v5 — Cloud recovery and device visibility

- Added cloud revisions, named device activity, rolling snapshots, and reversible restore.

## v4 — Secure cross-device sync

- Added Netlify Functions + Netlify Blobs synchronization with capability keys and merge/tombstone behavior.
