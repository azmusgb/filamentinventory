#!/usr/bin/env python3
from pathlib import Path
import argparse

from apply_smart_home_secret_safe_backups_v8_2 import apply as apply_secret_safe_backups
from apply_smart_home_code_only_auth_v8_3 import apply as apply_code_only_auth
from apply_smart_home_system_stability_v8_3_rc2 import apply as apply_system_stability
from apply_smart_home_session_auth_v8_3_rc3 import apply as apply_session_auth
from apply_smart_home_session_route_compat_v8_3_rc3 import apply as apply_session_route_compat
from apply_smart_home_release_identity_v8_3_rc3 import apply as apply_rc3_identity


class PatchError(RuntimeError):
    pass


def replace_once(text: str, old: str, new: str, name: str) -> str:
    count = text.count(old)
    if count != 1:
        raise PatchError(f"{name}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)


def apply(repo: Path) -> None:
    p = repo / "src" / "web_server.cpp"
    text = p.read_text(encoding="utf-8")

    replacements = [
        ('  server.on("/power/stats",  HTTP_GET, handleGetPowerStats);\n', '  SECURE_GET("/power/stats", handleGetPowerStats);\n', "power stats route"),
        ('  server.on("/led/test",    HTTP_POST, handleLedTest);\n', '  SECURE_POST("/led/test", handleLedTest);\n', "LED test route"),
        ('  server.on("/ota/slots",    HTTP_GET,  handleOtaSlots);\n', '  SECURE_GET("/ota/slots", handleOtaSlots);\n', "OTA slots route"),
        ('  server.on("/ota/auto",   HTTP_POST, handleOtaAuto);\n', '  SECURE_POST("/ota/auto", handleOtaAuto);\n', "OTA auto route"),
        ('  server.on("/ota/status", HTTP_GET,  handleOtaStatus);\n', '  SECURE_GET("/ota/status", handleOtaStatus);\n', "OTA status route"),
    ]

    for old, new, name in replacements:
        if old in text:
            text = replace_once(text, old, new, name)
        elif new not in text:
            raise PatchError(f"{name}: neither insecure nor secured form found")

    p.write_text(text, encoding="utf-8")

    # Compose the post-v8 hardening increments in deterministic order.
    # v8.3 strips wrapped credential serialization calls and then asserts no
    # password/save fields remain before the firmware is allowed to build.
    # RC2 removes the full-frame System redraw found on physical WS350.
    # RC3 replaces browser Digest challenges with a RAM-only session login,
    # pauses background polling during OTA so the ESP32 single-client server can
    # complete the upload/response without authentication races, exposes the
    # two intentional public login routes for static auditability, and marks the
    # physical build explicitly as RC3.
    apply_secret_safe_backups(repo)
    apply_code_only_auth(repo)
    apply_system_stability(repo)
    apply_session_auth(repo)
    apply_session_route_compat(repo)
    apply_rc3_identity(repo)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if not args.apply:
        raise SystemExit("Pass --apply")
    apply(Path(args.repo))
    print("Smart Home v8.3 RC3: hardening + backups + code-only Bambu auth + display stability + portal sessions + explicit login routes + OTA reliability + RC3 provenance applied")
