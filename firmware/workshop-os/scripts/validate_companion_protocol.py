#!/usr/bin/env python3
from __future__ import annotations

import plistlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = ROOT / "companion/protocol/workshop-companion-v1.md"
HEADER = ROOT / "companion/firmware/workshop_companion_protocol.h"
SWIFT = ROOT / "companion/ios/WorkshopCompanion/CompanionProtocol.swift"
PLIST = ROOT / "companion/ios/WorkshopCompanion/Info.plist"

EXPECTED_UUIDS = {
    "service": "A3D10000-7A4B-4B82-9C52-57534F533530",
    "bootstrap": "A3D10001-7A4B-4B82-9C52-57534F533530",
    "device_event": "A3D10002-7A4B-4B82-9C52-57534F533530",
    "phone_command": "A3D10003-7A4B-4B82-9C52-57534F533530",
    "device_state": "A3D10004-7A4B-4B82-9C52-57534F533530",
}

EXPECTED_EVENTS = {
    "hello",
    "lan.handoff",
    "camera.request",
    "tts.request",
    "notification.request",
    "ping",
}

EXPECTED_COMMANDS = {
    "hello",
    "camera.result",
    "tts.result",
    "notification.result",
    "lan.ready",
    "pong",
}


def fail(message: str) -> None:
    raise SystemExit(f"Workshop Companion protocol validation failed: {message}")


def text(path: Path) -> str:
    if not path.exists():
        fail(f"missing {path.relative_to(ROOT)}")
    return path.read_text(encoding="utf-8")


def require_all(source_name: str, source: str, values: set[str]) -> None:
    missing = sorted(value for value in values if value not in source)
    if missing:
        fail(f"{source_name} missing: {', '.join(missing)}")


def main() -> None:
    spec = text(SPEC)
    header = text(HEADER)
    swift = text(SWIFT)

    if "Protocol version: `1`" not in spec:
        fail("spec protocol version is not 1")
    if not re.search(r"#define\s+WORKSHOP_COMPANION_PROTOCOL_VERSION\s+1\b", header):
        fail("firmware header protocol version is not 1")
    if not re.search(r"static\s+let\s+version\s*=\s*1\b", swift):
        fail("Swift protocol version is not 1")

    header_uuid_names = {
        "service": "WORKSHOP_COMPANION_SERVICE_UUID",
        "bootstrap": "WORKSHOP_COMPANION_BOOTSTRAP_UUID",
        "device_event": "WORKSHOP_COMPANION_DEVICE_EVENT_UUID",
        "phone_command": "WORKSHOP_COMPANION_PHONE_COMMAND_UUID",
        "device_state": "WORKSHOP_COMPANION_DEVICE_STATE_UUID",
    }
    swift_uuid_names = {
        "service": "serviceUUID",
        "bootstrap": "bootstrapUUID",
        "device_event": "deviceEventUUID",
        "phone_command": "phoneCommandUUID",
        "device_state": "deviceStateUUID",
    }

    for key, value in EXPECTED_UUIDS.items():
        if value not in spec:
            fail(f"spec missing {key} UUID {value}")
        header_pattern = rf'#define\s+{header_uuid_names[key]}\s+\\?\s*\n?\s*"{re.escape(value)}"'
        if not re.search(header_pattern, header):
            fail(f"header {key} UUID drift")
        swift_pattern = rf'static\s+let\s+{swift_uuid_names[key]}\s*=\s*CBUUID\(string:\s*"{re.escape(value)}"\)'
        if not re.search(swift_pattern, swift):
            fail(f"Swift {key} UUID drift")

    require_all("spec", spec, EXPECTED_EVENTS | EXPECTED_COMMANDS)
    require_all("firmware header", header, EXPECTED_EVENTS | EXPECTED_COMMANDS)
    require_all("Swift model", swift, EXPECTED_EVENTS | EXPECTED_COMMANDS)

    if "auth == \"portal-session\"" not in text(ROOT / "companion/ios/WorkshopCompanion/BLECentral.swift"):
        fail("Swift central no longer enforces portal-session bootstrap auth")

    plist = plistlib.loads(PLIST.read_bytes())
    for key in ("NSBluetoothAlwaysUsageDescription", "NSCameraUsageDescription", "NSLocalNetworkUsageDescription"):
        if not plist.get(key):
            fail(f"Info.plist missing {key}")
    modes = set(plist.get("UIBackgroundModes", []))
    if "bluetooth-central" not in modes:
        fail("Info.plist missing bluetooth-central background mode")

    print("Workshop Companion protocol parity passed")


if __name__ == "__main__":
    main()
