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

PR **#76** carries the RC2 interaction redesign after RC1 proved technically healthy but exposed unnecessary friction during real WS350 touch testing.

The physical interface is being elevated around **discoverability, target size, explicit direction, safe staging, and guarded commit flows**:

- Network Expert uses large finger-sized controls instead of dense card-only gestures;
- primary Network navigation and numeric-edit controls target roughly **52–60 px** reference hit areas where the 480×320 layout permits it;
- every network page has explicit **Back / Next** navigation;
- Time & Locale exposes dedicated **Prev / Next** timezone controls;
- Address Editor exposes a visible **STAGED — NOT APPLIED** state;
- IPv4 editing uses selectable octets plus explicit **-10 / -1 / +1 / +10** controls;
- Address Review separates **Back**, **Discard**, and guarded **Hold Apply + Restart**;
- normal short taps cannot apply a network configuration;
- Display Expert removes hidden “hold to go backward” behavior in favor of explicit left/right direction semantics;
- Rotation opens a dedicated **Current / Preview / Prev / Next / Cancel / Hold Commit** interaction;
- changing Rotation Preview does not persist, and a short tap on Commit does not persist;
- live guarded-action progress makes protected commits visible;
- the established 32-view deterministic framebuffer catalog is retained because Rotation Preview is modal rather than a new capture page.

#### Security boundary

The **mergeable v11.23 candidate preserves the accepted v11.20 portal/session boundary**.

An early RC2 hardware-iteration delta briefly introduced a station-mode trusted-LAN bypass. That state is treated only as a historical/intermediate reconstruction condition and is explicitly removed before final security validation, settings-parity validation, browser JavaScript validation, native builds, artifact packaging, or promotion.

The final candidate requires:

- normal station-mode management access through the boot-scoped portal-code session;
- same-origin protection for mutating requests;
- route-scoped setup/recovery AP exceptions rather than blanket AP authorization;
- `WORKSHOP_OS_TEMP_LAN_OPEN` absent from final reconstructed source;
- authenticated framebuffer capture using `scripts/capture-ws350-views.zsh`;
- portal-code input hidden from the terminal and sent to `/login` over stdin rather than command-line arguments;
- System portal-code pixels redacted before retained capture output;
- no tracked or packaged no-code acceptance helper.

See `docs/security-hardening-v11-23-rc2.md`, `docs/PHYSICAL_ACCEPTANCE_V11_23_RC2.md`, and `SECURITY.md` for the enforceable boundary.

#### Network / Locale / Layout scope

- physical timezone selection using the existing supported timezone database;
- coordinated DHCP/static mode;
- segmented IP / gateway / subnet / DNS editing staged on-device;
- no network mutation until the Review page is deliberately held to apply;
- restart after an accepted network commit so addressing changes are applied coherently;
- guarded display rotation with a dedicated staged-preview flow;
- Time & Locale, Address Editor, and Network Review framebuffer acceptance views;
- Wi-Fi credentials and hostname remain browser-only inputs;
- no speculative speed, fan, temperature, or AMS printer commands.

The candidate is **not accepted** until exact-head RC2 CI and real-device touch/display/network/security acceptance pass. v11.22 remains the authoritative physically accepted source baseline.

### Workshop OS v11.24 Audio Console RC1 — PR #77

PR **#77** is stacked on #76. It evolves the existing ES8311/onboard-microphone path with persistent speaker volume, explicit event/click/cooldown/quiet controls, a short microphone-level sample, and explicit 1/3/5-second local record/playback loops. Capture remains local-only and temporary.

Because #77 depends on #76, it cannot be treated as a direct replacement for the accepted v11.22 baseline until the underlying v11.23 candidate has completed its own validation and physical acceptance path. v11.24 must inherit the authenticated v11.23 security boundary and may not resurrect the historical trusted-LAN bypass.

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
- healthy read-only device interrogation reporting `Smart Home v11.22 Display Expert RC1`, `safeMode=false`, responsive FT6336 touch, connected Wi-Fi, healthy memory, and connected printer telemetry;
- complete **29-view** authenticated framebuffer capture with the System credential line redacted before retained PNG/PPM output.

### v11.22 Display Expert

The physical Display Experience includes 14 pages, with expert surfaces for curated theme palettes, clock colors, gauge colors/scales/behavior, glow, layout, Clock Info, and AMS Tray Types.

Free-text Gauge Labels remain browser-only.

### Inherited safety and security

v11.22 preserves the v11.20 rotating portal-code and boot-scoped session boundary plus the accepted v11.19.1 control and recovery behavior. Printer control remains selected-printer scoped and fail-closed. Chamber Light, Pause/Resume, guarded Stop, and mapped Printer Power retain their established safeguards.

Speed, fan, temperature, AMS, or other printer commands are not added without a proven backend path and explicit safety semantics.

## Static installer

The static installer intentionally remains **Workshop OS v11.19.1 Physical Fit RC2**, with **Smart Home v7.2** as rollback. Accepted source and static distribution are independent release surfaces.

For a normal existing-device update, use the application/OTA image. A Full image belongs only at flash offset `0x0` during intentional USB recovery/full flash.

## Validation model

Firmware is reconstructed deterministically from pinned upstream BambuHelper commit `8cb1cbbb6d3c175af91989e8ebe1bbdcbe848ac4` plus the versioned `apply_smart_home_*.py` evolution stack.

For v11.23 RC2, the firmware gate reconstructs and validates the authenticated v11.20 baseline, applies the Network / Locale / Layout and touch-UX deltas, applies the physical-touch and guarded-feedback deltas, then applies the explicit **authenticated-LAN restore**. Only after the restore passes does CI run settings parity, browser JavaScript, native `ws_lcd_350`, shared `jc3248w535`, Full-image merge, and artifact packaging.

`docs/settings-capability-registry/` is the machine-authoritative WS350 browser/device settings parity inventory.

## Repository layout

- `apply_smart_home_*.py` — deterministic firmware evolution inputs.
- `.bambuhelper-validation/` — verified patch payloads required by selected loaders.
- `.github/workflows/firmware-candidate.yml` — reusable path-aware firmware/hardware gate.
- `.github/workflows/validate.yml` — repository validation.
- `.github/workflows/release-gate.yml` — source/release metadata gate and stable `merge-gate` coordination.
- `.github/workflows/release-main.yml` — accepted static-installer integrity gate.
- `docs/` — architecture, safety, parity, acceptance, security, and roadmap documentation.
- `docs/archive/` and `releases/archive/` — historical provenance.
- `releases/current.json` — accepted-source / direct-candidate / `main` / static-channel state.
- `scripts/capture-ws350-views.zsh` — authenticated credential-safe physical framebuffer capture.
- `docs/PHYSICAL_ACCEPTANCE_V11_23_RC2.md` — current physical acceptance checklist.

## Governance and safety

- `main` is protected by the stable path-aware `merge-gate`.
- Hardware-facing changes require exact-head CI and real-device acceptance before source promotion.
- Generated PlatformIO output, local capture ZIPs, credentials, and ad-hoc reports stay out of source control.
- Captures redact the System credential region before retained output and exclude printer configuration/settings exports.
- Final firmware validation forbids the temporary trusted-LAN bypass from surviving into reconstructed candidate source.
- Static firmware retention remains bounded to the published pair plus one rollback pair.
- Upstream synchronization is its own candidate; the accepted source line is never silently repinned. See `docs/UPSTREAM_SYNC.md`.

## License and attribution

Original Workshop OS contributions are provided under the **MIT License** in `LICENSE`. Workshop OS is derived from **Keralots/BambuHelper**; exact attribution and third-party boundaries are recorded in `NOTICE.md`.
