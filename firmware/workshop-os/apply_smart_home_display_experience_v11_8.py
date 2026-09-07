#!/usr/bin/env python3
from pathlib import Path
import argparse

class PatchError(RuntimeError):
    pass


def load(root: Path, rel: str) -> str:
    p = root / rel
    if not p.exists():
        raise PatchError(f"missing {rel}")
    return p.read_text()


def save(root: Path, rel: str, text: str) -> None:
    (root / rel).write_text(text)


def once(text: str, old: str, new: str, label: str) -> str:
    n = text.count(old)
    if n != 1:
        raise PatchError(f"{label}: expected one anchor, found {n}")
    return text.replace(old, new, 1)


DISPLAY_CODE = r'''
// ---------------------------------------------------------------------------
// Smart Home v11.8 physical Display & Experience controls
// ---------------------------------------------------------------------------
static uint8_t hubStepPreset(uint8_t current, const uint8_t* values,
                             uint8_t count, bool reverse) {
  if (!values || count == 0) return current;
  if (reverse) {
    for (int8_t i = (int8_t)count - 1; i >= 0; --i) {
      if (values[i] < current) return values[i];
    }
    return values[0];
  }
  for (uint8_t i = 0; i < count; ++i) {
    if (values[i] > current) return values[i];
  }
  return values[count - 1];
}

static uint8_t hubLevelPct(uint8_t level) {
  return (uint8_t)(((uint16_t)level * 100U + 127U) / 255U);
}

static uint8_t hubAfterPrintMode() {
  if (dpSettings.keepDisplayOn) return 0;       // stay on
  return dpSettings.showClockAfterFinish ? 1 : 2; // clock / display off
}

static const char* hubAfterPrintLabel() {
  switch (hubAfterPrintMode()) {
    case 0: return "STAY ON";
    case 1: return "CLOCK";
    default:return "DISPLAY OFF";
  }
}

static void hubCycleAfterPrint(bool reverse) {
  uint8_t mode = hubAfterPrintMode();
  mode = reverse ? (uint8_t)((mode + 2U) % 3U) : (uint8_t)((mode + 1U) % 3U);
  if (mode == 0) {
    dpSettings.keepDisplayOn = true;
  } else {
    dpSettings.keepDisplayOn = false;
    dpSettings.showClockAfterFinish = (mode == 1);
  }
}

static void hubPersistDisplay(bool applyBacklight) {
  saveSettings();
  if (applyBacklight) setBacklight(getEffectiveBrightness());
  buzzerPlay(BUZZ_CLICK);
  g_dirty = true;
}

static void uiDisplaySettingCard(const HubRect& r, const char* label,
                                 const char* value, const char* detail,
                                 uint16_t accent) {
  uiCard(r.x, r.y, r.w, r.h, accent, false);
  const int16_t pad = hubLandscape() ? 12 : 12;
  const int16_t labelY = r.y + (hubLandscape() ? 10 : 13);
  const int16_t valueY = r.y + (hubLandscape() ? 34 : 45);
  const int16_t detailY = r.y + (hubLandscape() ? 59 : 82);
  uiDrawFit(label, r.x + pad, labelY, r.w - pad * 2,
            FONT_SMALL, TL_DATUM, accent, UI_PANEL);
  uiDrawFit(value, r.x + pad, valueY, r.w - pad * 2,
            FONT_LARGE, TL_DATUM, UI_TEXT, UI_PANEL);
  uiDrawFit(detail, r.x + pad, detailY, r.w - pad * 2,
            FONT_SMALL, TL_DATUM, UI_DIM, UI_PANEL);
}

static void drawDisplayExperience(bool full) {
  (void)full;
  const int16_t W = tft.width();
  tft.fillScreen(UI_BG);
  drawHeader("DISPLAY", "LOCAL", 3);
  uiBottomNav(3, nullptr);

  char mainValue[16], standbyValue[16], nightDetail[40], afterDetail[48];
  snprintf(mainValue, sizeof(mainValue), "%u%%", (unsigned)hubLevelPct(brightness));
  snprintf(standbyValue, sizeof(standbyValue), "%u%%",
           (unsigned)hubLevelPct(dpSettings.screensaverBrightness));
  snprintf(nightDetail, sizeof(nightDetail), "%02u:00-%02u:00 • tap toggle",
           (unsigned)dpSettings.nightStartHour, (unsigned)dpSettings.nightEndHour);
  if (dpSettings.keepDisplayOn) {
    strlcpy(afterDetail, "Finish screen remains awake", sizeof(afterDetail));
  } else if (dpSettings.finishDisplayMins == 0) {
    strlcpy(afterDetail,
            dpSettings.showClockAfterFinish ? "Switches to clock immediately"
                                             : "Uses immediate finish transition",
            sizeof(afterDetail));
  } else {
    snprintf(afterDetail, sizeof(afterDetail), "After %u min finish timer",
             (unsigned)dpSettings.finishDisplayMins);
  }

  uiDisplaySettingCard(hubMoreRect(0), "MAIN BRIGHTNESS", mainValue,
                       "Tap + / hold -", UI_ORANGE);
  uiDisplaySettingCard(hubMoreRect(1), "STANDBY BRIGHTNESS", standbyValue,
                       "Tap + / hold -", UI_CYAN);
  uiDisplaySettingCard(hubMoreRect(2), "NIGHT MODE",
                       dpSettings.nightModeEnabled ? "ON" : "OFF",
                       nightDetail, dpSettings.nightModeEnabled ? UI_PURPLE : UI_MUTED);
  uiDisplaySettingCard(hubMoreRect(3), "AFTER PRINT", hubAfterPrintLabel(),
                       afterDetail, UI_GREEN);

  if (hubLandscape()) {
    uiPanelFill(8, 210, W - 16, 54);
    uiDrawFit("Large touch targets • settings save immediately • Custom: long-press to edit tiles",
              W / 2, 237, W - 32, FONT_SMALL, MC_DATUM, UI_DIM, UI_PANEL_2);
  } else {
    uiPanelFill(10, 306, W - 20, 108);
    uiDrawFit("DISPLAY & EXPERIENCE", 20, 318, W - 40,
              FONT_SMALL, TL_DATUM, UI_PURPLE, UI_PANEL_2);
    uiDrawFit("Tap brightness cards to increase", 20, 343, W - 40,
              FONT_BODY, TL_DATUM, UI_TEXT, UI_PANEL_2);
    uiDrawFit("Hold brightness cards to decrease", 20, 369, W - 40,
              FONT_BODY, TL_DATUM, UI_TEXT, UI_PANEL_2);
    uiDrawFit("Every change is stored on this device", 20, 397, W - 40,
              FONT_SMALL, TL_DATUM, UI_DIM, UI_PANEL_2);
  }
  hubMarkFrameDirty();
  g_dirty = false;
}
'''


def patch(root: Path) -> None:
    rel = "include/smart_home_build.h"
    t = load(root, rel)
    t = once(t, '#define SMART_HOME_VERSION "v11.7"',
             '#define SMART_HOME_VERSION "v11.8"', "version")
    t = once(t, '#define SMART_HOME_PROFILE "workshop-live-state"',
             '#define SMART_HOME_PROFILE "display-experience"', "profile")
    t = once(t, 'Smart Home v11.7 Live State Integrity RC1',
             'Smart Home v11.8 Display & Experience RC1', "label")
    save(root, rel, t)

    rel = "src/smart_hub.cpp"
    t = load(root, rel)
    t = once(t, "bool g_toolsView = false;",
             "bool g_toolsView = false;\nbool g_displayExperienceView = false;",
             "display subview state")
    t = once(t,
             "  if (s != SCREEN_HUB_MORE) g_toolsView = false;",
             "  if (s != SCREEN_HUB_MORE) { g_toolsView = false; g_displayExperienceView = false; }",
             "subview reset")

    anchor = "static void drawMore(bool full) {"
    if DISPLAY_CODE.strip() in t:
        raise PatchError("v11.8 display code already present")
    if t.count(anchor) != 1:
        raise PatchError("drawMore anchor missing or ambiguous")
    t = t.replace(anchor, DISPLAY_CODE + "\n" + anchor, 1)

    t = once(t,
             "static void drawMore(bool full) {\n  if (g_toolsView) { drawTools(full); return; }",
             "static void drawMore(bool full) {\n  if (g_displayExperienceView) { drawDisplayExperience(full); return; }\n  if (g_toolsView) { drawTools(full); return; }",
             "display dispatch")
    t = once(t,
             '  const char* titles[4]={"CUSTOM","SYSTEM","EDIT","TOOLS"};',
             '  const char* titles[4]={"CUSTOM","SYSTEM","DISPLAY","TOOLS"};',
             "More display title")
    t = once(t,
             '  const char* subs[4]={"Personal dashboard","Health & recovery","Choose dashboard tiles","Timers, notes & legacy"};',
             '  const char* subs[4]={"Personal dashboard","Health & recovery","Brightness, standby & finish","Timers, notes & legacy"};',
             "More display subtitle")

    t = once(t,
             '  if (strcmp(pageName, "more") == 0) { g_toolsView=false; setPage(SCREEN_HUB_MORE); return true; }',
             '  if (strcmp(pageName, "more") == 0) { g_toolsView=false; g_displayExperienceView=false; setPage(SCREEN_HUB_MORE); return true; }',
             "show More reset")
    t = once(t,
             '  if (strcmp(pageName, "tools") == 0) { setPage(SCREEN_HUB_MORE); g_toolsView=true; g_dirty=true; return true; }',
             '  if (strcmp(pageName, "tools") == 0) { setPage(SCREEN_HUB_MORE); g_displayExperienceView=false; g_toolsView=true; g_dirty=true; return true; }\n  if (strcmp(pageName, "display") == 0) { setPage(SCREEN_HUB_MORE); g_toolsView=false; g_displayExperienceView=true; g_dirty=true; return true; }',
             "show Display page")

    old_nav = '  for(uint8_t i=0;i<4;i++)if(hubNavRect(i).contains(x,y)){if(i==0)setPage(SCREEN_HUB_HOME);else if(i==1)setPage(SCREEN_HUB_PRINTER);else if(i==2)setPage(SCREEN_HUB_WORKSHOP);else{if(cur==SCREEN_HUB_MORE&&g_toolsView){g_toolsView=false;g_dirty=true;}else setPage(SCREEN_HUB_MORE);}return true;}'
    new_nav = '  for(uint8_t i=0;i<4;i++)if(hubNavRect(i).contains(x,y)){if(i==0)setPage(SCREEN_HUB_HOME);else if(i==1)setPage(SCREEN_HUB_PRINTER);else if(i==2)setPage(SCREEN_HUB_WORKSHOP);else{if(cur==SCREEN_HUB_MORE&&(g_toolsView||g_displayExperienceView)){g_toolsView=false;g_displayExperienceView=false;g_dirty=true;}else setPage(SCREEN_HUB_MORE);}return true;}'
    t = once(t, old_nav, new_nav, "More subview back navigation")

    more_anchor = "  if(cur==SCREEN_HUB_MORE){\n    if(g_toolsView){"
    display_touch = r'''  if(cur==SCREEN_HUB_MORE){
    if(g_displayExperienceView){
      static const uint8_t mainLevels[4] = {64,128,192,255};
      static const uint8_t standbyLevels[5] = {0,64,128,192,255};
      for(uint8_t i=0;i<4;i++)if(hubMoreRect(i).contains(x,y)){
        if(i==0){brightness=hubStepPreset(brightness,mainLevels,4,longPress);hubPersistDisplay(true);}
        else if(i==1){dpSettings.screensaverBrightness=hubStepPreset(dpSettings.screensaverBrightness,standbyLevels,5,longPress);hubPersistDisplay(false);}
        else if(i==2){dpSettings.nightModeEnabled=!dpSettings.nightModeEnabled;hubPersistDisplay(true);}
        else{hubCycleAfterPrint(longPress);hubPersistDisplay(false);}
        return true;
      }
      return true;
    }
    if(g_toolsView){'''
    t = once(t, more_anchor, display_touch, "Display touch dispatch")

    old_more_cards = '    for(uint8_t i=0;i<4;i++)if(hubMoreRect(i).contains(x,y)){if(i==0)setPage(SCREEN_HUB_CUSTOM);else if(i==1)setPage(SCREEN_HUB_SYSTEM);else if(i==2){g_widgetEditMode=true;g_widgetSelected=0;setPage(SCREEN_HUB_CUSTOM);}else{g_toolsView=true;g_dirty=true;}return true;}return true;}'
    new_more_cards = '    for(uint8_t i=0;i<4;i++)if(hubMoreRect(i).contains(x,y)){if(i==0)setPage(SCREEN_HUB_CUSTOM);else if(i==1)setPage(SCREEN_HUB_SYSTEM);else if(i==2){g_toolsView=false;g_displayExperienceView=true;g_dirty=true;}else{g_displayExperienceView=false;g_toolsView=true;g_dirty=true;}return true;}return true;}'
    t = once(t, old_more_cards, new_more_cards, "More card routing")

    old_workshop_tools = 'else if(i==1){setPage(SCREEN_HUB_MORE);g_toolsView=true;g_dirty=true;}'
    new_workshop_tools = 'else if(i==1){setPage(SCREEN_HUB_MORE);g_displayExperienceView=false;g_toolsView=true;g_dirty=true;}'
    t = once(t, old_workshop_tools, new_workshop_tools, "Workshop Tools routing")
    save(root, rel, t)

    checks = {
        "include/smart_home_build.h": [
            'SMART_HOME_VERSION "v11.8"',
            'SMART_HOME_PROFILE "display-experience"',
            'Smart Home v11.8 Display & Experience RC1',
        ],
        "src/smart_hub.cpp": [
            "g_displayExperienceView",
            "drawDisplayExperience",
            "MAIN BRIGHTNESS",
            "STANDBY BRIGHTNESS",
            "NIGHT MODE",
            "AFTER PRINT",
            "hubStepPreset",
            "hubPersistDisplay",
            "saveSettings();",
            "setBacklight(getEffectiveBrightness())",
            'strcmp(pageName, "display")',
            '"CUSTOM","SYSTEM","DISPLAY","TOOLS"',
            "mainLevels[4] = {64,128,192,255}",
            "standbyLevels[5] = {0,64,128,192,255}",
        ],
    }
    for check_rel, needles in checks.items():
        body = load(root, check_rel)
        for needle in needles:
            if needle not in body:
                raise PatchError(f"{check_rel}: missing {needle}")

    if '"CUSTOM","SYSTEM","EDIT","TOOLS"' in load(root, "src/smart_hub.cpp"):
        raise PatchError("legacy More EDIT tile still present")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    patch(Path(args.repo).resolve())
    print("Smart Home v11.8 Display & Experience applied")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
