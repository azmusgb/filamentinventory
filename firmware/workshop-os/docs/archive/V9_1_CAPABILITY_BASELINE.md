# Smart Home v9.1 Printer Capability Baseline

The v9 visual command center is a presentation layer over BambuHelper's existing printer configuration model. It must not remove or silently bypass these capabilities.

## Printer slots and connection

- Four independent printer slots where supported by the board profile
- LAN Direct mode
- Bambu Cloud mode
- per-slot printer name
- printer IPv4 address
- printer serial number
- LAN access code
- local-network discovery
- save + verify connection
- clear printer
- support-report export

## Remote monitor profiles

- Remote status
- X2D dual-nozzle
- Thermal & fans
- AMS overview
- BambuHelper defaults

Profiles must remain capability-aware. Unsupported telemetry must not be presented as if it is live.

## Gauge configuration

Preserve the existing print and idle/complete gauge configuration model, including:

- progress and layer progress
- nozzle / left nozzle / right nozzle
- bed and chamber temperature
- part, auxiliary, chamber, heatbreak and supported extended fan telemetry
- clock
- AMS humidity
- AMS temperature
- AMS filament / filament bars
- supported power/camera gauges
- Empty as an explicit slot choice

Board/layout-specific extra rows remain conditional on the matching display mode.

## Chamber light

Per printer:

- manual Light On / Light Off
- turn on when a print starts
- turn off after a successful print
- turn off after failed/cancelled print
- configurable off delay

## v9.1 UX rule

The browser and touchscreen may reorganize these controls into calmer, hierarchical screens, but the underlying capability must remain reachable and state-correct. UI simplification is not permission to delete a device setting.
