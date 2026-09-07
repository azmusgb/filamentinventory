# Smart Home v9.9 Display Experience RC1 — Physical Acceptance

Target: **Waveshare ESP32-S3-Touch-LCD-3.5 (`ws_lcd_350`)**

This gate focuses on the v9.9 visual/experience changes while rechecking the v9.8 responsive/touch geometry and v9.7.1/v9.7.2 reliability foundations.

## Critical acceptance

- [ ] Normal boot completes and `/recovery/status` reports **Smart Home v9.9 Display Experience RC1**.
- [ ] FT6336 remains responsive; touch press count increases; no unexpected read failures/recoveries.
- [ ] Home / Printer / Workshop / More footer targets all work and match their visible rectangles.
- [ ] Portrait 320×480 has no clipping, overlap, off-screen controls or dead touch strips.
- [ ] Landscape 480×320 has no clipping, overlap, off-screen controls or dead touch strips.
- [ ] Switching orientation preserves usable Home / Printer / Workshop / More navigation.
- [ ] Home clearly distinguishes printing, ready/idle, paused/attention and offline states.
- [ ] Active print hero, progress, ETA/layer and telemetry remain readable at a glance.
- [ ] AMS/material cards show useful material/tray context without text collisions.
- [ ] Printer screen clearly separates active print, ready and offline states.
- [ ] Workshop remains task-oriented and its quick actions are at least 44 px high.
- [ ] More cards and Custom/Dashboard are readable and all visible cards map to the expected touch action.
- [ ] System health shows Network, Touch, Recovery and firmware-slot state in human terms.
- [ ] Browser physical preview materially matches the device in portrait and landscape.
- [ ] No blank flash / whole-screen blip during repeated primary navigation.
- [ ] Previous-slot rollback remains available.

## Soak

- [ ] 30+ minutes without spontaneous reboot, touch freeze, graphical corruption or browser control-plane lockup.

## Acceptance record

```text
Build:
Running slot:
Known-good slot:
Portrait layout: PASS / FAIL
Landscape layout: PASS / FAIL
Primary navigation: PASS / FAIL
Home states: PASS / FAIL
Printer: PASS / FAIL
Workshop: PASS / FAIL
More / Dashboard: PASS / FAIL
System health: PASS / FAIL
AMS/material presentation: PASS / FAIL
Browser parity: PASS / FAIL
Touch reliability: PASS / FAIL
Recovery/rollback: PASS / FAIL
30-minute soak: PASS / FAIL
Issues:
```

Do not promote the production release pointer until blocker-class physical display, touch or recovery issues are cleared.
