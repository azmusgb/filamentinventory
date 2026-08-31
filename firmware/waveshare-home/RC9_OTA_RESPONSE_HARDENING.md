# rc9 OTA response hardening

This marker intentionally triggers the Waveshare firmware build after the rc9 updater hardening migration.

The hardened updater reduces Preview release discovery to a one-release payload, requests identity encoding, buffers GitHub JSON before parsing, and reports parser errors explicitly. The manifest and firmware requests also force identity encoding.
