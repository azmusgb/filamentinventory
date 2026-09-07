# Upstream BambuHelper sync policy

Workshop OS **v11.22 Display Expert RC1** is the physically accepted source baseline and is reproducibly reconstructed from BambuHelper commit `8cb1cbbb6d3c175af91989e8ebe1bbdcbe848ac4` plus the accepted Workshop OS evolution stack. The active v11.23 hardware candidate and stacked v11.24 Audio Console candidate continue from that same deliberate pin.

As of **2026-09-04**, upstream `Keralots/BambuHelper` `main` is `95597e4d633950bc00bb1cd50ce59da5c375a1fa`, **11 commits ahead** of the Workshop OS pin. The upstream comparison overlaps areas Workshop OS actively modifies, including display/rendering, touch behavior, MQTT/HMS state, settings, browser UI, smart-plug behavior, and printer-power interaction.

Notable overlapping upstream changes include:

- **Printer Off hold-to-power-on** — a direct hold gesture reuses the existing power-confirm path. This overlaps Workshop OS mapped-power and guarded-control UX.
- **True night blackout + wake override** — night brightness `0` can now fully blank the display with a temporary wake override, plus an option to keep the status LED dark during the night window. This overlaps Workshop OS display, input, backlight, LED, and settings behavior.
- **AMS auto-refill HMS alert suppression** — known self-resolving/normal auto-refill notices are excluded from persistent alert surfaces while remaining visible in detailed HMS/status output. This overlaps Workshop OS alert presentation and HMS-derived state.

Earlier upstream commits between the pin and current head also touch `include/bambu_state.h`, `include/tasmota.h`, `include/web_pages.h`, `src/bambu_mqtt.cpp`, `src/button_touch_axs.cpp`, `src/clock_mode.cpp`, `src/display_split.cpp`, `src/display_ui.cpp`, `src/main.cpp`, `src/settings.cpp/.h`, `src/tasmota.cpp`, `src/web_server.cpp`, `src/web_template.cpp`, and `web/app.js`, among other files.

The pin is deliberate, not forgotten dependency drift. A newer upstream SHA is **not** automatically safer merely because it is newer: these changes intersect the exact touch, display, alert, settings, authentication, and power behavior currently under Workshop OS physical acceptance.

## Sync rule

Never silently repin `main`, the direct hardware candidate, a stacked candidate, or the reusable firmware gate. An upstream update is a dedicated firmware candidate because a clean compile does not prove UI, authentication, power-control, HMS, audio, or touch equivalence.

A repin must pass:

1. complete Workshop OS patch-stack reconstruction against the proposed upstream SHA;
2. explicit review of every upstream-changed file that overlaps Workshop OS patches;
3. portal-auth/security contract validation when `web_server`, web pages, settings, or session paths overlap;
4. browser JavaScript validation;
5. native `ws_lcd_350` build;
6. shared `jc3248w535` 320×480 regression build;
7. existing device, safety, visual, rendered-fit, settings-parity, and fail-closed control contracts;
8. physical checks for touch, display retention, night/wake behavior when relevant, printer-off state, power-confirm geometry, Light/Pause/Resume/Stop/Power, Speaker/MIC ECHO, settings persistence, login/session behavior, OTA and recovery;
9. HMS/alert behavior review when the upstream delta changes printer-state or alert classification;
10. authenticated WS350 framebuffer recapture when the upstream delta touches display/rendering behavior;
11. update of the pinned SHA only after the dedicated sync candidate is physically accepted.

## Active candidate interaction

PR **#76** (v11.23 RC2) and PR **#77** (stacked v11.24 Audio Console) are already changing touch, network/layout, display-rotation, and audio behavior. Repinning either candidate in place would confound two independent acceptance deltas. Finish or deliberately replace that candidate stack before introducing an upstream-sync candidate.

Until the sync gate is run, `8cb1cbbb6d3c175af91989e8ebe1bbdcbe848ac4` remains a **reproducibility boundary**, not a claim that Workshop OS is synchronized to upstream `main`.
