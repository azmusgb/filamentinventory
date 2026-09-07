# Workshop OS candidate stack — 2026-09-06

This snapshot records the current hardware/software candidate train without redefining the accepted Workshop OS baseline.

## Authoritative accepted baseline

- Repository: `azmusgb/bambuhelper-smart-display`
- Accepted source line: **Workshop OS v11.22 Display Expert RC1**
- Accepted source commit: `b6ff19e8617a8cceb380ea3c3621c54ea0048f11`
- Physical acceptance: **passed on real WS350 hardware**
- Accepted date: 2026-09-04
- Static installer remains intentionally more conservative at v11.19.1.

`releases/current.json` remains authoritative for accepted source, direct candidate, `main`, and static download-channel state.

## Active promotion train

Only two pull requests remain active in the hardware promotion chain.

### PR #76 — v11.23 Network / Locale / Layout Expert RC2

- Branch: `feature/v11-23-network-locale-layout`
- Direct-to-`main` candidate
- Status: **physical acceptance required**
- Purpose: explicit touch-safe timezone/network/rotation flows, larger targets, visible staged state, guarded apply/commit semantics, and authenticated capture/security preservation.

This remains the first hardware gate that must be physically resolved.

### PR #77 — v11.24 Audio Console RC1

- Branch: `feature/v11-24-audio-console`
- Stacked directly on #76
- Status: **blocked on #76 physical acceptance; then requires its own physical audio acceptance**
- Purpose: persistent speaker volume, explicit event/quiet/cooldown controls, microphone level feedback, and bounded local-only record/playback tests.

Neither PR is accepted or stable merely because it builds. The accepted source baseline remains v11.22 until real-device acceptance and promotion are completed.

## Deferred post-v11.24 implementation evidence

The former later stacked PRs have been **closed without merge** so GitHub no longer presents them as an active release train:

| PR | Preserved implementation evidence | Disposition |
| --- | --- | --- |
| #83 | v11.25 Workshop Companion BLE RC1 | Closed/deferred to issue #97; BLE orchestration work remains in branch/history. |
| #87 | v11.26 Workshop Companion Web RC1 | Closed/deferred to #97; device-hosted iPhone Companion findings remain available. |
| #88 | v11.27 Workshop Companion Link RC1 | Closed/deferred to #97; unified state envelope and volatile phone-photo transfer remain evidence. |
| #90 | Workshop Intelligence v1 | Closed/deferred exploratory track; advisory/on-device LLM work must not compete with the canonical Filament Inventory Assistant. |
| #91 | v11.29 Companion Viewer + Acceptance Open LAN RC1 | Closed/deferred to #97; open-LAN acceptance mode is explicitly not stable-eligible. |
| #92 | v11.30 Unified Web + Companion RC2 | Closed/deferred to #97; phone-photo viewer state-machine fix and unified UI findings remain evidence for selective port. |

Closing these PRs does **not** delete their branches, commits, discussions, CI records, or artifacts. It only removes them from the active merge/promotion queue.

## Deferred backlog authority — issue #97

Issue **#97 — Post-v11.24 Companion / Assistant integration backlog** is the sequencing record for the preserved later work.

After #76 and #77 are physically accepted:

1. start from the then-accepted Workshop OS baseline;
2. reimplement/rebase the smallest coherent Companion slice rather than merging the historical dependency chain wholesale;
3. preserve only fixes and behaviors that remain relevant on that baseline;
4. revalidate BLE + Wi-Fi + MQTT + audio + touch + smart-plug coexistence and heap/PSRAM behavior on the actual WS350;
5. retain guarded Workshop OS command authority; BLE remains orchestration-only unless deliberately redesigned and accepted;
6. route Filament Inventory Assistant migration through issue #94 and the versioned Filament Inventory device contract;
7. use a revocable device-scoped least-privilege credential before Assistant-enabled stable promotion;
8. run exact-head `ws_lcd_350`, shared `jc3248w535`, Full/OTA, recovery, and physical acceptance gates.

## Preserved v11.30 software evidence

PR #92 head `eb8bb8f9f8787ad6b4bcc9ce5e6e308af515a3c0` previously passed both:

- repository `Validate` workflow;
- `Workshop OS Firmware Gate — v11.30 Unified Web + Companion RC2`.

That remains valid historical evidence that the specific candidate built and passed its software-side contract checks. It does **not** establish physical acceptance, and the closed PR is no longer an active promotion candidate.

## Workshop Intelligence boundary

PR #90 remains useful exploratory evidence for an iPhone/on-device intelligence layer with advisory-only behavior, structured output, deterministic grounding, and safety tests.

Important boundary:

- it does not move printer, smart-plug, OTA, recovery, settings, or inventory authority into the model path;
- it is not a substitute for Filament Inventory's authoritative grounded Assistant or device contract;
- it should remain a clearly separate optional advisory track or be consolidated with the canonical Assistant if product overlap becomes material;
- model output must not create inventory truth, physical state, or successful hardware-action claims.

## Security disposition of Acceptance Open LAN

PRs #91/#92 experimented with a WS350-only normal-LAN acceptance mode where portal-code login was disabled by default while selected same-origin and safety guards remained.

That mode is **not eligible for stable promotion** and must not be inherited implicitly into future Companion/Assistant work.

A stable successor must either:

- preserve the authenticated normal-LAN/session boundary; or
- adopt an explicitly approved revocable, least-authority device-scoped credential model.

The chosen authentication/credential boundary, revocation/recovery behavior, same-origin protections, AP/recovery scoping, and destructive-action guards must be physically validated before stable promotion.

## Promotion rule

Keep release states distinct:

`implemented -> built -> tested -> runtime validated -> physically validated -> accepted -> stable`

Only #76 and #77 are active candidates now. Everything beyond v11.24 is preserved implementation evidence/backlog until the prerequisite physical gates are resolved.

## Recommended next sequence

1. Resolve PR #76 physical WS350 acceptance first.
2. Promote/rebase as required and record exact accepted SHA/artifact identity.
3. Physically validate dependent #77 audio behavior on that accepted base.
4. Re-enter issue #97 and decide the smallest coherent post-v11.24 Companion slice.
5. Implement Filament Inventory Assistant migration through issue #94 without creating a second inventory authority.
6. Record exact candidate SHA, Full/OTA artifact hashes, recovery path, and physical acceptance result for every promoted hardware increment.
7. Advance `releases/current.json` and stable metadata only after the applicable acceptance gate actually passes.
