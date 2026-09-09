#!/usr/bin/env python3
"""Apply Workshop OS v11.27 UI12 Settings / Control Center after v11.26 UI11.

UI12 changes the device information architecture and settings presentation only.
It preserves printer command semantics, the seven-page guarded network workflow,
portal authentication, recovery boundaries, inventory non-inference, and the
published release manifest. It does not implement an on-device OTA installer.
"""
from __future__ import annotations

import argparse
from pathlib import Path


class PatchError(RuntimeError):
    pass


def load(path: Path) -> str:
    if not path.is_file():
        raise PatchError(f"missing {path}")
    return path.read_text(encoding="utf-8")


def once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise PatchError(f"{label}: expected one anchor, found {count}")
    return text.replace(old, new, 1)


def block_end(text: str, start: int) -> int:
    brace = text.find("{", start)
    if brace < 0:
        raise PatchError("opening brace missing")
    depth = 0
    string = None
    escape = False
    line_comment = False
    block_comment = False
    i = brace
    while i < len(text):
        c = text[i]
        n = text[i + 1] if i + 1 < len(text) else ""
        if line_comment:
            if c == "\n":
                line_comment = False
        elif block_comment:
            if c == "*" and n == "/":
                block_comment = False
                i += 1
        elif string:
            if escape:
                escape = False
            elif c == "\\":
                escape = True
            elif c == string:
                string = None
        elif c == "/" and n == "/":
            line_comment = True
            i += 1
        elif c == "/" and n == "*":
            block_comment = True
            i += 1
        elif c in ('"', "'"):
            string = c
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    raise PatchError("unterminated block")


def replace_block(text: str, signature: str, replacement: str, label: str) -> str:
    start = text.find(signature)
    if start < 0 or text.find(signature, start + 1) >= 0:
        raise PatchError(f"{label}: signature missing/non-unique: {signature}")
    return text[:start] + replacement.rstrip() + text[block_end(text, start):]


def sections(source_root: Path) -> dict[str, str]:
    path = source_root / "firmware" / "ui-v11.27-ui12" / "more_system.cppfrag"
    text = load(path)
    values: dict[str, str] = {}
    for name in ("MORE", "SYSTEM"):
        start = f"@@{name}@@"
        end = f"@@END_{name}@@"
        if start not in text or end not in text:
            raise PatchError(f"UI12 fragment missing {name}")
        values[name] = text.split(start, 1)[1].split(end, 1)[0].strip("\n")
    return values


def patch_more_touch(hub: str) -> str:
    needle = "for(uint8_t i=0;i<4;i++)if(hubV1125MoreRect(i).contains(x,y)){"
    start = hub.find(needle)
    if start < 0 or hub.find(needle, start + 1) >= 0:
        raise PatchError("More root touch loop missing/non-unique")
    end = block_end(hub, start)
    replacement = r'''if(g_ui12SettingsView){
      if(hubUi12BackRect().contains(x,y)){g_ui12SettingsView=0;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
      if(g_ui12SettingsView==1){
        if(hubUi12ExperienceRect(0).contains(x,y)){g_displayExperienceView=true;g_displayExperiencePage=0;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        if(hubUi12ExperienceRect(1).contains(x,y)){g_ui12SettingsView=0;g_ui12SystemView=0;g_networkSettingsView=false;g_audioSettingsView=true;g_audioSettingsPage=0;setPage(SCREEN_HUB_SYSTEM);buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
      }else if(g_ui12SettingsView==2&&hubUi12SubActionRect().contains(x,y)){g_ui12SettingsView=0;setPage(SCREEN_HUB_PRINTER);buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
      return true;
    }
    for(uint8_t i=0;i<5;i++)if(hubUi12SettingsRect(i).contains(x,y)){
      g_displayExperienceView=false;g_toolsView=false;g_ui12SettingsView=0;g_ui12SystemView=0;
      if(i==0){g_ui12SettingsView=1;g_dirty=true;buzzerPlay(BUZZ_CLICK);}
      else if(i==1){g_audioSettingsView=false;g_networkSettingsView=true;g_networkSettingsPage=0;g_networkEditLoaded=false;setPage(SCREEN_HUB_SYSTEM);g_dirty=true;buzzerPlay(BUZZ_CLICK);}
      else if(i==2){g_ui12SettingsView=2;g_dirty=true;buzzerPlay(BUZZ_CLICK);}
      else if(i==3){g_ui12SettingsView=3;g_dirty=true;buzzerPlay(BUZZ_CLICK);}
      else{g_audioSettingsView=false;g_networkSettingsView=false;setPage(SCREEN_HUB_SYSTEM);g_dirty=true;buzzerPlay(BUZZ_CLICK);}
      return true;
    }'''
    return hub[:start] + replacement + hub[end:]


def inject_system_navigation(hub: str) -> str:
    needle = "if(cur==SCREEN_HUB_SYSTEM){"
    start = hub.find(needle)
    if start < 0 or hub.find(needle, start + 1) >= 0:
        raise PatchError("System touch handler missing/non-unique")
    insert = start + len(needle)
    code = r'''
    if(!g_audioSettingsView&&!g_networkSettingsView&&g_ui12SystemView==1){
      if(hubUi12SystemBackRect().contains(x,y)){g_ui12SystemView=0;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
      return true;
    }
    if(!g_audioSettingsView&&!g_networkSettingsView&&hubUi12SystemBackRect().contains(x,y)){g_ui12SystemView=0;g_ui12SettingsView=0;setPage(SCREEN_HUB_MORE);buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
    if(!g_audioSettingsView&&!g_networkSettingsView&&hubUi12SystemPortalRect().contains(x,y)){g_ui12SystemView=1;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}'''
    return hub[:insert] + code + hub[insert:]


def inject_capture_state(hub: str, marker: str, label: str) -> str:
    """Reset UI12 nested System state without depending on legacy formatting."""
    start = hub.find(marker)
    if start < 0 or hub.find(marker, start + 1) >= 0:
        raise PatchError(f"{label}: marker missing/non-unique: {marker}")
    end = block_end(hub, start)
    block = hub[start:end]
    state = "g_ui12SystemView = 0;"
    if state in block:
        return hub
    brace = hub.find("{", start, end)
    if brace < 0:
        raise PatchError(f"{label}: opening brace missing")
    return hub[:brace + 1] + "\n    " + state + hub[brace + 1:]


def patch_capture_contract(repo: Path, hub: str) -> str:
    """Make the physical framebuffer capture surface deterministic for UI12.

    The v11.18 capture API predates nested UI12 settings. Add explicit capture
    routes and reset nested state when older System routes are requested. The
    catalog advertises the one credential-bearing view so retention tooling can
    redact it before writing any PPM/PNG evidence.
    """
    hub = inject_capture_state(
        hub,
        'if (strcmp(pageName, "system") == 0)',
        "UI12 deterministic system capture",
    )
    # v11.23 replaced the original direct system-network branch with a loop over
    # kNetworkPages. Reset nested System state for every expert network page.
    hub = inject_capture_state(
        hub,
        'if(strcmp(pageName,kNetworkPages[i])==0)',
        "UI12 deterministic network capture",
    )
    hub = inject_capture_state(
        hub,
        'if (strcmp(pageName, kHardwarePages[i]) == 0)',
        "UI12 deterministic hardware capture",
    )

    capture_routes = r'''  if (strcmp(pageName, "settings-experience") == 0) {
    setPage(SCREEN_HUB_MORE);
    g_toolsView = false;
    g_displayExperienceView = false;
    g_displayExperiencePage = 0;
    g_ui12SystemView = 0;
    g_ui12SettingsView = 1;
    g_dirty = true;
    return true;
  }

  if (strcmp(pageName, "settings-printer") == 0) {
    setPage(SCREEN_HUB_MORE);
    g_toolsView = false;
    g_displayExperienceView = false;
    g_displayExperiencePage = 0;
    g_ui12SystemView = 0;
    g_ui12SettingsView = 2;
    g_dirty = true;
    return true;
  }

  if (strcmp(pageName, "settings-update") == 0) {
    setPage(SCREEN_HUB_MORE);
    g_toolsView = false;
    g_displayExperienceView = false;
    g_displayExperiencePage = 0;
    g_ui12SystemView = 0;
    g_ui12SettingsView = 3;
    g_dirty = true;
    return true;
  }

  if (strcmp(pageName, "system-portal") == 0) {
    setPage(SCREEN_HUB_SYSTEM);
    g_ui12SettingsView = 0;
    g_networkSettingsView = false;
    g_audioSettingsView = false;
    g_audioSettingsPage = 0;
    g_ui12SystemView = 1;
    g_dirty = true;
    return true;
  }

'''
    anchor = '  if (strcmp(pageName, "custom") == 0) { setPage(SCREEN_HUB_CUSTOM); return true; }\n'
    hub = once(hub, anchor, capture_routes + anchor, "UI12 nested capture routes")

    web_path = repo / "src" / "web_server.cpp"
    web = load(web_path)
    web = once(
        web,
        'R"json({"version":1,"views":[',
        'R"json({"version":2,"views":[',
        "UI12 capture catalog version",
    )
    web = once(
        web,
        '{"id":"workshop","label":"Workshop","group":"Primary"},',
        '{"id":"workshop","label":"Tools","group":"Primary"},',
        "UI12 capture Tools label",
    )
    web = once(
        web,
        '{"id":"more","label":"More","group":"Primary"},',
        '''{"id":"more","label":"Settings","group":"Primary"},
    {"id":"settings-experience","label":"Experience","group":"Settings"},
    {"id":"settings-printer","label":"Printer Connection","group":"Settings"},
    {"id":"settings-update","label":"Software Update","group":"Settings"},''',
        "UI12 capture Settings catalog",
    )
    web = once(
        web,
        '{"id":"system","label":"System","group":"Primary"},',
        '''{"id":"system","label":"System","group":"Primary"},
    {"id":"system-portal","label":"Local Portal","group":"System","sensitive":"portal-code"},''',
        "UI12 sensitive portal capture catalog",
    )
    web_path.write_text(web, encoding="utf-8")
    return hub


def patch(repo: Path) -> None:
    source_root = Path(__file__).resolve().parent
    fragments = sections(source_root)

    build_path = repo / "include" / "smart_home_build.h"
    build = load(build_path)
    build = once(build, '#define SMART_HOME_VERSION "v11.25"', '#define SMART_HOME_VERSION "v11.27"', "UI12 version")
    build = once(build, '#define SMART_HOME_BUILD_LABEL "Workshop OS v11.26 UI11 Cupertino"', '#define SMART_HOME_BUILD_LABEL "Workshop OS v11.27 UI12 Control Center"', "UI12 build label")
    build = once(build, '#define SMART_HOME_PROFILE "cupertino-ui11"', '#define SMART_HOME_PROFILE "control-center-ui12"', "UI12 profile")
    build = once(build, '#define WORKSHOP_OS_UI_SCHEMA "UI11"', '#define WORKSHOP_OS_UI_SCHEMA "UI12"', "UI12 schema")
    if "WORKSHOP_OS_V11_27_UI12" not in build:
        build += "\n#define WORKSHOP_OS_V11_27_UI12 1\n"
    build_path.write_text(build, encoding="utf-8")

    hub_path = repo / "src" / "smart_hub.cpp"
    hub = load(hub_path)
    hub = once(
        hub,
        "bool g_toolsView = false;",
        "bool g_toolsView = false;\nuint8_t g_ui12SettingsView = 0; // 0 root, 1 experience, 2 printer connection, 3 software update\nuint8_t g_ui12SystemView = 0; // 0 system root, 1 deliberate Local Portal access",
        "UI12 settings state",
    )

    # Any pre-existing route back to More should land on the Settings root.
    if "setPage(SCREEN_HUB_MORE);" not in hub:
        raise PatchError("no More navigation routes found")
    hub = hub.replace("setPage(SCREEN_HUB_MORE);", "g_ui12SettingsView=0;g_ui12SystemView=0;setPage(SCREEN_HUB_MORE);")

    hub = replace_block(hub, "static void drawMore(bool full) {", fragments["MORE"], "UI12 Settings")
    hub = replace_block(hub, "static void drawSystem(bool full) {", fragments["SYSTEM"], "UI12 System")
    hub = patch_more_touch(hub)
    hub = inject_system_navigation(hub)

    hub = once(hub, 'static const char* labels[4]={"Home","Printer","Workshop","Settings"};', 'static const char* labels[4]={"Home","Printer","Tools","Settings"};', "UI12 bottom navigation")
    hub = once(hub, 'drawHeader("Workshop",nullptr,2);', 'drawHeader("Tools",nullptr,2);', "UI12 Tools title")

    for old, new in (("UI11-H", "UI12-H"), ("UI11-P", "UI12-P"), ("UI11-W", "UI12-T"), ("UI11-M", "UI12-M"), ("UI11-S", "UI12-S")):
        hub = once(hub, f'"{old}"', f'"{new}"', f"fingerprint {old}")
    hub = once(hub, 'default: return "UI11";', 'default: return "UI12";', "default UI fingerprint")

    # Extend the existing authenticated physical-view capture contract only after
    # UI12's global More-route reset has run, so deterministic nested routes keep
    # the explicit state they assign below.
    hub = patch_capture_contract(repo, hub)

    required = (
        "hubUi12SettingsRect", "drawUi12Experience", "drawUi12PrinterConnection", "drawUi12SoftwareUpdate",
        "drawUi12PortalAccess", "hubUi12SystemPortalRect", "securityPortalCode()",
        "settings-experience", "settings-printer", "settings-update", "system-portal",
        "Printer Connection", "Software Update", "authenticated Local Portal", "HUB_NETWORK_PAGE_COUNT = 7",
        "Hold to Apply", "UI12-H", "UI12-P", "UI12-T", "UI12-M", "UI12-S",
    )
    for marker in required:
        if marker not in hub:
            raise PatchError(f"UI12 lost required marker: {marker}")
    for forbidden in ("TEST / NO CODE", "matchSpoolByColor", "matchSpoolByMaterial", "resolveSpool"):
        if forbidden in hub:
            raise PatchError(f"forbidden UI12 marker present: {forbidden}")

    # Primary System must not expose the access code. It is available only through
    # the deliberate Local Portal subview, while authentication authority remains
    # in security_manager.cpp.
    sys_start = hub.find("static void drawSystem(bool full) {")
    sys_end = block_end(hub, sys_start)
    if "securityPortalCode()" in hub[sys_start:sys_end]:
        raise PatchError("primary System screen exposes portal code")
    portal_start = hub.find("static void drawUi12PortalAccess() {")
    portal_end = block_end(hub, portal_start)
    if "securityPortalCode()" not in hub[portal_start:portal_end]:
        raise PatchError("Local Portal access subview lost portal code")

    hub_path.write_text(hub, encoding="utf-8")
    print("Workshop OS v11.27 UI12 Control Center applied")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if not args.apply:
        raise SystemExit("refusing to modify source without --apply")
    patch(Path(args.repo).resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
