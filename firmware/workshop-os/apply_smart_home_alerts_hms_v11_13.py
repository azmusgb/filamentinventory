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


HMS_HELPERS = r'''static const char* hubHmsAutoLabel() {
#if HAS_HMS_UI
  switch (dispSettings.hmsAutoPresent) {
    case 1: return "BRIEF";
    case 2: return "HOLD";
    default:return "BADGE";
  }
#else
  return "N/A";
#endif
}

'''


def patch(root: Path) -> None:
    rel = "include/smart_home_build.h"
    t = load(root, rel)
    t = once(t, '#define SMART_HOME_VERSION "v11.12"',
             '#define SMART_HOME_VERSION "v11.13"', "version")
    t = once(t, '#define SMART_HOME_PROFILE "clock-experience"',
             '#define SMART_HOME_PROFILE "alerts-hms"', "profile")
    t = once(t, 'Smart Home v11.12 Clock Experience RC1',
             'Smart Home v11.13 Alerts & HMS RC1', "label")
    save(root, rel, t)

    rel = "src/smart_hub.cpp"
    t = load(root, rel)

    anchor = "static void drawDisplayExperience(bool full) {"
    if HMS_HELPERS.strip() not in t:
        t = once(t, anchor, HMS_HELPERS + anchor, "HMS helper")

    t = once(t,
             "  const uint8_t page = (uint8_t)(g_displayExperiencePage % 5U);\n"
             "  const bool quick = page == 0;\n"
             "  const bool schedule = page == 1;\n"
             "  const bool behavior = page == 2;\n"
             "  const bool visual = page == 3;\n",
             "  const uint8_t page = (uint8_t)(g_displayExperiencePage % 7U);\n"
             "  const bool quick = page == 0;\n"
             "  const bool schedule = page == 1;\n"
             "  const bool behavior = page == 2;\n"
             "  const bool visual = page == 3;\n"
             "  const bool clock = page == 4;\n"
             "  const bool alerts = page == 5;\n",
             "seven-page page flags")

    t = once(t,
             '  drawHeader("DISPLAY",\n'
             '             quick ? "QUICK" : (schedule ? "SCHEDULE" : (behavior ? "BEHAVIOR" : (visual ? "VISUAL" : "CLOCK"))),\n'
             '             3);\n',
             '  drawHeader("DISPLAY",\n'
             '             quick ? "QUICK" : (schedule ? "SCHEDULE" : (behavior ? "BEHAVIOR" : (visual ? "VISUAL" : (clock ? "CLOCK" : (alerts ? "ALERTS" : "SIGNALS"))))),\n'
             '             3);\n',
             "seven-page header")

    old_clock = r'''  } else {
    uiDisplaySettingCard(hubMoreRect(0), "PONG CLOCK",
                         dispSettings.pongClock ? "ON" : "OFF",
                         "Animated idle clock", UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(1), "TIME SIZE",
                         hubClockSizeLabel(dispSettings.clockTimeSize),
                         "Tap next / hold previous", UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(2), "DATE SIZE",
                         hubClockSizeLabel(dispSettings.clockDateSize),
                         "Tap next / hold previous", UI_PURPLE);
    uiDisplaySettingCard(hubMoreRect(3), "DATE VISIBILITY",
                         dispSettings.hideClockDate ? "HIDDEN" : "SHOWN",
                         "Toggle date on idle clock", UI_GREEN);
  }
'''
    new_clock_alerts = r'''  } else if (clock) {
    uiDisplaySettingCard(hubMoreRect(0), "PONG CLOCK",
                         dispSettings.pongClock ? "ON" : "OFF",
                         "Animated idle clock", UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(1), "TIME SIZE",
                         hubClockSizeLabel(dispSettings.clockTimeSize),
                         "Tap next / hold previous", UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(2), "DATE SIZE",
                         hubClockSizeLabel(dispSettings.clockDateSize),
                         "Tap next / hold previous", UI_PURPLE);
    uiDisplaySettingCard(hubMoreRect(3), "DATE VISIBILITY",
                         dispSettings.hideClockDate ? "HIDDEN" : "SHOWN",
                         "Toggle date on idle clock", UI_GREEN);
  } else if (alerts) {
#if HAS_HMS_UI
    uiDisplaySettingCard(hubMoreRect(0), "PRINTER ERRORS",
                         dispSettings.hmsEnabled ? "ON" : "OFF",
                         "Master HMS and print-error alerts", UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(1), "SEVERITY",
                         dispSettings.hmsSeverityAll ? "ALL" : "IMPORTANT",
                         dispSettings.hmsSeverityAll ? "Includes common severity" : "Important severity only",
                         UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(2), "AUTO PRESENT",
                         hubHmsAutoLabel(),
                         "Badge / brief / hold", UI_PURPLE);
    uiDisplaySettingCard(hubMoreRect(3), "ONLINE LOOKUP",
                         dispSettings.hmsLookupOnline ? "ON" : "OFF",
                         "Portal sentence lookup preference", UI_GREEN);
#else
    uiDisplaySettingCard(hubMoreRect(0), "PRINTER ERRORS", "N/A",
                         "HMS UI unavailable on this board", UI_MUTED);
#endif
  } else {
#if HAS_HMS_UI
    uiDisplaySettingCard(hubMoreRect(0), "ERROR GLOW",
                         (dispSettings.hmsAlertMask & 0x01U) ? "ON" : "OFF",
                         "Edge-glow alert signal", UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(1), "ERROR BUZZER",
                         (dispSettings.hmsAlertMask & 0x02U) ? "ON" : "OFF",
                         "Audible alert signal", UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(2), "ERROR LED",
                         (dispSettings.hmsAlertMask & 0x04U) ? "ON" : "OFF",
                         "Status LED alert signal", UI_PURPLE);
    uiDisplaySettingCard(hubMoreRect(3), "WAKE DISPLAY",
                         (dispSettings.hmsAlertMask & 0x08U) ? "ON" : "OFF",
                         "Wake screen for new error", UI_GREEN);
#else
    uiDisplaySettingCard(hubMoreRect(0), "ERROR SIGNALS", "N/A",
                         "HMS UI unavailable on this board", UI_MUTED);
#endif
  }
'''
    t = once(t, old_clock, new_clock_alerts, "alerts and signals renderer")

    t = once(t,
             '  const char* nextLabel = quick ? "SCHEDULE >"\n'
             '                                : (schedule ? "BEHAVIOR >"\n'
             '                                            : (behavior ? "VISUAL >"\n'
             '                                                        : (visual ? "CLOCK >" : "QUICK >")));\n',
             '  const char* nextLabel = quick ? "SCHEDULE >"\n'
             '                                : (schedule ? "BEHAVIOR >"\n'
             '                                            : (behavior ? "VISUAL >"\n'
             '                                                        : (visual ? "CLOCK >"\n'
             '                                                                  : (clock ? "ALERTS >"\n'
             '                                                                           : (alerts ? "SIGNALS >" : "QUICK >")))));\n',
             "seven-page pager labels")

    t = once(t,
             '                    : (schedule ? "Night schedule and finish timing"\n'
             '                                : (behavior ? "After-print behavior and time readout"\n'
             '                                            : (visual ? "Dashboard density and motion"\n'
             '                                                      : "Idle clock style and typography"))),\n',
             '                    : (schedule ? "Night schedule and finish timing"\n'
             '                                : (behavior ? "After-print behavior and time readout"\n'
             '                                            : (visual ? "Dashboard density and motion"\n'
             '                                                      : (clock ? "Idle clock style and typography"\n'
             '                                                               : (alerts ? "Printer-error presentation policy"\n'
             '                                                                         : "Printer-error alert signals"))))),\n',
             "landscape page description")

    t = once(t,
             '                    : (schedule ? "SCHEDULE & FINISH"\n'
             '                                : (behavior ? "FINISH BEHAVIOR"\n'
             '                                            : (visual ? "VISUAL PRESENTATION" : "CLOCK EXPERIENCE"))),\n',
             '                    : (schedule ? "SCHEDULE & FINISH"\n'
             '                                : (behavior ? "FINISH BEHAVIOR"\n'
             '                                            : (visual ? "VISUAL PRESENTATION"\n'
             '                                                      : (clock ? "CLOCK EXPERIENCE"\n'
             '                                                               : (alerts ? "PRINTER ALERTS" : "ALERT SIGNALS"))))),\n',
             "portrait page heading")

    t = once(t,
             '                    : (schedule ? "All values save immediately on this device"\n'
             '                                : (behavior ? "Tap toggles • time mode supports reverse hold"\n'
             '                                            : (visual ? "Motion, labels, fan precision and status density"\n'
             '                                                      : "Clock animation, type scale and date visibility"))),\n',
             '                    : (schedule ? "All values save immediately on this device"\n'
             '                                : (behavior ? "Tap toggles • time mode supports reverse hold"\n'
             '                                            : (visual ? "Motion, labels, fan precision and status density"\n'
             '                                                      : (clock ? "Clock animation, type scale and date visibility"\n'
             '                                                               : (alerts ? "Master policy, severity and presentation"\n'
             '                                                                         : "Glow, buzzer, LED and wake are independent"))))),\n',
             "portrait page description")

    t = once(t,
             "        g_displayExperiencePage=(uint8_t)((g_displayExperiencePage+1U)%5U);",
             "        g_displayExperiencePage=(uint8_t)((g_displayExperiencePage+1U)%7U);",
             "seven-page pager")

    old_touch = r'''        if(g_displayExperiencePage==0){
          if(i==0){brightness=hubStepPreset(brightness,mainLevels,4,longPress);hubPersistDisplay(true);}
          else if(i==1){dpSettings.screensaverBrightness=hubStepPreset(dpSettings.screensaverBrightness,standbyLevels,5,longPress);hubPersistDisplay(false);}
          else if(i==2){dpSettings.nightModeEnabled=!dpSettings.nightModeEnabled;hubPersistDisplay(true);}
          else{hubCycleAfterPrint(longPress);hubPersistDisplay(false);}
        }else if(g_displayExperiencePage==1){
          if(i==0){dpSettings.nightBrightness=hubStepPreset(dpSettings.nightBrightness,standbyLevels,5,longPress);hubPersistDisplay(true);}
          else if(i==1){dpSettings.nightStartHour=hubStepHour(dpSettings.nightStartHour,longPress);hubPersistDisplay(true);}
          else if(i==2){dpSettings.nightEndHour=hubStepHour(dpSettings.nightEndHour,longPress);hubPersistDisplay(true);}
          else{dpSettings.finishDisplayMins=hubStepFinishDelay(dpSettings.finishDisplayMins,longPress);hubPersistDisplay(false);}
        }else if(g_displayExperiencePage==2){
          if(i==0){dpSettings.doorAckEnabled=!dpSettings.doorAckEnabled;hubPersistDisplay(false);}
          else if(i==1){dpSettings.keepPrintScreen=!dpSettings.keepPrintScreen;hubPersistDisplay(false);}
          else if(i==2){dpSettings.finishShowTime=!dpSettings.finishShowTime;hubPersistDisplay(false);}
          else{dispSettings.timeDisplayMode=(uint8_t)((dispSettings.timeDisplayMode+(longPress?2U:1U))%3U);hubPersistDisplay(false);}
        }else if(g_displayExperiencePage==3){
          if(i==0){dispSettings.animatedBar=!dispSettings.animatedBar;hubPersistDisplay(false);}
          else if(i==1){dispSettings.smallLabels=!dispSettings.smallLabels;hubPersistDisplay(false);}
          else if(i==2){dispSettings.fanMatchPrinter=!dispSettings.fanMatchPrinter;hubPersistDisplay(false);}
          else{dispSettings.hideStatusReadout=!dispSettings.hideStatusReadout;hubPersistDisplay(false);}
        }else{
          if(i==0){dispSettings.pongClock=!dispSettings.pongClock;hubPersistDisplay(false);}
          else if(i==1){dispSettings.clockTimeSize=(uint8_t)((dispSettings.clockTimeSize+(longPress?3U:1U))%4U);hubPersistDisplay(false);}
          else if(i==2){dispSettings.clockDateSize=(uint8_t)((dispSettings.clockDateSize+(longPress?3U:1U))%4U);hubPersistDisplay(false);}
          else{dispSettings.hideClockDate=!dispSettings.hideClockDate;hubPersistDisplay(false);}
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
        }else if(g_displayExperiencePage==2){
          if(i==0){dpSettings.doorAckEnabled=!dpSettings.doorAckEnabled;hubPersistDisplay(false);}
          else if(i==1){dpSettings.keepPrintScreen=!dpSettings.keepPrintScreen;hubPersistDisplay(false);}
          else if(i==2){dpSettings.finishShowTime=!dpSettings.finishShowTime;hubPersistDisplay(false);}
          else{dispSettings.timeDisplayMode=(uint8_t)((dispSettings.timeDisplayMode+(longPress?2U:1U))%3U);hubPersistDisplay(false);}
        }else if(g_displayExperiencePage==3){
          if(i==0){dispSettings.animatedBar=!dispSettings.animatedBar;hubPersistDisplay(false);}
          else if(i==1){dispSettings.smallLabels=!dispSettings.smallLabels;hubPersistDisplay(false);}
          else if(i==2){dispSettings.fanMatchPrinter=!dispSettings.fanMatchPrinter;hubPersistDisplay(false);}
          else{dispSettings.hideStatusReadout=!dispSettings.hideStatusReadout;hubPersistDisplay(false);}
        }else if(g_displayExperiencePage==4){
          if(i==0){dispSettings.pongClock=!dispSettings.pongClock;hubPersistDisplay(false);}
          else if(i==1){dispSettings.clockTimeSize=(uint8_t)((dispSettings.clockTimeSize+(longPress?3U:1U))%4U);hubPersistDisplay(false);}
          else if(i==2){dispSettings.clockDateSize=(uint8_t)((dispSettings.clockDateSize+(longPress?3U:1U))%4U);hubPersistDisplay(false);}
          else{dispSettings.hideClockDate=!dispSettings.hideClockDate;hubPersistDisplay(false);}
        }else if(g_displayExperiencePage==5){
#if HAS_HMS_UI
          if(i==0){dispSettings.hmsEnabled=!dispSettings.hmsEnabled;hubPersistDisplay(false);}
          else if(i==1){dispSettings.hmsSeverityAll=!dispSettings.hmsSeverityAll;hubPersistDisplay(false);}
          else if(i==2){dispSettings.hmsAutoPresent=(uint8_t)((dispSettings.hmsAutoPresent+(longPress?2U:1U))%3U);hubPersistDisplay(false);}
          else{dispSettings.hmsLookupOnline=!dispSettings.hmsLookupOnline;hubPersistDisplay(false);}
#endif
        }else{
#if HAS_HMS_UI
          const uint8_t bit=(uint8_t)(1U<<i);
          dispSettings.hmsAlertMask=(uint8_t)(dispSettings.hmsAlertMask^bit);hubPersistDisplay(false);
#endif
        }
'''
    t = once(t, old_touch, new_touch, "HMS touch pages")
    save(root, rel, t)

    checks = {
        "include/smart_home_build.h": [
            'SMART_HOME_VERSION "v11.13"',
            'SMART_HOME_PROFILE "alerts-hms"',
            'Smart Home v11.13 Alerts & HMS RC1',
        ],
        "src/smart_hub.cpp": [
            "hubHmsAutoLabel",
            '"ALERTS"',
            '"SIGNALS"',
            '"PRINTER ERRORS"',
            '"SEVERITY"',
            '"AUTO PRESENT"',
            '"ONLINE LOOKUP"',
            '"ERROR GLOW"',
            '"ERROR BUZZER"',
            '"ERROR LED"',
            '"WAKE DISPLAY"',
            '"ALERTS >"',
            '"SIGNALS >"',
            "dispSettings.hmsEnabled=!dispSettings.hmsEnabled",
            "dispSettings.hmsSeverityAll=!dispSettings.hmsSeverityAll",
            "dispSettings.hmsAlertMask=(uint8_t)(dispSettings.hmsAlertMask^bit)",
            "(g_displayExperiencePage+1U)%7U",
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
    print("Smart Home v11.13 Alerts & HMS applied")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
