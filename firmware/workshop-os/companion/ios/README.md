# Workshop Companion iOS starter

This directory contains the native iPhone client for Workshop Companion v1.

## Reproducible Xcode target

The app target is defined in `project.yml` and generated with [XcodeGen](https://github.com/yonaskolb/XcodeGen). Do not hand-maintain or commit a generated `.xcodeproj`.

Recommended deployment baseline: iOS 17+.

Required frameworks are Apple system frameworks:

- SwiftUI
- CoreBluetooth
- AVFoundation
- UserNotifications

`WorkshopCompanion/Info.plist` is the target privacy/background-mode source.

Generate and open the project on a Mac:

```bash
cd companion/ios
brew install xcodegen
xcodegen generate --spec project.yml
open WorkshopCompanion.xcodeproj
```

The repository `Validate` workflow performs the same project generation on `macos-15` and compiles the `WorkshopCompanion` scheme for the generic iOS Simulator with code signing disabled. A green `Workshop Companion iOS` job therefore proves that the checked-in Swift source and project definition compile against the Apple SDK used by CI.

## What the starter already does

- scans specifically for the Workshop Companion BLE service;
- connects as a CoreBluetooth central;
- discovers bootstrap/event/command/state characteristics;
- reads and validates the non-secret LAN bootstrap;
- refuses bootstrap auth modes other than `portal-session`;
- subscribes to device events and state notifications;
- responds to `ping` and LAN-handoff events;
- sends capability negotiation to the device;
- keeps BLE command payloads inside the v1 180-byte target;
- opens the Workshop OS `/login` route for the existing authenticated session flow;
- handles foreground camera requests and stores captures in the app cache;
- handles iPhone text-to-speech requests;
- handles local notification requests;
- sends explicit completed/permission-denied/foreground-required/unsupported/failed results to the device.

## Deliberate v1 limits

- There is no Bluetooth Classic/A2DP/HFP/LE Audio path.
- Photos are not sent over BLE.
- Audio files are not sent over BLE.
- BLE does not authorize protected Workshop OS routes.
- BLE does not execute printer or power mutations.
- Wi-Fi credentials are not provisioned over BLE yet.
- Camera capture is user/foreground constrained; the app does not claim that a suspended iOS app can silently operate the camera.
- The CI build is unsigned and simulator-targeted; installing on a physical iPhone still requires an Apple development signing identity/team and real-device permission/transport acceptance.

## Next implementation slice

After the v11.25 firmware GATT server is physically proven:

1. persist the paired Workshop OS peripheral identifier and use CoreBluetooth state restoration;
2. add a native authenticated LAN client instead of opening `/login` externally;
3. add an authenticated Wi-Fi upload endpoint for camera captures/thumbnails;
4. add an authenticated Wi-Fi audio transport for microphone/TTS payloads;
5. expose active-print state through a Live Activity only after its source-of-truth/state lifecycle is defined;
6. add notification categories/actions only where they map to already-proven guarded command semantics.

The phone app must continue to degrade cleanly when BLE, camera, notifications, or LAN access are unavailable.
