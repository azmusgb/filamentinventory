# Filament Inventory

A mobile-first, local-first filament inventory PWA for 3D-printing spools, designed for iPhone, iPad, and desktop and deployed as a static Netlify site.

## v3 highlights

- Conservative 21-spool starter inventory from the photo audit
- Measured gross − tare weight overrides visual estimates
- Active + archived spool lifecycle; archive preserves history
- One-tap **Mark empty**, restore, and permanent-delete only from archive
- Per-spool reorder thresholds and reorder-first sorting
- Search, lifecycle/material/status/location filters, and multiple sort modes
- Measurement history view with history CSV export
- Last-dried date, opened/bagged state, purchase source/price/date
- Full-fidelity JSON backup with merge or replace restore
- Inventory CSV export and CSV merge import for Google Sheets / Excel round-trips
- Per-spool deep links for quick lookup
- Backup-age / data-health panel
- PWA install support and safer service-worker update behavior
- Netlify security headers and explicit cache policy
- No build step and no third-party runtime dependencies

## Data model and behavior

Inventory is stored in browser `localStorage`. This is intentionally simple and private, but it means data does **not** automatically synchronize between different devices or browsers.

Use **Data → Export JSON** as the authoritative backup. CSV is intended for spreadsheet analysis/editing and can be merged back by spool ID.

Existing v1/v2 browser data is normalized into the v3 model at load time. New v3 fields receive safe defaults without changing existing spool IDs or measurements.

## Inventory rules

1. Measured `gross - tare` is authoritative when both values are present.
2. Visual percentage is used only when no complete measurement exists.
3. Unknown values remain unknown; they are never converted to zero automatically.
4. Reorder status applies only to active spools with a known remaining gram value.
5. Finished spools should normally be archived rather than permanently deleted.

## Deployment

The repository is a zero-build static site. Netlify should publish the repository root from `main`.

`netlify.toml` supplies security headers and cache rules. `sw.js` provides same-origin offline caching for core application assets.

## Future evolution

A shared backend can be added later for true iPhone/iPad/desktop synchronization, but it should include authentication before any remote write API is exposed. The current local-first design deliberately avoids creating an unauthenticated public inventory endpoint.
