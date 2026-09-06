#include "Workshop.h"
#include <lvgl.h>
#include <string.h>

namespace {
void copyWs(char *dst, size_t size, const char *src) {
  if (!dst || size == 0) return;
  strlcpy(dst, src ? src : "", size);
}

struct AssistantUiState {
  lv_obj_t *screen = nullptr;
  lv_obj_t *answer = nullptr;
  lv_obj_t *question = nullptr;
  lv_obj_t *status = nullptr;
  lv_obj_t *source = nullptr;
  lv_obj_t *launcher = nullptr;
  lv_obj_t *launcherParent = nullptr;
  lv_obj_t *returnScreen = nullptr;
  AppState *state = nullptr;
  uint32_t lastProbeMs = 0;
  bool open = false;
};

AssistantUiState assistantUi;

bool containsLabel(lv_obj_t *root, const char *text) {
  if (!root || !text) return false;
  if (lv_obj_check_type(root, &lv_label_class)) {
    const char *value = lv_label_get_text(root);
    if (value && strcmp(value, text) == 0) return true;
  }
  const uint32_t count = lv_obj_get_child_cnt(root);
  for (uint32_t i = 0; i < count; ++i) {
    if (containsLabel(lv_obj_get_child(root, i), text)) return true;
  }
  return false;
}

lv_obj_t *assistantLabel(lv_obj_t *parent, const char *text, const lv_font_t *font, lv_color_t color,
                         int x, int y, int width = LV_SIZE_CONTENT) {
  lv_obj_t *obj = lv_label_create(parent);
  lv_label_set_text(obj, text);
  lv_obj_set_style_text_font(obj, font, 0);
  lv_obj_set_style_text_color(obj, color, 0);
  lv_obj_set_pos(obj, x, y);
  if (width != LV_SIZE_CONTENT) {
    lv_obj_set_width(obj, width);
    lv_label_set_long_mode(obj, LV_LABEL_LONG_WRAP);
  }
  return obj;
}

lv_obj_t *assistantPanel(lv_obj_t *parent, int x, int y, int width, int height, lv_color_t bg, lv_color_t border) {
  lv_obj_t *obj = lv_obj_create(parent);
  lv_obj_set_pos(obj, x, y);
  lv_obj_set_size(obj, width, height);
  lv_obj_set_style_radius(obj, 15, 0);
  lv_obj_set_style_bg_color(obj, bg, 0);
  lv_obj_set_style_bg_opa(obj, LV_OPA_COVER, 0);
  lv_obj_set_style_border_width(obj, 1, 0);
  lv_obj_set_style_border_color(obj, border, 0);
  lv_obj_set_style_pad_all(obj, 0, 0);
  lv_obj_clear_flag(obj, LV_OBJ_FLAG_SCROLLABLE);
  return obj;
}

lv_obj_t *assistantButton(lv_obj_t *parent, const char *text, int x, int y, int width, int height,
                          lv_event_cb_t callback, void *data, lv_color_t bg, lv_color_t border,
                          lv_color_t textColor, lv_color_t pressed) {
  lv_obj_t *btn = lv_btn_create(parent);
  lv_obj_set_pos(btn, x, y);
  lv_obj_set_size(btn, width, height);
  lv_obj_set_style_radius(btn, 12, 0);
  lv_obj_set_style_bg_color(btn, bg, 0);
  lv_obj_set_style_bg_color(btn, pressed, LV_STATE_PRESSED);
  lv_obj_set_style_border_width(btn, 1, 0);
  lv_obj_set_style_border_color(btn, border, 0);
  lv_obj_set_style_shadow_width(btn, 0, 0);
  if (callback) lv_obj_add_event_cb(btn, callback, LV_EVENT_CLICKED, data);
  lv_obj_t *label = lv_label_create(btn);
  lv_label_set_text(label, text);
  lv_obj_set_style_text_font(label, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(label, textColor, 0);
  lv_obj_center(label);
  return btn;
}

String attentionDetails(const AppState &state) {
  String out;
  for (uint8_t i = 0; i < state.filament.attentionCount && i < 3; ++i) {
    const auto &spool = state.filament.attention[i];
    if (!spool.valid) continue;
    if (out.length()) out += "\n";
    out += spool.id;
    out += " • ";
    if (strlen(spool.material)) out += spool.material;
    else out += "Filament";
    if (strlen(spool.colorName)) {
      out += " • ";
      out += spool.colorName;
    }
    out += " • ";
    if (spool.remainingGrams >= 0) out += String(spool.remainingGrams) + " g";
    else if (spool.remainingPercent >= 0) out += String(spool.remainingPercent) + "%";
    else out += "amount unknown";
  }
  return out;
}

String loadedDetails(const AppState &state) {
  String out;
  int shown = 0;
  const uint8_t count = state.printer.amsSlotCount < 16 ? state.printer.amsSlotCount : 16;
  for (uint8_t i = 0; i < count && shown < 3; ++i) {
    const auto &slot = state.printer.amsSlots[i];
    if (!slot.loaded) continue;
    if (out.length()) out += "\n";
    out += "A";
    out += String(i + 1);
    out += " • ";
    if (strlen(slot.material)) out += slot.material;
    else if (strlen(slot.name)) out += slot.name;
    else out += "Loaded filament";
    if (slot.remainingPercent >= 0) out += String(" • ") + slot.remainingPercent + "%";
    if (slot.active) out += " • ACTIVE";
    shown++;
  }
  return out;
}

void setAssistantAnswer(const char *question, const String &answer, const char *sourceText) {
  if (!assistantUi.screen) return;
  if (assistantUi.question) lv_label_set_text(assistantUi.question, question ? question : "ASK INVENTORY");
  if (assistantUi.answer) lv_label_set_text(assistantUi.answer, answer.c_str());
  if (assistantUi.source) lv_label_set_text(assistantUi.source, sourceText ? sourceText : "Grounded in live device state");
}

void answerPrompt(int prompt) {
  if (!assistantUi.state) return;
  const AppState &state = *assistantUi.state;
  if (!state.filament.online) {
    setAssistantAnswer("INVENTORY", "Filament Inventory is offline.\n\nOpen the companion or web dashboard to reconnect the inventory integration.", "No inventory evidence available");
    return;
  }

  if (prompt == 0) {
    const int needs = state.filament.lowSpools + state.filament.emptySpools;
    String answer;
    if (needs == 0) answer = "No low-stock alerts.\n\nNothing is currently flagged low or empty.";
    else {
      answer = String(needs) + (needs == 1 ? " spool needs attention.\n\n" : " spools need attention.\n\n");
      String detail = attentionDetails(state);
      if (detail.length()) answer += detail;
      else answer += String(state.filament.lowSpools) + " low • " + state.filament.emptySpools + " empty";
    }
    setAssistantAnswer("WHAT IS LOW?", answer, "Evidence: inventory thresholds + attention feed");
    return;
  }

  if (prompt == 1) {
    String detail = loadedDetails(state);
    String answer;
    if (detail.length()) answer = String("Loaded in AMS:\n\n") + detail;
    else if (state.filament.loadedSpools > 0) answer = String(state.filament.loadedSpools) + " spool(s) are marked loaded, but slot-level evidence is not currently available.";
    else answer = "No loaded spool is reported right now.\n\nI won’t infer an AMS assignment from color or material.";
    setAssistantAnswer("WHAT IS LOADED?", answer, "Evidence: live Bambu AMS + inventory loaded state");
    return;
  }

  if (prompt == 2) {
    String answer = String(state.filament.totalSpools) + " active spool(s) for " + state.filament.profile + ".\n\n";
    answer += String(state.filament.loadedSpools) + " loaded • " + state.filament.lowSpools + " low • ";
    answer += String(state.filament.emptySpools) + " empty • " + state.filament.unknownSpools + " unknown";
    setAssistantAnswer("INVENTORY SUMMARY", answer, "Evidence: synced private inventory summary");
    return;
  }

  String detail = attentionDetails(state);
  String answer;
  if (state.filament.attentionCount == 0) answer = "No filament item currently needs attention.";
  else answer = detail.length() ? detail : String(state.filament.attentionCount) + " item(s) are in the attention queue.";
  setAssistantAnswer("NEEDS ATTENTION", answer, "Evidence: top inventory attention records");
}

void closeAssistant(lv_event_t *) {
  if (!assistantUi.returnScreen || !lv_obj_is_valid(assistantUi.returnScreen)) return;
  assistantUi.open = false;
  lv_scr_load_anim(assistantUi.returnScreen, LV_SCR_LOAD_ANIM_FADE_ON, 110, 0, false);
}

void promptEvent(lv_event_t *event) {
  const int prompt = static_cast<int>(reinterpret_cast<intptr_t>(lv_event_get_user_data(event)));
  answerPrompt(prompt);
}

void createAssistantScreen() {
  if (assistantUi.screen) return;
  lv_obj_t *sourceScreen = lv_scr_act();
  const lv_color_t bg = lv_obj_get_style_bg_color(sourceScreen, LV_PART_MAIN);
  const lv_color_t text = lv_obj_get_style_text_color(sourceScreen, LV_PART_MAIN);
  const lv_color_t surface = lv_color_hex(0x071015);
  const lv_color_t surface2 = lv_color_hex(0x0B171E);
  const lv_color_t border = lv_color_hex(0x18303A);
  const lv_color_t muted = lv_color_hex(0x91A1AA);
  const lv_color_t green = lv_color_hex(0x4ADE80);
  const lv_color_t blue = lv_color_hex(0x60A5FA);
  const lv_color_t orange = lv_color_hex(0xFDBA74);
  const lv_color_t purple = lv_color_hex(0xA78BFA);

  assistantUi.screen = lv_obj_create(nullptr);
  lv_obj_set_style_bg_color(assistantUi.screen, bg, 0);
  lv_obj_set_style_bg_opa(assistantUi.screen, LV_OPA_COVER, 0);
  lv_obj_clear_flag(assistantUi.screen, LV_OBJ_FLAG_SCROLLABLE);

  assistantLabel(assistantUi.screen, "ASK INVENTORY", &lv_font_montserrat_18, text, 12, 13, 174);
  assistantUi.status = assistantLabel(assistantUi.screen, "LOCAL • GROUNDED", &lv_font_montserrat_12, green, 184, 18, 124);
  lv_obj_set_style_text_align(assistantUi.status, LV_TEXT_ALIGN_RIGHT, 0);

  lv_obj_t *answerPanel = assistantPanel(assistantUi.screen, 12, 54, 296, 164, surface2, border);
  assistantUi.question = assistantLabel(answerPanel, "INVENTORY SUMMARY", &lv_font_montserrat_12, blue, 14, 12, 266);
  assistantUi.answer = assistantLabel(answerPanel, "Loading grounded inventory state…", &lv_font_montserrat_14, text, 14, 39, 266);
  lv_obj_set_style_text_line_space(assistantUi.answer, 5, 0);
  assistantUi.source = assistantLabel(answerPanel, "Evidence: live device state", &lv_font_montserrat_12, muted, 14, 137, 266);

  assistantLabel(assistantUi.screen, "QUICK QUESTIONS", &lv_font_montserrat_12, muted, 12, 232);
  assistantButton(assistantUi.screen, "Low stock", 12, 254, 142, 52, promptEvent, reinterpret_cast<void *>(0), surface, border, text, orange);
  assistantButton(assistantUi.screen, "Loaded now", 166, 254, 142, 52, promptEvent, reinterpret_cast<void *>(1), surface, border, text, blue);
  assistantButton(assistantUi.screen, "Inventory", 12, 316, 142, 52, promptEvent, reinterpret_cast<void *>(2), surface, border, text, green);
  assistantButton(assistantUi.screen, "Attention", 166, 316, 142, 52, promptEvent, reinterpret_cast<void *>(3), surface, border, text, purple);
  assistantButton(assistantUi.screen, "Back", 12, 380, 296, 52, closeAssistant, nullptr, surface, border, text, blue);
}

void openAssistant(lv_event_t *) {
  assistantUi.returnScreen = lv_scr_act();
  createAssistantScreen();
  assistantUi.open = true;
  if (assistantUi.status && assistantUi.state) {
    String status = String("LOCAL • ") + (strlen(assistantUi.state->filament.profile) ? assistantUi.state->filament.profile : "PROFILE");
    lv_label_set_text(assistantUi.status, status.c_str());
  }
  answerPrompt(2);
  lv_scr_load_anim(assistantUi.screen, LV_SCR_LOAD_ANIM_FADE_ON, 110, 0, false);
}

void addAssistantLauncher(lv_obj_t *moreScreen) {
  if (!moreScreen || (assistantUi.launcherParent == moreScreen && assistantUi.launcher && lv_obj_is_valid(assistantUi.launcher))) return;
  const lv_color_t text = lv_obj_get_style_text_color(moreScreen, LV_PART_MAIN);
  const lv_color_t surface = lv_color_hex(0x0B171E);
  const lv_color_t border = lv_color_hex(0x244353);
  const lv_color_t blue = lv_color_hex(0x60A5FA);
  assistantUi.launcher = assistantButton(moreScreen, "Assistant", 12, 334, 296, 70, openAssistant, nullptr, surface, border, text, blue);
  assistantUi.launcherParent = moreScreen;
}

void assistantUiLoop(AppState &state) {
  assistantUi.state = &state;
  if (millis() - assistantUi.lastProbeMs < 250UL) return;
  assistantUi.lastProbeMs = millis();
  lv_obj_t *active = lv_scr_act();
  if (!active || active == assistantUi.screen) return;
  if (containsLabel(active, "MORE")) addAssistantLauncher(active);
}
}

const char *airModeName(AirMode mode) {
  switch (mode) {
    case AirMode::Manual: return "Manual";
    case AirMode::Auto: return "Auto";
    case AirMode::PostPrint: return "Post-print";
    default: return "Off";
  }
}

const char *ambientModeName(AmbientDisplayMode mode) {
  switch (mode) {
    case AmbientDisplayMode::Clock: return "Clock";
    case AmbientDisplayMode::Printer: return "Printer";
    case AmbientDisplayMode::Workshop: return "Workshop";
    case AmbientDisplayMode::Minimal: return "Minimal";
    default: return "Auto";
  }
}

void WorkshopService::begin(AppConfig &config, AppState &state) {
  state.workshop.enabled = config.workshopEnabled;
  state.workshop.airMode = config.airMode;
  state.workshop.sensorConfigured = config.workshopSensorEnabled;
  state.workshop.presenceConfigured = config.presenceEnabled;
  state.workshop.dryerConfigured = config.dryerEnabled;
  lastPrinting_ = state.printer.printing;
  lastPresence_ = state.workshop.environment.presence;
  assistantUi.state = &state;
}

void WorkshopService::loop(AppConfig &config, AppState &state) {
  assistantUiLoop(state);
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
}

void WorkshopService::ingestSensor(AppState &state, const char *source, float temperatureC, float humidity,
                                   float pm25, float voc, float co2, bool presence) {
  auto &e = state.workshop.environment;
  copyWs(e.source, sizeof(e.source), source && *source ? source : "External sensor");
  e.temperatureC = temperatureC;
  e.humidity = humidity;
  e.pm25 = pm25;
  e.voc = voc;
  e.co2 = co2;
  e.presence = presence;
  e.online = true;
  e.stale = false;
  e.updatedMs = millis();
}

void WorkshopService::startDryer(AppState &state, const char *material, uint16_t temperatureC, uint32_t durationSec) {
  auto &d = state.workshop.dryer;
  copyWs(d.material, sizeof(d.material), material && *material ? material : "Filament");
  d.targetC = temperatureC;
  d.durationSec = durationSec;
  d.remainingSec = durationSec;
  d.startedMs = millis();
  d.running = true;
  d.completed = false;
}

void WorkshopService::stopDryer(AppState &state) {
  state.workshop.dryer.running = false;
  state.workshop.dryer.remainingSec = 0;
}

void WorkshopService::setAirMode(AppState &state, AirMode mode) {
  state.workshop.airMode = mode;
}

void ActivityEngine::begin(AppState &state) {
  initialized_ = true;
  lastPrinterOnline_ = state.printer.online;
  lastPrinting_ = state.printer.printing;
  lastAlertCount_ = state.alertCount;
  lastDryerRunning_ = state.workshop.dryer.running;
  add(state, "System", "Waveshare Home started", FW_VERSION);
}

void ActivityEngine::add(AppState &state, const char *source, const char *title, const char *detail) {
  for (int i = 11; i > 0; --i) state.activity[i] = state.activity[i - 1];
  auto &a = state.activity[0];
  a.valid = true;
  a.epoch = time(nullptr);
  a.ms = millis();
  copyWs(a.source, sizeof(a.source), source);
  copyWs(a.title, sizeof(a.title), title);
  copyWs(a.detail, sizeof(a.detail), detail);
  if (state.activityCount < 12) state.activityCount++;
}

void ActivityEngine::loop(AppState &state) {
  if (!initialized_) begin(state);
  if (state.printer.online != lastPrinterOnline_) {
    add(state, "Printer", state.printer.online ? "Printer connected" : "Printer offline", state.printer.displayName);
    lastPrinterOnline_ = state.printer.online;
  }
  if (state.printer.printing != lastPrinting_) {
    add(state, "Printer", state.printer.printing ? "Print started" : "Print stopped", state.printer.jobName);
    lastPrinting_ = state.printer.printing;
  }
  if (state.alertCount != lastAlertCount_) {
    if (state.alertCount > lastAlertCount_ && state.alertCount > 0) add(state, "Attention", state.alerts[0].title, state.alerts[0].detail);
    else if (state.alertCount == 0) add(state, "Attention", "All alerts cleared", "");
    lastAlertCount_ = state.alertCount;
  }
  if (state.workshop.dryer.running != lastDryerRunning_) {
    add(state, "Dryer", state.workshop.dryer.running ? "Drying started" : (state.workshop.dryer.completed ? "Drying complete" : "Drying stopped"), state.workshop.dryer.material);
    lastDryerRunning_ = state.workshop.dryer.running;
  }
}