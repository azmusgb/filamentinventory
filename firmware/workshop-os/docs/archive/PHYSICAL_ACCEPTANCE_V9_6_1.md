# Smart Home v9.6.1 Zero-Blip RC2 — Physical Acceptance

Target: **Waveshare ESP32-S3-Touch-LCD-3.5 (`ws_lcd_350`)**

Candidate: **Smart Home v9.6.1 Zero-Blip RC2**

RC1 was rejected on physical hardware because visible blank/repaint blipping remained during Smart Home page changes. RC2 changes the transition architecture: Smart Home pages are composed in a PSRAM framebuffer and committed only after the new frame is complete, while the upstream physical pre-clear is suppressed for Smart Home page entry.

Automated validation is green. Physical acceptance remains required.

## 1. Critical zero-blip transition test

Test these transitions repeatedly, at least 10 cycles:

- [ ] Home → Workshop
- [ ] Workshop → Custom
- [ ] Custom → System
- [ ] System → Home
- [ ] Home → System
- [ ] System → Workshop

For every transition confirm:

- [ ] The previous page stays visible until the replacement frame appears.
- [ ] No blank/background-only frame is visible.
- [ ] No obvious top-to-bottom or card-by-card construction is visible.
- [ ] No white/black flash appears.
- [ ] No partial stale frame remains after the transition.
- [ ] Touch remains responsive during rapid page changes.

**Release blocker:** any repeatable Smart Home → Smart Home blank/repaint blip.

## 2. Live update stability

Leave each page visible for at least two minutes while telemetry changes.

- [ ] Home telemetry updates without full-screen flash.
- [ ] Workshop telemetry updates without full-screen flash.
- [ ] Custom widget updates do not rebuild the full page.
- [ ] System Wi-Fi / uptime / memory updates do not rebuild the full page.
- [ ] Printer / AMS telemetry does not cause unrelated cards to blink.
- [ ] No progressive visual corruption appears after repeated incremental updates.

## 3. Printer boundary observation

The legacy Printer surface still uses the upstream renderer. Test and record separately:

- [ ] Smart Home → Printer behavior observed.
- [ ] Printer → Smart Home behavior observed.

If a blip exists only at the legacy Printer boundary, record it explicitly. Do not classify that alone as failure of the Smart-to-Smart framebuffer compositor; it is a separate follow-up transition path.

## 4. Boot / recovery regression

- [ ] Normal boot succeeds.
- [ ] Touchscreen initializes and remains responsive.
- [ ] Configured Wi-Fi reconnects.
- [ ] Browser control plane loads.
- [ ] No unexpected portal-code prompt or authentication lockout.
- [ ] `/recovery` loads.
- [ ] `/recovery/status` returns valid JSON.
- [ ] Reboot Normally works.
- [ ] Reboot to Safe Mode works.
- [ ] Safe Mode root lands on `/recovery`.

## 5. Printer Workspace regression

- [ ] Overview / Connection / Display / Automation / Advanced navigation works.
- [ ] Printer status / temperatures / progress are credible.
- [ ] Touchscreen preview renders correctly.
- [ ] Widget assignment saves and matches the physical screen.
- [ ] Saved widget layout persists after browser refresh.
- [ ] Saved widget layout persists after reboot.
- [ ] Chamber-light manual controls still work.
- [ ] Existing Advanced controls remain reachable.

## 6. Runtime soak

- [ ] 30+ minutes idle without spontaneous reboot.
- [ ] Active-print telemetry observed for multiple updates.
- [ ] No touch freeze.
- [ ] No browser lockup.
- [ ] No progressive redraw corruption.
- [ ] No severe memory-health degradation in diagnostics.

## Candidate artifact

OTA:

`BambuHelper-ws_lcd_350-v3.8.1-Smart-Home-v9.6.1-Zero-Blip-RC2-OTA.bin`

SHA-256:

`c290bb942662023de00cd622b90a85945af3c08a6d3bf31976ecebb25eefe760`

Full / USB recovery SHA-256:

`c19f6e7f144d4ee9b172ee84d56f4a2beed8587148cde6e7fcb5ce446fba6dd0`

GitHub Actions run: `33641404096`

## Acceptance decision

- [ ] **ACCEPT v9.6.1 RC2 for merge/promotion**
- [ ] **REJECT / continue RC iteration**

Notes:

- Date:
- Device:
- Tester:
- Observed device IP:
- Running slot:
- Smart-to-Smart blip observed:
- Legacy Printer-boundary blip observed:
- Other issues:
