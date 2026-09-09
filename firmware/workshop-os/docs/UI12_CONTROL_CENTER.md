# Workshop OS UI12 — Settings / Control Center

UI12 reorganizes the WS350 around an appliance boundary rather than exposing every firmware capability as a setting.

## Configuration planes

1. **Device / everyday** — touchscreen. Things a person plausibly changes while standing at the printer.
2. **Administration / advanced** — authenticated Local Portal. Credentials, advanced printer/network administration, detailed diagnostics, and other infrequent configuration.
3. **Service / recovery** — deliberate troubleshooting/recovery flow. Destructive or engineering-only functions do not belong in ordinary Settings.

A new firmware option does not automatically earn a touchscreen control.

## Primary navigation

`Home · Printer · Tools · Settings`

The existing Workshop screen becomes the user-facing **Tools** destination; its implementation name may remain `SCREEN_HUB_WORKSHOP` for compatibility.

## Settings root

UI12 uses five touch-first destinations:

- **Experience** — Display & Standby plus Sound & Alerts.
- **Network** — routes into the existing guarded seven-page network workflow.
- **Printer Connection** — status and configuration boundary only; everyday printer controls remain under Printer. Credentials stay in the authenticated Local Portal.
- **Software Update** — current-build/update-policy presentation only. UI12 does not pretend an on-device installer exists.
- **System** — health, diagnostics/recovery status, version, and Local Portal handoff.

The primary System screen does **not** display the portal access code. A visible **Local Portal** action opens a deliberate authenticated-administration subview showing the device's local address and the rotating reboot-scoped access code. This preserves portal usability without exposing credentials on the normal System status surface.

The portal-code presentation is not the authentication authority. Session validation and same-origin mutation enforcement remain in the security layer.

## Physical acceptance capture contract

The authenticated physical-framebuffer capture surface is part of the acceptance tooling, not a second UI implementation. UI12 extends the existing `/hub/show`, `/hub/views`, and `/hub/frame.ppm` contract so nested settings views can be selected deterministically on the real WS350.

Capture catalog version 2 adds deterministic entries for **Experience**, **Printer Connection**, **Software Update**, and the deliberate **Local Portal** subview. The primary `workshop` and `more` capture IDs remain compatible but are labeled **Tools** and **Settings**. Requests for System, System Network, or hardware views explicitly clear Local Portal nested state before rendering so a previous credential-bearing view cannot leak into a later System capture.

The Local Portal catalog entry is marked `sensitive: portal-code`. `scripts/capture-ws350-views.zsh` uses that metadata to redact the rotating code from the 480×320 framebuffer before any retained PPM or PNG is written. Catalog v1 remains supported for accepted older firmware using its validated legacy System-code redaction geometry. Unknown sensitivity labels or unexpected framebuffer geometry fail closed. Raw framebuffers remain temporary mode-0600 files and printer/settings exports containing secrets remain excluded.

A captured screenshot is evidence of rendered layout only. It is not evidence that touch interaction, printer control, persistence, recovery, or any other physical acceptance item passed.

## Update boundary

UI12 source work does not publish a v11.27 candidate and does not modify `releases/device-update.json`. The exact published v11.26 UI11 candidate remains authoritative until a real v11.27 OTA has been built, hashed, preserved, and published through a separate candidate step.

Ordinary update UI must not expose Full-image flashing or `0x0` recovery mechanics. Full images remain a recovery/service concern.

## Preserved invariants

- 480×320 finger-first geometry with visible controls.
- 36 px header and 54 px bottom navigation inherited from UI11.
- Seven-page guarded network workflow.
- Guarded destructive printer actions and hold-progress behavior.
- Portal authentication and same-origin mutation checks.
- Portal access code visible only in the deliberate Local Portal subview, not the primary System screen.
- Deterministic, secret-safe physical framebuffer capture for acceptance evidence.
- Explicit Unknown inventory identity; no spool inference from printer color/material telemetry.
- Recovery boundary and stable-release discipline.

## Release state

UI12 starts as **implemented source only**. CI may advance an exact head to built/tested, but that does not make it a published candidate, physically accepted, accepted, or stable. Physical acceptance requires an exact preserved OTA artifact and a separate WS350 acceptance record.
