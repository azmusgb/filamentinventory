#pragma once

// Compile-neutral Workshop Companion v1 identifiers.
// This header intentionally does not initialize BLE, allocate tasks, or alter
// firmware behavior. A future hardware candidate may consume these constants.

#define WORKSHOP_COMPANION_PROTOCOL_VERSION 1

#define WORKSHOP_COMPANION_SERVICE_UUID \
  "A3D10000-7A4B-4B82-9C52-57534F533530"
#define WORKSHOP_COMPANION_BOOTSTRAP_UUID \
  "A3D10001-7A4B-4B82-9C52-57534F533530"
#define WORKSHOP_COMPANION_DEVICE_EVENT_UUID \
  "A3D10002-7A4B-4B82-9C52-57534F533530"
#define WORKSHOP_COMPANION_PHONE_COMMAND_UUID \
  "A3D10003-7A4B-4B82-9C52-57534F533530"
#define WORKSHOP_COMPANION_DEVICE_STATE_UUID \
  "A3D10004-7A4B-4B82-9C52-57534F533530"

#define WORKSHOP_COMPANION_EVENT_HELLO "hello"
#define WORKSHOP_COMPANION_EVENT_LAN_HANDOFF "lan.handoff"
#define WORKSHOP_COMPANION_EVENT_CAMERA_REQUEST "camera.request"
#define WORKSHOP_COMPANION_EVENT_TTS_REQUEST "tts.request"
#define WORKSHOP_COMPANION_EVENT_NOTIFICATION_REQUEST "notification.request"
#define WORKSHOP_COMPANION_EVENT_PING "ping"

#define WORKSHOP_COMPANION_COMMAND_HELLO "hello"
#define WORKSHOP_COMPANION_COMMAND_CAMERA_RESULT "camera.result"
#define WORKSHOP_COMPANION_COMMAND_TTS_RESULT "tts.result"
#define WORKSHOP_COMPANION_COMMAND_NOTIFICATION_RESULT "notification.result"
#define WORKSHOP_COMPANION_COMMAND_LAN_READY "lan.ready"
#define WORKSHOP_COMPANION_COMMAND_PONG "pong"

namespace workshop_companion {
inline constexpr int kProtocolVersion = WORKSHOP_COMPANION_PROTOCOL_VERSION;
inline constexpr const char* kServiceUuid = WORKSHOP_COMPANION_SERVICE_UUID;
inline constexpr const char* kBootstrapUuid = WORKSHOP_COMPANION_BOOTSTRAP_UUID;
inline constexpr const char* kDeviceEventUuid = WORKSHOP_COMPANION_DEVICE_EVENT_UUID;
inline constexpr const char* kPhoneCommandUuid = WORKSHOP_COMPANION_PHONE_COMMAND_UUID;
inline constexpr const char* kDeviceStateUuid = WORKSHOP_COMPANION_DEVICE_STATE_UUID;
}  // namespace workshop_companion
