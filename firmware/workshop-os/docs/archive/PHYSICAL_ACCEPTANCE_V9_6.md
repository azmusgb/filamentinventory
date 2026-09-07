# Smart Home v9.6 Printer Workspace RC1 — Physical Acceptance

Target: **Waveshare ESP32-S3-Touch-LCD-3.5 (`ws_lcd_350`)**

Candidate: **Smart Home v9.6 Printer Workspace RC1**

Automated validation is green. This checklist is the remaining release gate before merge/promotion.

## 1. Boot and baseline

- [ ] Device boots normally without entering Safe Mode unexpectedly.
- [ ] Touchscreen initializes and remains responsive.
- [ ] No repeated reboot / boot-loop behavior.
- [ ] Device reconnects to configured Wi-Fi.
- [ ] Browser control plane loads from the device IP.
- [ ] No unexpected portal-code prompt or authentication lockout.

## 2. Touchscreen smoothness

- [ ] Home opens without visible full-screen flashing or excessive redraw blips.
- [ ] Workshop opens without visible full-screen flashing or excessive redraw blips.
- [ ] Custom opens cleanly.
- [ ] System opens cleanly.
- [ ] Live printer telemetry updates without repainting unrelated regions.
- [ ] AMS updates do not cause full-screen refreshes.
- [ ] Wi-Fi / uptime / system telemetry refresh without disruptive flicker.

## 3. Printer Workspace — Overview

- [ ] Printer page opens to the new Workspace experience.
- [ ] Overview / Connection / Display / Automation / Advanced navigation is visible and usable.
- [ ] Active printer slot is clearly identified.
- [ ] Printer hero reflects the configured printer.
- [ ] Connection state is accurate.
- [ ] Print progress is accurate during an active print.
- [ ] Nozzle temperature is accurate.
- [ ] Bed temperature is accurate.
- [ ] Layer progress is accurate when available.
- [ ] Wi-Fi / health state is credible and actionable.
- [ ] Disconnected state points toward useful recovery or configuration actions.

## 4. Connection

- [ ] Connection subview isolates LAN / Cloud setup cleanly.
- [ ] Existing printer name, IP, serial and LAN code settings remain editable.
- [ ] Save & Verify still works.
- [ ] Verify Connection still works independently.
- [ ] Local printer scan still works on the same subnet.
- [ ] Switching printer slots updates the visible configuration correctly.
- [ ] Clearing a printer affects only the selected slot.

## 5. Display and Widget Library

- [ ] Touchscreen preview renders without layout breakage.
- [ ] Preview reflects the current gauge-slot assignments.
- [ ] Selecting a preview tile identifies the correct underlying slot.
- [ ] Widget Library can assign a supported gauge/widget to the selected slot.
- [ ] Saving the layout persists after page refresh.
- [ ] Saved layout persists after device reboot.
- [ ] Physical Waveshare print screen matches the browser preview configuration.
- [ ] Ready / Print-complete gauge assignments match the saved configuration.
- [ ] Empty widgets hide correctly.

### Presets

- [ ] Remote Status preset applies correctly.
- [ ] Thermal & Fans preset applies correctly.
- [ ] AMS Overview preset applies correctly.
- [ ] X2D preset applies correctly on compatible telemetry / does not break unsupported printers.
- [ ] Reset/default behavior restores expected BambuHelper defaults.

## 6. Automation

- [ ] Chamber-light automation is presented as readable rules.
- [ ] Turn on when print starts behaves correctly.
- [ ] Turn off after successful print behaves correctly.
- [ ] Turn off after failed/cancelled print behaves correctly.
- [ ] Configured off delay is honored.
- [ ] Manual Light On works.
- [ ] Manual Light Off works.
- [ ] Automation settings persist across reboot.

## 7. Unsaved-change protection

- [ ] Editing a display setting produces the Unsaved Changes state.
- [ ] Save commits the intended changes.
- [ ] Discard returns the UI to the last persisted state.
- [ ] Navigating between Printer Workspace tabs does not silently lose or incorrectly save edits.

## 8. Advanced compatibility

- [ ] Existing advanced printer controls remain reachable.
- [ ] Existing gauge controls remain functional.
- [ ] Existing printer error controls remain functional.
- [ ] Existing hardware controls remain functional.
- [ ] No settings disappeared solely because of the workspace redesign.

## 9. Recovery foundation regression

Open `/recovery` directly from the device IP.

- [ ] Recovery page loads.
- [ ] `/recovery/status` returns valid JSON.
- [ ] Build identity is visible.
- [ ] Touch status reports FT6336 / forced-on behavior as expected.
- [ ] Reboot Normally works.
- [ ] Reboot to Safe Mode works.
- [ ] Safe Mode root lands on `/recovery`.
- [ ] Recovery AP uses `Waveshare-Recovery-*` in Safe Mode.
- [ ] Reset Display UI works without clearing unrelated printer configuration.
- [ ] Reset Wi-Fi Only clears Wi-Fi without destroying printer settings.
- [ ] Settings backup downloads successfully.
- [ ] Application recovery OTA accepts `WaveshareHome-firmware.bin`.
- [ ] Application recovery OTA rejects a Full image where expected.

## 10. OTA candidate acceptance

Using the validated OTA image:

`BambuHelper-ws_lcd_350-v3.8.1-Smart-Home-v9.6-Printer-Workspace-RC1-OTA.bin`

SHA-256:

`2acd8c73b0d9f76fa4a78a4dc6ea47a361cd022eb2906eb449b61ca813c397f4`

- [ ] Browser verifies the selected image successfully.
- [ ] OTA reaches 100% without hanging.
- [ ] Device reboots automatically.
- [ ] Candidate boots into the expected application slot.
- [ ] Web control plane becomes ready after reboot.
- [ ] Candidate does not roll back unexpectedly after the health window.
- [ ] Printer settings remain intact after OTA.
- [ ] Display/widget configuration remains intact after OTA.

## 11. Final runtime soak

- [ ] Run at least 30 minutes idle with browser dashboard open.
- [ ] Run during an active print long enough to observe multiple telemetry updates.
- [ ] No touch freezes.
- [ ] No browser lockups.
- [ ] No spontaneous device reboot.
- [ ] No progressive redraw corruption.
- [ ] No severe memory-health degradation visible in diagnostics.

## Acceptance decision

Physical acceptance is complete only when all critical boot, touchscreen, Printer Workspace, OTA and recovery checks pass with no release-blocking regression.

- [ ] **ACCEPT v9.6 RC1 for merge/promotion**
- [ ] **REJECT / continue RC iteration**

Notes:

- Date:
- Device:
- Tester:
- Observed device IP:
- Running slot:
- Issues found:
