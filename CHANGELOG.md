# Changelog

## Unreleased — Print-job intelligence

- Evolved **Can I print this?** into a guided print workflow covering requirement, candidate selection, verification, placement, start, completion, and recent job history without adding another primary navigation area.
- Candidate ranking now trusts scale-backed **Measured** remaining amounts over visual or usage-derived **Estimated** values, even when an estimated spool is already loaded.
- Added a distinct provisional `estimate-ready` result so estimated quantity is never presented as verified print readiness.
- Added printer/AMS placement recommendations, including conservative open-slot suggestions when one printer and feeder context is unambiguous.
- Added planned, in-progress, completed, and cancelled print-job records with guarded lifecycle transitions.
- Starting a print now requires the selected spool to be loaded, scale-measured, and still contain the required filament plus safety margin.
- Completing a print records reported filament consumption and converts the pre-print scale reading into a usage-derived remaining estimate until the spool is weighed again.
- Added explicit print planning/start/completion/cancellation events to Activity and suppressed duplicate generic inventory-change noise for print-generated remaining-weight fields.
- Added print-job merge semantics to local backup restore and Netlify cloud sync so independent jobs survive multi-device synchronization and the newest lifecycle transition wins for the same job ID.
- Added responsive, keyboard-focusable, reduced-motion-aware print intelligence UI plus unit, integration, cloud-sync, publication, and offline-cache regression coverage.

## Unreleased — Physical spool command workflow

- Added one canonical **Identify → Verify → Place → Use** workflow for a spool in hand.
- QR/scan-opened spool controls now surface canonical product identity, lifecycle, physical placement, remaining-filament evidence, and a recommended next step.
- Added compact product/spool details for product line, diameter, manufacturer SKU, lot/batch, spool format, and owner without crowding the primary action surface.
- Added **Mark used now** for measured, loaded spools; the resulting `lastUsedAt` change flows through the existing inventory audit/activity system.
- Added visible **Measured / Estimated / Unknown** evidence in the physical spool sheet, Smart Weigh selection, and Printer/AMS loaded-slot views.
- Fixed canonical reorder semantics so a low spool remains reorder-needed even while its lifecycle is `Loaded`.
- Added a separate canonical stock state so physical lifecycle and inventory attention no longer overwrite each other.
- Routed Printer/AMS, physical spool actions, and Smart Weigh remaining-filament logic back through the canonical spool contract instead of maintaining independent calculations.
- Smart Weigh now prioritizes loaded unknown/estimated spools for verification and includes usage-derived estimates in known-remaining logic.
- Added workflow, guardrail, publication, offline-cache, and responsive UI regression coverage.

## Unreleased — Canonical spool contract

- Added a canonical spool domain contract shared across the current local-first application layers.
- Added first-class product-line, filament-diameter, manufacturer-SKU, and lot/batch metadata without breaking existing v10 records.
- Made scale measurements explicitly **Measured**, visual/usage values explicitly **Estimated**, and unverifiable remaining amounts explicitly **Unknown**.
- Added derived lifecycle states for Available, Loaded, Low, Empty, and Archived spools while preserving the existing Stored/Loaded physical-placement model.
- Added state validation for duplicate spool IDs, impossible gross/tare values, suspicious above-nominal measurements, and duplicate printer/AMS slot assignments.
- Added a storage compatibility bridge so legacy saves preserve richer canonical fields, audit/tombstone metadata, and newer backup timestamps instead of silently dropping them.
- Upgraded JSON and CSV import/export to retain canonical product, ownership, placement, weight-evidence, and lifecycle data.
- Extended the spool editor with product line, diameter, manufacturer SKU, and lot/batch fields while keeping the primary add workflow compact.
- Added unit/integration coverage and PWA precaching for the canonical contract runtime.

## v9 — Per-user customization and experience

- Added a dedicated **Customize** workspace.
- Added separate local UX profiles for Bill and Aimee.
- Added Midnight, Light, OLED Black, High Contrast, and Follow System themes.
- Added five accent presets.
- Added Compact, Comfortable, and Roomy density modes.
- Added four text-size choices, reduced motion, and larger touch targets.
- Added Cards vs List inventory layout.
- Added default landing view, owner scope, lifecycle, sort, and remembered inventory filters.
- Added per-profile default QR label size.
- Added dashboard visibility controls for welcome/quick actions, priority queue, and charts.
- Added per-profile app titles.
- Added preference export/import and copy-other-profile actions.
- Kept UX preferences local so device-specific layout choices do not alter shared cloud inventory.
- Bumped the offline cache to v9.

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

## v6 — Pairing and key lifecycle

- Added private pairing links using URL fragments.
- Added key rotation/revocation, cloud backup download, and explicit cloud wipe through a separate admin Function.

## v5 — Cloud recovery and device visibility

- Added cloud revisions, named device activity, rolling snapshots, and reversible restore.

## v4 — Secure cross-device sync

- Added Netlify Functions + Netlify Blobs synchronization with capability keys and merge/tombstone behavior.
