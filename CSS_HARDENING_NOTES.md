# CSS hardening hotfix

This hotfix applies selected improvements from the supplied CSS critique without replacing the app's established `styles.css` + `ui-polish.css` design system.

Included:
- Safari `-webkit-backdrop-filter` coverage
- sticky-header scroll offsets
- stable and styled scrollbars
- explicit keyboard `:focus-visible` treatment that survives field focus rules
- `prefers-contrast: more` and forced-colors support
- broader reduced-motion coverage
- font smoothing and standard 700 button weight
- mobile background repaint reduction
- PWA publication/cache coverage

The private-user, smart intake, QR scanner, and Printer/AMS feature layers are intentionally preserved.
