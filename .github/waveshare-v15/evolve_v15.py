from pathlib import Path
import re

ROOT = Path('.')
INO = ROOT / 'firmware/waveshare-home/WaveshareHome/WaveshareHome.ino'
MODEL = ROOT / 'firmware/waveshare-home/WaveshareHome/AppModel.h'
SERVICES = ROOT / 'firmware/waveshare-home/WaveshareHome/Services.cpp'
WORKSHOP = ROOT / 'firmware/waveshare-home/WaveshareHome/Workshop.cpp'
README = ROOT / 'firmware/waveshare-home/README.md'
TESTS = ROOT / 'tests/waveshare-ux-source.test.mjs'


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


def replace_between(text, start, end, replacement, label):
    a = text.find(start)
    if a < 0:
        raise RuntimeError(f'{label}: start marker not found')
    b = text.find(end, a + len(start))
    if b < 0:
        raise RuntimeError(f'{label}: end marker not found')
    return text[:a] + replacement.rstrip() + '\n\n' + text[b:]


def write(path, text):
    path.write_text(text)
    print('updated', path)

# ---------------------------------------------------------------------------
# App model: versioned schema, workshop home card, useful defaults, filament
# attention summaries, stable update channel.
# ---------------------------------------------------------------------------
model = MODEL.read_text()
model = replace_once(model, 'static constexpr uint32_t CONFIG_SCHEMA_VERSION = 4;\nstatic constexpr char FW_VERSION[] = "1.4.0";',
                     'static constexpr uint32_t CONFIG_SCHEMA_VERSION = 5;\nstatic constexpr char FW_VERSION[] = "1.5.0";', 'model version')
model = replace_once(model,
    'enum class HomeCard : uint8_t { Controls = 0, Today = 1, Printer = 2, Filament = 3, Weather = 4, System = 5, Timers = 6, Attention = 7 };',
    'enum class HomeCard : uint8_t { Controls = 0, Today = 1, Printer = 2, Filament = 3, Weather = 4, System = 5, Timers = 6, Attention = 7, Workshop = 8 };',
    'workshop home card')
model = replace_once(model,
    'HomeCard homeCards[3] = {HomeCard::Controls, HomeCard::Today, HomeCard::System};',
    'HomeCard homeCards[3] = {HomeCard::Printer, HomeCard::Filament, HomeCard::Workshop};',
    'home defaults')
model = replace_once(model, 'uint8_t updateChannel = 1; // 0=stable, 1=preview/RC',
                     'uint8_t updateChannel = 0; // 0=stable, 1=preview/RC', 'stable update default')
filament_struct = '''struct FilamentAttentionSpool {
  bool valid = false;
  char id[40] = "";
  char brand[32] = "";
  char material[24] = "";
  char colorName[32] = "";
  char colorHex[12] = "#64748b";
  int remainingGrams = -1;
  int remainingPercent = -1;
};

struct FilamentState {'''
model = replace_once(model, 'struct FilamentState {', filament_struct, 'filament attention struct')
model = replace_once(model, '  uint32_t updatedMs = 0;\n};\n\nstruct HomeAssistantEntityState',
                     '  uint32_t updatedMs = 0;\n  FilamentAttentionSpool attention[3];\n  uint8_t attentionCount = 0;\n};\n\nstruct HomeAssistantEntityState',
                     'filament attention state')
model = replace_once(model, '    case HomeCard::Attention: return "Attention";\n    default: return "System";',
                     '    case HomeCard::Attention: return "Attention";\n    case HomeCard::Workshop: return "Workshop";\n    default: return "System";',
                     'workshop card name')
write(MODEL, model)

# ---------------------------------------------------------------------------
# Workshop policy: all four exposed modes now have explicit semantics.
# ---------------------------------------------------------------------------
workshop = WORKSHOP.read_text()
new_loop = r'''void WorkshopService::loop(AppConfig &config, AppState &state) {
  state.workshop.enabled = config.workshopEnabled;
  state.workshop.airMode = config.airMode;
  if (!config.workshopEnabled) {
    state.workshop.filterRequested = false;
    state.workshop.filterReason[0] = '\0';
    state.workshop.postFilterUntilMs = 0;
    return;
  }

  if (state.workshop.dryer.running) {
    uint32_t elapsed = (millis() - state.workshop.dryer.startedMs) / 1000UL;
    if (elapsed >= state.workshop.dryer.durationSec) {
      state.workshop.dryer.running = false;
      state.workshop.dryer.remainingSec = 0;
      state.workshop.dryer.completed = true;
    } else {
      state.workshop.dryer.remainingSec = state.workshop.dryer.durationSec - elapsed;
    }
  }

  const bool printJustFinished = lastPrinting_ && !state.printer.printing;
  const bool postWindowActive = (int32_t)(state.workshop.postFilterUntilMs - millis()) > 0;
  const bool airElevated = state.workshop.environment.online && !state.workshop.environment.stale &&
    (state.workshop.environment.pm25 >= config.pm25Alert || state.workshop.environment.voc >= config.vocAlert);

  if (config.airMode == AirMode::Manual) {
    state.workshop.postFilterUntilMs = 0;
    state.workshop.filterRequested = true;
    copyWs(state.workshop.filterReason, sizeof(state.workshop.filterReason), "Manual request");
  } else if (config.airMode == AirMode::Auto) {
    if (state.printer.printing) {
      state.workshop.filterRequested = true;
      copyWs(state.workshop.filterReason, sizeof(state.workshop.filterReason), "Printer active");
    } else if (airElevated) {
      state.workshop.filterRequested = true;
      copyWs(state.workshop.filterReason, sizeof(state.workshop.filterReason), "Air quality elevated");
    } else if (printJustFinished) {
      state.workshop.postFilterUntilMs = millis() + config.postPrintFilterMinutes * 60000UL;
      state.workshop.filterRequested = config.postPrintFilterMinutes > 0;
      copyWs(state.workshop.filterReason, sizeof(state.workshop.filterReason), "Post-print filtration");
    } else if (postWindowActive) {
      state.workshop.filterRequested = true;
      copyWs(state.workshop.filterReason, sizeof(state.workshop.filterReason), "Post-print filtration");
    } else {
      state.workshop.filterRequested = false;
      state.workshop.filterReason[0] = '\0';
      state.workshop.postFilterUntilMs = 0;
    }
  } else if (config.airMode == AirMode::PostPrint) {
    if (printJustFinished) {
      state.workshop.postFilterUntilMs = millis() + config.postPrintFilterMinutes * 60000UL;
    }
    if ((int32_t)(state.workshop.postFilterUntilMs - millis()) > 0) {
      state.workshop.filterRequested = true;
      copyWs(state.workshop.filterReason, sizeof(state.workshop.filterReason), "Post-print filtration");
    } else {
      state.workshop.filterRequested = false;
      state.workshop.filterReason[0] = '\0';
      state.workshop.postFilterUntilMs = 0;
    }
  } else {
    state.workshop.filterRequested = false;
    state.workshop.filterReason[0] = '\0';
    state.workshop.postFilterUntilMs = 0;
  }

  state.workshop.environment.stale = state.workshop.environment.updatedMs == 0 || millis() - state.workshop.environment.updatedMs > 180000UL;
  lastPrinting_ = state.printer.printing;
  lastPresence_ = state.workshop.environment.presence;
}'''
workshop = replace_between(workshop, 'void WorkshopService::loop(AppConfig &config, AppState &state) {',
                           'void WorkshopService::ingestSensor', new_loop, 'workshop loop')
write(WORKSHOP, workshop)

# ---------------------------------------------------------------------------
# Touch UI: stateful navigation, safer touch targets, real secondary surfaces,
# current-screen-only refresh, settings/theme correctness.
# ---------------------------------------------------------------------------
ino = INO.read_text()
ino = replace_once(ino, 'static char appliedTimezone[80] = "";\n',
                   'static char appliedTimezone[80] = "";\nstatic ScreenId currentScreen = ScreenId::Home;\n', 'current screen state') if False else ino
# ScreenId is declared after these globals, so insert the state after the enum.
ino = replace_once(ino,
    'enum class ScreenId : uint8_t {\n  Home, Today, Controls, Apps, Attention, Quick, Settings, Wifi,\n  Timers, Printer, Filament, Workshop, Insights, Automation, Activity, Devices, Readiness, Modes, System, Recovery, Ambient\n};',
    'enum class ScreenId : uint8_t {\n  Home, Today, Controls, Apps, Attention, Quick, Settings, Wifi,\n  Timers, Printer, Filament, Workshop, Insights, Automation, Activity, Devices, Readiness, Modes, System, Recovery, Ambient\n};\nstatic ScreenId currentScreen = ScreenId::Home;',
    'current screen enum')
ino = replace_once(ino,
    'static lv_obj_t *filamentBody = nullptr;\nstatic lv_obj_t *workshopBody = nullptr;',
    'static lv_obj_t *filamentBody = nullptr;\nstatic lv_obj_t *filamentMetricLabels[4] = {nullptr};\nstatic lv_obj_t *workshopBody = nullptr;\nstatic lv_obj_t *workshopEnvironmentLabel = nullptr;\nstatic lv_obj_t *workshopAirLabel = nullptr;\nstatic lv_obj_t *workshopDryerLabel = nullptr;\nstatic lv_obj_t *printerPauseButton = nullptr;\nstatic lv_obj_t *printerResumeButton = nullptr;\nstatic lv_obj_t *printerStopButton = nullptr;',
    'component globals')

scroll_helper = r'''
static lv_obj_t *scrollBodyLabel(lv_obj_t *parent, const char *text, const lv_font_t *font, lv_color_t color,
                                 int x, int y, int w, int h) {
  lv_obj_t *box = panel(parent, x, y, w, h, C_SURFACE);
  lv_obj_add_flag(box, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_scroll_dir(box, LV_DIR_VER);
  lv_obj_set_scrollbar_mode(box, LV_SCROLLBAR_MODE_AUTO);
  lv_obj_set_style_pad_all(box, 10, 0);
  lv_obj_t *body = wrapLabel(box, text, font, color, 0, 0, w - 20);
  lv_obj_set_height(body, LV_SIZE_CONTENT);
  return body;
}
'''
ino = replace_once(ino, 'static lv_obj_t *button(lv_obj_t *parent, const char *text, int x, int y, int w, int h,',
                   scroll_helper + '\nstatic lv_obj_t *button(lv_obj_t *parent, const char *text, int x, int y, int w, int h,',
                   'scroll body helper')
ino = replace_once(ino,
    'static void loadScreen(ScreenId id) {\n  lastInteractionMs = millis();\n  lv_obj_t *target = screenFor(id);\n  if (target) lv_scr_load_anim(target, LV_SCR_LOAD_ANIM_FADE_ON, 110, 0, false);\n}',
    'static void loadScreen(ScreenId id) {\n  lastInteractionMs = millis();\n  currentScreen = id;\n  lv_obj_t *target = screenFor(id);\n  if (target) lv_scr_load_anim(target, LV_SCR_LOAD_ANIM_FADE_ON, 110, 0, false);\n}',
    'load screen tracking')
ino = replace_once(ino,
    'lv_obj_t *bar = panel(screen, 8, 426, 304, 46, lv_color_hex(0x050B0F));',
    'lv_obj_t *bar = panel(screen, 8, 420, 304, 52, lv_color_hex(0x050B0F));', 'bottom nav bar')
ino = replace_once(ino,
    'lv_obj_t *btn = button(bar, items[i].name, 4 + i * 99, 4, 95, 38, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(items[i].id)));',
    'lv_obj_t *btn = button(bar, items[i].name, 4 + i * 99, 4, 95, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(items[i].id)));', 'bottom nav targets')
ino = replace_once(ino, 'title = "Bambu P1S"; snprintf(value, sizeof(value), "%u%%", state.printer.progress);',
    'title = strlen(state.printer.displayName) ? state.printer.displayName : (strlen(state.printer.model) ? state.printer.model : "Bambu printer"); snprintf(value, sizeof(value), "%u%%", state.printer.progress);', 'dynamic hero printer')
ino = replace_once(ino,
    'case HomeCard::Printer: detail = "P1S"; value = state.printer.printing ? String(state.printer.progress) + "%" : (state.printer.online ? state.printer.status : "Setup"); break;',
    'case HomeCard::Printer: detail = strlen(state.printer.model) ? state.printer.model : "Bambu"; value = state.printer.printing ? String(state.printer.progress) + "%" : (state.printer.online ? state.printer.status : "Setup"); break;',
    'dynamic home printer')
ino = replace_once(ino,
    'case HomeCard::Attention: detail = "Alerts"; value = String(state.alertCount); break;\n    case HomeCard::System: default: detail = "Health"; value = state.system.recoveryMode ? "Recovery" : "Good"; break;',
    'case HomeCard::Attention: detail = "Alerts"; value = String(state.alertCount); break;\n    case HomeCard::Workshop: detail = "Air & dryer"; value = state.workshop.filterRequested ? "Filtering" : (state.workshop.dryer.running ? "Drying" : "Ready"); break;\n    case HomeCard::System: default: detail = "Health"; value = state.system.recoveryMode ? "Recovery" : "Good"; break;',
    'workshop home content')
ino = replace_once(ino,
    'case HomeCard::Attention: return ScreenId::Attention; default: return ScreenId::System;',
    'case HomeCard::Attention: return ScreenId::Attention; case HomeCard::Workshop: return ScreenId::Workshop; default: return ScreenId::System;',
    'workshop home routing')

color_fn = r'''
static lv_color_t homeCardColor(HomeCard card) {
  switch (card) {
    case HomeCard::Attention:
      if (!state.alertCount) return C_GREEN;
      return state.alerts[0].severity == AlertSeverity::Urgent ? C_RED : C_ORANGE;
    case HomeCard::Printer:
      return !config.bambuEnabled || !state.printer.online ? C_MUTED : state.printer.error ? C_RED : state.printer.printing ? C_GREEN : C_BLUE;
    case HomeCard::Filament:
      return !config.filamentEnabled || !state.filament.online ? C_MUTED : state.filament.emptySpools ? C_RED : state.filament.lowSpools ? C_ORANGE : C_GREEN;
    case HomeCard::Weather:
      return !state.weather.online ? C_MUTED : state.weather.severeAlert ? C_ORANGE : C_BLUE;
    case HomeCard::Workshop:
      return state.workshop.filterRequested ? C_ORANGE : state.workshop.dryer.running ? C_BLUE : C_GREEN;
    case HomeCard::Controls:
      return state.homeAssistant.online ? C_GREEN : C_MUTED;
    case HomeCard::System:
      return state.system.recoveryMode ? C_RED : state.system.updateAvailable ? C_ORANGE : C_GREEN;
    default: return C_GREEN;
  }
}
'''
ino = replace_once(ino, 'static ScreenId screenForCard(HomeCard card) {', color_fn + '\nstatic ScreenId screenForCard(HomeCard card) {', 'home semantic colors')
ino = replace_once(ino,
    'for(int i=0;i<3;i++){ String t,d,v; homeCardContent(config.homeCards[i],t,d,v); lv_label_set_text(homeCardTitle[i],t.c_str()); lv_label_set_text(homeCardDetail[i],d.c_str()); lv_label_set_text(homeCardState[i],v.c_str()); }',
    'for(int i=0;i<3;i++){ String t,d,v; homeCardContent(config.homeCards[i],t,d,v); lv_label_set_text(homeCardTitle[i],t.c_str()); lv_label_set_text(homeCardDetail[i],d.c_str()); lv_label_set_text(homeCardState[i],v.c_str()); lv_obj_set_style_text_color(homeCardState[i],homeCardColor(config.homeCards[i]),0); }',
    'home state colors')

new_apps = r'''static void createApps() {
  screenApps = lv_obj_create(nullptr); styleScreen(screenApps); addStatusBar(screenApps, "MORE");
  label(screenApps, "WORKSHOP & DEVICE", &lv_font_montserrat_12, C_DIM, 12, 52);
  struct App { const char *name; ScreenId id; lv_color_t color; } apps[] = {
    {"Workshop", ScreenId::Workshop, C_ORANGE}, {"Filament", ScreenId::Filament, C_BLUE},
    {"Today", ScreenId::Today, C_BLUE}, {"Smart Home", ScreenId::Controls, C_GREEN},
    {"Timers", ScreenId::Timers, C_ORANGE}, {"Settings", ScreenId::Settings, C_PURPLE}
  };
  for (size_t i = 0; i < sizeof(apps)/sizeof(apps[0]); ++i) {
    button(screenApps, apps[i].name, 12 + (i % 2) * 154, 82 + (i / 2) * 86, 142, 70,
           navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(apps[i].id)), apps[i].color);
  }
  addBottomNav(screenApps, ScreenId::Apps);
}'''
ino = replace_between(ino, 'static void createApps() {', 'static void createAttention() {', new_apps, 'More launcher')
ino = replace_once(ino,
    'attentionBody = wrapLabel(screenAttention, "All clear", &lv_font_montserrat_14, C_TEXT, 14, 64, 292); lv_obj_set_style_text_line_space(attentionBody, 8, 0);',
    'attentionBody = scrollBodyLabel(screenAttention, "All clear", &lv_font_montserrat_14, C_TEXT, 12, 56, 296, 350); lv_obj_set_style_text_line_space(attentionBody, 8, 0);',
    'scroll attention')
ino = replace_once(ino, 'config.homeCards[i]=static_cast<HomeCard>((static_cast<int>(config.homeCards[i])+1)%8);',
                   'config.homeCards[i]=static_cast<HomeCard>((static_cast<int>(config.homeCards[i])+1)%9);', 'settings card cycle')
ino = replace_once(ino,
    'configStore.save(config); applyBacklight(config.brightness); applyThemeTokens();\n  if (action == 4) { lv_obj_t *current = lv_scr_act(); (void)current; }\n  lastUiRefreshMs = 0;',
    'configStore.save(config); applyBacklight(config.brightness); applyThemeTokens();\n  if (action == 4) { delay(120); ESP.restart(); }\n  lastUiRefreshMs = 0;',
    'theme apply')

new_settings = r'''static void createSettings() {
  screenSettings = lv_obj_create(nullptr); styleScreen(screenSettings); addStatusBar(screenSettings, "SETTINGS");
  settingsBody = label(screenSettings, "", &lv_font_montserrat_12, C_MUTED, 14, 50, 292);
  button(screenSettings, "Brightness", 12, 80, 142, 48, settingAction, reinterpret_cast<void *>(0), C_GREEN);
  button(screenSettings, "Timezone", 166, 80, 142, 48, settingAction, reinterpret_cast<void *>(1), C_BLUE);
  button(screenSettings, "Ambient time", 12, 140, 142, 48, settingAction, reinterpret_cast<void *>(2), C_PURPLE);
  button(screenSettings, "Ambient dim", 166, 140, 142, 48, settingAction, reinterpret_cast<void *>(3), C_ORANGE);
  button(screenSettings, "Theme", 12, 200, 92, 48, settingAction, reinterpret_cast<void *>(4), C_BLUE);
  button(screenSettings, "NOW", 114, 200, 92, 48, settingAction, reinterpret_cast<void *>(5), C_GREEN);
  button(screenSettings, "Ambient", 216, 200, 92, 48, settingAction, reinterpret_cast<void *>(6), C_PURPLE);
  button(screenSettings, "Air mode", 12, 260, 92, 48, settingAction, reinterpret_cast<void *>(7), C_ORANGE);
  button(screenSettings, "Card 1", 114, 260, 92, 48, settingAction, reinterpret_cast<void *>(10));
  button(screenSettings, "Card 2", 216, 260, 92, 48, settingAction, reinterpret_cast<void *>(11));
  button(screenSettings, "Card 3", 12, 320, 92, 48, settingAction, reinterpret_cast<void *>(12));
  button(screenSettings, "Workshop", 114, 320, 92, 48, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Workshop)), C_ORANGE);
  button(screenSettings, "Wi-Fi", 216, 320, 92, 48, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Wifi)), C_BLUE);
  addBottomNav(screenSettings, ScreenId::Apps);
}'''
ino = replace_between(ino, 'static void createSettings() {', 'static void createWifi() {', new_settings, 'settings layout')
ino = replace_once(ino,
    'button(screenWifi, "Forget", 166, 304, 142, 52, [](lv_event_t*){ connectivity.forget(); }, nullptr, C_RED);',
    'lv_obj_t *forget = button(screenWifi, "Hold Forget", 166, 304, 142, 52, nullptr, nullptr, C_RED); lv_obj_add_event_cb(forget, [](lv_event_t*){ connectivity.forget(); }, LV_EVENT_LONG_PRESSED, nullptr);',
    'guard wifi forget')
ino = replace_once(ino,
    'timerBody = wrapLabel(screenTimers, "No active timers", &lv_font_montserrat_14, C_TEXT, 14, 66, 292); lv_obj_set_style_text_line_space(timerBody, 9, 0);',
    'timerBody = scrollBodyLabel(screenTimers, "No active timers", &lv_font_montserrat_14, C_TEXT, 12, 58, 296, 176); lv_obj_set_style_text_line_space(timerBody, 9, 0);',
    'scroll timers')
ino = replace_once(ino,
    'button(screenPrinter, "Pause", 12, 352, 92, 56, [](lv_event_t*){ bambuPlugin.pausePrint(); }, nullptr, C_ORANGE);\n  button(screenPrinter, "Resume", 114, 352, 92, 56, [](lv_event_t*){ bambuPlugin.resumePrint(); }, nullptr, C_GREEN);\n  lv_obj_t *stop = button(screenPrinter, "Hold Stop", 216, 352, 92, 56, nullptr, nullptr, C_RED);\n  lv_obj_add_event_cb(stop, [](lv_event_t*){ bambuPlugin.stopPrint(); }, LV_EVENT_LONG_PRESSED, nullptr);',
    'printerPauseButton = button(screenPrinter, "Pause", 12, 352, 92, 56, [](lv_event_t*){ bambuPlugin.pausePrint(); }, nullptr, C_ORANGE);\n  printerResumeButton = button(screenPrinter, "Resume", 114, 352, 92, 56, [](lv_event_t*){ bambuPlugin.resumePrint(); }, nullptr, C_GREEN);\n  printerStopButton = button(screenPrinter, "Hold Stop", 216, 352, 92, 56, nullptr, nullptr, C_RED);\n  lv_obj_add_event_cb(printerStopButton, [](lv_event_t*){ bambuPlugin.stopPrint(); }, LV_EVENT_LONG_PRESSED, nullptr);',
    'printer button handles')
ino = replace_once(ino,
    '  for (int i = 0; i < 4; ++i) {\n    if (!printerAmsLabels[i] || !printerAmsPanels[i]) continue;',
    '  if (printerPauseButton) { if (printing) lv_obj_clear_state(printerPauseButton, LV_STATE_DISABLED); else lv_obj_add_state(printerPauseButton, LV_STATE_DISABLED); }\n  if (printerResumeButton) { if (online && !printing) lv_obj_clear_state(printerResumeButton, LV_STATE_DISABLED); else lv_obj_add_state(printerResumeButton, LV_STATE_DISABLED); }\n  if (printerStopButton) { if (online && (printing || !strcmp(state.printer.status, "PAUSE") || !strcmp(state.printer.status, "PAUSED"))) lv_obj_clear_state(printerStopButton, LV_STATE_DISABLED); else lv_obj_add_state(printerStopButton, LV_STATE_DISABLED); }\n\n  for (int i = 0; i < 4; ++i) {\n    if (!printerAmsLabels[i] || !printerAmsPanels[i]) continue;',
    'printer stateful controls')

new_filament = r'''static void createFilament() {
  screenFilament = lv_obj_create(nullptr); styleScreen(screenFilament); addStatusBar(screenFilament, "FILAMENT");
  const char *names[] = {"SPOOLS", "LOADED", "LOW", "EMPTY"};
  for (int i = 0; i < 4; ++i) {
    lv_obj_t *p = panel(screenFilament, 12 + (i % 2) * 154, 58 + (i / 2) * 78, 142, 66, C_SURFACE_2);
    label(p, names[i], &lv_font_montserrat_12, C_DIM, 10, 8, 120);
    filamentMetricLabels[i] = label(p, "--", &lv_font_montserrat_20, C_TEXT, 10, 31, 120);
  }
  label(screenFilament, "NEEDS ATTENTION", &lv_font_montserrat_12, C_DIM, 12, 220);
  filamentBody = scrollBodyLabel(screenFilament, "Connect Filament Inventory from the web dashboard.", &lv_font_montserrat_12, C_TEXT, 12, 240, 296, 166);
  addBottomNav(screenFilament, ScreenId::Apps);
}'''
ino = replace_between(ino, 'static void createFilament() {', 'static void createWorkshop() {', new_filament, 'filament screen')
new_workshop = r'''static void createWorkshop() {
  screenWorkshop = lv_obj_create(nullptr); styleScreen(screenWorkshop); addStatusBar(screenWorkshop, "WORKSHOP");
  lv_obj_t *env = panel(screenWorkshop, 12, 58, 296, 92, C_SURFACE_2);
  label(env, "ENVIRONMENT", &lv_font_montserrat_12, C_BLUE, 12, 9);
  workshopEnvironmentLabel = wrapLabel(env, "No sensor connected", &lv_font_montserrat_14, C_TEXT, 12, 34, 270);
  lv_obj_t *air = panel(screenWorkshop, 12, 162, 142, 112, C_SURFACE);
  label(air, "AIR", &lv_font_montserrat_12, C_GREEN, 10, 9);
  workshopAirLabel = wrapLabel(air, "Auto\nReady", &lv_font_montserrat_14, C_TEXT, 10, 34, 120);
  lv_obj_t *dryer = panel(screenWorkshop, 166, 162, 142, 112, C_SURFACE);
  label(dryer, "DRYER TIMER", &lv_font_montserrat_12, C_ORANGE, 10, 9);
  workshopDryerLabel = wrapLabel(dryer, "Idle", &lv_font_montserrat_14, C_TEXT, 10, 34, 120);
  workshopBody = label(screenWorkshop, "", &lv_font_montserrat_12, C_MUTED, 12, 286, 296);
  button(screenWorkshop, "Air mode", 12, 316, 92, 48, [](lv_event_t*){ config.airMode=static_cast<AirMode>((static_cast<int>(config.airMode)+1)%4); state.workshop.airMode=config.airMode; configStore.save(config); }, nullptr, C_BLUE);
  button(screenWorkshop, "PETG timer", 114, 316, 92, 48, [](lv_event_t*){ workshopService.startDryer(state,"PETG",55,6UL*3600UL); }, nullptr, C_ORANGE);
  button(screenWorkshop, "Stop timer", 216, 316, 92, 48, [](lv_event_t*){ workshopService.stopDryer(state); }, nullptr, C_RED);
  button(screenWorkshop, "Quick controls", 12, 376, 296, 40, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Quick)), C_BLUE);
  addBottomNav(screenWorkshop, ScreenId::Apps);
}'''
ino = replace_between(ino, 'static void createWorkshop() {', 'static void createInsights() {', new_workshop, 'workshop screen')
# Bound other text-heavy surfaces.
for old, new, label_name in [
 ('activityBody = wrapLabel(screenActivity, "No recent activity", &lv_font_montserrat_12, C_TEXT, 14, 54, 292);', 'activityBody = scrollBodyLabel(screenActivity, "No recent activity", &lv_font_montserrat_12, C_TEXT, 12, 54, 296, 298);', 'activity scroll'),
 ('devicesBody = wrapLabel(screenDevices, "Inspecting device health...", &lv_font_montserrat_12, C_TEXT, 14, 54, 292);', 'devicesBody = scrollBodyLabel(screenDevices, "Inspecting device health...", &lv_font_montserrat_12, C_TEXT, 12, 54, 296, 298);', 'devices scroll'),
 ('readinessBody = wrapLabel(screenReadiness, "Evaluating setup...", &lv_font_montserrat_12, C_TEXT, 14, 54, 292);', 'readinessBody = scrollBodyLabel(screenReadiness, "Evaluating setup...", &lv_font_montserrat_12, C_TEXT, 12, 54, 296, 298);', 'readiness scroll'),
 ('systemBody = wrapLabel(screenSystem, "Loading diagnostics...", &lv_font_montserrat_12, C_TEXT, 14, 58, 292);', 'systemBody = scrollBodyLabel(screenSystem, "Loading diagnostics...", &lv_font_montserrat_12, C_TEXT, 12, 54, 296, 294);', 'system scroll'),
 ('automationBody = wrapLabel(screenAutomation, "Evaluating local rules...", &lv_font_montserrat_12, C_TEXT, 14, 54, 292);', 'automationBody = scrollBodyLabel(screenAutomation, "Evaluating local rules...", &lv_font_montserrat_12, C_TEXT, 12, 54, 296, 298);', 'automation scroll'),
 ('insightsBody = wrapLabel(screenInsights, "Evaluating current context...", &lv_font_montserrat_12, C_TEXT, 14, 54, 292);', 'insightsBody = scrollBodyLabel(screenInsights, "Evaluating current context...", &lv_font_montserrat_12, C_TEXT, 12, 54, 296, 298);', 'insights scroll'),
]:
    ino = replace_once(ino, old, new, label_name)

new_refresh_filament = r'''static void refreshFilament() {
  if (!filamentBody) return;
  int values[] = {state.filament.totalSpools, state.filament.loadedSpools, state.filament.lowSpools, state.filament.emptySpools};
  for (int i = 0; i < 4; ++i) if (filamentMetricLabels[i]) {
    lv_label_set_text(filamentMetricLabels[i], config.filamentEnabled && state.filament.online ? String(values[i]).c_str() : "--");
    lv_obj_set_style_text_color(filamentMetricLabels[i], i == 3 && values[i] ? C_RED : i == 2 && values[i] ? C_ORANGE : C_TEXT, 0);
  }
  String b;
  if (!config.filamentEnabled) b = "Filament Inventory is not configured.\nConnect it from the web dashboard.";
  else if (!state.filament.online) b = String("Inventory unavailable\nProfile: ") + config.filamentProfile + "\nWaiting for cloud sync.";
  else if (state.filament.attentionCount) {
    for (int i = 0; i < state.filament.attentionCount; ++i) {
      auto &a = state.filament.attention[i];
      if (!a.valid) continue;
      b += String("• ") + (strlen(a.brand) ? a.brand : "Filament") + " " + (strlen(a.material) ? a.material : "") + "\n  " + (strlen(a.colorName) ? a.colorName : "Unknown color");
      if (a.remainingPercent >= 0) b += String(" • ") + a.remainingPercent + "%";
      else if (a.remainingGrams >= 0) b += String(" • ") + a.remainingGrams + " g";
      b += "\n\n";
    }
  } else b = String("All tracked spools are above their configured low thresholds.\nProfile ") + state.filament.profile;
  lv_label_set_text(filamentBody, b.c_str());
}'''
ino = replace_between(ino, 'static void refreshFilament() {', 'static void refreshWorkshop() {', new_refresh_filament, 'refresh filament')
new_refresh_workshop = r'''static void refreshWorkshop() {
  auto &e = state.workshop.environment;
  if (workshopEnvironmentLabel) {
    String b = !e.online ? "No sensor connected" : String(e.stale ? "STALE" : "LIVE") + " • " + e.source + "\n" + String(e.temperatureC,1) + "°C • " + String(e.humidity,0) + "% RH\nPM2.5 " + String(e.pm25,1) + " • VOC " + String(e.voc,0);
    lv_label_set_text(workshopEnvironmentLabel, b.c_str());
    lv_obj_set_style_text_color(workshopEnvironmentLabel, e.online && !e.stale ? C_TEXT : C_MUTED, 0);
  }
  if (workshopAirLabel) {
    String b = String(airModeName(config.airMode)) + "\n" + (state.workshop.filterRequested ? "FILTER ON" : "Ready");
    if (state.workshop.filterRequested && strlen(state.workshop.filterReason)) b += String("\n") + state.workshop.filterReason;
    lv_label_set_text(workshopAirLabel, b.c_str());
    lv_obj_set_style_text_color(workshopAirLabel, state.workshop.filterRequested ? C_ORANGE : C_TEXT, 0);
  }
  if (workshopDryerLabel) {
    auto &d = state.workshop.dryer;
    String b = d.running ? String(d.material) + " • " + d.targetC + "°C\n" + (d.remainingSec/60UL) + " min left" : d.completed ? "Complete" : "Idle";
    lv_label_set_text(workshopDryerLabel, b.c_str());
  }
  if (workshopBody) {
    String b = state.printer.printing ? String("Printer ") + state.printer.progress + "% • " + formatMinutes(state.printer.remainingMinutes) + " left" : "Printer idle";
    lv_label_set_text(workshopBody, b.c_str());
  }
}'''
ino = replace_between(ino, 'static void refreshWorkshop() {', 'static void refreshInsights() {', new_refresh_workshop, 'refresh workshop')

new_readiness = r'''static void refreshReadiness() {
  if(!readinessBody) return;
  const bool networkReady = WiFi.status() == WL_CONNECTED;
  const bool systemReady = state.system.stableBoot && !state.system.recoveryMode;
  const bool workshopReady = config.workshopEnabled;
  String b = "CORE\n";
  b += String(networkReady ? "✓" : "○") + " Network       " + (networkReady ? "Connected" : "Needs setup") + "\n";
  b += String(systemReady ? "✓" : "○") + " System        " + (systemReady ? "Ready" : state.system.recoveryMode ? "Recovery" : "Validating") + "\n";
  b += String(workshopReady ? "✓" : "○") + " Workshop      " + (workshopReady ? "Enabled" : "Disabled") + "\n\nOPTIONAL\n";
  b += String(config.weatherEnabled && state.weather.configured ? "✓" : "○") + " Weather       " + (config.weatherEnabled ? (state.weather.configured ? "Configured" : "Needs location") : "Off") + "\n";
  b += String(config.bambuEnabled && state.printer.configured ? "✓" : "○") + " Printer       " + (config.bambuEnabled ? (state.printer.configured ? "Configured" : "Needs printer") : "Off") + "\n";
  b += String(config.filamentEnabled ? "✓" : "○") + " Filament      " + (config.filamentEnabled ? "Enabled" : "Off") + "\n";
  b += String(config.calendarEnabled ? "✓" : "○") + " Calendar      " + (config.calendarEnabled ? "Enabled" : "Off") + "\n";
  b += String(config.homeAssistantEnabled ? "✓" : "○") + " Smart Home    " + (config.homeAssistantEnabled ? "Enabled" : "Off") + "\n\n";
  if(!systemReady) b += "NEXT  Complete boot validation or recovery.";
  else if(!networkReady) b += "NEXT  Connect Wi-Fi.";
  else if(state.system.updateAvailable) b += String("NEXT  Firmware ") + state.system.updateVersion + " is available.";
  else b += "READY  Core setup is healthy. Optional integrations do not reduce readiness.";
  lv_label_set_text(readinessBody,b.c_str());
}'''
ino = replace_between(ino, 'static void refreshReadiness() {', 'static void refreshSystem() {', new_readiness, 'readiness semantics')
new_settings_refresh = r'''static void refreshSettings() {
  if(!settingsBody)return;
  char b[220];
  snprintf(b,sizeof(b),"%u%% • %s • NOW %s • %s",config.brightness,themeName(config.theme),heroModeName(config.heroMode),config.timezoneId);
  lv_label_set_text(settingsBody,b);
}'''
ino = replace_between(ino, 'static void refreshSettings() {', 'static void refreshWifi() {', new_settings_refresh, 'settings summary')

new_refresh_ui = r'''static void refreshActiveScreen() {
  refreshStatusBars();
  switch (currentScreen) {
    case ScreenId::Home: refreshHome(); break;
    case ScreenId::Today: refreshToday(); break;
    case ScreenId::Controls: refreshControls(); break;
    case ScreenId::Attention: refreshAttention(); break;
    case ScreenId::Settings: refreshSettings(); break;
    case ScreenId::Wifi: refreshWifi(); break;
    case ScreenId::Timers: refreshTimers(); break;
    case ScreenId::Printer: refreshPrinter(); break;
    case ScreenId::Filament: refreshFilament(); break;
    case ScreenId::Workshop: refreshWorkshop(); break;
    case ScreenId::Insights: refreshInsights(); break;
    case ScreenId::Automation: refreshAutomation(); break;
    case ScreenId::Activity: refreshActivity(); break;
    case ScreenId::Devices: refreshDevices(); break;
    case ScreenId::Modes: refreshModes(); break;
    case ScreenId::Readiness: refreshReadiness(); break;
    case ScreenId::System: refreshSystem(); break;
    case ScreenId::Ambient: refreshAmbient(); break;
    default: break;
  }
}

static void refreshUi() {
  refreshHome();
  refreshActiveScreen();
}'''
ino = replace_between(ino, 'static void refreshUi() {', 'static void applyTimeConfiguration() {', new_refresh_ui, 'active screen refresh')
ino = replace_once(ino,
    'if(millis()-lastUiRefreshMs>=UI_REFRESH_MS){lastUiRefreshMs=millis();refreshUi();}',
    'if(millis()-lastUiRefreshMs>=UI_REFRESH_MS){lastUiRefreshMs=millis();refreshActiveScreen();}',
    'loop active refresh')
write(INO, ino)

# ---------------------------------------------------------------------------
# Services / web / API state correctness and v1.5 migration.
# ---------------------------------------------------------------------------
services = SERVICES.read_text()
services = replace_once(services, 'return static_cast<uint8_t>(constrain(n, 0, 7));',
                        'return static_cast<uint8_t>(constrain(n, 0, 8));', 'home card parse range')
services = replace_once(services,
    '  config = AppConfig{};\n  config.schemaVersion = doc["schema"] | CONFIG_SCHEMA_VERSION;',
    '  config = AppConfig{};\n  const uint32_t storedSchema = doc["schema"] | 0;\n  config.schemaVersion = storedSchema;',
    'stored schema')
services = replace_once(services,
    '  for (int i = 0; i < 3; ++i) config.homeCards[i] = static_cast<HomeCard>(constrain((int)(doc["homeCards"][i] | i), 0, 7));',
    '  for (int i = 0; i < 3; ++i) { if (!doc["homeCards"][i].isNull()) config.homeCards[i] = static_cast<HomeCard>(constrain((int)doc["homeCards"][i], 0, 8)); }',
    'home card load')
services = replace_once(services,
    '  config.updateChannel = constrain((int)(doc["updates"]["channel"] | 1), 0, 1);',
    '  config.updateChannel = constrain((int)(doc["updates"]["channel"] | 0), 0, 1);',
    'stable channel load')
services = replace_once(services,
    '  if (config.schemaVersion < CONFIG_SCHEMA_VERSION) {\n    config.schemaVersion = CONFIG_SCHEMA_VERSION;\n    save(config);\n  }',
    '  if (storedSchema < 5 && config.homeCards[0] == HomeCard::Controls && config.homeCards[1] == HomeCard::Today && config.homeCards[2] == HomeCard::System) {\n    config.homeCards[0] = HomeCard::Printer; config.homeCards[1] = HomeCard::Filament; config.homeCards[2] = HomeCard::Workshop;\n  }\n  if (storedSchema < CONFIG_SCHEMA_VERSION) { config.schemaVersion = CONFIG_SCHEMA_VERSION; save(config); }',
    'schema migration')

# Filament attention summaries.
services = replace_once(services,
    '  int total = 0, loaded = 0, low = 0, empty = 0, unknown = 0;\n  for (JsonObject spool : spools) {',
    '  int total = 0, loaded = 0, low = 0, empty = 0, unknown = 0;\n  state.filament.attentionCount = 0;\n  for (auto &item : state.filament.attention) item = FilamentAttentionSpool{};\n  for (JsonObject spool : spools) {',
    'filament attention init')
services = replace_once(services,
    '    if (remaining < 0) unknown++;\n    else if (remaining <= 0.1f) empty++;\n    else if (remaining <= threshold) low++;',
    '''    if (remaining < 0) unknown++;
    else if (remaining <= 0.1f) empty++;
    else if (remaining <= threshold) low++;
    if (remaining >= 0 && remaining <= threshold && state.filament.attentionCount < 3) {
      auto &item = state.filament.attention[state.filament.attentionCount++];
      item.valid = true;
      copyText(item.id, sizeof(item.id), spool["id"] | "");
      copyText(item.brand, sizeof(item.brand), spool["brand"] | "");
      const char *material = spool["material"] | spool["type"] | "";
      copyText(item.material, sizeof(item.material), material);
      copyText(item.colorName, sizeof(item.colorName), spool["colorName"] | spool["color"] | "");
      copyText(item.colorHex, sizeof(item.colorHex), spool["colorHex"] | "#64748b");
      item.remainingGrams = (int)roundf(remaining);
      float nominal = spool["startWeight"] | 1000.0f;
      item.remainingPercent = nominal > 0 ? constrain((int)roundf(remaining * 100.0f / nominal), 0, 100) : -1;
    }''',
    'filament attention capture')

services = replace_once(services, '  doc["printer"]["online"] = state_->printer.online;\n',
                        '  doc["printer"]["online"] = state_->printer.online;\n  doc["printer"]["printing"] = state_->printer.printing;\n', 'printer printing API')
services = replace_once(services,
    '  doc["filament"]["low"] = state_->filament.lowSpools;\n',
    '  doc["filament"]["low"] = state_->filament.lowSpools;\n  doc["filament"]["empty"] = state_->filament.emptySpools;\n  doc["filament"]["profile"] = state_->filament.profile;\n  doc["filament"]["attentionCount"] = state_->filament.attentionCount;\n  for(int i=0;i<state_->filament.attentionCount;i++){auto &a=state_->filament.attention[i];doc["filament"]["attention"][i]["brand"]=a.brand;doc["filament"]["attention"][i]["material"]=a.material;doc["filament"]["attention"][i]["colorName"]=a.colorName;doc["filament"]["attention"][i]["colorHex"]=a.colorHex;doc["filament"]["attention"][i]["remainingGrams"]=a.remainingGrams;doc["filament"]["attention"][i]["remainingPercent"]=a.remainingPercent;}\n',
    'filament API')

# Primary web operating surface: filament replaces speaker status.
old_audio_card = '''  s += F("<div class='card command-card'><span class='metric-label'>Audio</span><span class='command-status "); s += state_->system.audioReady && config_->audioEnabled ? "" : "off"; s += F("'></span><div class='command-value' id='nowAudio'>"); s += config_->audioEnabled ? String(config_->audioVolume) + "%" : String("Off"); s += F("</div><div class='command-detail'>"); s += state_->system.audioReady ? F("Speaker ready") : F("Audio unavailable"); s += F("</div></div></section>");'''
new_filament_card = '''  s += F("<div class='card command-card'><span class='metric-label'>Filament</span><span class='command-status "); s += state_->filament.online ? ((state_->filament.lowSpools || state_->filament.emptySpools) ? "warn" : "") : "off"; s += F("'></span><div class='command-value' id='nowFilament'>"); if (state_->filament.online) s += String(state_->filament.totalSpools) + " spools"; else s += config_->filamentEnabled ? "Unavailable" : "Not set up"; s += F("</div><div class='command-detail'>"); if (state_->filament.online) { s += String(state_->filament.loadedSpools) + " loaded • " + state_->filament.lowSpools + " low • " + state_->filament.emptySpools + " empty"; } else s += F("Inventory status"); s += F("</div></div></section>");'''
services = replace_once(services, old_audio_card, new_filament_card, 'web filament command card')

# CSS polish / accessibility.
services = replace_once(services, '.nav a{flex:0 0 auto;color:#9fb7c1;text-decoration:none;padding:9px 12px;border-radius:10px;font-size:11px;font-weight:750;transition:.16s}',
    '.nav a{flex:0 0 auto;color:#9fb7c1;text-decoration:none;padding:9px 12px;border-radius:10px;font-size:11px;font-weight:750;transition:.16s;min-height:44px;display:flex;align-items:center}', 'web nav targets')
services = replace_once(services, '.metric-label{font-size:9px;', '.metric-label{font-size:10px;', 'web micro type')
services = replace_once(services, '.section-chip{padding:6px 9px}',
    '.section-chip{padding:6px 9px}.top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.badge{display:inline-flex;align-items:center;padding:6px 9px;border-radius:999px;border:1px solid #315062;background:#0b1a22;color:#a9d9ed;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}',
    'top badge styles')
services = replace_once(services, '.wrap{max-width:1260px;margin:auto;padding:22px 24px 80px;',
    '.wrap{max-width:1260px;margin:auto;padding:22px 24px calc(80px + env(safe-area-inset-bottom));', 'safe area wrap')

# Live JS correctness + finite local fetch timeouts.
services = replace_once(services,
    "if(d.printer?.online){set('nowPrinter',d.printer.progress>0?`${d.printer.progress}%`:(d.printer.status||'Ready'));const el=$('nowPrinter')?.nextElementSibling;if(el)el.textContent=d.printer.progress>0?`${d.printer.job||'Print'} • ${d.printer.remainingMinutes||0} min left`:`${d.printer.name||'Bambu Lab'}${d.printer.model?` • ${d.printer.model}`:''}`;updateStatusDot('nowPrinter',true,!!d.printer.errorCode)}",
    "if(d.printer?.online){set('nowPrinter',d.printer.printing?`${d.printer.progress}%`:(d.printer.status||'Ready'));const el=$('nowPrinter')?.nextElementSibling;if(el)el.textContent=d.printer.printing?`${d.printer.job||'Print'} • ${d.printer.remainingMinutes||0} min left`:`${d.printer.name||'Bambu Lab'}${d.printer.model?` • ${d.printer.model}`:''}`;updateStatusDot('nowPrinter',true,!!d.printer.errorCode)}",
    'web authoritative printing')
services = replace_once(services,
    "if(d.audio){set('nowAudio',d.audio.enabled?`${d.audio.volume}%`:'Off');updateStatusDot('nowAudio',!!d.audio.ready)}paintAttention(d);paintIntegrations(d);paintProgress(d);set('lastRefresh','Updated now');const pp=Number(d.printer?.progress)||0;const pause=$('deckPause'),resume=$('deckResume');if(pause)pause.disabled=!d.printer?.online||pp<=0;if(resume)resume.disabled=!d.printer?.online;",
    "if(d.filament){set('nowFilament',d.filament.online?`${d.filament.total||0} spools`:(d.integrations?.filament?.enabled?'Unavailable':'Not set up'));const el=$('nowFilament')?.nextElementSibling;if(el)el.textContent=d.filament.online?`${d.filament.loaded||0} loaded • ${d.filament.low||0} low • ${d.filament.empty||0} empty`:'Inventory status';updateStatusDot('nowFilament',!!d.filament.online,(d.filament.low||0)>0||(d.filament.empty||0)>0)}paintAttention(d);paintIntegrations(d);paintProgress(d);set('lastRefresh','Updated now');const pause=$('deckPause'),resume=$('deckResume');if(pause)pause.disabled=!d.printer?.online||!d.printer?.printing;if(resume)resume.disabled=!d.printer?.online||!!d.printer?.printing;",
    'web filament live state')
services = replace_once(services,
    '  function scheduleSync(ms){clearTimeout(syncTimer);syncTimer=setTimeout(()=>sync(),ms)}\n  async function sync(manual=false)',
    "  function scheduleSync(ms){clearTimeout(syncTimer);syncTimer=setTimeout(()=>sync(),ms)}\n  async function fetchWithTimeout(url,options={},ms=5000){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),ms);try{return await fetch(url,{...options,signal:controller.signal})}finally{clearTimeout(timer)}}\n  async function sync(manual=false)",
    'web timeout helper')
services = replace_once(services, "const r=await fetch('/api/status',{cache:'no-store'});", "const r=await fetchWithTimeout('/api/status',{cache:'no-store'},5000);", 'status timeout')
services = replace_once(services, "const r=await fetch(path,{method:'POST',body:fd});", "const r=await fetchWithTimeout(path,{method:'POST',body:fd},7000);", 'action timeout')
services = replace_once(services, "const r=await fetch(form.action,{method:(form.method||'POST').toUpperCase(),body:new FormData(form)});", "const r=await fetchWithTimeout(form.action,{method:(form.method||'POST').toUpperCase(),body:new FormData(form)},7000);", 'async form timeout')
# Offline RSSI: if source changed slightly this regexp remains narrow.
services, n = re.subn(r"const rssi=Number\(d\.network\?\.rssi\?\?0\);const sig=signal\(rssi\)", "const rssi=Number(d.network?.rssi??0);const sig=d.network?.connected?signal(rssi):'Offline'", services, count=1)
if n != 1:
    raise RuntimeError(f'offline RSSI: expected one match, found {n}')
write(SERVICES, services)

# ---------------------------------------------------------------------------
# README + regression contracts.
# ---------------------------------------------------------------------------
readme = README.read_text()
readme = readme.replace('1.4.0', '1.5.0')
if 'v1.5.0' not in readme and '1.5.0' not in readme:
    readme = '# Waveshare Home 1.5.0\n\n' + readme
write(README, readme)

tests = TESTS.read_text()
tests = replace_once(tests, "test('Waveshare Home UX release is versioned as 1.4.0', () => {\n  assert.match(model, /FW_VERSION\\[\\]\\s*=\\s*\"1\\.4\\.0\"/);\n});",
'''test('Waveshare Home UX release is versioned as 1.5.0 with schema 5', () => {
  assert.match(model, /FW_VERSION\\[\\]\\s*=\\s*"1\\.5\\.0"/);
  assert.match(model, /CONFIG_SCHEMA_VERSION\\s*=\\s*5/);
});''', 'test version')
tests = replace_once(tests,
    "assert.deepEqual(entries, ['Workshop', 'Filament', 'Controls', 'Automation', 'Today', 'Timers', 'Device', 'System']);\n  assert.match(apps, /142, 64/);",
    "assert.deepEqual(entries, ['Workshop', 'Filament', 'Today', 'Smart Home', 'Timers', 'Settings']);\n  assert.match(apps, /142, 70/);",
    'More test')
tests += r'''

test('v1.5 home defaults prioritize printer, filament and workshop', () => {
  assert.match(model, /HomeCard homeCards\[3\] = \{HomeCard::Printer, HomeCard::Filament, HomeCard::Workshop\}/);
  assert.match(model, /Workshop = 8/);
});

test('bottom navigation meets the 44px touch-target floor', () => {
  const nav = functionBody(ino, 'addBottomNav');
  assert.match(nav, /95, 44/);
});

test('settings no longer overlap a multiline summary and theme changes apply', () => {
  const create = functionBody(ino, 'createSettings');
  const refresh = functionBody(ino, 'refreshSettings');
  assert.match(create, /settingsBody = label/);
  assert.doesNotMatch(refresh, /Cards:/);
  const action = functionBody(ino, 'settingAction');
  assert.match(action, /action == 4[\s\S]*ESP\.restart\(\)/);
});

test('dynamic touch surfaces are bounded or scrollable', () => {
  assert.match(ino, /scrollBodyLabel/);
  for (const name of ['createAttention', 'createTimers', 'createActivity', 'createSystem']) {
    assert.match(functionBody(ino, name), /scrollBodyLabel/);
  }
});

test('touch refresh follows the active screen and includes Modes', () => {
  assert.match(ino, /static ScreenId currentScreen/);
  const active = functionBody(ino, 'refreshActiveScreen');
  assert.match(active, /case ScreenId::Modes: refreshModes\(\)/);
  const loopStart = ino.indexOf('void loop()');
  assert.match(ino.slice(loopStart), /refreshActiveScreen\(\)/);
});

test('workshop air modes have explicit Manual and PostPrint behavior', () => {
  const workshop = fs.readFileSync(path.join(root, 'firmware/waveshare-home/WaveshareHome/Workshop.cpp'), 'utf8');
  assert.match(workshop, /AirMode::Manual/);
  assert.match(workshop, /Manual request/);
  assert.match(workshop, /AirMode::PostPrint/);
  assert.match(workshop, /Post-print filtration/);
});

test('readiness separates core health from optional integrations', () => {
  const readiness = functionBody(ino, 'refreshReadiness');
  assert.match(readiness, /CORE/);
  assert.match(readiness, /OPTIONAL/);
  assert.doesNotMatch(readiness, /configured\*100/);
});

test('web API exposes authoritative printer printing state and filament attention', () => {
  assert.match(services, /doc\["printer"\]\["printing"\]/);
  assert.match(services, /attentionCount/);
});

test('web live state uses request timeouts and authoritative print state', () => {
  assert.match(services, /fetchWithTimeout/);
  assert.match(services, /d\.printer\.printing/);
  assert.match(services, /nowFilament/);
});
'''
write(TESTS, tests)
print('v1.5 deterministic migration complete')
