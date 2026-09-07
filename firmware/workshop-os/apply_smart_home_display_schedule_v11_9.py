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


def replace_between(text: str, start: str, end: str, replacement: str, label: str) -> str:
    a = text.find(start)
    b = text.find(end, a + len(start)) if a >= 0 else -1
    if a < 0 or b < 0:
        raise PatchError(f"{label}: boundary missing")
    return text[:a] + replacement + text[b:]


DISPLAY_PAGED_CODE = r'''static HubRect hubDisplayPagerRect() {
  const int16_t W = tft.width();
  if (hubLandscape()) return hr(W - 140, 213, 132, 42);
  return hr(18, 362, W - 36, 42);
}

static uint8_t hubStepHour(uint8_t hour, bool reverse) {
  hour = (uint8_t)(hour % 24U);
  return reverse ? (uint8_t)((hour + 23U) % 24U)
                 : (uint8_t)((hour + 1U) % 24U);
}

static uint16_t hubStepFinishDelay(uint16_t current, bool reverse) {
  static const uint16_t values[] = {0,1,3,5,10,15,30,60};
  const uint8_t count = (uint8_t)(sizeof(values) / sizeof(values[0]));
  if (reverse) {
    for (int8_t i = (int8_t)count - 1; i >= 0; --i) {
      if (values[i] < current) return values[i];
    }
    return current;
  }
  for (uint8_t i = 0; i < count; ++i) {
    if (values[i] > current) return values[i];
  }
  return current;
}

static void drawDisplayExperience(bool full) {
  (void)full;
  const int16_t W = tft.width();
  const bool quick = g_displayExperiencePage == 0;
  tft.fillScreen(UI_BG);
  drawHeader("DISPLAY", quick ? "QUICK" : "SCHEDULE", 3);
  uiBottomNav(3, nullptr);

  if (quick) {
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
  } else {
    char nightValue[16], startValue[16], endValue[16], finishValue[20];
    char nightDetail[44], finishDetail[48];
    snprintf(nightValue, sizeof(nightValue), "%u%%",
             (unsigned)hubLevelPct(dpSettings.nightBrightness));
    snprintf(startValue, sizeof(startValue), "%02u:00",
             (unsigned)dpSettings.nightStartHour);
    snprintf(endValue, sizeof(endValue), "%02u:00",
             (unsigned)dpSettings.nightEndHour);
    if (dpSettings.finishDisplayMins == 0)
      strlcpy(finishValue, "IMMEDIATE", sizeof(finishValue));
    else
      snprintf(finishValue, sizeof(finishValue), "%u MIN",
               (unsigned)dpSettings.finishDisplayMins);
    strlcpy(nightDetail,
            dpSettings.nightModeEnabled ? "Tap + / hold -" : "Stored • Night mode is off",
            sizeof(nightDetail));
    strlcpy(finishDetail,
            dpSettings.keepDisplayOn ? "Stored • Stay On currently overrides" : "Tap next / hold previous",
            sizeof(finishDetail));

    uiDisplaySettingCard(hubMoreRect(0), "NIGHT BRIGHTNESS", nightValue,
                         nightDetail, UI_PURPLE);
    uiDisplaySettingCard(hubMoreRect(1), "NIGHT START", startValue,
                         "Tap +1h / hold -1h", UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(2), "NIGHT END", endValue,
                         "Tap +1h / hold -1h", UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(3), "FINISH TIMEOUT", finishValue,
                         finishDetail, UI_GREEN);
  }

  HubRect pager = hubDisplayPagerRect();
  if (hubLandscape()) {
    uiPanelFill(8, 210, W - 156, 54);
    uiDrawFit(quick ? "Common display controls" : "Night schedule and finish timing",
              20, 237, W - 184, FONT_SMALL, ML_DATUM, UI_DIM, UI_PANEL_2);
  } else {
    uiPanelFill(10, 306, W - 20, 108);
    uiDrawFit(quick ? "DISPLAY & EXPERIENCE" : "SCHEDULE & FINISH",
              20, 319, W - 40, FONT_SMALL, TL_DATUM, UI_PURPLE, UI_PANEL_2);
    uiDrawFit(quick ? "Large controls for everyday adjustments"
                    : "All values save immediately on this device",
              20, 344, W - 40, FONT_BODY, TL_DATUM, UI_TEXT, UI_PANEL_2);
  }
  uiActionButton(pager, quick ? "SCHEDULE >" : "< QUICK", UI_PURPLE);
  hubMarkFrameDirty();
  g_dirty = false;
}

'''


def patch(root: Path) -> None:
    rel = "include/smart_home_build.h"
    t = load(root, rel)
    t = once(t, '#define SMART_HOME_VERSION "v11.8"',
             '#define SMART_HOME_VERSION "v11.9"', "version")
    t = once(t, '#define SMART_HOME_PROFILE "display-experience"',
             '#define SMART_HOME_PROFILE "display-schedule"', "profile")
    t = once(t, 'Smart Home v11.8 Display & Experience RC1',
             'Smart Home v11.9 Display Schedule & Finish RC1', "label")
    save(root, rel, t)

    rel = "src/smart_hub.cpp"
    t = load(root, rel)
    t = once(t,
             "bool g_displayExperienceView = false;",
             "bool g_displayExperienceView = false;\nuint8_t g_displayExperiencePage = 0;",
             "display page state")
    t = once(t,
             "  if (s != SCREEN_HUB_MORE) { g_toolsView = false; g_displayExperienceView = false; }",
             "  if (s != SCREEN_HUB_MORE) { g_toolsView = false; g_displayExperienceView = false; g_displayExperiencePage = 0; }",
             "display page reset")

    t = replace_between(t,
                        "static void drawDisplayExperience(bool full) {",
                        "static void drawMore(bool full) {",
                        DISPLAY_PAGED_CODE,
                        "paged Display renderer")

    t = once(t,
             '  if (strcmp(pageName, "more") == 0) { g_toolsView=false; g_displayExperienceView=false; setPage(SCREEN_HUB_MORE); return true; }',
             '  if (strcmp(pageName, "more") == 0) { g_toolsView=false; g_displayExperienceView=false; g_displayExperiencePage=0; setPage(SCREEN_HUB_MORE); return true; }',
             "show More page reset")
    t = once(t,
             '  if (strcmp(pageName, "display") == 0) { setPage(SCREEN_HUB_MORE); g_toolsView=false; g_displayExperienceView=true; g_dirty=true; return true; }',
             '  if (strcmp(pageName, "display") == 0) { setPage(SCREEN_HUB_MORE); g_toolsView=false; g_displayExperienceView=true; g_displayExperiencePage=0; g_dirty=true; return true; }',
             "show Display page reset")

    old_nav = 'else{if(cur==SCREEN_HUB_MORE&&(g_toolsView||g_displayExperienceView)){g_toolsView=false;g_displayExperienceView=false;g_dirty=true;}else setPage(SCREEN_HUB_MORE);}return true;}'
    new_nav = 'else{if(cur==SCREEN_HUB_MORE&&(g_toolsView||g_displayExperienceView)){g_toolsView=false;g_displayExperienceView=false;g_displayExperiencePage=0;g_dirty=true;}else setPage(SCREEN_HUB_MORE);}return true;}'
    t = once(t, old_nav, new_nav, "display pager back reset")

    old_touch = r'''    if(g_displayExperienceView){
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
'''
    new_touch = r'''    if(g_displayExperienceView){
      if(hubDisplayPagerRect().contains(x,y)){
        g_displayExperiencePage=(uint8_t)(g_displayExperiencePage?0:1);
        buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;
      }
      static const uint8_t mainLevels[4] = {64,128,192,255};
      static const uint8_t standbyLevels[5] = {0,64,128,192,255};
      for(uint8_t i=0;i<4;i++)if(hubMoreRect(i).contains(x,y)){
        if(g_displayExperiencePage==0){
          if(i==0){brightness=hubStepPreset(brightness,mainLevels,4,longPress);hubPersistDisplay(true);}
          else if(i==1){dpSettings.screensaverBrightness=hubStepPreset(dpSettings.screensaverBrightness,standbyLevels,5,longPress);hubPersistDisplay(false);}
          else if(i==2){dpSettings.nightModeEnabled=!dpSettings.nightModeEnabled;hubPersistDisplay(true);}
          else{hubCycleAfterPrint(longPress);hubPersistDisplay(false);}
        }else{
          if(i==0){dpSettings.nightBrightness=hubStepPreset(dpSettings.nightBrightness,standbyLevels,5,longPress);hubPersistDisplay(true);}
          else if(i==1){dpSettings.nightStartHour=hubStepHour(dpSettings.nightStartHour,longPress);hubPersistDisplay(true);}
          else if(i==2){dpSettings.nightEndHour=hubStepHour(dpSettings.nightEndHour,longPress);hubPersistDisplay(true);}
          else{dpSettings.finishDisplayMins=hubStepFinishDelay(dpSettings.finishDisplayMins,longPress);hubPersistDisplay(false);}
        }
        return true;
      }
      return true;
    }
'''
    t = once(t, old_touch, new_touch, "paged Display touch handling")

    old_card = 'else if(i==2){g_toolsView=false;g_displayExperienceView=true;g_dirty=true;}else{g_displayExperienceView=false;g_toolsView=true;g_dirty=true;}'
    new_card = 'else if(i==2){g_toolsView=false;g_displayExperienceView=true;g_displayExperiencePage=0;g_dirty=true;}else{g_displayExperienceView=false;g_displayExperiencePage=0;g_toolsView=true;g_dirty=true;}'
    t = once(t, old_card, new_card, "More Display entry reset")
    save(root, rel, t)

    checks = {
        "include/smart_home_build.h": [
            'SMART_HOME_VERSION "v11.9"',
            'SMART_HOME_PROFILE "display-schedule"',
            'Smart Home v11.9 Display Schedule & Finish RC1',
        ],
        "src/smart_hub.cpp": [
            "g_displayExperiencePage",
            "hubDisplayPagerRect",
            "hubStepHour",
            "hubStepFinishDelay",
            '"SCHEDULE >"',
            '"< QUICK"',
            '"NIGHT BRIGHTNESS"',
            '"NIGHT START"',
            '"NIGHT END"',
            '"FINISH TIMEOUT"',
            "dpSettings.nightBrightness=hubStepPreset",
            "dpSettings.nightStartHour=hubStepHour",
            "dpSettings.nightEndHour=hubStepHour",
            "dpSettings.finishDisplayMins=hubStepFinishDelay",
        ],
    }
    for check_rel, needles in checks.items():
        body = load(root, check_rel)
        for needle in needles:
            if needle not in body:
                raise PatchError(f"{check_rel}: missing {needle}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    patch(Path(args.repo).resolve())
    print("Smart Home v11.9 Display Schedule & Finish applied")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
