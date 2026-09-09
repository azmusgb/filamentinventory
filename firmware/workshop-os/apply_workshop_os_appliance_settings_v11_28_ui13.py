#!/usr/bin/env python3
"""Apply Workshop OS v11.28 UI13 appliance settings after v11.27 UI12.

UI13 keeps UI12's authority, authentication, recovery and printer-control
boundaries, but replaces the transitional settings wrappers with a coherent
appliance information architecture and explicit touch controls.
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
    raise PatchError("unterminated block")


def replace_block(text: str, signature: str, replacement: str, label: str) -> str:
    start = text.find(signature)
    if start < 0 or text.find(signature, start + 1) >= 0:
        raise PatchError(f"{label}: signature missing/non-unique: {signature}")
    return text[:start] + replacement.rstrip() + text[block_end(text, start):]


def sections(source_root: Path) -> dict[str, str]:
    text = load(source_root / "firmware" / "ui-v11.28-ui13" / "settings.cppfrag")
    out: dict[str, str] = {}
    for name in ("HELPERS", "MORE", "SYSTEM"):
        a, b = f"@@{name}@@", f"@@END_{name}@@"
        if a not in text or b not in text:
            raise PatchError(f"UI13 fragment missing {name}")
        out[name] = text.split(a, 1)[1].split(b, 1)[0].strip("\n")
    return out


def patch_more_touch(hub: str) -> str:
    replacement = r'''if(g_ui12SettingsView){
      if(g_ui12SettingsView==1){
        static const uint8_t mainLevels[4]={64,128,192,255};
        static const uint8_t standbyLevels[5]={0,64,128,192,255};
        if(hubUi13MinusRect(0).contains(x,y)){brightness=hubStepPreset(brightness,mainLevels,4,true);hubPersistDisplay(true);return true;}
        if(hubUi13PlusRect(0).contains(x,y)){brightness=hubStepPreset(brightness,mainLevels,4,false);hubPersistDisplay(true);return true;}
        if(hubUi13MinusRect(1).contains(x,y)){dpSettings.screensaverBrightness=hubStepPreset(dpSettings.screensaverBrightness,standbyLevels,5,true);hubPersistDisplay(false);return true;}
        if(hubUi13PlusRect(1).contains(x,y)){dpSettings.screensaverBrightness=hubStepPreset(dpSettings.screensaverBrightness,standbyLevels,5,false);hubPersistDisplay(false);return true;}
        if(hubUi13ToggleRect(2).contains(x,y)){dpSettings.nightModeEnabled=!dpSettings.nightModeEnabled;hubPersistDisplay(true);return true;}
        if(hubUi13BackRect().contains(x,y)){g_ui12SettingsView=0;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        if(hubUi13ActionRect().contains(x,y)){g_ui12SettingsView=5;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        return true;
      }
      if(g_ui12SettingsView==5){
        if(hubUi13MinusRect(0).contains(x,y)){hubCycleAfterPrint(true);hubPersistDisplay(false);return true;}
        if(hubUi13PlusRect(0).contains(x,y)){hubCycleAfterPrint(false);hubPersistDisplay(false);return true;}
        if(hubUi13MinusRect(1).contains(x,y)){dpSettings.finishDisplayMins=hubStepFinishDelay(dpSettings.finishDisplayMins,true);hubPersistDisplay(false);return true;}
        if(hubUi13PlusRect(1).contains(x,y)){dpSettings.finishDisplayMins=hubStepFinishDelay(dpSettings.finishDisplayMins,false);hubPersistDisplay(false);return true;}
        if(hubUi13ToggleRect(2).contains(x,y)){dispSettings.animatedBar=!dispSettings.animatedBar;hubPersistDisplay(false);return true;}
        if(hubUi13BackRect().contains(x,y)){g_ui12SettingsView=1;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        if(hubUi13ActionRect().contains(x,y)){g_ui12SettingsView=0;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        return true;
      }
      if(g_ui12SettingsView==2){
        if(hubUi13ToggleRect(0).contains(x,y)){buzzerSettings.enabled=!buzzerSettings.enabled;saveBuzzerSettings();initBuzzer();buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        if(hubUi13ToggleRect(1).contains(x,y)){buzzerSettings.buttonClick=!buzzerSettings.buttonClick;saveBuzzerSettings();buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        if(hubUi13ToggleRect(2).contains(x,y)){buzzerSettings.bedCooldownAlert=!buzzerSettings.bedCooldownAlert;saveBuzzerSettings();buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        if(hubUi13BackRect().contains(x,y)){g_ui12SettingsView=0;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        if(hubUi13ActionRect().contains(x,y)){g_ui12SettingsView=6;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        return true;
      }
      if(g_ui12SettingsView==6){
#if HAS_HMS_UI
        if(hubUi13ToggleRect(0).contains(x,y)){dispSettings.hmsEnabled=!dispSettings.hmsEnabled;hubPersistDisplay(false);return true;}
        if(hubUi13MinusRect(1).contains(x,y)||hubUi13PlusRect(1).contains(x,y)){dispSettings.hmsSeverityAll=!dispSettings.hmsSeverityAll;hubPersistDisplay(false);return true;}
        if(hubUi13MinusRect(2).contains(x,y)){dispSettings.hmsAutoPresent=(uint8_t)((dispSettings.hmsAutoPresent+2U)%3U);hubPersistDisplay(false);return true;}
        if(hubUi13PlusRect(2).contains(x,y)){dispSettings.hmsAutoPresent=(uint8_t)((dispSettings.hmsAutoPresent+1U)%3U);hubPersistDisplay(false);return true;}
#endif
        if(hubUi13BackRect().contains(x,y)){g_ui12SettingsView=2;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        if(hubUi13ActionRect().contains(x,y)){g_ui12SettingsView=7;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        return true;
      }
      if(g_ui12SettingsView==7){
#if HAS_HMS_UI
        if(hubUi13ToggleRect(0).contains(x,y)){dispSettings.hmsAlertMask^=0x02U;hubPersistDisplay(false);return true;}
        if(hubUi13ToggleRect(1).contains(x,y)){dispSettings.hmsAlertMask^=0x04U;hubPersistDisplay(false);return true;}
        if(hubUi13ToggleRect(2).contains(x,y)){dispSettings.hmsAlertMask^=0x08U;hubPersistDisplay(false);return true;}
#endif
        if(hubUi13BackRect().contains(x,y)){g_ui12SettingsView=6;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        if(hubUi13ActionRect().contains(x,y)){g_ui12SettingsView=0;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        return true;
      }
      if(g_ui12SettingsView==3){
        if(hubUi13ToggleRect(1).contains(x,y)){netSettings.mdnsEnabled=!netSettings.mdnsEnabled;saveSettings();buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        if(hubUi13ToggleRect(2).contains(x,y)){netSettings.showIPAtStartup=!netSettings.showIPAtStartup;saveSettings();buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        if(hubUi13BackRect().contains(x,y)){g_ui12SettingsView=0;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        if(hubUi13ActionRect().contains(x,y)){g_ui12SettingsView=0;g_ui12SystemView=1;g_networkSettingsView=false;g_audioSettingsView=false;setPage(SCREEN_HUB_SYSTEM);buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        return true;
      }
      if(g_ui12SettingsView==4){
        const bool configured=isAnyPrinterConfigured();const uint8_t plug=configured?hubPowerConfigPlug():0xFF;
        if(hubUi13ToggleRect(2).contains(x,y)&&plug!=0xFF){TasmotaSettings& ps=tasmotaSettings[plug];if(ps.autoOffEnabled){ps.autoOffEnabled=false;hubPersistPower("Printer auto-off disabled",C10_MUTED);}else if(ps.enabled&&ps.ip[0]){g_ui12SettingsView=9;buzzerPlay(BUZZ_CLICK);g_dirty=true;}else{g_ui12SettingsView=0;g_ui12SystemView=1;setPage(SCREEN_HUB_SYSTEM);buzzerPlay(BUZZ_CLICK);g_dirty=true;}return true;}
        if(hubUi13BackRect().contains(x,y)){g_ui12SettingsView=0;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        if(hubUi13ActionRect().contains(x,y)&&plug!=0xFF){g_ui12SettingsView=8;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        return true;
      }
      if(g_ui12SettingsView==8){
        const bool configured=isAnyPrinterConfigured();const uint8_t plug=configured?hubPowerConfigPlug():0xFF;
        if(plug!=0xFF){TasmotaSettings& ps=tasmotaSettings[plug];if(hubUi13MinusRect(0).contains(x,y)){ps.autoOffDelayMin=hubStepAutoOffDelay(ps.autoOffDelayMin,true);hubPersistPower("Auto-off delay updated",C10_ACCENT);return true;}if(hubUi13PlusRect(0).contains(x,y)){ps.autoOffDelayMin=hubStepAutoOffDelay(ps.autoOffDelayMin,false);hubPersistPower("Auto-off delay updated",C10_ACCENT);return true;}if(hubUi13ToggleRect(1).contains(x,y)){ps.autoOffCancelOnDoor=!ps.autoOffCancelOnDoor;hubPersistPower("Door-cancel setting updated",C10_ACCENT);return true;}}
        if(hubUi13BackRect().contains(x,y)){g_ui12SettingsView=4;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        if(hubUi13ActionRect().contains(x,y)){g_ui12SettingsView=0;g_ui12SystemView=1;setPage(SCREEN_HUB_SYSTEM);buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        return true;
      }
      if(g_ui12SettingsView==9){
        if(hubUi13BackRect().contains(x,y)){g_ui12SettingsView=4;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        if(hubUi13ActionRect().contains(x,y)){const bool configured=isAnyPrinterConfigured();const uint8_t plug=configured?hubPowerConfigPlug():0xFF;if(plug!=0xFF){TasmotaSettings& ps=tasmotaSettings[plug];if(ps.enabled&&ps.ip[0]){ps.autoOffEnabled=true;hubPersistPower("Printer auto-off enabled",C10_GREEN);}}g_ui12SettingsView=4;g_dirty=true;return true;}
        return true;
      }
      return true;
    }'''
    hub = replace_block(hub, "if(g_ui12SettingsView){", replacement, "UI13 settings touch")

    root = r'''for(uint8_t i=0;i<5;i++)if(hubUi12SettingsRect(i).contains(x,y)){
      g_displayExperienceView=false;g_toolsView=false;g_networkSettingsView=false;g_audioSettingsView=false;g_ui12SystemView=0;
      if(i<4){g_ui12SettingsView=(uint8_t)(i+1U);buzzerPlay(BUZZ_CLICK);g_dirty=true;}
      else{g_ui12SettingsView=0;setPage(SCREEN_HUB_SYSTEM);buzzerPlay(BUZZ_CLICK);g_dirty=true;}
      return true;
    }'''
    hub = replace_block(hub, "for(uint8_t i=0;i<5;i++)if(hubUi12SettingsRect(i).contains(x,y)){", root, "UI13 root routing")
    return hub


def inject_system_touch(hub: str) -> str:
    needle = "if(cur==SCREEN_HUB_SYSTEM){"
    start = hub.find(needle)
    if start < 0 or hub.find(needle, start + 1) >= 0:
        raise PatchError("System touch handler missing/non-unique")
    insert = start + len(needle)
    code = r'''
    if(!g_audioSettingsView&&!g_networkSettingsView){
      if(g_ui12SystemView==1){if(hubUi12SystemBackRect().contains(x,y)){g_ui12SystemView=0;buzzerPlay(BUZZ_CLICK);g_dirty=true;}return true;}
      if(g_ui12SystemView==2){
        if(hubUi13MinusRect(0).contains(x,y)){hubStepTimezone(true);return true;}if(hubUi13PlusRect(0).contains(x,y)){hubStepTimezone(false);return true;}
        if(hubUi13ToggleRect(1).contains(x,y)){netSettings.use24h=!netSettings.use24h;saveSettings();buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        if(hubUi13MinusRect(2).contains(x,y)){netSettings.dateFormat=(uint8_t)((netSettings.dateFormat+5U)%6U);saveSettings();buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}if(hubUi13PlusRect(2).contains(x,y)){netSettings.dateFormat=(uint8_t)((netSettings.dateFormat+1U)%6U);saveSettings();buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        if(hubUi13BackRect().contains(x,y)||hubUi13ActionRect().contains(x,y)){g_ui12SystemView=0;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}return true;
      }
      if(g_ui12SystemView==3||g_ui12SystemView==4){
        if(hubUi13BackRect().contains(x,y)){g_ui12SystemView=0;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        if(hubUi13ActionRect().contains(x,y)){g_ui12SystemView=1;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}return true;
      }
      for(uint8_t i=0;i<4;i++)if(hubUi13SystemCardRect(i).contains(x,y)){
        if(i==0)g_ui12SystemView=4;
        else if(i==1){g_ui12SettingsView=3;setPage(SCREEN_HUB_MORE);}
        else if(i==2)g_ui12SystemView=2;
        else g_ui12SystemView=3;
        buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;
      }
      if(hubUi13BackRect().contains(x,y)){g_ui12SystemView=0;g_ui12SettingsView=0;setPage(SCREEN_HUB_MORE);buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
      if(hubUi13ActionRect().contains(x,y)){g_ui12SystemView=1;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
      return true;
    }
'''
    return hub[:insert] + code + hub[insert:]


def patch_capture(repo: Path, hub: str) -> str:
    compat = {
        'if (strcmp(pageName, "settings-experience") == 0) {': r'''if (strcmp(pageName, "settings-experience") == 0) {
    setPage(SCREEN_HUB_MORE);g_toolsView=false;g_displayExperienceView=false;g_networkSettingsView=false;g_audioSettingsView=false;g_ui12SystemView=0;g_ui12SettingsView=1;g_dirty=true;return true;
  }''',
        'if (strcmp(pageName, "settings-printer") == 0) {': r'''if (strcmp(pageName, "settings-printer") == 0) {
    setPage(SCREEN_HUB_MORE);g_toolsView=false;g_displayExperienceView=false;g_networkSettingsView=false;g_audioSettingsView=false;g_ui12SystemView=0;g_ui12SettingsView=4;g_dirty=true;return true;
  }''',
        'if (strcmp(pageName, "settings-update") == 0) {': r'''if (strcmp(pageName, "settings-update") == 0) {
    setPage(SCREEN_HUB_SYSTEM);g_ui12SettingsView=0;g_networkSettingsView=false;g_audioSettingsView=false;g_ui12SystemView=3;g_dirty=true;return true;
  }''',
    }
    for signature, replacement in compat.items():
        hub = replace_block(hub, signature, replacement, f"UI13 capture compatibility {signature}")

    routes = r'''  if (strcmp(pageName, "settings-display") == 0) { setPage(SCREEN_HUB_MORE);g_ui12SettingsView=1;g_ui12SystemView=0;g_networkSettingsView=false;g_audioSettingsView=false;g_dirty=true;return true; }
  if (strcmp(pageName, "settings-sounds") == 0) { setPage(SCREEN_HUB_MORE);g_ui12SettingsView=2;g_ui12SystemView=0;g_networkSettingsView=false;g_audioSettingsView=false;g_dirty=true;return true; }
  if (strcmp(pageName, "settings-network") == 0) { setPage(SCREEN_HUB_MORE);g_ui12SettingsView=3;g_ui12SystemView=0;g_networkSettingsView=false;g_audioSettingsView=false;g_dirty=true;return true; }
  if (strcmp(pageName, "settings-printer-power") == 0) { setPage(SCREEN_HUB_MORE);g_ui12SettingsView=4;g_ui12SystemView=0;g_networkSettingsView=false;g_audioSettingsView=false;g_dirty=true;return true; }
  if (strcmp(pageName, "system-date-time") == 0) { setPage(SCREEN_HUB_SYSTEM);g_ui12SettingsView=0;g_ui12SystemView=2;g_networkSettingsView=false;g_audioSettingsView=false;g_dirty=true;return true; }
  if (strcmp(pageName, "system-update") == 0) { setPage(SCREEN_HUB_SYSTEM);g_ui12SettingsView=0;g_ui12SystemView=3;g_networkSettingsView=false;g_audioSettingsView=false;g_dirty=true;return true; }
  if (strcmp(pageName, "system-diagnostics") == 0) { setPage(SCREEN_HUB_SYSTEM);g_ui12SettingsView=0;g_ui12SystemView=4;g_networkSettingsView=false;g_audioSettingsView=false;g_dirty=true;return true; }
'''
    anchor = '  if (strcmp(pageName, "custom") == 0) { setPage(SCREEN_HUB_CUSTOM); return true; }\n'
    hub = once(hub, anchor, routes + anchor, "UI13 capture routes")

    web_path = repo / "src" / "web_server.cpp"
    web = load(web_path)
    web = once(web, '{"id":"settings-experience","label":"Experience","group":"Settings"},', '{"id":"settings-experience","label":"Display & Appearance","group":"Settings"},\n    {"id":"settings-display","label":"Display & Appearance","group":"Settings"},\n    {"id":"settings-sounds","label":"Sounds & Alerts","group":"Settings"},\n    {"id":"settings-network","label":"Network","group":"Settings"},', "UI13 settings capture catalog")
    web = once(web, '{"id":"settings-printer","label":"Printer Connection","group":"Settings"},', '{"id":"settings-printer","label":"Printer & Power","group":"Settings"},\n    {"id":"settings-printer-power","label":"Printer & Power","group":"Settings"},', "UI13 printer capture catalog")
    web = once(web, '{"id":"settings-update","label":"Software Update","group":"Settings"},', '{"id":"settings-update","label":"Software Update","group":"System"},\n    {"id":"system-date-time","label":"Date & Time","group":"System"},\n    {"id":"system-update","label":"Software Update","group":"System"},\n    {"id":"system-diagnostics","label":"Diagnostics","group":"System"},', "UI13 system capture catalog")
    web_path.write_text(web, encoding="utf-8")
    return hub


def patch(repo: Path) -> None:
    root = Path(__file__).resolve().parent
    fragments = sections(root)

    build_path = repo / "include" / "smart_home_build.h"
    build = load(build_path)
    build = once(build, '#define SMART_HOME_VERSION "v11.27"', '#define SMART_HOME_VERSION "v11.28"', "UI13 version")
    build = once(build, '#define SMART_HOME_BUILD_LABEL "Workshop OS v11.27 UI12 Control Center"', '#define SMART_HOME_BUILD_LABEL "Workshop OS v11.28 UI13 Appliance Settings"', "UI13 label")
    build = once(build, '#define SMART_HOME_PROFILE "control-center-ui12"', '#define SMART_HOME_PROFILE "appliance-settings-ui13"', "UI13 profile")
    build = once(build, '#define WORKSHOP_OS_UI_SCHEMA "UI12"', '#define WORKSHOP_OS_UI_SCHEMA "UI13"', "UI13 schema")
    if "WORKSHOP_OS_V11_28_UI13" not in build:
        build += "\n#define WORKSHOP_OS_V11_28_UI13 1\n"
    build_path.write_text(build, encoding="utf-8")

    hub_path = repo / "src" / "smart_hub.cpp"
    hub = load(hub_path)
    if "static HubRect hubUi13RowRect" in hub:
        raise PatchError("UI13 helpers already present")
    anchor = "static void drawMore(bool full) {"
    if hub.count(anchor) != 1:
        raise PatchError("drawMore anchor missing/non-unique")
    hub = hub.replace(anchor, fragments["HELPERS"] + "\n\n" + anchor, 1)
    hub = replace_block(hub, "static void drawMore(bool full) {", fragments["MORE"], "UI13 Settings")
    hub = replace_block(hub, "static void drawSystem(bool full) {", fragments["SYSTEM"], "UI13 System")
    hub = patch_more_touch(hub)
    hub = inject_system_touch(hub)

    for old, new in (("UI12-H","UI13-H"),("UI12-P","UI13-P"),("UI12-T","UI13-T"),("UI12-M","UI13-M"),("UI12-S","UI13-S")):
        hub = once(hub, f'"{old}"', f'"{new}"', f"fingerprint {old}")
    hub = once(hub, 'default: return "UI12";', 'default: return "UI13";', "UI13 default fingerprint")
    hub = patch_capture(repo, hub)

    required = (
        "Display & Appearance", "Sounds & Alerts", "Printer & Power", "Date & Time",
        "Printer Alerts", "Alert Signals", "Automatic Power Off", "Enable Auto-Off?",
        "On-device install is not enabled in this build", "Connectivity is separate from device health",
        "settings-display", "settings-sounds", "settings-network", "settings-printer-power",
        "system-date-time", "system-update", "system-diagnostics",
        "UI13-H", "UI13-P", "UI13-T", "UI13-M", "UI13-S",
    )
    for marker in required:
        if marker not in hub:
            raise PatchError(f"UI13 missing marker: {marker}")
    settings_start = hub.find("if(g_ui12SettingsView){")
    if settings_start < 0:
        raise PatchError("UI13 normal Settings touch block missing")
    settings_touch = hub[settings_start:block_end(hub, settings_start)]
    if "longPress" in settings_touch:
        raise PatchError("routine UI13 Settings touch path still depends on longPress")
    if "g_networkSettingsView=true" in settings_touch or "g_audioSettingsView=true" in settings_touch:
        raise PatchError("normal UI13 Settings still routes into legacy engineering carousels")
    for forbidden in ("matchSpoolByColor", "matchSpoolByMaterial", "resolveSpool", "TEST / NO CODE"):
        if forbidden in hub:
            raise PatchError(f"forbidden UI13 marker present: {forbidden}")

    hub_path.write_text(hub, encoding="utf-8")
    print("Workshop OS v11.28 UI13 Appliance Settings applied")


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
