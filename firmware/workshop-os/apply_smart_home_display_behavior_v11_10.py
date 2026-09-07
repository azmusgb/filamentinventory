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


DISPLAY_THREE_PAGE_CODE = r'''static const char* hubTimeDisplayLabel() {
  switch (dispSettings.timeDisplayMode) {
    case 1: return "REMAINING";
    case 2: return "BOTH";
    default:return "ETA";
  }
}

static void drawDisplayExperience(bool full) {
  (void)full;
  const int16_t W = tft.width();
  const uint8_t page = (uint8_t)(g_displayExperiencePage % 3U);
  const bool quick = page == 0;
  const bool schedule = page == 1;
  tft.fillScreen(UI_BG);
  drawHeader("DISPLAY", quick ? "QUICK" : (schedule ? "SCHEDULE" : "BEHAVIOR"), 3);
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
  } else if (schedule) {
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
  } else {
    uiDisplaySettingCard(hubMoreRect(0), "DOOR ACK",
                         dpSettings.doorAckEnabled ? "ON" : "OFF",
                         "Wait for door before finish timeout", UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(1), "KEEP PRINT SCREEN",
                         dpSettings.keepPrintScreen ? "ON" : "OFF",
                         "Keep print dashboard after completion", UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(2), "FINISH TIMESTAMP",
                         dpSettings.finishShowTime ? "ON" : "OFF",
                         "Show completion clock time", UI_PURPLE);
    uiDisplaySettingCard(hubMoreRect(3), "TIME DISPLAY",
                         hubTimeDisplayLabel(),
                         "Tap next / hold previous", UI_GREEN);
  }

  HubRect pager = hubDisplayPagerRect();
  const char* nextLabel = quick ? "SCHEDULE >" : (schedule ? "BEHAVIOR >" : "QUICK >");
  if (hubLandscape()) {
    uiPanelFill(8, 210, W - 156, 54);
    uiDrawFit(quick ? "Common display controls"
                    : (schedule ? "Night schedule and finish timing"
                                : "After-print behavior and time readout"),
              20, 237, W - 184, FONT_SMALL, ML_DATUM, UI_DIM, UI_PANEL_2);
  } else {
    uiPanelFill(10, 306, W - 20, 108);
    uiDrawFit(quick ? "DISPLAY & EXPERIENCE"
                    : (schedule ? "SCHEDULE & FINISH" : "FINISH BEHAVIOR"),
              20, 319, W - 40, FONT_SMALL, TL_DATUM, UI_PURPLE, UI_PANEL_2);
    uiDrawFit(quick ? "Large controls for everyday adjustments"
                    : (schedule ? "All values save immediately on this device"
                                : "Tap toggles • time mode supports reverse hold"),
              20, 344, W - 40, FONT_BODY, TL_DATUM, UI_TEXT, UI_PANEL_2);
  }
  uiActionButton(pager, nextLabel, UI_PURPLE);
  hubMarkFrameDirty();
  g_dirty = false;
}

'''


def patch(root: Path) -> None:
    rel = "include/smart_home_build.h"
    t = load(root, rel)
    t = once(t, '#define SMART_HOME_VERSION "v11.9"',
             '#define SMART_HOME_VERSION "v11.10"', "version")
    t = once(t, '#define SMART_HOME_PROFILE "display-schedule"',
             '#define SMART_HOME_PROFILE "display-behavior"', "profile")
    t = once(t, 'Smart Home v11.9 Display Schedule & Finish RC1',
             'Smart Home v11.10 Display Behavior RC1', "label")
    save(root, rel, t)

    rel = "src/smart_hub.cpp"
    t = load(root, rel)
    t = replace_between(t,
                        "static void drawDisplayExperience(bool full) {",
                        "static void drawMore(bool full) {",
                        DISPLAY_THREE_PAGE_CODE,
                        "three-page Display renderer")

    t = once(t,
             "        g_displayExperiencePage=(uint8_t)(g_displayExperiencePage?0:1);",
             "        g_displayExperiencePage=(uint8_t)((g_displayExperiencePage+1U)%3U);",
             "three-page pager")

    old_touch = r'''        if(g_displayExperiencePage==0){
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
'''
    new_touch = r'''        if(g_displayExperiencePage==0){
          if(i==0){brightness=hubStepPreset(brightness,mainLevels,4,longPress);hubPersistDisplay(true);}
          else if(i==1){dpSettings.screensaverBrightness=hubStepPreset(dpSettings.screensaverBrightness,standbyLevels,5,longPress);hubPersistDisplay(false);}
          else if(i==2){dpSettings.nightModeEnabled=!dpSettings.nightModeEnabled;hubPersistDisplay(true);}
          else{hubCycleAfterPrint(longPress);hubPersistDisplay(false);}
        }else if(g_displayExperiencePage==1){
          if(i==0){dpSettings.nightBrightness=hubStepPreset(dpSettings.nightBrightness,standbyLevels,5,longPress);hubPersistDisplay(true);}
          else if(i==1){dpSettings.nightStartHour=hubStepHour(dpSettings.nightStartHour,longPress);hubPersistDisplay(true);}
          else if(i==2){dpSettings.nightEndHour=hubStepHour(dpSettings.nightEndHour,longPress);hubPersistDisplay(true);}
          else{dpSettings.finishDisplayMins=hubStepFinishDelay(dpSettings.finishDisplayMins,longPress);hubPersistDisplay(false);}
        }else{
          if(i==0){dpSettings.doorAckEnabled=!dpSettings.doorAckEnabled;hubPersistDisplay(false);}
          else if(i==1){dpSettings.keepPrintScreen=!dpSettings.keepPrintScreen;hubPersistDisplay(false);}
          else if(i==2){dpSettings.finishShowTime=!dpSettings.finishShowTime;hubPersistDisplay(false);}
          else{dispSettings.timeDisplayMode=(uint8_t)((dispSettings.timeDisplayMode+(longPress?2U:1U))%3U);hubPersistDisplay(false);}
        }
'''
    t = once(t, old_touch, new_touch, "Behavior touch page")
    save(root, rel, t)

    checks = {
        "include/smart_home_build.h": [
            'SMART_HOME_VERSION "v11.10"',
            'SMART_HOME_PROFILE "display-behavior"',
            'Smart Home v11.10 Display Behavior RC1',
        ],
        "src/smart_hub.cpp": [
            "hubTimeDisplayLabel",
            '"BEHAVIOR"',
            '"DOOR ACK"',
            '"KEEP PRINT SCREEN"',
            '"FINISH TIMESTAMP"',
            '"TIME DISPLAY"',
            '"BEHAVIOR >"',
            "dpSettings.doorAckEnabled=!dpSettings.doorAckEnabled",
            "dpSettings.keepPrintScreen=!dpSettings.keepPrintScreen",
            "dpSettings.finishShowTime=!dpSettings.finishShowTime",
            "dispSettings.timeDisplayMode=(uint8_t)((dispSettings.timeDisplayMode+(longPress?2U:1U))%3U)",
            "(g_displayExperiencePage+1U)%3U",
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
    print("Smart Home v11.10 Display Behavior applied")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
