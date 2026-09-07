# BambuHelper Smart Display v8 Roadmap

## Goal
Evolve the project from a firmware installer into a complete local-first workshop operating system.

## Architecture

```
firmware/
  ESP32 runtime

installer/
  verified deployment

workshop-os/
  local dashboard

services/
  printer
  filament
  OTA
  diagnostics
```

## Priorities

1. Stable release pipeline
2. Unified release manifest
3. Device health model
4. Printer integration layer
5. Filament inventory integration
6. Workshop dashboard UX
7. Automated validation

## UX Direction

- Calm dashboard
- Attention-first information hierarchy
- Large touch targets
- Local-first operation
- Deep diagnostics only when needed

## Release Gates

- Firmware build verified
- Assets hashed
- OTA tested
- Physical display tested
- Regression checklist completed
