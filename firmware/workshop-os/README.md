# BambuHelper Smart Display — Workshop OS

Local-first Workshop OS for the **Waveshare ESP32-S3-Touch-LCD-3.5 (`ws_lcd_350`)**, built on the BambuHelper v3.8.1 core.

Workshop OS owns the WS350 firmware, touchscreen UX, printer/device controls, hardware integrations, audio/microphone/BLE, networking, OTA/recovery behavior, and physical acceptance. **Filament Inventory remains the sole authority for filament inventory facts, spool identity, ownership, quantity evidence, location, printer/AMS placement, and print-readiness data.**

## Current release state

Workshop OS deliberately keeps source acceptance, static distribution, device OTA publication, and hardware candidates separate. A green build is not physical acceptance, and physical acceptance is not automatically stable promotion.

| Surface | Current state | Meaning |
| --- | --- | --- |
| accepted source baseline | **Workshop OS v11.22 Display Expert RC1** | Physically accepted on a real WS350 on 2026-09-04. |
| `main` | **v11.22 accepted source** | Current accepted source authority until a later hardware candidate passes physical acceptance and promotion. |
| static installer | **Workshop OS v11.19.1 Physical Fit RC2** | Conservative downloadable Full + OTA channel. |
| static rollback | **Smart Home v7.2** | Known static rollback pair retained for recovery. |
| published device OTA candidate | **Workshop OS v11.26 UI11 Cupertino** | Published, unaccepted OTA candidate in `releases/device-update.json`; Full image is not published for this candidate. |
| source acceptance candidate | **Workshop OS v11.28 UI13 Appliance Settings — PR #109** | Direct-to-`main` source candidate; exact-head CI and physical WS350 acceptance are required. |
| physical acceptance record | **Issue #111** | Canonical checklist and evidence record for the exact frozen UI13 artifact. |

`releases/current.json` is authoritative for accepted source, the active source candidate, `main` state, and the conservative static download channel. `releases/device-update.json` is the versioned device-facing OTA discovery contract and may intentionally lag or differ from the active source candidate until publication is deliberately advanced.

## Workshop OS v11.28 UI13 Appliance Settings

PR **#109** is the current hardware-facing source candidate. Its goal is not another settings menu; it is a coherent appliance UI for a 480×320 touch device.

Primary navigation is:

`Home · Printer · Tools · Settings`

Settings is reduced to five user-facing destinations:

- **Display & Appearance** — brightness, standby, night behavior, and after-print display behavior.
- **Sounds & Alerts** — event/touch sounds, cooled-bed notification, printer-error policy, and alert signals.
- **Network** — everyday connectivity, local discovery, startup address visibility, and Local Portal handoff.
- **Printer & Power** — printer availability, smart-plug readiness, and guarded automatic power-off.
- **System** — device health, connectivity summary, Date & Time, Software Update, Diagnostics, and Local Portal.

Advanced network configuration, credentials, wiring, drivers, polling, raw diagnostics, and recovery/service mechanics do not belong in normal touchscreen Settings.

### Product-finish rules

UI13 uses a restrained dark system palette and semantic state treatment:

- blue = normal interaction;
- green = healthy / available;
- orange = offline / degraded / setup required;
- red = true fault / destructive meaning;
- muted = unknown / unavailable information.

Routine landscape controls expose at least a **48 px** touch target. Back and primary actions are explicit. Numeric/preset values use visible decrement/increment controls. Routine Settings navigation does not depend on hidden tap/hold gestures.

Copy is written as product language rather than implementation language. The touchscreen presents what a person needs while standing at the printer; advanced administration stays in the authenticated Local Portal.

## Safety, truth, and security boundaries

Workshop OS must not invent physical or inventory facts.

- Unknown inventory state remains **Unknown**.
- AMS color/material telemetry does not identify a Filament Inventory spool by similarity.
- Workshop OS does not fabricate spool identity, owner, quantity, location, printer assignment, feeder/AMS placement, or measured weight.
- Printer controls fail closed when required printer connectivity/state is unavailable.
- Stop and other destructive actions retain deliberate guards and visible feedback.
- Automatic printer power-off requires explicit enable confirmation and a valid mapped smart plug.
- The rotating Local Portal access code is shown only in the deliberate Local Portal view, not on normal System status screens.
- Session validation and same-origin mutation protection remain authoritative.

## Update and recovery model

For a normal existing-device update, use the **application/OTA image** on a compatible Workshop OS partition layout.

A **Full** image is a recovery/service artifact and belongs at flash offset `0x0`. Waveshare Home and Workshop OS use incompatible partition layouts; cross-line migration is therefore a deliberate full-image recovery procedure, never an OTA shortcut.

UI13 does **not** pretend that device-native self-install exists when it does not. The touchscreen Software Update screen reports capability honestly and keeps Full-image/recovery mechanics out of normal update UX.

## Validation and acceptance

Firmware is reconstructed deterministically from pinned upstream BambuHelper commit `8cb1cbbb6d3c175af91989e8ebe1bbdcbe848ac4` plus the versioned Workshop OS patch stack.

Hardware-facing source changes are expected to pass:

1. repository validation;
2. accepted static-installer integrity validation;
3. deterministic Workshop OS reconstruction;
4. product/interaction contract validation;
5. native `ws_lcd_350` build;
6. shared `jc3248w535` regression build;
7. release/merge gate coordination;
8. exact artifact identity capture;
9. physical WS350 acceptance.

The lifecycle is kept explicit:

`implemented → built → tested → runtime validated → production validated → physically validated → accepted → stable`

CI cannot skip the physical stages.

### UI13 acceptance

Issue **#111** is the canonical physical-acceptance record for PR #109. It locks the exact source SHA, OTA filename, size, SHA-256, Actions artifact identity, automated gate evidence, product-level 480×320 checks, Settings behavior, printer safety, inventory truth boundaries, persistence, recovery, and sanitized framebuffer evidence requirements.

Do not merge or promote UI13 merely because CI is green. If acceptance passes, promotion must preserve the **exact accepted bytes** and provenance; do not rebuild a different binary and call it accepted.

## Repository map

- `apply_smart_home_*.py` — inherited deterministic firmware evolution inputs.
- `apply_workshop_os_*.py` — Workshop OS source evolution and product-finish layers.
- `.bambuhelper-validation/` — verified patch payloads required by selected loaders.
- `.github/workflows/firmware-candidate.yml` — reusable firmware/hardware gate.
- `.github/workflows/ui13-appliance-settings.yml` — UI13 reconstruction, product-finish, native build, and exact artifact gate.
- `.github/workflows/validate.yml` — repository validation.
- `.github/workflows/release-gate.yml` — release metadata validation and conditional merge-gate coordination.
- `.github/workflows/release-main.yml` — accepted static-installer integrity gate.
- `releases/current.json` — accepted-source / active-source-candidate / `main` / static-channel state.
- `releases/device-update.json` — minimal versioned device-facing OTA discovery contract.
- `release.json` — conservative static download/rollback catalog.
- `scripts/capture-ws350-views.zsh` — authenticated credential-safe physical framebuffer capture.
- `docs/` — architecture, safety, UX, acceptance, and release documentation.
- `docs/archive/` and `releases/archive/` — historical provenance only.

## Repository discipline

- `main` remains the accepted source authority until promotion is earned.
- Hardware-facing changes require exact-head CI and physical acceptance before source promotion.
- Generated PlatformIO output, local capture bundles, credentials, and ad-hoc reports stay out of source control.
- Physical framebuffer evidence redacts the Local Portal credential before retained output is written.
- Printer configuration/settings exports are excluded from credential-safe capture bundles.
- Static firmware retention remains bounded to the published pair plus one rollback pair.
- Upstream synchronization is a deliberate candidate; the accepted source line is never silently repinned.

## License and attribution

Original Workshop OS contributions are provided under the **MIT License** in `LICENSE`.

Workshop OS is derived from **Keralots/BambuHelper**; exact attribution and third-party boundaries are recorded in `NOTICE.md`.
