# Physical Settings Parity

This document is the human-readable contract for moving BambuHelper / Workshop OS configuration onto the WS350 touchscreen without turning the normal Home / Printer / Workshop surfaces into an expert settings form.

The **machine-authoritative inventory** lives under [`docs/settings-capability-registry/`](settings-capability-registry/). `scripts/validate_settings_parity.py` validates the registry statically and compares reconstructed browser mutation surfaces against physical implementation evidence in firmware CI.

## Classification contract

Every writable browser setting applicable to WS350 is classified as exactly one of:

- **PHYSICAL** — directly editable on the WS350 normal physical settings surfaces.
- **PHYSICAL-EXPERT** — editable on a deeper physical expert surface or explicitly planned there.
- **PORTAL-INPUT** — intentionally remains in the local portal because it requires free text, secrets, URLs, or keyboard-quality entry.
- **BOARD-N/A** — not applicable to WS350 hardware/build shape.

## Accepted v11.22 parity state

Workshop OS **v11.22 Display Expert RC1** is physically accepted. The Display Experience now contains 14 pages and the physical acceptance catalog contains 29 views.

### Display settings now physical

Normal physical settings continue to include:

- Main / Standby / Night brightness;
- Night Mode and schedule;
- finish timing and after-print behavior;
- Door Ack / Keep Print Screen / Finish Timestamp;
- ETA / Remaining / Both;
- Animated Progress / Small Labels / Fan Display / Status Readout;
- Pong Clock / time/date scale / date visibility.

v11.22 adds accepted **PHYSICAL-EXPERT** control for:

- curated theme palettes;
- independent clock time/date colors;
- gauge arc / label / value colors;
- nozzle / bed / chamber / power full-scale values;
- gauge smoothing;
- warning threshold and warning color;
- glow mode / style / duration / color;
- 8-slot landscape and 9-slot portrait presentation;
- split view / force-split presentation;
- Clock Info;
- AMS Tray Types.

Custom Gauge Labels remain **PORTAL-INPUT** because they are free text.

## Alerts, locale, network essentials

Already physical:

- HMS / alert policy and presentation;
- event sounds / button clicks;
- 12/24-hour clock;
- date format;
- Show IP at startup;
- mDNS enable/disable;
- quiet hours;
- bed cooldown alert/threshold.

## LED / power / workshop operation

Already physical:

- LED enable/brightness and finish/print/pause/error behavior;
- Plug Enabled / Poll Interval / Status Display / Button Power;
- Auto Off / delay / cancel-on-door;
- Workshop ambient mode and timer presets/actions;
- Chamber Light;
- guarded Pause / Resume;
- hold-to-confirm Stop;
- guarded mapped smart-plug Printer Power.

Printer commands remain selected-printer scoped and fail-closed. Unproven speed/fan/temperature/AMS command payloads remain intentionally absent.

## v11.23 — Network / Locale / Layout Expert

Next planned `PHYSICAL-EXPERT` work:

- timezone;
- coordinated DHCP/static mode;
- segmented IP / gateway / subnet / DNS entry;
- guarded display rotation;
- printer rotation/split policy.

Wi-Fi credentials and hostname remain **PORTAL-INPUT**.

## v11.24 — Printer / Workshop / Power Configuration

Planned `PHYSICAL-EXPERT` work:

- light start/finish/failure automation and off delay;
- printer connection mode and region;
- PSRAM multi-printer expert enablement;
- custom dashboard enable/refresh/return behavior;
- plug type/outlet;
- power tariff/currency.

Printer name/IP/serial/access credentials, custom dashboard URL, Workshop note, and plug IP/hostname remain **PORTAL-INPUT**.

## v11.25 — Hardware Expert

Planned capability-gated work:

- battery/PMIC presentation tied to AXP2101;
- RTC fallback tied to PCF85063;
- microSD diagnostics/history/export;
- QMI8658 orientation/motion behavior;
- buzzer/LED wiring-sensitive expert controls.

Incorrect wiring values can make hardware appear broken, so wiring-sensitive settings remain below normal operational surfaces.

## BOARD-N/A on WS350

The registry explicitly marks incompatible settings rather than merely hiding them, including CYD/round-panel-only controls, low-RAM dual-printer behavior, configurable GPIO button wiring where FT6336 touch is forced on, and low-RAM one-plug assignment semantics.

## Recovery / OTA

Recovery actions are physically reachable. Firmware upload remains a portal/file-transfer operation; the touchscreen may inspect/check/reboot/rollback/recover, but does not pretend to provide a local file picker.

## Non-negotiable contracts

1. Existing settings objects remain authoritative; no touchscreen-only shadow settings model.
2. Physical mutations persist through the existing save authority.
3. Selected-printer commands remain fail-closed and printer-scoped.
4. Destructive actions require deliberate confirmation/hold semantics.
5. Board-specific settings are capability-gated, not merely visually hidden.
6. `ws_lcd_350` and shared `jc3248w535` regression builds remain firmware gates.
7. New writable browser settings update the capability registry in the same change.
8. Implemented physical settings require source evidence in parity validation.
9. Real-device acceptance remains mandatory whenever touch, display, audio, recovery, authentication, network, or control behavior changes.
