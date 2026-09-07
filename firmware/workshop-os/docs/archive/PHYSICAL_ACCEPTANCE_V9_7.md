# Smart Home v9.7 Interaction & Layout RC1 — Physical Acceptance

Target: **Waveshare ESP32-S3-Touch-LCD-3.5 (`ws_lcd_350`)**

Validated OTA SHA-256: `c27c6c1407fcb18d47394b1f1fa87d86b4881c8541b2a5266d1b0a271fc4d673`

Validated Full SHA-256: `0c6152c476961b7f40f84409b60224e434e00983d485d3fc23b3f4b653649173`

Automated CI is green. This checklist is the remaining hardware acceptance gate before broad OTA promotion.

## 0. Mac USB / serial baseline

Do not assume a fixed `/dev/cu.usbmodem####` name. macOS can assign a different port after reconnects or resets.

From the repository root:

```bash
bash scripts/waveshare-usb.sh list
bash scripts/waveshare-usb.sh port
```

For live diagnostics:

```bash
bash scripts/waveshare-usb.sh monitor
```

The helper matches the Espressif USB JTAG/serial VID:PID and therefore follows the same board across macOS port renumbering. If multiple matching boards are connected, set `WAVESHARE_USB_SERIAL` to the intended board serial rather than selecting a port by number.

- [ ] Helper finds exactly one intended Waveshare device.
- [ ] Serial monitor opens on the detected port.
- [ ] Pressing RST produces boot output in the monitor.
- [ ] No test or recovery procedure depends on a hard-coded `/dev/cu.usbmodem####` value.

## 1. Boot / recovery baseline

- [ ] Normal boot completes without a boot loop.
- [ ] Device reconnects to saved Wi-Fi.
- [ ] Browser control plane loads at the device LAN address.
- [ ] Touchscreen is responsive.
- [ ] No portal-code lockout appears.
- [ ] `/recovery` loads.
- [ ] `/recovery/status` returns healthy JSON.
- [ ] Settings backup downloads successfully.
- [ ] Inspect backup: `_secretsIncluded` is `false`; no Wi-Fi password, printer LAN access code, or cloud identity is present.

## 2. Direct coordinate navigation

Test each footer target independently; do not rely on cycling.

- [ ] Home target opens Home.
- [ ] Printer target opens native Printer.
- [ ] Workshop target opens Workshop.
- [ ] More target opens More.
- [ ] Targets work near the left/right edges of each 80 px cell.
- [ ] Touch coordinates are not mirrored horizontally.
- [ ] Touch coordinates are not inverted vertically.
- [ ] A tap in page content does not unexpectedly switch pages.

## 3. Zero-blip transitions

Repeat each transition at least five times:

- [ ] Home → Printer
- [ ] Printer → Workshop
- [ ] Workshop → More
- [ ] More → Home
- [ ] Home → Workshop
- [ ] More → Custom
- [ ] More → System

Acceptance: the previous complete frame remains visible until the replacement frame is ready. No blank background, partial card construction, white flash, or obvious whole-screen blink.

## 4. Home layout

- [ ] Printer / job identity fits without clipping.
- [ ] Progress ring and percentage are legible.
- [ ] ETA and layer values fit.
- [ ] Nozzle / Bed / Chamber / Fan telemetry rail is readable.
- [ ] AMS captions do not overlap percentages or adjacent slots.
- [ ] Wi-Fi / attention strip is readable.
- [ ] Live telemetry updates do not cause whole-screen repainting.

## 5. Native Printer view

- [ ] Correct printer is shown.
- [ ] Printer-family artwork is sensible for the configured machine.
- [ ] Job name and state are correct.
- [ ] Progress is correct.
- [ ] Nozzle / Bed / Chamber / Fan values are correct.
- [ ] Layer / ETA are correct.
- [ ] AMS data is correct.
- [ ] Light action changes the chamber light.
- [ ] Classic Details opens the original printer detail surface.
- [ ] Returning to Smart Home does not corrupt the screen.

## 6. Workshop

- [ ] No redundant Workshop hero/title consumes the page.
- [ ] Print card is readable.
- [ ] Environment card is readable.
- [ ] AMS / material deck is readable.
- [ ] Light quick action works.
- [ ] Custom action opens Custom.
- [ ] System action opens System.
- [ ] Classic action reaches legacy printer details.

## 7. More

- [ ] Custom opens Custom.
- [ ] System opens System.
- [ ] Edit Widgets opens Custom in edit mode.
- [ ] Classic Printer reaches the original detail surface.
- [ ] Device / recovery status is readable and accurate.

## 8. Custom fallback + on-device widget editing

With no external Custom feed, or with the feed deliberately unavailable:

- [ ] Four fallback widgets remain visible and useful.
- [ ] Long-press enters Edit My Widgets mode.
- [ ] Tap each tile and confirm it cycles widget type.
- [ ] Available values include Progress, Nozzle, Bed, Chamber, Wi-Fi, AMS, Layer, ETA, Fan, and Uptime.
- [ ] Long-press exits edit mode.
- [ ] Widget choices survive page changes.
- [ ] Widget choices survive device reboot.
- [ ] If an external feed fails after previously working, fallback content replaces it cleanly.

## 9. System

- [ ] Network card reports connection, IP and RSSI.
- [ ] Device card reports Waveshare / uptime / touch information.
- [ ] Update & Recovery card reports recovery readiness / slot.
- [ ] Diagnostics presents a human-level Healthy / Watch state.
- [ ] Raw heap / PSRAM internals are not the dominant primary content.

## 10. Browser Printer Workspace

- [ ] Overview opens and is not duplicated by legacy Setup Health.
- [ ] Connection opens.
- [ ] Display opens.
- [ ] Automation opens.
- [ ] Advanced opens.
- [ ] Touchscreen preview visibly uses a 320:480 / 2:3 portrait proportion.
- [ ] Widget Library is usable.
- [ ] Original Gauge Layout / Remote Monitor Profile are under Advanced display configuration.
- [ ] Printer-family artwork remains visible in reduced form on tablet widths.
- [ ] Status pills do not look or behave like buttons.
- [ ] Interactive controls remain obvious.

## 11. OTA / rollback

- [ ] OTA reaches completion and device reboots.
- [ ] Wi-Fi survives OTA.
- [ ] Printer configuration survives OTA.
- [ ] Custom widget choices survive OTA.
- [ ] Candidate is accepted after the health window.
- [ ] No unexpected rollback occurs after normal successful boot.
- [ ] Safe Mode can be entered deliberately.
- [ ] Safe Mode lands on `/recovery`.
- [ ] Previous-slot rollback remains functional when a fallback slot exists.

## 12. Soak

Run for at least 30 minutes, preferably during an active print.

- [ ] No spontaneous reboot.
- [ ] No touch freeze.
- [ ] No browser control-plane lockup.
- [ ] No increasing flicker / blipping.
- [ ] No graphical corruption.
- [ ] Live print values continue updating.
- [ ] Recovery endpoint remains reachable.

## Acceptance result

Record:

```text
USB/serial baseline: PASS / FAIL
Boot/recovery: PASS / FAIL
Direct touch navigation: PASS / FAIL
Zero-blip transitions: PASS / FAIL
Home: PASS / FAIL
Printer: PASS / FAIL
Workshop: PASS / FAIL
More: PASS / FAIL
Custom/edit mode: PASS / FAIL
System: PASS / FAIL
Browser workspace: PASS / FAIL
OTA/rollback: PASS / FAIL
30-minute soak: PASS / FAIL
Issues:
```

Broad OTA promotion requires the critical interaction/recovery checks to pass and no blocker-class display or navigation defect to remain.
