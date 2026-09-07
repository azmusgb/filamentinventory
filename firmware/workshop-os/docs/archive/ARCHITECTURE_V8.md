# V8 Architecture

## Current State

The repository already supports firmware distribution, browser installation, release metadata, and diagnostics.

## Evolution

Move toward independent layers:

- Device firmware
- API/service model
- Dashboard UI
- Release management
- Validation pipeline

## Rules

- Never commit generated builds
- Keep production releases immutable
- Validate before publishing
- Preserve rollback assets
