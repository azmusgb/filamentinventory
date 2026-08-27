# Changelog

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
