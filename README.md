# Filament Inventory

A mobile-first, local-first filament inventory PWA for tracking 3D-printing spools from iPhone, iPad, or desktop.

## Current capabilities

- Conservative 21-spool starter inventory based on the photo audit
- Brand, material/type, color, spool format, location, and confidence
- Visual remaining-% estimates when that is all that is known
- Gross-weight minus tare-weight measurements that override visual estimates
- Measurement history for repeat weigh-ins
- Per-spool reorder thresholds with dashboard/reorder flags
- Opened and bagged/sealed storage state
- Purchase source, purchase price, and purchase date
- Search and filters, including `Reorder needed`
- JSON backup/restore including measurement history
- CSV export for Google Sheets / Excel
- Responsive mobile UI and offline/PWA caching
- No build step and no third-party runtime dependencies

## Data behavior

Inventory is stored in browser `localStorage`. That keeps the app simple and private, but data does **not** automatically sync between different browsers/devices. Use JSON backup/export when moving between devices until a shared backend is added.

Existing v1 browser data is migrated in place when v2 loads. New v2 fields receive safe defaults; existing spool IDs and inventory values are preserved.

## Netlify

This repository is designed to deploy as a static site. `netlify.toml` publishes the repository root and includes security/cache headers.

No npm install, build command, or framework build is required.

## Inventory rule

Measured gross − tare weight is authoritative. Visual estimates remain useful for unweighed spools, and unknown values remain unknown rather than being converted to zero.
