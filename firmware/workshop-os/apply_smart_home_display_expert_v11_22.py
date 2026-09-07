#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

MARKER = "Smart Home v11.22 physical Display Expert controls"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one anchor, found {count}")
    return text.replace(old, new, 1)


def apply(repo: Path) -> None:
    hub_path = repo / "src" / "smart_hub.cpp"
    web_path = repo / "src" / "web_server.cpp"
    build_path = repo / "include" / "smart_home_build.h"
    for path in (hub_path, web_path, build_path):
        if not path.exists():
            raise SystemExit(f"missing reconstructed source: {path}")

    hub = hub_path.read_text(encoding="utf-8")
    web = web_path.read_text(encoding="utf-8")
    build = build_path.read_text(encoding="utf-8")

    if MARKER in hub:
        if 'SMART_HOME_VERSION "v11.22"' not in build:
            raise SystemExit("v11.22 marker exists but build identity is not v11.22")
        print("v11.22 Display Expert already applied")
        return

    if 'SMART_HOME_VERSION "v11.20"' not in build:
        raise SystemExit("v11.22 patch requires reconstructed v11.20 Portal Auth source")

    hub = replace_once(
        hub,
        "bool g_displayExperienceView = false;\nuint8_t g_displayExperiencePage = 0;",
        "bool g_displayExperienceView = false;\nuint8_t g_displayExperiencePage = 0;\nuint8_t g_displayGaugeColorIndex = 0;\nstatic const uint8_t HUB_DISPLAY_PAGE_COUNT = 14;",
        "display state",
    )

    helper_block = r'''
// ---------------------------------------------------------------------------
// Smart Home v11.22 physical Display Expert controls
// ---------------------------------------------------------------------------
struct HubColorChoice {
  uint16_t value;
  const char* label;
};

static const HubColorChoice HUB_EXPERT_COLORS[] = {
  {CLR_GREEN, "GREEN"}, {CLR_CYAN, "CYAN"}, {CLR_BLUE, "BLUE"},
  {CLR_ORANGE, "ORANGE"}, {CLR_GOLD, "GOLD"}, {CLR_YELLOW, "YELLOW"},
  {CLR_RED, "RED"}, {CLR_TEXT_DEFAULT, "WHITE"}
};
static const uint8_t HUB_EXPERT_COLOR_COUNT =
    (uint8_t)(sizeof(HUB_EXPERT_COLORS) / sizeof(HUB_EXPERT_COLORS[0]));

struct HubThemePreset {
  const char* label;
  uint16_t bg;
  uint16_t track;
  uint16_t pbar;
  uint16_t eta;
  uint16_t finish;
  uint16_t statusOk;
  uint16_t printerName;
  uint16_t text;
  uint16_t textDim;
  uint16_t doorClosed;
  uint16_t doorOpen;
  uint16_t clockTime;
  uint16_t clockDate;
};

static const HubThemePreset HUB_THEMES[] = {
  {"FACTORY", CLR_BG, CLR_TRACK, CLR_GREEN, CLR_GREEN, CLR_GREEN, CLR_GREEN,
   CLR_GREEN, CLR_TEXT_DEFAULT, CLR_TEXT_DIM_DEFAULT, CLR_GREEN, CLR_ORANGE,
   CLR_TEXT_DEFAULT, CLR_TEXT_DIM_DEFAULT},
  {"WORKSHOP", CLR_BG, CLR_TRACK, CLR_ORANGE, CLR_GOLD, CLR_GOLD, CLR_GREEN,
   CLR_ORANGE, CLR_TEXT_DEFAULT, CLR_TEXT_DIM_DEFAULT, CLR_GREEN, CLR_ORANGE,
   CLR_GOLD, CLR_ORANGE},
  {"OCEAN", CLR_BG, CLR_TRACK, CLR_CYAN, CLR_CYAN, CLR_BLUE, CLR_CYAN,
   CLR_BLUE, CLR_TEXT_DEFAULT, CLR_TEXT_DIM_DEFAULT, CLR_CYAN, CLR_ORANGE,
   CLR_CYAN, CLR_BLUE},
  {"MONO", CLR_BG, CLR_TRACK, CLR_TEXT_DEFAULT, CLR_TEXT_DEFAULT,
   CLR_TEXT_DEFAULT, CLR_GREEN, CLR_TEXT_DEFAULT, CLR_TEXT_DEFAULT,
   CLR_TEXT_DIM_DEFAULT, CLR_GREEN, CLR_ORANGE, CLR_TEXT_DEFAULT,
   CLR_TEXT_DIM_DEFAULT}
};
static const uint8_t HUB_THEME_COUNT =
    (uint8_t)(sizeof(HUB_THEMES) / sizeof(HUB_THEMES[0]));

static void hubPersistDisplayExpert() {
  saveSettings();
  applyDisplaySettings();
  buzzerPlay(BUZZ_CLICK);
  g_dirty = true;
}

static const char* hubExpertColorName(uint16_t value) {
  for (uint8_t i = 0; i < HUB_EXPERT_COLOR_COUNT; ++i)
    if (HUB_EXPERT_COLORS[i].value == value) return HUB_EXPERT_COLORS[i].label;
  return "CUSTOM";
}

static uint16_t hubCycleExpertColor(uint16_t current, bool reverse) {
  int8_t found = -1;
  for (uint8_t i = 0; i < HUB_EXPERT_COLOR_COUNT; ++i) {
    if (HUB_EXPERT_COLORS[i].value == current) { found = (int8_t)i; break; }
  }
  if (found < 0)
    return HUB_EXPERT_COLORS[reverse ? HUB_EXPERT_COLOR_COUNT - 1U : 0U].value;
  const uint8_t next = reverse
      ? (uint8_t)((found + HUB_EXPERT_COLOR_COUNT - 1) % HUB_EXPERT_COLOR_COUNT)
      : (uint8_t)((found + 1) % HUB_EXPERT_COLOR_COUNT);
  return HUB_EXPERT_COLORS[next].value;
}

static int8_t hubThemePresetIndex() {
  for (uint8_t i = 0; i < HUB_THEME_COUNT; ++i) {
    const HubThemePreset& p = HUB_THEMES[i];
    if (dispSettings.bgColor == p.bg && dispSettings.trackColor == p.track &&
        dispSettings.progressBarColor == p.pbar && dispSettings.etaColor == p.eta &&
        dispSettings.finishColor == p.finish && dispSettings.statusOkColor == p.statusOk &&
        dispSettings.printerNameColor == p.printerName && dispSettings.textColor == p.text &&
        dispSettings.textDimColor == p.textDim && dispSettings.doorClosedColor == p.doorClosed &&
        dispSettings.doorOpenColor == p.doorOpen && dispSettings.clockTimeColor == p.clockTime &&
        dispSettings.clockDateColor == p.clockDate) return (int8_t)i;
  }
  return -1;
}

static const char* hubThemePresetLabel() {
  const int8_t idx = hubThemePresetIndex();
  return idx >= 0 ? HUB_THEMES[idx].label : "CUSTOM";
}

static void hubApplyThemePreset(uint8_t index) {
  const HubThemePreset& p = HUB_THEMES[index % HUB_THEME_COUNT];
  dispSettings.bgColor = p.bg;
  dispSettings.trackColor = p.track;
  dispSettings.progressBarColor = p.pbar;
  dispSettings.etaColor = p.eta;
  dispSettings.finishColor = p.finish;
  dispSettings.statusOkColor = p.statusOk;
  dispSettings.printerNameColor = p.printerName;
  dispSettings.textColor = p.text;
  dispSettings.textDimColor = p.textDim;
  dispSettings.doorClosedColor = p.doorClosed;
  dispSettings.doorOpenColor = p.doorOpen;
  dispSettings.clockTimeColor = p.clockTime;
  dispSettings.clockDateColor = p.clockDate;
}

static void hubCycleTheme(bool reverse) {
  int8_t idx = hubThemePresetIndex();
  if (idx < 0) idx = reverse ? 0 : -1;
  const uint8_t next = reverse
      ? (uint8_t)((idx + HUB_THEME_COUNT - 1) % HUB_THEME_COUNT)
      : (uint8_t)((idx + 1) % HUB_THEME_COUNT);
  hubApplyThemePreset(next);
}

static const char* hubGaugeName(uint8_t index) {
  static const char* names[] = {
    "PROGRESS", "NOZZLE", "BED", "PART FAN", "AUX FAN", "AUX RIGHT",
    "CHAMBER FAN", "EXHAUST", "CHAMBER TEMP", "HEATBREAK", "POWER", "LAYER"
  };
  return names[index % 12U];
}

static GaugeColors* hubSelectedGaugeColors() {
  switch (g_displayGaugeColorIndex % 12U) {
    case 0: return &dispSettings.progress;
    case 1: return &dispSettings.nozzle;
    case 2: return &dispSettings.bed;
    case 3: return &dispSettings.partFan;
    case 4: return &dispSettings.auxFan;
    case 5: return &dispSettings.auxFanRight;
    case 6: return &dispSettings.chamberFan;
    case 7: return &dispSettings.exhaustFan;
    case 8: return &dispSettings.chamberTemp;
    case 9: return &dispSettings.heatbreak;
    case 10:return &dispSettings.power;
    default:return &dispSettings.layer;
  }
}

static uint16_t hubStepPreset16(uint16_t current, const uint16_t* values,
                                uint8_t count, bool reverse) {
  if (!values || count == 0) return current;
  if (reverse) {
    for (int8_t i = (int8_t)count - 1; i >= 0; --i)
      if (values[i] < current) return values[i];
    return values[0];
  }
  for (uint8_t i = 0; i < count; ++i)
    if (values[i] > current) return values[i];
  return values[count - 1];
}

static const char* hubGaugeSmoothingLabel() {
  switch (dispSettings.gaugeSmoothing) {
    case 0: return "OFF";
    case 1: return "SLOW";
    case 3: return "FAST";
    default:return "NORMAL";
  }
}

static const char* hubGlowModeLabel() {
  switch (dispSettings.glowMode) {
    case 1: return "SINGLE";
    case 2: return "RAINBOW";
    default:return "OFF";
  }
}

static const char* hubGlowStyleLabel() {
  switch (dispSettings.glowStyle) {
    case 1: return "PULSE";
    case 2: return "STORM";
    default:return "SWEEP";
  }
}

static const char* hubGlowDurationLabel() {
  switch (dispSettings.glowDuration) {
    case 1: return "UNTIL DISMISSED";
    case 2: return "REMINDER";
    default:return "BURST";
  }
}

static const char* hubDisplayPageLabel(uint8_t page) {
  static const char* labels[HUB_DISPLAY_PAGE_COUNT] = {
    "QUICK", "SCHEDULE", "BEHAVIOR", "VISUAL", "CLOCK", "ALERTS", "SIGNALS",
    "THEME", "GAUGE COLORS", "GAUGE SCALES", "GAUGE BEHAVIOR", "GLOW", "LAYOUT", "EXTRAS"
  };
  return labels[page % HUB_DISPLAY_PAGE_COUNT];
}

static const char* hubDisplayPageNextLabel(uint8_t page) {
  static const char* labels[HUB_DISPLAY_PAGE_COUNT] = {
    "SCHEDULE >", "BEHAVIOR >", "VISUAL >", "CLOCK >", "ALERTS >", "SIGNALS >",
    "THEME >", "COLORS >", "SCALES >", "BEHAVIOR >", "GLOW >", "LAYOUT >", "EXTRAS >", "QUICK >"
  };
  return labels[page % HUB_DISPLAY_PAGE_COUNT];
}

static const char* hubDisplayPageFooterTitle(uint8_t page) {
  static const char* labels[HUB_DISPLAY_PAGE_COUNT] = {
    "DISPLAY & EXPERIENCE", "SCHEDULE & FINISH", "FINISH BEHAVIOR", "VISUAL PRESENTATION",
    "CLOCK EXPERIENCE", "PRINTER ALERTS", "ALERT SIGNALS", "DISPLAY THEME", "GAUGE COLOR EDITOR",
    "GAUGE FULL SCALE", "GAUGE BEHAVIOR", "EDGE GLOW", "LAYOUT MODES", "EXPERT EXTRAS"
  };
  return labels[page % HUB_DISPLAY_PAGE_COUNT];
}

static const char* hubDisplayPageFooterDetail(uint8_t page) {
  static const char* labels[HUB_DISPLAY_PAGE_COUNT] = {
    "Large controls for everyday adjustments",
    "Night schedule and finish timing",
    "After-print behavior and time readout",
    "Motion, labels, fan precision and status density",
    "Clock animation, type scale and date visibility",
    "Master policy, severity and presentation",
    "Glow, buzzer, LED and wake are independent",
    "Curated safe palettes; alarm colors stay fixed",
    "Select gauge, then edit arc / label / value color",
    "Nozzle, bed, chamber and power arc maxima",
    "Smoothing and warning policy; labels remain portal input",
    "Mode, style, duration and single-color accent",
    "Extended grids and multi-printer split presentation",
    "Clock footer and AMS tray labels; rotation remains v11.23"
  };
  return labels[page % HUB_DISPLAY_PAGE_COUNT];
}

'''

    hub = replace_once(
        hub,
        "static void drawDisplayExperience(bool full) {",
        helper_block + "static void drawDisplayExperience(bool full) {",
        "expert helper insertion",
    )

    old_header = '''  const int16_t W = tft.width();
  const uint8_t page = (uint8_t)(g_displayExperiencePage % 7U);
  const bool quick = page == 0;
  const bool schedule = page == 1;
  const bool behavior = page == 2;
  const bool visual = page == 3;
  const bool clock = page == 4;
  const bool alerts = page == 5;
  tft.fillScreen(UI_BG);
  drawHeader("DISPLAY",
             quick ? "QUICK" : (schedule ? "SCHEDULE" : (behavior ? "BEHAVIOR" : (visual ? "VISUAL" : (clock ? "CLOCK" : (alerts ? "ALERTS" : "SIGNALS"))))),
             3);
  uiBottomNav(3, nullptr);

  if (quick) {'''
    new_header = '''  const int16_t W = tft.width();
  const uint8_t page = (uint8_t)(g_displayExperiencePage % HUB_DISPLAY_PAGE_COUNT);
  const bool quick = page == 0;
  const bool schedule = page == 1;
  const bool behavior = page == 2;
  const bool visual = page == 3;
  const bool clock = page == 4;
  const bool alerts = page == 5;
  tft.fillScreen(UI_BG);
  drawHeader("DISPLAY", hubDisplayPageLabel(page), 3);
  uiBottomNav(3, nullptr);

  if (quick) {'''
    hub = replace_once(hub, old_header, new_header, "display header")

    hub = replace_once(
        hub,
        '''  } else {
#if HAS_HMS_UI
    uiDisplaySettingCard(hubMoreRect(0), "ERROR GLOW",''',
        '''  } else if (page == 6) {
#if HAS_HMS_UI
    uiDisplaySettingCard(hubMoreRect(0), "ERROR GLOW",''',
        "signals branch",
    )

    expert_draw = r'''#endif
  } else if (page == 7) {
    uiDisplaySettingCard(hubMoreRect(0), "THEME PALETTE", hubThemePresetLabel(),
                         "Tap next / hold previous", UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(1), "CLOCK TIME",
                         hubExpertColorName(dispSettings.clockTimeColor),
                         "Independent clock color", UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(2), "CLOCK DATE",
                         hubExpertColorName(dispSettings.clockDateColor),
                         "Independent date color", UI_PURPLE);
    uiDisplaySettingCard(hubMoreRect(3), "THEME RESET", "FACTORY",
                         "Restore curated factory palette", UI_GREEN);
  } else if (page == 8) {
    GaugeColors* gc = hubSelectedGaugeColors();
    uiDisplaySettingCard(hubMoreRect(0), "GAUGE COLORS",
                         hubGaugeName(g_displayGaugeColorIndex),
                         "Tap next gauge / hold previous", UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(1), "ARC COLOR", hubExpertColorName(gc->arc),
                         "Tap next / hold previous", UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(2), "LABEL COLOR", hubExpertColorName(gc->label),
                         "Tap next / hold previous", UI_PURPLE);
    uiDisplaySettingCard(hubMoreRect(3), "VALUE COLOR", hubExpertColorName(gc->value),
                         "Tap next / hold previous", UI_GREEN);
  } else if (page == 9) {
    char nozzle[16], bed[16], chamber[16], power[16];
    snprintf(nozzle,sizeof(nozzle),"%u C",(unsigned)dispSettings.nozzleScaleMax);
    snprintf(bed,sizeof(bed),"%u C",(unsigned)dispSettings.bedScaleMax);
    snprintf(chamber,sizeof(chamber),"%u C",(unsigned)dispSettings.chamberScaleMax);
    snprintf(power,sizeof(power),"%u W",(unsigned)dispSettings.powerScaleW);
    uiDisplaySettingCard(hubMoreRect(0), "NOZZLE SCALE", nozzle,
                         "100-400 C presets", UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(1), "BED SCALE", bed,
                         "40-150 C presets", UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(2), "CHAMBER SCALE", chamber,
                         "30-120 C presets", UI_PURPLE);
    uiDisplaySettingCard(hubMoreRect(3), "POWER SCALE", power,
                         "100-5000 W presets", UI_GREEN);
  } else if (page == 10) {
    char threshold[16];
    if (dispSettings.warnThresholdPct == 0) strlcpy(threshold,"OFF",sizeof(threshold));
    else snprintf(threshold,sizeof(threshold),"%u%%",(unsigned)dispSettings.warnThresholdPct);
    uiDisplaySettingCard(hubMoreRect(0), "SMOOTHING", hubGaugeSmoothingLabel(),
                         "Off / slow / normal / fast", UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(1), "WARN THRESHOLD", threshold,
                         "0 or 50-100% presets", UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(2), "WARN COLOR",
                         hubExpertColorName(dispSettings.warnColor),
                         "Temperature warning accent", UI_PURPLE,
                         dispSettings.warnThresholdPct > 0);
    uiDisplaySettingCard(hubMoreRect(3), "GAUGE DEFAULTS", "RESTORE",
                         "Smoothing normal / warning off", UI_GREEN);
  } else if (page == 11) {
    uiDisplaySettingCard(hubMoreRect(0), "GLOW MODE", hubGlowModeLabel(),
                         "Off / single / rainbow", UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(1), "GLOW STYLE", hubGlowStyleLabel(),
                         "Sweep / pulse / storm", UI_CYAN,
                         dispSettings.glowMode != 0);
    uiDisplaySettingCard(hubMoreRect(2), "GLOW DURATION", hubGlowDurationLabel(),
                         "Burst / until dismissed / reminder", UI_PURPLE,
                         dispSettings.glowMode != 0);
    uiDisplaySettingCard(hubMoreRect(3), "GLOW COLOR",
                         hubExpertColorName(dispSettings.glowColor),
                         dispSettings.glowMode == 1 ? "Single-color accent" : "Configured • Single mode only",
                         UI_GREEN, dispSettings.glowMode == 1);
  } else if (page == 12) {
    uiDisplaySettingCard(hubMoreRect(0), "8-SLOT LANDSCAPE",
                         dispSettings.landscape8Slots ? "ON" : "OFF",
                         "Replace AMS sidebar with 2x4 grid", UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(1), "9-SLOT PORTRAIT",
                         dispSettings.portrait9Slots ? "ON" : "OFF",
                         "Replace AMS strip with 3x3 grid", UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(2), "SPLIT VIEW",
                         rotState.splitEnabled ? "ON" : "OFF",
                         "Two-printer split presentation", UI_PURPLE);
    uiDisplaySettingCard(hubMoreRect(3), "FORCE SPLIT",
                         rotState.splitForce ? "ON" : "OFF",
                         rotState.splitEnabled ? "Keep split even when one printer idle" : "Configured • Split view off",
                         UI_GREEN, rotState.splitEnabled);
  } else {
    uiDisplaySettingCard(hubMoreRect(0), "CLOCK INFO",
                         dispSettings.showClockInfo ? "ON" : "OFF",
                         "Printer name + LAN IP footer", UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(1), "AMS TRAY TYPES",
                         dispSettings.amsTrayTypes ? "ON" : "OFF",
                         "Show filament type under AMS bars", UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(2), "GAUGE LABELS", "PORTAL",
                         "Free text stays browser-only", UI_PURPLE, false);
    uiDisplaySettingCard(hubMoreRect(3), "ROTATION", "v11.23",
                         "Guarded touch remap comes next", UI_GREEN, false);
  }

  HubRect pager'''
    hub = replace_once(
        hub,
        "#endif\n  }\n\n  HubRect pager",
        expert_draw,
        "expert draw pages",
    )

    old_next = '''  const char* nextLabel = quick ? "SCHEDULE >"
                                : (schedule ? "BEHAVIOR >"
                                            : (behavior ? "VISUAL >"
                                                        : (visual ? "CLOCK >"
                                                                  : (clock ? "ALERTS >"
                                                                           : (alerts ? "SIGNALS >" : "QUICK >")))));'''
    hub = replace_once(
        hub,
        old_next,
        "  const char* nextLabel = hubDisplayPageNextLabel(page);",
        "display next label",
    )

    old_land = '''    uiDrawFit(quick ? "Common display controls"
                    : (schedule ? "Night schedule and finish timing"
                                : (behavior ? "After-print behavior and time readout"
                                            : (visual ? "Dashboard density and motion"
                                                      : (clock ? "Idle clock style and typography"
                                                               : (alerts ? "Printer-error presentation policy"
                                                                         : "Printer-error alert signals"))))),
              20, 237, W - 184, FONT_SMALL, ML_DATUM, UI_DIM, UI_PANEL_2);'''
    hub = replace_once(
        hub,
        old_land,
        '''    uiDrawFit(hubDisplayPageFooterDetail(page),
              20, 237, W - 184, FONT_SMALL, ML_DATUM, UI_DIM, UI_PANEL_2);''',
        "landscape footer",
    )

    old_portrait = '''    uiDrawFit(quick ? "DISPLAY & EXPERIENCE"
                    : (schedule ? "SCHEDULE & FINISH"
                                : (behavior ? "FINISH BEHAVIOR"
                                            : (visual ? "VISUAL PRESENTATION"
                                                      : (clock ? "CLOCK EXPERIENCE"
                                                               : (alerts ? "PRINTER ALERTS" : "ALERT SIGNALS"))))),
              20, 319, W - 40, FONT_SMALL, TL_DATUM, UI_PURPLE, UI_PANEL_2);
    uiDrawFit(quick ? "Large controls for everyday adjustments"
                    : (schedule ? "All values save immediately on this device"
                                : (behavior ? "Tap toggles • time mode supports reverse hold"
                                            : (visual ? "Motion, labels, fan precision and status density"
                                                      : (clock ? "Clock animation, type scale and date visibility"
                                                               : (alerts ? "Master policy, severity and presentation"
                                                                         : "Glow, buzzer, LED and wake are independent"))))),
              20, 344, W - 40, FONT_BODY, TL_DATUM, UI_TEXT, UI_PANEL_2);'''
    hub = replace_once(
        hub,
        old_portrait,
        '''    uiDrawFit(hubDisplayPageFooterTitle(page),
              20, 319, W - 40, FONT_SMALL, TL_DATUM, UI_PURPLE, UI_PANEL_2);
    uiDrawFit(hubDisplayPageFooterDetail(page),
              20, 344, W - 40, FONT_BODY, TL_DATUM, UI_TEXT, UI_PANEL_2);''',
        "portrait footer",
    )

    hub = replace_once(
        hub,
        '''      if(hubDisplayPagerRect().contains(x,y)){
        g_displayExperiencePage=(uint8_t)((g_displayExperiencePage+1U)%7U);
        buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;
      }''',
        '''      if(hubDisplayPagerRect().contains(x,y)){
        g_displayExperiencePage=longPress
          ? (uint8_t)((g_displayExperiencePage+HUB_DISPLAY_PAGE_COUNT-1U)%HUB_DISPLAY_PAGE_COUNT)
          : (uint8_t)((g_displayExperiencePage+1U)%HUB_DISPLAY_PAGE_COUNT);
        buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;
      }''',
        "display pager touch",
    )

    touch_old = r'''        }else{
#if HAS_HMS_UI
          const uint8_t bit=(uint8_t)(1U<<i);
          dispSettings.hmsAlertMask=(uint8_t)(dispSettings.hmsAlertMask^bit);hubPersistDisplay(false);
#endif
        }
        return true;'''
    touch_new = r'''        }else if(g_displayExperiencePage==6){
#if HAS_HMS_UI
          const uint8_t bit=(uint8_t)(1U<<i);
          dispSettings.hmsAlertMask=(uint8_t)(dispSettings.hmsAlertMask^bit);hubPersistDisplay(false);
#endif
        }else if(g_displayExperiencePage==7){
          if(i==0){hubCycleTheme(longPress);hubPersistDisplayExpert();}
          else if(i==1){dispSettings.clockTimeColor=hubCycleExpertColor(dispSettings.clockTimeColor,longPress);hubPersistDisplayExpert();}
          else if(i==2){dispSettings.clockDateColor=hubCycleExpertColor(dispSettings.clockDateColor,longPress);hubPersistDisplayExpert();}
          else{hubApplyThemePreset(0);hubPersistDisplayExpert();}
        }else if(g_displayExperiencePage==8){
          GaugeColors* gc=hubSelectedGaugeColors();
          if(i==0){g_displayGaugeColorIndex=longPress?(uint8_t)((g_displayGaugeColorIndex+11U)%12U):(uint8_t)((g_displayGaugeColorIndex+1U)%12U);buzzerPlay(BUZZ_CLICK);g_dirty=true;}
          else if(i==1){gc->arc=hubCycleExpertColor(gc->arc,longPress);hubPersistDisplayExpert();}
          else if(i==2){gc->label=hubCycleExpertColor(gc->label,longPress);hubPersistDisplayExpert();}
          else{gc->value=hubCycleExpertColor(gc->value,longPress);hubPersistDisplayExpert();}
        }else if(g_displayExperiencePage==9){
          static const uint16_t nozzleScale[] = {100,150,200,250,300,350,400};
          static const uint16_t bedScale[] = {40,60,80,100,120,150};
          static const uint16_t chamberScale[] = {30,40,50,60,80,100,120};
          static const uint16_t powerScale[] = {100,250,500,750,1000,1500,2000,3000,5000};
          if(i==0)dispSettings.nozzleScaleMax=hubStepPreset16(dispSettings.nozzleScaleMax,nozzleScale,7,longPress);
          else if(i==1)dispSettings.bedScaleMax=hubStepPreset16(dispSettings.bedScaleMax,bedScale,6,longPress);
          else if(i==2)dispSettings.chamberScaleMax=hubStepPreset16(dispSettings.chamberScaleMax,chamberScale,7,longPress);
          else dispSettings.powerScaleW=hubStepPreset16(dispSettings.powerScaleW,powerScale,9,longPress);
          hubPersistDisplayExpert();
        }else if(g_displayExperiencePage==10){
          static const uint8_t warningPct[] = {0,50,60,70,80,90,100};
          if(i==0){dispSettings.gaugeSmoothing=(uint8_t)((dispSettings.gaugeSmoothing+(longPress?3U:1U))%4U);hubPersistDisplayExpert();}
          else if(i==1){dispSettings.warnThresholdPct=hubStepPreset(dispSettings.warnThresholdPct,warningPct,7,longPress);hubPersistDisplayExpert();}
          else if(i==2){dispSettings.warnColor=hubCycleExpertColor(dispSettings.warnColor,longPress);hubPersistDisplayExpert();}
          else{dispSettings.gaugeSmoothing=2;dispSettings.warnThresholdPct=0;dispSettings.warnColor=CLR_RED;hubPersistDisplayExpert();}
        }else if(g_displayExperiencePage==11){
          if(i==0){dispSettings.glowMode=(uint8_t)((dispSettings.glowMode+(longPress?2U:1U))%3U);hubPersistDisplayExpert();}
          else if(i==1){dispSettings.glowStyle=(uint8_t)((dispSettings.glowStyle+(longPress?2U:1U))%3U);hubPersistDisplayExpert();}
          else if(i==2){dispSettings.glowDuration=(uint8_t)((dispSettings.glowDuration+(longPress?2U:1U))%3U);hubPersistDisplayExpert();}
          else{dispSettings.glowColor=hubCycleExpertColor(dispSettings.glowColor,longPress);hubPersistDisplayExpert();}
        }else if(g_displayExperiencePage==12){
          if(i==0)dispSettings.landscape8Slots=!dispSettings.landscape8Slots;
          else if(i==1)dispSettings.portrait9Slots=!dispSettings.portrait9Slots;
          else if(i==2)rotState.splitEnabled=!rotState.splitEnabled;
          else rotState.splitForce=!rotState.splitForce;
          hubPersistDisplayExpert();
        }else{
          if(i==0){dispSettings.showClockInfo=!dispSettings.showClockInfo;hubPersistDisplayExpert();}
          else if(i==1){dispSettings.amsTrayTypes=!dispSettings.amsTrayTypes;hubPersistDisplayExpert();}
          else{buzzerPlay(BUZZ_CLICK);g_dirty=true;}
        }
        return true;'''
    hub = replace_once(hub, touch_old, touch_new, "expert touch pages")

    old_pages = '''  static const char* const kDisplayPages[] = {
    "display-quick", "display-schedule", "display-behavior",
    "display-visual", "display-clock", "display-alerts", "display-signals"
  };
  for (uint8_t i = 0; i < 7; ++i) {'''
    new_pages = '''  static const char* const kDisplayPages[] = {
    "display-quick", "display-schedule", "display-behavior",
    "display-visual", "display-clock", "display-alerts", "display-signals",
    "display-theme", "display-gauge-colors", "display-gauge-scales",
    "display-gauge-behavior", "display-glow", "display-layout", "display-extras"
  };
  for (uint8_t i = 0; i < HUB_DISPLAY_PAGE_COUNT; ++i) {'''
    hub = replace_once(hub, old_pages, new_pages, "capture display pages")

    old_catalog = '''    {"id":"display-alerts","label":"Display - Alerts","group":"Display"},
    {"id":"display-signals","label":"Display - Signals","group":"Display"},
    {"id":"system-network","label":"Network Essentials","group":"System"},'''
    new_catalog = '''    {"id":"display-alerts","label":"Display - Alerts","group":"Display"},
    {"id":"display-signals","label":"Display - Signals","group":"Display"},
    {"id":"display-theme","label":"Display - Theme","group":"Display Expert"},
    {"id":"display-gauge-colors","label":"Display - Gauge Colors","group":"Display Expert"},
    {"id":"display-gauge-scales","label":"Display - Gauge Scales","group":"Display Expert"},
    {"id":"display-gauge-behavior","label":"Display - Gauge Behavior","group":"Display Expert"},
    {"id":"display-glow","label":"Display - Glow","group":"Display Expert"},
    {"id":"display-layout","label":"Display - Layout","group":"Display Expert"},
    {"id":"display-extras","label":"Display - Extras","group":"Display Expert"},
    {"id":"system-network","label":"Network Essentials","group":"System"},'''
    web = replace_once(web, old_catalog, new_catalog, "capture catalog")

    build = replace_once(build, '#define SMART_HOME_VERSION "v11.20"', '#define SMART_HOME_VERSION "v11.22"', "build version")
    build = replace_once(build, '#define SMART_HOME_PROFILE "portal-auth"', '#define SMART_HOME_PROFILE "display-expert"', "build profile")
    build = replace_once(build, '#define SMART_HOME_BUILD_LABEL "Smart Home v11.20 Portal Auth RC1"', '#define SMART_HOME_BUILD_LABEL "Smart Home v11.22 Display Expert RC1"', "build label")

    hub_path.write_text(hub, encoding="utf-8")
    web_path.write_text(web, encoding="utf-8")
    build_path.write_text(build, encoding="utf-8")
    print("Applied Smart Home v11.22 Display Expert RC1")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if not args.apply:
        raise SystemExit("refusing to modify source without --apply")
    apply(Path(args.repo).resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
