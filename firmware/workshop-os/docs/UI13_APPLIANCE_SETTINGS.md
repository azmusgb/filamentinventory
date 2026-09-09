# Workshop OS UI13 — Appliance Settings

UI13 is the structural follow-up to the UI12 Control Center. UI12 established the correct top-level boundary between touchscreen operation, authenticated administration, and recovery/service work. UI13 removes the remaining inherited engineering-menu behavior underneath that boundary.

## Product rule

The WS350 touchscreen exposes only settings a person plausibly changes while standing at the printer. Advanced network, credential, wiring, driver, polling, and other infrequent administration remains in the authenticated Local Portal. Recovery and destructive firmware migration remain separate service/recovery workflows.

A firmware option does not automatically earn a touchscreen control.

## Primary navigation

`Home · Printer · Tools · Settings`

## Settings root

UI13 uses five user-facing destinations:

1. **Display & Appearance** — brightness, standby, night behavior, after-print display behavior, and restrained visual preferences.
2. **Sounds & Alerts** — event/touch sounds, cooled-bed notification, printer-error policy, and error signaling.
3. **Network** — current connectivity, local hostname advertisement, startup address visibility, and Local Portal handoff. Static IP/gateway/subnet/DNS editing is not part of ordinary touchscreen Settings.
4. **Printer & Power** — printer-connection status, smart-plug readiness, and guarded automatic power-off policy. Plug addressing/type/wiring remain administrative.
5. **System** — device health, connectivity summary, Date & Time, Software Update, Diagnostics, and Local Portal access.

## Explicit controls

Routine Settings interaction must be visible and self-describing:

- Boolean state uses a switch-style control.
- Numeric/preset state uses visible `-` and `+` controls.
- Enumerated choices use visible previous/next controls.
- Navigation uses a labeled action or destination card.
- Commands use explicit action buttons.
- Read-only information has no false affordance.

Long-press is **not** a routine Settings interaction. It remains appropriate only for guarded/destructive operations such as Stop, applying disruptive network changes in service/admin flows, rotation commit, or recovery/destructive actions.

## Display & Appearance

The normal touchscreen surface keeps the highest-value controls:

- Brightness
- Standby brightness
- Night mode
- After-print display behavior
- Finish timeout
- Animated progress

Lower-value implementation-oriented controls such as fan telemetry precision or compact-label implementation details are no longer promoted as normal Settings concepts.

## Sounds & Alerts

Alerts are one user concept rather than separate display/audio/LED implementation menus.

Normal settings cover:

- Event sounds
- Touch sounds
- Bed-cooled alert
- Printer error alerts
- Severity policy
- On-screen presentation policy
- Audible error signal
- Status-light error signal
- Wake display on new error

Driver/wiring/color implementation details remain in the Local Portal or service tooling.

## Network

The normal Network screen is intentionally shallow:

- Current Wi-Fi state
- Current local address when available
- mDNS/local-hostname advertisement
- Show local IP after connection
- Local Portal handoff

Static IP, gateway, subnet, DNS, hostname text editing, Wi-Fi credentials, and similarly infrequent expert configuration are administration concerns. Historical/service support for guarded static-address editing may remain in source, but it is not reachable through the normal UI13 Settings path.

## Printer & Power

Printer & Power separates safety-relevant printer power automation from audio/hardware settings.

Normal settings show:

- Printer connection state
- Smart-plug mapping/readiness
- Automatic Power Off
- Auto-off delay
- Cancel pending auto-off when the printer door is opened

The first transition from disabled to enabled requires an explicit confirmation screen explaining that Workshop OS may cut printer power through the mapped smart plug after a completed print. Disabling auto-off is immediate. Plug address, type, outlet/wiring, polling interval, and equivalent engineering settings remain administrative.

## System

System distinguishes hardware/device health from connectivity.

**Device Health** is based on local device facts such as touch and recovery readiness. Wi-Fi or printer disconnection is represented separately under **Connectivity**; an intentionally offline network must not make healthy hardware appear failed.

System also owns:

- Date & Time
- Software Update
- Diagnostics
- Local Portal

Timezone/date/time presentation is therefore no longer a Network concept.

## Software Update boundary

UI13 still does not implement a device-native self-pull updater. The touchscreen must say so clearly and route administration to the authenticated Local Portal.

Ordinary Settings must not present Full-image flashing, `0x0`, partition migration, or recovery flashing as a normal update operation. Cross-line Waveshare Home ↔ Workshop OS migration remains a full-image recovery/service procedure.

## Local Portal and credentials

The primary System surface does not display the reboot-scoped Local Portal access code. A deliberate Local Portal view displays the local address and rotating access code. Presentation is not authentication authority: session validation and same-origin mutation protection remain in `security_manager.cpp`.

Physical framebuffer capture must preserve the existing `sensitive: portal-code` contract and redact the credential before retained evidence is written.

## Inventory truth boundary

UI13 does not change inventory authority. Workshop OS may display authoritative device-facing Filament Inventory data, but it must not infer spool identity, owner, quantity, location, printer assignment, or AMS placement from color/material similarity or other unsupported telemetry. Unknown remains `Unknown`.

## Product finish

The final UI13 layer uses the existing restrained dark system palette rather than adding another visual theme. Blue is the normal interaction accent; green is healthy/available; orange is degraded, disconnected, or attention-required; red remains reserved for actual destructive/fault meaning; unknown stays visually muted.

Routine landscape controls expose a **minimum 48 px touch hit area**. Back/primary action controls are 48 px high, stepper `-`/`+` controls retain 52 px width with full-row hit height, and switch hit regions extend beyond their visual thumb/track so the interface is forgiving without looking oversized.

Copy follows a finished-appliance rule: name the user concept, show the current state, and explain only what materially changes the decision. Acceptance-language and implementation jargon such as “visible controls,” “previous/next policy,” board capability names, driver details, wiring details, and internal subsystem terminology do not appear in routine Settings.

Header status color is semantic rather than merely decorative. Healthy/connected states are green, degraded/offline/setup states are orange, unknown is muted, real failures may be red, and unclassified active informational state remains the normal blue accent. Network loss therefore does not look like a destructive fault.

The final product-finish patch is layered **after** the reconstructable UI13 architecture and does not rewrite the historical RC/UI source fragments used for provenance. Deterministic validation separately checks the touch geometry, concise product copy, semantic state colors, single printer-power implementation, truthful update boundary, and absence of a fake device-native installer.

## Release state

UI13 source identity is `Workshop OS v11.28 UI13 Appliance Settings`.

UI13 source work does **not** modify `releases/device-update.json`. Until an exact UI13 OTA is built, hashed, preserved, published through the candidate process, and physically accepted, the published v11.26 UI11 candidate and existing stable channel remain authoritative.

Any earlier UI12 physical-acceptance artifact is superseded as the target for this Settings architecture. It remains historical evidence for its exact bytes only; it cannot be carried forward to UI13.
