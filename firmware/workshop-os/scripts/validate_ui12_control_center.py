#!/usr/bin/env python3
"""Validate the reconstructed Workshop OS v11.27 UI12 Control Center source."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def block_end(text: str, start: int) -> int:
    brace = text.find("{", start)
    if brace < 0:
        raise SystemExit("opening brace missing")
    depth = 0; string = None; escape = False; line = False; block = False; i = brace
    while i < len(text):
        c = text[i]; n = text[i + 1] if i + 1 < len(text) else ""
        if line:
            if c == "\n": line = False
        elif block:
            if c == "*" and n == "/": block = False; i += 1
        elif string:
            if escape: escape = False
            elif c == "\\": escape = True
            elif c == string: string = None
        elif c == "/" and n == "/": line = True; i += 1
        elif c == "/" and n == "*": block = True; i += 1
        elif c in ('"', "'"): string = c
        elif c == "{": depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0: return i + 1
        i += 1
    raise SystemExit("unterminated block")


def function(text: str, signature: str) -> str:
    start = text.find(signature)
    if start < 0:
        raise SystemExit(f"missing function/block: {signature}")
    return text[start:block_end(text, start)]


def need(body: str, needle: str, label: str) -> None:
    if needle not in body:
        raise SystemExit(f"MISSING {label}: {needle}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    args = ap.parse_args()
    repo = Path(args.repo).resolve()
    source_root = Path(__file__).resolve().parents[1]

    build = (repo / "include" / "smart_home_build.h").read_text(encoding="utf-8")
    hub = (repo / "src" / "smart_hub.cpp").read_text(encoding="utf-8")
    web = (repo / "src" / "web_server.cpp").read_text(encoding="utf-8")
    sec = (repo / "src" / "security_manager.cpp").read_text(encoding="utf-8")
    mqtt = (repo / "src" / "bambu_mqtt.cpp").read_text(encoding="utf-8")
    capture = (source_root / "scripts" / "capture-ws350-views.zsh").read_text(encoding="utf-8")

    for marker in (
        '#define SMART_HOME_VERSION "v11.27"',
        '#define SMART_HOME_BUILD_LABEL "Workshop OS v11.27 UI12 Control Center"',
        '#define SMART_HOME_PROFILE "control-center-ui12"',
        '#define WORKSHOP_OS_UI_SCHEMA "UI12"',
        '#define WORKSHOP_OS_V11_27_UI12 1',
    ):
        need(build, marker, "UI12 build identity")

    for marker in (
        'static const char* labels[4]={"Home","Printer","Tools","Settings"};',
        'drawHeader("Tools",nullptr,2);',
        "hubUi12SettingsRect", "drawUi12Experience", "drawUi12PrinterConnection", "drawUi12SoftwareUpdate",
        "drawUi12PortalAccess", "hubUi12SystemPortalRect", "g_ui12SystemView",
        '"Experience"', '"Network"', '"Printer Connection"', '"Software Update"', '"System"',
        "for(uint8_t i=0;i<5;i++)if(hubUi12SettingsRect(i).contains(x,y))",
        "hubUi12SystemPortalRect().contains(x,y)",
        "static const uint8_t HUB_NETWORK_PAGE_COUNT = 7;",
        "Hold to Apply", "Hold to Stop",
        "UI12-H", "UI12-P", "UI12-T", "UI12-M", "UI12-S",
    ):
        need(hub, marker, "UI12 interaction contract")

    system = function(hub, "static void drawSystem(bool full) {")
    if "securityPortalCode()" in system:
        raise SystemExit("primary System screen must not expose portal code")
    if "Local Portal" in system and "hubUi12SystemPortalRect" not in system:
        raise SystemExit("System Local Portal affordance is not explicit/touchable")

    portal = function(hub, "static void drawUi12PortalAccess() {")
    need(portal, "securityPortalCode()", "deliberate portal access code")
    need(portal, "Code changes after every reboot", "portal-code lifecycle")
    need(portal, "Authenticated Administration", "portal purpose")

    update = function(hub, "static void drawUi12SoftwareUpdate() {")
    for forbidden in ("Full", "0x0", "Install Now", "Download & Install"):
        if forbidden in update:
            raise SystemExit(f"software update UI implies unsupported/recovery behavior: {forbidden}")
    need(update, "On-device installation is not enabled in this build", "honest update capability")

    # The physical-view capture surface must be deterministic for nested UI12
    # views. Capturing System after Local Portal must reset nested state rather
    # than accidentally retaining credential-bearing presentation.
    show = function(hub, "bool smartHubShowPage(const char* pageName) {")
    for page in ("settings-experience", "settings-printer", "settings-update", "system-portal"):
        need(show, f'if (strcmp(pageName, "{page}") == 0)', "UI12 deterministic capture route")
    system_route = function(show, 'if (strcmp(pageName, "system") == 0) {')
    need(system_route, "g_ui12SystemView = 0;", "System capture state reset")

    # v11.23 expands system-network into kNetworkPages, so the acceptance check
    # validates the loop that owns all seven network pages rather than a removed
    # legacy direct branch.
    need(show, 'static const char* const kNetworkPages[]', "network capture route table")
    network_route = function(show, 'if(strcmp(pageName,kNetworkPages[i])==0) {')
    need(network_route, "g_ui12SystemView = 0;", "Network capture state reset")
    for page in ("system-network", "system-time-locale", "system-network-address", "system-network-review"):
        need(show, f'"{page}"', "network capture page")

    portal_route = function(show, 'if (strcmp(pageName, "system-portal") == 0) {')
    need(portal_route, "g_ui12SystemView = 1;", "Local Portal capture state")
    hardware_pos = show.find("static const char* const kHardwarePages[]")
    if hardware_pos < 0:
        raise SystemExit("missing hardware capture routes")
    need(show[hardware_pos:], "g_ui12SystemView = 0;", "hardware capture state reset")

    for marker in (
        'R"json({"version":2,"views":[',
        '{"id":"workshop","label":"Tools","group":"Primary"}',
        '{"id":"more","label":"Settings","group":"Primary"}',
        '{"id":"settings-experience","label":"Experience","group":"Settings"}',
        '{"id":"settings-printer","label":"Printer Connection","group":"Settings"}',
        '{"id":"settings-update","label":"Software Update","group":"Settings"}',
        '{"id":"system-portal","label":"Local Portal","group":"System","sensitive":"portal-code"}',
    ):
        need(web, marker, "UI12 capture catalog v2")

    # Retained visual evidence must be secret-safe for both UI12 catalog v2 and
    # accepted older catalog v1 firmware. Unknown sensitivity/geometry fails closed.
    for marker in (
        "catalog_version = int(sys.argv[6])",
        "sensitivity != 'portal-code'",
        "view_id != 'system-portal'",
        "catalog_version == 1 and view_id == 'system'",
        "redaction = (236, 146, 472, 192)",
        "redaction = (330, 196, 468, 230)",
        "Unsupported capture catalog version",
        "Raw framebuffer bytes exist only in a mode-0600 temporary file",
    ):
        need(capture, marker, "secret-safe UI12 capture tooling")

    # Authentication authority is security_manager.cpp, not a presentation helper
    # in smart_hub.cpp. UI12 moves code visibility behind a deliberate Local Portal
    # subview while preserving fail-closed session/origin checks.
    for marker in ("return cookieMatches(server);", "if (mutating && !sameOrigin(server))"):
        need(sec, marker, "portal security")
    for marker in ("DROPPED: MQTT offline", "if (!st.connected) return false"):
        need(mqtt, marker, "fail-closed printer control")

    for forbidden in ("TEST / NO CODE", "matchSpoolByColor", "matchSpoolByMaterial", "resolveSpool", "requestSpeedCommand", "requestFanCommand"):
        if forbidden in hub or forbidden in mqtt:
            raise SystemExit(f"forbidden implementation marker: {forbidden}")

    # Do not publish UI12 with placeholder release metadata. The currently published
    # v11.26 hardware candidate remains locked until a real UI12 binary exists.
    manifest = json.loads((source_root / "releases" / "device-update.json").read_text(encoding="utf-8"))
    stable = manifest["channels"]["stable"]
    candidate = manifest["channels"]["candidate"]
    if stable["release"] != "production-workshop-os-v11.19.1":
        raise SystemExit("stable channel changed during UI12 source work")
    if candidate["release"] != "workshop-os-v11.26-ui11-cupertino" or candidate["version"] != "11.26":
        raise SystemExit("UI12 source work must not replace the published v11.26 candidate without an exact artifact")
    if candidate["ota"]["sha256"] != "ed96f780b58af2fd353f45a4df442abd27d5065c520dff757c346abddeac8fc2":
        raise SystemExit("published candidate artifact identity changed")

    fragment = (source_root / "firmware" / "ui-v11.27-ui12" / "more_system.cppfrag").read_text(encoding="utf-8")
    for required in (
        "hr(8,44,228,62)", "hr(244,44,W-252,62)", "hr(8,184,W-16,76)",
        "hr(8,212,112,48)", "hr(128,212,W-136,48)",
    ):
        need(fragment, required, "480x320 touch geometry")

    print("Workshop OS v11.27 UI12 Control Center validation: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
