# Workshop OS migration boundary

This is the Workshop OS source destination in the authorized Filament Inventory monorepo migration. See [current migration record](../../docs/migration/2026-09-09/README.md).

Source files, nested workflows, release metadata and historical documentation retain their source-repository meaning unless an explicit migration overlay says otherwise. Nested `.github/workflows` files are retained provenance; root workflows perform monorepo validation. Existing release URLs remain operational until validated cutover. UI13 remains a separate unaccepted candidate, never an implicit main/stable promotion.

Inventory truth belongs to the root inventory/API implementation. Workshop OS consumes the profile-scoped device contract and must not infer spool identity or AMS placement from telemetry.
