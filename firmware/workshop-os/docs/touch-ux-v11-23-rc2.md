# Workshop OS v11.23 RC2 — WS350 Touch UX

## Status

**Hardware candidate only.** Workshop OS v11.22 remains the physically accepted source baseline until v11.23 RC2 passes exact-head CI and real-device touch/network/display/security acceptance.

RC1 validated the underlying Network / Locale / Layout behavior and 32-view capture surface, but physical testing exposed a usability problem: too many actions depended on dense cards and hidden short-press/long-press semantics. RC2 treats that as an acceptance failure rather than normalizing it as technical debt.

## Interaction principles

RC2 applies the following rules to the 480×320 WS350 touch surface:

1. **Common actions are visible.** Back, Next, Prev, increment, decrement, Discard, Review, and rotation staging are explicit controls.
2. **Large targets first.** Primary controls target roughly **52–60 px high** reference hit areas where the layout permits it.
3. **Long press is reserved for guarded commits.** Ordinary navigation no longer depends on hidden hold gestures. Network Apply and rotation Commit remain hold-guarded.
4. **Staged state is unmistakable.** Network edits show `STAGED — NOT APPLIED` until deliberate Review/Apply.
5. **Cancel paths do not persist staged addressing.** Back navigates without saving; Discard reloads persisted network values.
6. **Direction is discoverable.** Display Expert uses left/right interaction semantics instead of “tap next / hold previous”.
7. **Touch ownership stays local.** Workshop OS pages consume their own touch events so stock printer-control screens keep their established behavior.
8. **Guarded actions expose a safe pre-commit state.** Rotation is previewed before commit; network addressing is reviewed before Apply.

## Network Expert RC2

### 1 / 4 — Essentials

- Startup IP
- Clock Format
- Date Format
- mDNS
- explicit Back / Next

### 2 / 4 — Time & Locale

- full-width timezone presentation
- explicit `< PREV` and `NEXT >` timezone controls
- Clock Format and Date Format
- explicit Back / Next
- timezone changes remain immediate because they are non-network-disruptive and reversible

### 3 / 4 — Address Editor

The page prominently shows:

`STAGED — NOT APPLIED`

Controls:

- DHCP / Static mode
- previous / next field
- four selectable IPv4 octets
- `-10`, `-1`, `+1`, `+10`
- Back / Review

The physical-touch finalization enlarges the octet and delta controls to 52 px reference hit areas and enlarges primary page navigation. Editing this page changes only the in-memory staged buffer. It does not write `netSettings` and does not restart the device.

### 4 / 4 — Review

The page separates three actions:

- **Back** — return to editor
- **Discard** — reload persisted settings and abandon staged values
- **HOLD APPLY + RESTART** — validate, persist the complete addressing set atomically, then restart

A short tap on Apply is intentionally insufficient.

Network Apply is disruptive to the display connection because the display restarts and may reconnect on a different address. It does **not** command or stop the printer. When a printer is active, the UI explicitly warns that the display will restart while the printer continues.

## Display Expert RC2

For reversible expert values, RC2 removes the hidden “hold to reverse” convention. Within the setting-card interaction surface:

- left side = previous / decrement
- right side = next / increment

Copy is updated to make the direction explicit.

### Dedicated rotation preview

Rotation is no longer committed directly from **Display → Extras**.

A normal tap on Rotation opens a dedicated full-screen guarded interaction containing:

- **CURRENT** orientation
- **PREVIEW** orientation
- explicit **Prev / Next** staging controls
- **Cancel**
- **HOLD TO COMMIT ROTATION**

Changing Preview does not persist orientation. A short tap on Commit does not persist orientation. Only a deliberate hold commits the staged rotation through the normal display-settings persistence path, updating display and touch mapping together.

The rotation preview is modal rather than an additional deterministic capture page, so the established 32-view framebuffer catalog remains unchanged.

## Security boundary

The final v11.23 RC2 candidate **preserves the v11.20 portal/session security model**.

An early hardware-iteration delta historically introduced a temporary station-mode trusted-LAN bypass. It is not the final candidate policy. The deterministic build now applies an explicit authenticated-LAN restore before final validation and compilation.

Final-source invariants:

- normal station-mode management requires the boot-scoped portal-code session;
- mutating requests also require the existing same-origin check;
- AP/setup/recovery authorization remains route-scoped;
- blanket `isAPMode()` authorization remains forbidden;
- `WORKSHOP_OS_TEMP_LAN_OPEN` must be absent from final reconstructed source;
- the browser must not expose a trusted-LAN bypass banner;
- framebuffer capture authenticates through `/login` and uses a session cookie;
- portal-code input is hidden and submitted to curl over stdin rather than as a process argument;
- the System credential region is redacted before retained PPM/PNG output;
- printer configuration and settings exports remain excluded from capture bundles.

The obsolete no-code physical-acceptance helper was removed from the repository. Current acceptance is documented in `docs/PHYSICAL_ACCEPTANCE_V11_23_RC2.md`.

## Physical acceptance gates

RC2 must pass all of the following before source promotion:

- exact-head Validate, Release Gate, and v11.23 RC2 native firmware gate;
- `ws_lcd_350` native build;
- `jc3248w535` shared-target regression;
- RC2 touch UX, physical-touch finalization, guarded-feedback, authenticated-boundary, and settings-parity contracts;
- device boots `safeMode=false`, `webReady=true`, touch responsive;
- protected normal-LAN management requires a valid portal session;
- all 32 deterministic framebuffer views captured through the authenticated capture helper;
- no clipping or hit-target ambiguity on Network Expert pages;
- primary Network navigation and numeric-edit controls are comfortably finger-sized;
- timezone Prev/Next works and can be restored;
- staged address editing does not persist before Apply;
- Back and Discard behave distinctly and safely;
- short-tap Apply does nothing destructive;
- rotation opens a dedicated preview instead of rotating directly from Extras;
- changing Rotation Preview does not persist;
- short-tap rotation Commit does not persist;
- deliberate hold Commit changes orientation and touch mapping together;
- rotation can be restored with touch still aligned;
- existing printer-control, audio, recovery, and persistence behavior remains healthy.

## Non-goals

RC2 does not introduce speed, fan, temperature, AMS, or other speculative printer commands. Wi-Fi credentials and hostname remain browser-input settings rather than touchscreen free-text entry.
