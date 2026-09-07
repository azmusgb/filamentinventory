# Workshop Companion

Workshop Companion is the phone-side extension of Workshop OS. It deliberately uses two transports:

- **Bluetooth Low Energy (BLE)** for discovery, presence, pairing intent, compact events, and Wi-Fi handoff metadata.
- **Wi-Fi/LAN** for authenticated management, printer state, images, audio, larger payloads, and any operation that can mutate printer/power/device state.

The ESP32-S3 is treated as a BLE peripheral and the iPhone as a CoreBluetooth central. The ESP32-S3 is **not** treated as a Bluetooth Classic/A2DP/HFP/LE Audio device.

## Security boundary

Workshop Companion does not create a second management authority.

1. BLE advertisements and characteristics contain no printer credentials, Wi-Fi passwords, portal codes, sync keys, or other long-lived secrets.
2. BLE can advertise the device identity and local Workshop OS URL, but it cannot authorize protected HTTP routes.
3. The iPhone must authenticate through the existing Workshop OS portal/session flow before protected LAN operations are available.
4. Printer and power mutations remain governed by the existing fail-closed command path and guarded-action rules.
5. Camera, microphone, notification, and speech requests are capability requests, not guarantees; iOS may require foreground/user interaction.
6. Wi-Fi provisioning is intentionally deferred until a cryptographically authenticated enrollment flow is designed and physically accepted.

## Repository layout

- `protocol/workshop-companion-v1.md` — transport and message contract.
- `firmware/workshop_companion_protocol.h` — compile-neutral constants for a future firmware candidate.
- `ios/WorkshopCompanion/` — SwiftUI/CoreBluetooth starter implementation.
- `../scripts/validate_companion_protocol.py` — parity validator for UUIDs, protocol version, and command names.

## v1 milestone

The initial implementation proves the integration boundary without modifying accepted firmware bytes:

- scan for Workshop OS BLE advertisements;
- connect to the companion service;
- read non-secret bootstrap metadata;
- subscribe to device events;
- write compact phone responses;
- discover the Workshop OS LAN endpoint;
- open the authenticated Workshop OS login/control plane from the app;
- model camera/TTS/notification requests with explicit unsupported/foreground-required states.

A later firmware candidate may implement the BLE GATT server behind a feature flag. It requires native `ws_lcd_350` + shared-target CI and real-device acceptance before promotion.
