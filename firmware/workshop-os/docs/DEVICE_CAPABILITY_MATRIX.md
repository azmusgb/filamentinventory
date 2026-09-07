# Device Capability Matrix

This is the authoritative checklist for capabilities that the Smart Display should expose. A capability is only marked complete when its firmware/API path and user-facing behavior are both implemented.

| Domain | Capability | Target state |
|---|---|---|
| Device | identity / version / uptime | exposed |
| Device | display brightness | controllable |
| Device | standby / wake | controllable |
| Device | touch diagnostics | exposed |
| Device | speaker test / volume | controllable where firmware supports it |
| Network | Wi-Fi status | exposed |
| Network | reconnect | controllable |
| Network | signal / IP / gateway / DNS | exposed |
| Printer | connection state | exposed |
| Printer | LAN discovery | active + passive Bambu-only discovery |
| Printer | discovery metadata | preserve name / model / IP / serial |
| Printer | hardware slot capacity | UI must report actual compiled slot capacity |
| Printer | LAN save + verify | controllable and explicitly verified |
| Printer | Bambu Cloud setup | preserved where supported |
| Printer | job / progress / ETA | exposed |
| Printer | temperatures | exposed |
| Printer | pause / resume / stop | guarded controls |
| Printer | gauge layout / remote profiles | per-printer configuration preserved |
| Printer | chamber light / automation | per-printer configuration preserved where supported |
| AMS | slot/material state | exposed |
| Workshop | filament inventory | service integration |
| System | health / diagnostics | exposed |
| System | logs | exposed |
| System | OTA | SHA-256 verified application update flow |
| System | OTA browser handoff | definitive acceptance + reboot-aware reconnect |
| System | rollback / recovery | always available |
| System | factory reset | explicitly guarded |

## WS350 acceptance profile

The Waveshare 3.5 target is a constrained ESP32-S3 build. Browser and touchscreen copy must describe the capabilities actually compiled for that hardware instead of advertising a larger generic feature ceiling. LAN discovery must remain available from the device web portal, and a successful discovery must preserve the printer identity returned by the Bambu announcement so setup does not require retyping data the device already knows.

The normal update path after recovery is device-side OTA using the application image (`WaveshareHome-firmware.bin` / OTA image). The merged Full image remains a recovery/WebFlasher artifact and must not be accepted by the application-only browser upload path.

## Rules

- Do not claim a setting is supported merely because a UI control exists.
- Unsupported hardware capabilities must be labeled `unsupported`, not silently ignored.
- Destructive actions require confirmation and a recoverable failure path.
- Printer state is read-only unless a command is explicitly implemented and acknowledged by the device.
- OTA must validate the image before staging it and preserve a known-good recovery path.
- Browser-side discovery timing must not expire before the firmware-side discovery window completes.
- Printer discovery must reject unrelated SSDP devices and retain Bambu name/model/IP/serial metadata when available.
- Browser and touchscreen build identity must make the Smart Home evolution version visible independently of the upstream BambuHelper version.
