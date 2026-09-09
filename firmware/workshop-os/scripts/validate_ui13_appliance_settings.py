#!/usr/bin/env python3
"""Validate reconstructed Workshop OS v11.28 UI13 Appliance Settings source."""
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


def forbid(body: str, needle: str, label: str) -> None:
    if needle in body:
        raise SystemExit(f"FORBIDDEN {label}: {needle}")


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

    for marker in (
        '#define SMART_HOME_VERSION "v11.28"',
        '#define SMART_HOME_BUILD_LABEL "Workshop OS v11.28 UI13 Appliance Settings"',
        '#define SMART_HOME_PROFILE "appliance-settings-ui13"',
        '#define WORKSHOP_OS_UI_SCHEMA "UI13"',
        '#define WORKSHOP_OS_V11_28_UI13 1',
    ):
        need(build, marker, "UI13 build identity")

    for marker in (
        'static const char* labels[4]={"Home","Printer","Tools","Settings"};',
        'drawHeader("Tools",nullptr,2);',
        '"Display & Appearance"', '"Sounds & Alerts"', '"Network"', '"Printer & Power"', '"System"',
        "drawUi13Display", "drawUi13Sound", "drawUi13Network", "drawUi13PrinterPower",
        "drawUi13DateTime", "drawUi13SoftwareUpdate", "drawUi13Diagnostics",
        "drawUi13PrinterAlerts", "drawUi13AlertSignals", "drawUi13AutoOffConfirm",
        "hubUi13ToggleRow", "hubUi13StepperRow", "hubUi13InfoRow",
        "UI13-H", "UI13-P", "UI13-T", "UI13-M", "UI13-S",
    ):
        need(hub, marker, "UI13 interaction contract")

    # Scope interaction checks to the active UI13 settings branch. Older guarded
    # service/compatibility surfaces may still contain long-press semantics, but
    # normal Settings must not depend on them or route into legacy carousels.
    settings_touch = function(hub, "if(g_ui12SettingsView){")
    forbid(settings_touch, "g_networkSettingsView=true", "legacy network carousel route")
    forbid(settings_touch, "g_audioSettingsView=true", "legacy hardware carousel route")
    forbid(settings_touch, "longPress", "routine hidden hold behavior")

    # Network is intentionally everyday-only. Static addressing remains an
    # advanced Local Portal/service concern and must not appear on normal UI13
    # Network presentation. mDNS is intentionally allowed as the simple local
    # hostname-advertisement toggle; a standalone DNS editor is not.
    network = function(hub, "static void drawUi13Network() {")
    for forbidden in ("IP ADDRESS", "GATEWAY", "SUBNET", '"DNS"', "STATIC", "OCTET"):
        forbid(network, forbidden, "advanced network editor on normal Network screen")
    for marker in ("Wi-Fi", "Local Hostname", "Show IP at Startup", "Local Portal"):
        need(network, marker, "everyday Network surface")

    # Date/time is a System concept, not Network.
    date_time = function(hub, "static void drawUi13DateTime() {")
    for marker in ("Time Zone", "24-Hour Time", "Date Format"):
        need(date_time, marker, "System Date & Time")
    forbid(network, "Time Zone", "timezone on Network")
    forbid(network, "Date Format", "date format on Network")

    # Alerts are unified under one normal user path rather than being split by
    # implementation subsystem.
    sounds = function(hub, "static void drawUi13Sound() {")
    alerts = function(hub, "static void drawUi13PrinterAlerts() {")
    signals = function(hub, "static void drawUi13AlertSignals() {")
    for marker in ("Event Sounds", "Touch Sounds", "Bed Cooled Alert", "Printer Alerts"):
        need(sounds, marker, "Sounds & Alerts")
    for marker in ("Printer Errors", "Severity", "Presentation"):
        need(alerts, marker, "Printer Alerts")
    for marker in ("Alert Sound", "Status Light", "Wake Display"):
        need(signals, marker, "Alert Signals")

    # Power automation is no longer hidden inside Sound/Hardware. First-time
    # enable has a deliberate confirmation, while engineering plug details stay
    # in the Local Portal.
    printer_power = function(hub, "static void drawUi13PrinterPower() {")
    power_options = function(hub, "static void drawUi13PowerOptions() {")
    power_confirm = function(hub, "static void drawUi13AutoOffConfirm() {")
    for marker in ("Smart Plug", "Automatic Power Off", "Power Options"):
        need(printer_power, marker, "Printer & Power")
    for marker in ("Auto-Off Delay", "Cancel on Door", "Advanced Power Setup", "Local Portal"):
        need(power_options, marker, "Power Options")
    for marker in ("Enable Auto-Off?", "Automatic printer power-off", "Cancel", "Enable"):
        need(power_confirm, marker, "auto-off confirmation")
    for forbidden in ("POLL INTERVAL", "LED DRIVER", "GPIO & COLORS"):
        forbid(printer_power + power_options, forbidden, "engineering control on normal power surface")

    # Device health and connectivity are intentionally distinct. Wi-Fi/printer
    # outages must not make the hardware itself report unhealthy.
    system = function(hub, "static void drawSystem(bool full) {")
    diagnostics = function(hub, "static void drawUi13Diagnostics() {")
    need(system, "Device Health", "System device health")
    need(system, "Connectivity", "System connectivity")
    need(system, "const bool deviceHealthy=touchOk&&recoveryOk", "health/connectivity separation")
    need(diagnostics, "Connectivity is separate from device health", "diagnostics health semantics")

    # Update UI stays truthful until a real device-native installer exists.
    update = function(hub, "static void drawUi13SoftwareUpdate() {")
    need(update, "On-device install is not enabled in this build", "honest update capability")
    for forbidden in ("Full", "0x0", "Install Now", "Download & Install"):
        forbid(update, forbidden, "unsupported/recovery update behavior")

    # Primary System must not expose the rotating credential. It remains only in
    # the deliberate Local Portal view, with security authority in the security
    # layer rather than presentation code.
    forbid(system, "securityPortalCode()", "portal code on primary System")
    portal = function(hub, "static void drawUi12PortalAccess() {")
    need(portal, "securityPortalCode()", "deliberate Local Portal credential")
    for marker in ("return cookieMatches(server);", "if (mutating && !sameOrigin(server))"):
        need(sec, marker, "portal security")

    # Preserve source-of-truth and fail-closed printer boundaries.
    for forbidden in ("matchSpoolByColor", "matchSpoolByMaterial", "resolveSpool", "TEST / NO CODE"):
        if forbidden in hub or forbidden in mqtt:
            raise SystemExit(f"forbidden implementation marker: {forbidden}")
    for marker in ("DROPPED: MQTT offline", "if (!st.connected) return false"):
        need(mqtt, marker, "fail-closed printer control")

    # The physical framebuffer capture catalog must expose the new appliance
    # surfaces while preserving the secret-sensitive Local Portal marker.
    show = function(hub, "bool smartHubShowPage(const char* pageName) {")
    for page in (
        "settings-display", "settings-sounds", "settings-network", "settings-printer-power",
        "system-date-time", "system-update", "system-diagnostics", "system-portal",
    ):
        need(show, f'"{page}"', "UI13 deterministic capture route")
    for marker in (
        '{"id":"settings-display","label":"Display & Appearance","group":"Settings"}',
        '{"id":"settings-sounds","label":"Sounds & Alerts","group":"Settings"}',
        '{"id":"settings-network","label":"Network","group":"Settings"}',
        '{"id":"settings-printer-power","label":"Printer & Power","group":"Settings"}',
        '{"id":"system-date-time","label":"Date & Time","group":"System"}',
        '{"id":"system-update","label":"Software Update","group":"System"}',
        '{"id":"system-diagnostics","label":"Diagnostics","group":"System"}',
        '{"id":"system-portal","label":"Local Portal","group":"System","sensitive":"portal-code"}',
    ):
        need(web, marker, "UI13 capture catalog")

    # Release metadata is deliberately unchanged by source work.
    manifest = json.loads((source_root / "releases" / "device-update.json").read_text(encoding="utf-8"))
    stable = manifest["channels"]["stable"]
    candidate = manifest["channels"]["candidate"]
    if stable["release"] != "production-workshop-os-v11.19.1":
        raise SystemExit("stable channel changed during UI13 source work")
    if candidate["release"] != "workshop-os-v11.26-ui11-cupertino" or candidate["version"] != "11.26":
        raise SystemExit("UI13 source work changed the published candidate")
    if candidate["ota"]["sha256"] != "ed96f780b58af2fd353f45a4df442abd27d5065c520dff757c346abddeac8fc2":
        raise SystemExit("published candidate artifact identity changed")

    print("Workshop OS v11.28 UI13 Appliance Settings validation: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
