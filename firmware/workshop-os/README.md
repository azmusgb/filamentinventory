# BambuHelper Smart Display — Waveshare Workshop OS

Local-first Workshop OS for the **Waveshare ESP32-S3-Touch-LCD-3.5 (`ws_lcd_350`)**, built on the BambuHelper v3.8.1 core.

## Release model

The repository deliberately separates the **physically accepted source baseline** from the conservative static download channel and from hardware candidates still awaiting real-device acceptance.

| Surface | Current state | Purpose |
| --- | --- | --- |
| accepted source baseline | **Workshop OS v11.22 Display Expert RC1 — physically accepted** | Current source baseline accepted on real WS350 hardware. |
| `main` | **Workshop OS v11.22 Display Expert RC1 — accepted** | PR #74 merged after exact-head CI and real-device acceptance. |
| `release.json` / Netlify | **Workshop OS v11.19.1 Physical Fit RC2** | Conservative static installer retained until its binary-channel promotion is performed separately. |
| static rollback download | **Smart Home v7.2** | Current static-channel rollback while v11.19.1 remains the published installer. |
| active candidate | **Workshop OS v11.23 Network / Locale / Layout Expert RC2 — PR #76 (draft)** | Direct-to-`main` hardware candidate; exact-head CI and physical WS350 acceptance are required. |
| stacked follow-on | **Workshop OS v11.24 Audio Console RC1 — PR #77 (draft)** | First stacked dependency on #76; not independently promotable until its base candidate is accepted. |
| deferred backlog | **post-v11.24 Companion / Assistant experiments — issue #97** | Former v11.25–v11.30 / Workshop Intelligence PRs are closed as preserved implementation evidence until the physical baseline is accepted. |

A merge is not physical acceptance by itself. `releases/current.json` is authoritative for the accepted source, the direct-to-`main` hardware candidate, `main` state, and the static download channel. The active promotion train is deliberately limited to **#76 -> #77**; deferred Companion/Assistant implementation evidence is recorded in `docs/CANDIDATE_STACK_2026-09-06.md` and issue #97 rather than represented as another active candidate chain.

## Current candidate stack

### Workshop OS v11.23 Network / Locale / Layout Expert RC2 — PR #76

PR **#76** is the current direct-to-`main` hardware candidate. It adds explicit physical controls for timezone, staged DHCP/static network configuration, segmented IPv4 editing, and guarded display rotation. Ordinary adjustments use visible directional controls rather than hidden long-press reversal semantics.

The **final RC2 preserves the v11.20 portal/session security model**. An early hardware-iteration delta temporarily introduced a trusted-LAN no-code bypass, but that experiment is not part of the mergeable candidate. The final authenticated-boundary gate explicitly forbids the temporary bypass, the ordinary station-mode portal still requires the boot-scoped session, mutating requests retain same-origin protection, and framebuffer capture remains session-authenticated and credential-safe. Physical network, touch, rotation, and security acceptance remain required before promotion.

### Workshop OS v11.24 Audio Console RC1 — PR #77

PR **#77** is stacked on #76. It evolves the existing ES8311/onboard-microphone path with persistent speaker volume, explicit event/click/cooldown/quiet controls, a short microphone-level sample, and explicit 1/3/5-second local record/playback loops. Capture remains local-only and temporary.

Because #77 depends on #76, it cannot be treated as a direct replacement for the accepted v11.22 baseline until the underlying v11.23 candidate has completed its own validation and physical acceptance path.

### Deferred post-v11.24 Companion / Assistant work — issue #97

The former later stacked PRs **#83, #87, #88, #90, #91, and #92** are now closed as **deferred implementation evidence**. Their branches, commits, discussions, and prior validation remain available, but they are not active merge candidates and do not form an accepted release train.

After #76 and #77 are physically accepted, re-enter that work through **issue #97** and rebuild the smallest still-relevant Companion/Assistant slice on the then-accepted baseline. Do not merge the historical dependency stack wholesale.

PRs #91/#92 experimented with a WS350-only **Acceptance Open LAN** policy. That posture is explicitly **not eligible for stable promotion**. A stable successor must retain an authenticated normal-LAN/session boundary or use an explicitly approved revocable, least-authority device-scoped credential model, with the chosen security/recovery behavior physically validated.

Filament Inventory Assistant migration remains separately tracked by **issue #94** and must preserve Filament Inventory as the sole inventory authority.

## Accepted source — Workshop OS v11.22 Display Expert RC1

PR **#74** completed the v11.22 Display Expert evolution and was physically accepted on a real WS350 on **2026-09-04**.

Acceptance evidence includes:

- exact-head `Validate`, `Release Gate`, stable `merge-gate`, and **Workshop OS Firmware Gate — v11.22 Display Expert RC1** success;
- native `ws_lcd_350` build success;
- shared `jc3248w535` 320×480 regression success;
- inherited v11.20 portal-auth contract validation;
- v11.22 Display Expert contract and settings-parity validation;
- healthy read-only device interrogation reporting `Smart Home v11.22 Display Expert RC1`, `safeMode=false`, responsive FT6336 touch, connected Wi-Fi, healthy memory, and connected X2D telemetry;
- complete **29-view** authenticated framebuffer capture with the System credential line redacted before retained PNG/PPM output.

### v11.22 Display Expert

The physical Display Experience includes 14 pages with expert surfaces for:

- curated theme palettes and clock colors;
- gauge arc/label/value colors;
- nozzle, bed, chamber, and power full-scale values;
- gauge smoothing and warning threshold/color;
- glow mode/style/duration/color;
- 8-slot landscape, 9-slot portrait, and split presentation;
- Clock Info and AMS Tray Types.

Free-text Gauge Labels remain portal-only. Guarded display rotation is being validated in v11.23 rather than being retrofitted into the accepted v11.22 baseline.

### Inherited safety and security

v11.22 preserves the v11.20 rotating portal-code and boot-scoped session boundary plus the accepted v11.19.1 control and recovery behavior. Printer control remains selected-printer scoped and fail-closed. Chamber Light, Pause/Resume, guarded Stop, and mapped Printer Power retain their established safeguards.

Speed, fan, temperature, AMS, or other printer commands are not added without a proven backend path and explicit safety semantics.

## Static installer

The static installer intentionally remains **Workshop OS v11.19.1 Physical Fit RC2** for the moment, with **Smart Home v7.2** as its rollback. Accepted source and static distribution are independent release surfaces; advancing accepted source does not silently rewrite the published binary channel.

For a normal existing-device update, use the application/OTA image. A Full image belongs only at flash offset `0x0` during intentional USB recovery/full flash.

## Validation model

Firmware is reconstructed deterministically from pinned upstream BambuHelper commit `8cb1cbbb6d3c175af91989e8ebe1bbdcbe848ac4` plus the versioned `apply_smart_home_*.py` evolution stack. The reusable firmware gate validates:

1. deterministic reconstruction and candidate tooling;
2. inherited device and control contracts;
3. accepted visual/rendered-fit boundaries;
4. portal-auth contracts;
5. candidate-specific behavior contracts;
6. browser JavaScript;
7. native `ws_lcd_350` build;
8. shared `jc3248w535` regression build;
9. Full/OTA artifact generation and provenance.

`docs/settings-capability-registry/` is the machine-authoritative WS350 browser/device settings parity inventory.

## Repository layout

- `apply_smart_home_*.py` — deterministic firmware evolution inputs.
- `.bambuhelper-validation/` — verified patch payloads required by selected loaders.
- `.github/workflows/firmware-candidate.yml` — single reusable firmware/hardware gate.
- `.github/workflows/validate.yml` — repository validation.
- `.github/workflows/release-gate.yml` — source/release metadata gate and stable `merge-gate` coordination.
- `.github/workflows/release-main.yml` — accepted static installer integrity gate.
- `docs/` — architecture, safety, parity, acceptance, and roadmap documentation.
- `docs/archive/` and `releases/archive/` — historical provenance.
- `releases/current.json` — accepted-source / direct-candidate / `main` / static-channel state.
- `scripts/capture-ws350-views.zsh` — authenticated credential-safe physical framebuffer capture.

## Governance and safety

- `main` is protected by the stable path-aware `merge-gate`.
- Hardware-facing changes require exact-head CI and real-device acceptance before source promotion.
- Generated PlatformIO output, local capture ZIPs, credentials, and ad-hoc reports stay out of source control.
- Captures redact the System credential before retained output and exclude printer configuration/settings exports.
- Static firmware retention remains bounded to the published pair plus one rollback pair.
- Upstream synchronization is its own candidate; the accepted source line is never silently repinned.

## License and attribution

Original Workshop OS contributions are provided under the **MIT License** in `LICENSE`. Workshop OS is derived from **Keralots/BambuHelper**; exact attribution and third-party boundaries are recorded in `NOTICE.md`.
