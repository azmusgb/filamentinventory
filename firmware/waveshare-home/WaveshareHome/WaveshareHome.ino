#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <time.h>
#include <lvgl.h>
#include <Arduino_GFX_Library.h>
#include "TCA9554.h"
#include "TouchDrvFT6X36.hpp"
#include "AppModel.h"
#include "Services.h"
#include "Workshop.h"

static constexpr int PIN_LCD_BL = 6;
static constexpr int PIN_SPI_MISO = 2;
static constexpr int PIN_SPI_MOSI = 1;
static constexpr int PIN_SPI_SCLK = 5;
static constexpr int PIN_LCD_CS = -1;
static constexpr int PIN_LCD_DC = 3;
static constexpr int PIN_LCD_RST = -1;
static constexpr int PIN_I2C_SDA = 8;
static constexpr int PIN_I2C_SCL = 7;
static constexpr uint16_t SCREEN_W = 320;
static constexpr uint16_t SCREEN_H = 480;
static constexpr uint32_t UI_REFRESH_MS = 1000UL;
static constexpr uint32_t ATTENTION_REFRESH_MS = 1500UL;

TCA9554 ioExpander(0x20);
TouchDrvFT6X36 touch;
Arduino_DataBus *bus = new Arduino_ESP32SPI(PIN_LCD_DC, PIN_LCD_CS, PIN_SPI_SCLK, PIN_SPI_MOSI, PIN_SPI_MISO);
Arduino_GFX *gfx = new Arduino_ST7796(bus, PIN_LCD_RST, 0, true, SCREEN_W, SCREEN_H);

AppConfig config;
AppState state;
ConfigStore configStore;
BootGuard bootGuard;
ConnectivityService connectivity;
AudioService audio;
WeatherPlugin weatherPlugin;
BambuPlugin bambuPlugin;
FilamentPlugin filamentPlugin;
HomeAssistantPlugin homeAssistantPlugin;
CalendarPlugin calendarPlugin;
TimerPlugin timerPlugin(audio);
ServiceManager serviceManager;
AttentionEngine attentionEngine;
WorkshopService workshopService;
ActivityEngine activityEngine;
WebDashboard webDashboard(configStore, connectivity, audio, timerPlugin, homeAssistantPlugin, bambuPlugin);

static lv_disp_draw_buf_t drawBuf;
static lv_color_t *drawBuf1 = nullptr;
static lv_color_t *drawBuf2 = nullptr;
static lv_disp_drv_t displayDriver;
static lv_indev_drv_t inputDriver;

static lv_obj_t *screenHome = nullptr;
static lv_obj_t *screenToday = nullptr;
static lv_obj_t *screenControls = nullptr;
static lv_obj_t *screenApps = nullptr;
static lv_obj_t *screenAttention = nullptr;
static lv_obj_t *screenQuick = nullptr;
static lv_obj_t *screenSettings = nullptr;
static lv_obj_t *screenWifi = nullptr;
static lv_obj_t *screenTimers = nullptr;
static lv_obj_t *screenPrinter = nullptr;
static lv_obj_t *screenFilament = nullptr;
static lv_obj_t *screenWorkshop = nullptr;
static lv_obj_t *screenInsights = nullptr;
static lv_obj_t *screenAutomation = nullptr;
static lv_obj_t *screenActivity = nullptr;
static lv_obj_t *screenDevices = nullptr;
static lv_obj_t *screenModes = nullptr;
static lv_obj_t *screenReadiness = nullptr;
static lv_obj_t *screenSystem = nullptr;
static lv_obj_t *screenRecovery = nullptr;
static lv_obj_t *screenAmbient = nullptr;

static lv_obj_t *homeClock = nullptr;
static lv_obj_t *homeGreeting = nullptr;
static lv_obj_t *homeDate = nullptr;
static lv_obj_t *homeStatus = nullptr;
static lv_obj_t *heroEyebrow = nullptr;
static lv_obj_t *heroTitle = nullptr;
static lv_obj_t *heroValue = nullptr;
static lv_obj_t *heroDetail = nullptr;
static lv_obj_t *homeCardTitle[3] = {nullptr};
static lv_obj_t *homeCardDetail[3] = {nullptr};
static lv_obj_t *homeCardState[3] = {nullptr};
static lv_obj_t *todayWeather = nullptr;
static lv_obj_t *todayAgenda = nullptr;
static lv_obj_t *todayTimer = nullptr;
static lv_obj_t *controlsBody = nullptr;
static lv_obj_t *attentionBody = nullptr;
static lv_obj_t *wifiBody = nullptr;
static lv_obj_t *timerBody = nullptr;
static lv_obj_t *printerStateLabel = nullptr;
static lv_obj_t *printerJobLabel = nullptr;
static lv_obj_t *printerProgressLabel = nullptr;
static lv_obj_t *printerRemainingLabel = nullptr;
static lv_obj_t *printerProgressBar = nullptr;
static lv_obj_t *printerLayerLabel = nullptr;
static lv_obj_t *printerNozzleLabel = nullptr;
static lv_obj_t *printerBedLabel = nullptr;
static lv_obj_t *printerChamberLabel = nullptr;
static lv_obj_t *printerAmsPanels[4] = {nullptr};
static lv_obj_t *printerAmsLabels[4] = {nullptr};
static lv_obj_t *filamentBody = nullptr;
static lv_obj_t *workshopBody = nullptr;
static lv_obj_t *insightsBody = nullptr;
static lv_obj_t *automationBody = nullptr;
static lv_obj_t *activityBody = nullptr;
static lv_obj_t *devicesBody = nullptr;
static lv_obj_t *modesBody = nullptr;
static lv_obj_t *readinessBody = nullptr;
static lv_obj_t *systemBody = nullptr;
static lv_obj_t *settingsBody = nullptr;
static lv_obj_t *ambientClock = nullptr;
static lv_obj_t *ambientDate = nullptr;
static lv_obj_t *ambientSummary = nullptr;
static lv_obj_t *recoveryBody = nullptr;
static lv_obj_t *statusLabels[20] = {nullptr};
static uint8_t statusLabelCount = 0;

static lv_color_t C_BG;
static lv_color_t C_SURFACE;
static lv_color_t C_SURFACE_2;
static lv_color_t C_BORDER;
static lv_color_t C_TEXT;
static lv_color_t C_MUTED;
static lv_color_t C_DIM;
static lv_color_t C_GREEN;
static lv_color_t C_BLUE;
static lv_color_t C_PURPLE;
static lv_color_t C_ORANGE;
static lv_color_t C_RED;

static uint32_t lastInteractionMs = 0;
static uint32_t lastUiRefreshMs = 0;
static uint32_t lastAttentionMs = 0;
static bool ambientMode = false;
static bool timeConfigured = false;
static char appliedTimezone[80] = "";

enum class ScreenId : uint8_t {
  Home, Today, Controls, Apps, Attention, Quick, Settings, Wifi,
  Timers, Printer, Filament, Workshop, Insights, Automation, Activity, Devices, Readiness, Modes, System, Recovery, Ambient
};

static void applyThemeTokens() {
  if (config.theme == ThemeMode::Oled) {
    C_BG = lv_color_hex(0x000000); C_SURFACE = lv_color_hex(0x050607); C_SURFACE_2 = lv_color_hex(0x0A0C0E);
    C_BORDER = lv_color_hex(0x25282A); C_TEXT = lv_color_hex(0xFFFFFF); C_MUTED = lv_color_hex(0xA8B0B5); C_DIM = lv_color_hex(0x687178);
  } else if (config.theme == ThemeMode::HighContrast) {
    C_BG = lv_color_hex(0x000000); C_SURFACE = lv_color_hex(0x101214); C_SURFACE_2 = lv_color_hex(0x171B1E);
    C_BORDER = lv_color_hex(0x67757D); C_TEXT = lv_color_hex(0xFFFFFF); C_MUTED = lv_color_hex(0xD7E0E4); C_DIM = lv_color_hex(0xABB8BE);
  } else {
    C_BG = lv_color_hex(0x020609); C_SURFACE = lv_color_hex(0x071015); C_SURFACE_2 = lv_color_hex(0x0B171E);
    C_BORDER = lv_color_hex(0x18303A); C_TEXT = lv_color_hex(0xF6FAFC); C_MUTED = lv_color_hex(0x91A1AA); C_DIM = lv_color_hex(0x60717A);
  }
  C_GREEN = lv_color_hex(0x4ADE80); C_BLUE = lv_color_hex(0x60A5FA); C_PURPLE = lv_color_hex(0xA78BFA);
  C_ORANGE = lv_color_hex(0xFDBA74); C_RED = lv_color_hex(0xFB7185);
}

static void applyBacklight(uint8_t percent) {
  percent = constrain(percent, 5, 100);
  ledcWrite(PIN_LCD_BL, map(percent, 0, 100, 0, 255));
}

static void lcdReset() {
  ioExpander.write1(1, 1); delay(10);
  ioExpander.write1(1, 0); delay(10);
  ioExpander.write1(1, 1); delay(200);
}

static void displayFlush(lv_disp_drv_t *drv, const lv_area_t *area, lv_color_t *colorP) {
  const uint32_t w = area->x2 - area->x1 + 1;
  const uint32_t h = area->y2 - area->y1 + 1;
#if (LV_COLOR_16_SWAP != 0)
  gfx->draw16bitBeRGBBitmap(area->x1, area->y1, reinterpret_cast<uint16_t *>(&colorP->full), w, h);
#else
  gfx->draw16bitRGBBitmap(area->x1, area->y1, reinterpret_cast<uint16_t *>(&colorP->full), w, h);
#endif
  lv_disp_flush_ready(drv);
}

static void wakeFromAmbient();

static void touchRead(lv_indev_drv_t *, lv_indev_data_t *data) {
  int16_t x[1] = {0}; int16_t y[1] = {0};
  const uint8_t count = touch.getPoint(x, y, 1);
  if (count > 0) {
    data->state = LV_INDEV_STATE_PR;
    data->point.x = constrain(x[0], 0, SCREEN_W - 1);
    data->point.y = constrain(y[0], 0, SCREEN_H - 1);
    lastInteractionMs = millis();
    if (ambientMode) wakeFromAmbient();
  } else data->state = LV_INDEV_STATE_REL;
}

static void styleScreen(lv_obj_t *screen) {
  lv_obj_set_style_bg_color(screen, C_BG, 0);
  lv_obj_set_style_bg_opa(screen, LV_OPA_COVER, 0);
  lv_obj_set_style_text_color(screen, C_TEXT, 0);
  lv_obj_clear_flag(screen, LV_OBJ_FLAG_SCROLLABLE);
}

static lv_obj_t *label(lv_obj_t *parent, const char *text, const lv_font_t *font, lv_color_t color,
                       int x, int y, int w = LV_SIZE_CONTENT) {
  lv_obj_t *obj = lv_label_create(parent);
  lv_label_set_text(obj, text);
  lv_obj_set_style_text_font(obj, font, 0);
  lv_obj_set_style_text_color(obj, color, 0);
  lv_obj_set_pos(obj, x, y);
  if (w != LV_SIZE_CONTENT) { lv_obj_set_width(obj, w); lv_label_set_long_mode(obj, LV_LABEL_LONG_DOT); }
  return obj;
}

static lv_obj_t *wrapLabel(lv_obj_t *parent, const char *text, const lv_font_t *font, lv_color_t color,
                           int x, int y, int w) {
  lv_obj_t *obj = label(parent, text, font, color, x, y, w);
  lv_label_set_long_mode(obj, LV_LABEL_LONG_WRAP);
  return obj;
}

static lv_obj_t *panel(lv_obj_t *parent, int x, int y, int w, int h, lv_color_t bg) {
  lv_obj_t *obj = lv_obj_create(parent);
  lv_obj_set_pos(obj, x, y); lv_obj_set_size(obj, w, h);
  lv_obj_set_style_radius(obj, 15, 0); lv_obj_set_style_bg_color(obj, bg, 0); lv_obj_set_style_bg_opa(obj, LV_OPA_COVER, 0);
  lv_obj_set_style_border_width(obj, 1, 0); lv_obj_set_style_border_color(obj, C_BORDER, 0); lv_obj_set_style_pad_all(obj, 0, 0);
  lv_obj_clear_flag(obj, LV_OBJ_FLAG_SCROLLABLE);
  return obj;
}

static lv_obj_t *button(lv_obj_t *parent, const char *text, int x, int y, int w, int h,
                        lv_event_cb_t cb, void *data = nullptr, lv_color_t accent = lv_color_hex(0x4ADE80)) {
  lv_obj_t *btn = lv_btn_create(parent);
  lv_obj_set_pos(btn, x, y); lv_obj_set_size(btn, w, h); lv_obj_set_style_radius(btn, 12, 0);
  lv_obj_set_style_bg_color(btn, C_SURFACE_2, 0); lv_obj_set_style_bg_color(btn, accent, LV_STATE_PRESSED);
  lv_obj_set_style_border_width(btn, 1, 0); lv_obj_set_style_border_color(btn, C_BORDER, 0); lv_obj_set_style_shadow_width(btn, 0, 0);
  if (cb) lv_obj_add_event_cb(btn, cb, LV_EVENT_CLICKED, data);
  lv_obj_t *txt = lv_label_create(btn); lv_label_set_text(txt, text); lv_obj_set_style_text_font(txt, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(txt, C_TEXT, 0); lv_obj_center(txt);
  return btn;
}

static const char *networkText() {
  if (WiFi.status() == WL_CONNECTED) return "WiFi";
  if (state.system.setupApActive) return "SETUP";
  return "OFF";
}

static lv_color_t networkColor() {
  if (WiFi.status() == WL_CONNECTED) return C_GREEN;
  if (state.system.setupApActive) return C_ORANGE;
  return C_DIM;
}

static void addStatusBar(lv_obj_t *screen, const char *title) {
  label(screen, title, &lv_font_montserrat_18, C_TEXT, 12, 13, 160);
  lv_obj_t *right = label(screen, "", &lv_font_montserrat_12, C_MUTED, 174, 18, 134);
  lv_obj_set_style_text_align(right, LV_TEXT_ALIGN_RIGHT, 0);
  if (statusLabelCount < 20) statusLabels[statusLabelCount++] = right;
}

static void refreshStatusBars() {
  char timeBuf[12] = "--:--";
  struct tm info;
  if (getLocalTime(&info, 5)) strftime(timeBuf, sizeof(timeBuf), "%l:%M", &info);
  char buf[64]; snprintf(buf, sizeof(buf), "%s  %s  !%u", timeBuf, networkText(), state.alertCount);
  for (uint8_t i = 0; i < statusLabelCount; ++i) {
    if (!statusLabels[i]) continue;
    lv_label_set_text(statusLabels[i], buf);
    lv_obj_set_style_text_color(statusLabels[i], state.alertCount ? C_ORANGE : networkColor(), 0);
  }
}

static lv_obj_t *screenFor(ScreenId id) {
  switch (id) {
    case ScreenId::Home: return screenHome;
    case ScreenId::Today: return screenToday;
    case ScreenId::Controls: return screenControls;
    case ScreenId::Apps: return screenApps;
    case ScreenId::Attention: return screenAttention;
    case ScreenId::Quick: return screenQuick;
    case ScreenId::Settings: return screenSettings;
    case ScreenId::Wifi: return screenWifi;
    case ScreenId::Timers: return screenTimers;
    case ScreenId::Printer: return screenPrinter;
    case ScreenId::Filament: return screenFilament;
    case ScreenId::Workshop: return screenWorkshop;
    case ScreenId::Insights: return screenInsights;
    case ScreenId::Automation: return screenAutomation;
    case ScreenId::Modes: return screenModes;
    case ScreenId::Activity: return screenActivity;
    case ScreenId::Devices: return screenDevices;
    case ScreenId::Readiness: return screenReadiness;
    case ScreenId::System: return screenSystem;
    case ScreenId::Recovery: return screenRecovery;
    case ScreenId::Ambient: return screenAmbient;
  }
  return screenHome;
}

static void loadScreen(ScreenId id) {
  lastInteractionMs = millis();
  lv_obj_t *target = screenFor(id);
  if (target) lv_scr_load_anim(target, LV_SCR_LOAD_ANIM_FADE_ON, 110, 0, false);
}

static void navEvent(lv_event_t *e) {
  ScreenId id = static_cast<ScreenId>(reinterpret_cast<intptr_t>(lv_event_get_user_data(e)));
  loadScreen(id);
}

static void addBottomNav(lv_obj_t *screen, ScreenId active) {
  lv_obj_t *bar = panel(screen, 8, 426, 304, 46, lv_color_hex(0x050B0F));
  struct N { const char *name; ScreenId id; } items[] = {{"Home", ScreenId::Home}, {"Printer", ScreenId::Printer}, {"More", ScreenId::Apps}};
  for (int i = 0; i < 3; ++i) {
    lv_obj_t *btn = button(bar, items[i].name, 4 + i * 99, 4, 95, 38, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(items[i].id)));
    if (active == items[i].id) {
      lv_obj_set_style_bg_color(btn, lv_color_hex(0x102A1B), 0);
      lv_obj_set_style_border_color(btn, lv_color_hex(0x2B7650), 0);
    }
  }
}

static String formatMinutes(int minutes) {
  if (minutes <= 0) return "--";
  if (minutes < 60) return String(minutes) + "m";
  return String(minutes / 60) + "h " + String(minutes % 60) + "m";
}

static int activeTimerCount() {
  int count = 0; for (auto &t : state.timers) if (t.active) count++; return count;
}

static String remainingTimerText() {
  uint32_t best = UINT32_MAX;
  const char *name = nullptr;
  for (auto &t : state.timers) {
    if (!t.active) continue;
    uint32_t left = (int32_t)(t.endMs - millis()) > 0 ? (t.endMs - millis()) / 1000UL : 0;
    if (left < best) { best = left; name = t.label; }
  }
  if (!name) return "No active timers";
  char out[64]; snprintf(out, sizeof(out), "%s • %02lu:%02lu", name, best / 60UL, best % 60UL); return String(out);
}

static HeroMode resolvedHeroMode() {
  if (config.heroMode != HeroMode::Auto) return config.heroMode;
  for (uint8_t i = 0; i < state.alertCount; ++i) if (state.alerts[i].severity == AlertSeverity::Urgent) return HeroMode::System;
  if (state.printer.online && state.printer.printing) return HeroMode::Printer;
  if (state.calendar.online && state.calendar.hasNext && state.calendar.nextEpoch > 0 && state.calendar.nextEpoch - time(nullptr) < 7200) return HeroMode::Calendar;
  if (state.filament.online && (state.filament.lowSpools + state.filament.emptySpools) > 0) return HeroMode::Filament;
  if (state.weather.online) return HeroMode::Weather;
  return HeroMode::System;
}

static ScreenId heroDestination() {
  switch (resolvedHeroMode()) {
    case HeroMode::Printer: return ScreenId::Printer;
    case HeroMode::Filament: return ScreenId::Filament;
    case HeroMode::Weather:
    case HeroMode::Calendar: return ScreenId::Today;
    case HeroMode::System:
    default:
      if (state.alertCount) {
        const char *source = state.alerts[0].source;
        if (!strcmp(source, "Printer")) return ScreenId::Printer;
        if (!strcmp(source, "Filament")) return ScreenId::Filament;
        if (!strcmp(source, "Workshop") || !strcmp(source, "Dryer")) return ScreenId::Workshop;
        if (!strcmp(source, "Timer")) return ScreenId::Timers;
        if (!strcmp(source, "Network")) return ScreenId::Wifi;
        if (!strcmp(source, "Weather") || !strcmp(source, "Calendar")) return ScreenId::Today;
      }
      if (state.workshop.filterRequested || state.workshop.dryer.running) return ScreenId::Workshop;
      return ScreenId::System;
  }
}

static void heroEvent(lv_event_t *) {
  loadScreen(heroDestination());
}

static void updateHero() {
  if (!heroTitle || !heroValue || !heroDetail || !heroEyebrow) return;
  HeroMode mode = resolvedHeroMode();
  char value[64] = "Ready"; char detail[128] = "Everything looks good"; const char *eyebrow = "NOW"; const char *title = config.deviceName;
  switch (mode) {
    case HeroMode::Printer:
      title = "Bambu P1S"; snprintf(value, sizeof(value), "%u%%", state.printer.progress);
      snprintf(detail, sizeof(detail), "%s • %s remaining", strlen(state.printer.jobName) ? state.printer.jobName : state.printer.status, formatMinutes(state.printer.remainingMinutes).c_str()); break;
    case HeroMode::Weather:
      title = strlen(config.weatherLocation) ? config.weatherLocation : "Weather"; snprintf(value, sizeof(value), "%.0f°F", state.weather.temperatureC * 9.0f / 5.0f + 32.0f);
      snprintf(detail, sizeof(detail), "%s • H %.0f° / L %.0f°", state.weather.condition, state.weather.highC * 9.0f/5.0f+32.0f, state.weather.lowC * 9.0f/5.0f+32.0f); break;
    case HeroMode::Calendar:
      title = "Next"; snprintf(value, sizeof(value), "%s", state.calendar.nextTitle); snprintf(detail, sizeof(detail), "%s", state.calendar.nextWhen); break;
    case HeroMode::Filament:
      title = "Filament"; snprintf(value, sizeof(value), "%d spools", state.filament.totalSpools);
      snprintf(detail, sizeof(detail), "%d loaded • %d low • %d empty", state.filament.loadedSpools, state.filament.lowSpools, state.filament.emptySpools); break;
    case HeroMode::System:
    default:
      if (state.alertCount && state.alerts[0].severity == AlertSeverity::Urgent) { title = "Attention"; snprintf(value, sizeof(value), "%s", state.alerts[0].title); snprintf(detail, sizeof(detail), "%s", state.alerts[0].detail); }
      else if (state.system.updateAvailable) { title = "Update available"; snprintf(value, sizeof(value), "%s", state.system.updateVersion); snprintf(detail, sizeof(detail), "Open System to review"); }
      else if (state.workshop.filterRequested) { title = "Workshop air"; snprintf(value, sizeof(value), "Filter on"); snprintf(detail, sizeof(detail), "%s", strlen(state.workshop.filterReason) ? state.workshop.filterReason : "Automation active"); }
      else if (state.workshop.dryer.running) { title = "Filament dryer"; snprintf(value, sizeof(value), "%s", state.workshop.dryer.material); snprintf(detail, sizeof(detail), "%lu min remaining", (unsigned long)(state.workshop.dryer.remainingSec / 60UL)); }
      else { title = config.deviceName; snprintf(value, sizeof(value), "Ready"); snprintf(detail, sizeof(detail), "%s • %lu min uptime", WiFi.status() == WL_CONNECTED ? "Online" : "Local mode", state.system.uptimeSec / 60UL); }
      break;
  }
  lv_label_set_text(heroEyebrow, eyebrow); lv_label_set_text(heroTitle, title); lv_label_set_text(heroValue, value); lv_label_set_text(heroDetail, detail);
}

static void homeCardContent(HomeCard card, String &title, String &detail, String &value) {
  title = homeCardName(card);
  switch (card) {
    case HomeCard::Controls: detail = "Smart home"; value = state.homeAssistant.online ? "Live" : (config.homeAssistantEnabled ? "Offline" : "Setup"); break;
    case HomeCard::Today: detail = "Agenda"; value = state.calendar.hasNext ? "Next" : "Open"; break;
    case HomeCard::Printer: detail = "P1S"; value = state.printer.printing ? String(state.printer.progress) + "%" : (state.printer.online ? state.printer.status : "Setup"); break;
    case HomeCard::Filament: detail = "Inventory"; value = state.filament.online ? String(state.filament.totalSpools) : "Setup"; break;
    case HomeCard::Weather: detail = "Forecast"; value = state.weather.online ? String((int)round(state.weather.temperatureC*9.0/5.0+32)) + "°" : "Setup"; break;
    case HomeCard::Timers: detail = "Local"; value = String(activeTimerCount()) + " active"; break;
    case HomeCard::Attention: detail = "Alerts"; value = String(state.alertCount); break;
    case HomeCard::System: default: detail = "Health"; value = state.system.recoveryMode ? "Recovery" : "Good"; break;
  }
}

static ScreenId screenForCard(HomeCard card) {
  switch (card) {
    case HomeCard::Controls: return ScreenId::Controls; case HomeCard::Today: return ScreenId::Today;
    case HomeCard::Printer: return ScreenId::Printer; case HomeCard::Filament: return ScreenId::Filament;
    case HomeCard::Weather: return ScreenId::Today; case HomeCard::Timers: return ScreenId::Timers;
    case HomeCard::Attention: return ScreenId::Attention; default: return ScreenId::System;
  }
}

static void homeCardEvent(lv_event_t *e) {
  int index = (int)reinterpret_cast<intptr_t>(lv_event_get_user_data(e));
  if (index < 0 || index >= 3) return;
  loadScreen(screenForCard(config.homeCards[index]));
}

static void createHome() {
  screenHome = lv_obj_create(nullptr); styleScreen(screenHome);
  homeClock = label(screenHome, "--:--", &lv_font_montserrat_18, C_TEXT, 12, 10);
  homeDate = label(screenHome, "Starting...", &lv_font_montserrat_12, C_MUTED, 12, 38, 200);
  lv_obj_t *status = label(screenHome, "", &lv_font_montserrat_12, C_GREEN, 180, 14, 128); lv_obj_set_style_text_align(status, LV_TEXT_ALIGN_RIGHT, 0); statusLabels[statusLabelCount++] = status;
  homeGreeting = label(screenHome, "Hello", &lv_font_montserrat_20, C_TEXT, 12, 64);
  homeStatus = label(screenHome, "Home Hub starting", &lv_font_montserrat_12, C_MUTED, 12, 91, 292);

  lv_obj_t *hero = panel(screenHome, 12, 116, 296, 132, C_SURFACE_2);
  heroEyebrow = label(hero, "NOW", &lv_font_montserrat_12, C_GREEN, 14, 10);
  heroTitle = label(hero, config.deviceName, &lv_font_montserrat_16, C_TEXT, 14, 32, 265);
  heroValue = label(hero, "Ready", &lv_font_montserrat_28, C_TEXT, 14, 57, 265);
  heroDetail = label(hero, "Everything looks good", &lv_font_montserrat_12, C_MUTED, 14, 102, 265);
  lv_obj_add_flag(hero, LV_OBJ_FLAG_CLICKABLE); lv_obj_add_event_cb(hero, heroEvent, LV_EVENT_CLICKED, nullptr);

  label(screenHome, "AT A GLANCE", &lv_font_montserrat_12, C_DIM, 12, 263);
  for (int i = 0; i < 3; ++i) {
    lv_obj_t *card = panel(screenHome, 12 + i * 102, 282, 92, 112, C_SURFACE);
    homeCardTitle[i] = label(card, "Card", &lv_font_montserrat_14, C_TEXT, 9, 12, 76);
    homeCardDetail[i] = label(card, "Detail", &lv_font_montserrat_12, C_MUTED, 9, 40, 76);
    homeCardState[i] = label(card, "Ready", &lv_font_montserrat_12, C_GREEN, 9, 72, 76);
    lv_obj_add_flag(card, LV_OBJ_FLAG_CLICKABLE); lv_obj_add_event_cb(card, homeCardEvent, LV_EVENT_CLICKED, reinterpret_cast<void *>(static_cast<intptr_t>(i)));
  }
  addBottomNav(screenHome, ScreenId::Home);
}

static void createToday() {
  screenToday = lv_obj_create(nullptr); styleScreen(screenToday); addStatusBar(screenToday, "TODAY");
  lv_obj_t *weather = panel(screenToday, 12, 54, 296, 112, C_SURFACE_2); label(weather, "WEATHER", &lv_font_montserrat_12, C_BLUE, 14, 10); todayWeather = wrapLabel(weather, "Not configured", &lv_font_montserrat_16, C_TEXT, 14, 37, 266);
  lv_obj_t *agenda = panel(screenToday, 12, 178, 296, 132, C_SURFACE_2); label(agenda, "NEXT", &lv_font_montserrat_12, C_PURPLE, 14, 10); todayAgenda = wrapLabel(agenda, "No calendar connected", &lv_font_montserrat_16, C_TEXT, 14, 37, 266);
  lv_obj_t *timers = panel(screenToday, 12, 322, 296, 88, C_SURFACE); label(timers, "TIMERS", &lv_font_montserrat_12, C_ORANGE, 14, 10); todayTimer = label(timers, "No active timers", &lv_font_montserrat_14, C_TEXT, 14, 38, 266); lv_obj_add_flag(timers, LV_OBJ_FLAG_CLICKABLE); lv_obj_add_event_cb(timers, navEvent, LV_EVENT_CLICKED, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Timers)));
  addBottomNav(screenToday, ScreenId::Apps);
}

static void createControls() {
  screenControls = lv_obj_create(nullptr); styleScreen(screenControls); addStatusBar(screenControls, "CONTROLS");
  controlsBody = wrapLabel(screenControls, "Home Assistant not configured", &lv_font_montserrat_14, C_TEXT, 14, 62, 292); lv_obj_set_style_text_line_space(controlsBody, 10, 0);
  button(screenControls, "Scene", 12, 350, 142, 52, [](lv_event_t*) { homeAssistantPlugin.callScene(config); }, nullptr, C_BLUE);
  button(screenControls, "Automation", 166, 350, 142, 52, [](lv_event_t*) { homeAssistantPlugin.callAutomation(config); }, nullptr, C_PURPLE);
  addBottomNav(screenControls, ScreenId::Apps);
}

static void createApps() {
  screenApps = lv_obj_create(nullptr); styleScreen(screenApps); addStatusBar(screenApps, "MORE");
  label(screenApps, "WORKSHOP & DEVICE", &lv_font_montserrat_12, C_DIM, 12, 52);
  struct App { const char *name; ScreenId id; lv_color_t color; } apps[] = {
    {"Workshop", ScreenId::Workshop, C_ORANGE}, {"Filament", ScreenId::Filament, C_BLUE},
    {"Controls", ScreenId::Controls, C_GREEN}, {"Automation", ScreenId::Automation, C_PURPLE},
    {"Today", ScreenId::Today, C_BLUE}, {"Timers", ScreenId::Timers, C_ORANGE},
    {"Device", ScreenId::Devices, C_BLUE}, {"System", ScreenId::System, C_GREEN}
  };
  for (size_t i = 0; i < sizeof(apps)/sizeof(apps[0]); ++i) {
    button(screenApps, apps[i].name, 12 + (i % 2) * 154, 76 + (i / 2) * 76, 142, 64,
           navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(apps[i].id)), apps[i].color);
  }
  addBottomNav(screenApps, ScreenId::Apps);
}

static void createAttention() {
  screenAttention = lv_obj_create(nullptr); styleScreen(screenAttention); addStatusBar(screenAttention, "ATTENTION");
  attentionBody = wrapLabel(screenAttention, "All clear", &lv_font_montserrat_14, C_TEXT, 14, 64, 292); lv_obj_set_style_text_line_space(attentionBody, 8, 0);
  addBottomNav(screenAttention, ScreenId::Apps);
}

static void settingAction(lv_event_t *e) {
  intptr_t action = reinterpret_cast<intptr_t>(lv_event_get_user_data(e));
  if (action == 0) config.brightness = config.brightness >= 100 ? 20 : config.brightness + 10;
  else if (action == 1) { int idx = 0; for (size_t i=0;i<TIMEZONE_COUNT;i++) if (!strcmp(config.timezoneId,TIMEZONES[i].id)) idx=i; idx=(idx+1)%TIMEZONE_COUNT; strlcpy(config.timezoneId,TIMEZONES[idx].id,sizeof(config.timezoneId)); strlcpy(config.timezonePosix,TIMEZONES[idx].posix,sizeof(config.timezonePosix)); timeConfigured=false; }
  else if (action == 2) config.ambientTimeoutSec = config.ambientTimeoutSec >= 600 ? 60 : config.ambientTimeoutSec + 60;
  else if (action == 3) config.ambientBrightness = config.ambientBrightness >= 50 ? 10 : config.ambientBrightness + 10;
  else if (action == 4) { config.theme = static_cast<ThemeMode>((static_cast<int>(config.theme)+1)%3); }
  else if (action == 5) { config.heroMode = static_cast<HeroMode>((static_cast<int>(config.heroMode)+1)%6); }
  else if (action == 6) { config.ambientMode = static_cast<AmbientDisplayMode>((static_cast<int>(config.ambientMode)+1)%5); }
  else if (action == 7) { config.airMode = static_cast<AirMode>((static_cast<int>(config.airMode)+1)%4); state.workshop.airMode = config.airMode; }
  else if (action >= 10 && action <= 12) { int i=action-10; config.homeCards[i]=static_cast<HomeCard>((static_cast<int>(config.homeCards[i])+1)%8); }
  configStore.save(config); applyBacklight(config.brightness); applyThemeTokens();
  if (action == 4) { lv_obj_t *current = lv_scr_act(); (void)current; }
  lastUiRefreshMs = 0;
}

static void createQuick() {
  screenQuick = lv_obj_create(nullptr); styleScreen(screenQuick); addStatusBar(screenQuick, "QUICK CONTROL");
  label(screenQuick, "COMMON ACTIONS", &lv_font_montserrat_12, C_DIM, 12, 54);
  button(screenQuick, "Brightness", 12, 78, 142, 64, [](lv_event_t*){ config.brightness=config.brightness>=100?30:config.brightness+10; configStore.save(config); applyBacklight(config.brightness); }, nullptr, C_BLUE);
  button(screenQuick, "Air mode", 166, 78, 142, 64, [](lv_event_t*){ config.airMode=static_cast<AirMode>((static_cast<int>(config.airMode)+1)%4); state.workshop.airMode=config.airMode; configStore.save(config); }, nullptr, C_GREEN);
  button(screenQuick, "5 min timer", 12, 154, 142, 64, [](lv_event_t*){ timerPlugin.start(state,300,"5 minute timer"); }, nullptr, C_ORANGE);
  button(screenQuick, "Ambient", 166, 154, 142, 64, [](lv_event_t*){ config.ambientMode=static_cast<AmbientDisplayMode>((static_cast<int>(config.ambientMode)+1)%5); configStore.save(config); }, nullptr, C_PURPLE);
  button(screenQuick, "Pause print", 12, 230, 142, 64, [](lv_event_t*){ bambuPlugin.pausePrint(); }, nullptr, C_ORANGE);
  button(screenQuick, "Resume print", 166, 230, 142, 64, [](lv_event_t*){ bambuPlugin.resumePrint(); }, nullptr, C_GREEN);
  button(screenQuick, "Attention", 12, 306, 142, 64, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Attention)), C_RED);
  button(screenQuick, "Settings", 166, 306, 142, 64, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Settings)), C_BLUE);
  addBottomNav(screenQuick, ScreenId::Apps);
}

static void createSettings() {
  screenSettings = lv_obj_create(nullptr); styleScreen(screenSettings); addStatusBar(screenSettings, "SETTINGS");
  settingsBody = label(screenSettings, "", &lv_font_montserrat_12, C_MUTED, 14, 52, 292);
  button(screenSettings, "Brightness", 12, 92, 142, 50, settingAction, reinterpret_cast<void *>(0), C_GREEN);
  button(screenSettings, "Timezone", 166, 92, 142, 50, settingAction, reinterpret_cast<void *>(1), C_BLUE);
  button(screenSettings, "Ambient time", 12, 154, 142, 50, settingAction, reinterpret_cast<void *>(2), C_PURPLE);
  button(screenSettings, "Ambient dim", 166, 154, 142, 50, settingAction, reinterpret_cast<void *>(3), C_ORANGE);
  button(screenSettings, "Theme", 12, 216, 92, 46, settingAction, reinterpret_cast<void *>(4), C_BLUE);
  button(screenSettings, "NOW", 114, 216, 92, 46, settingAction, reinterpret_cast<void *>(5), C_GREEN);
  button(screenSettings, "Ambient", 216, 216, 92, 46, settingAction, reinterpret_cast<void *>(6), C_PURPLE);
  button(screenSettings, "Air mode", 12, 274, 92, 46, settingAction, reinterpret_cast<void *>(7), C_ORANGE);
  button(screenSettings, "Card 1", 114, 274, 92, 46, settingAction, reinterpret_cast<void *>(10));
  button(screenSettings, "Card 2", 216, 274, 92, 46, settingAction, reinterpret_cast<void *>(11));
  button(screenSettings, "Card 3", 12, 332, 92, 46, settingAction, reinterpret_cast<void *>(12));
  button(screenSettings, "Workshop", 114, 332, 92, 46, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Workshop)), C_ORANGE);
  button(screenSettings, "Wi-Fi", 216, 332, 92, 46, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Wifi)), C_BLUE);
  addBottomNav(screenSettings, ScreenId::Apps);
}

static void createWifi() {
  screenWifi = lv_obj_create(nullptr); styleScreen(screenWifi); addStatusBar(screenWifi, "WI-FI");
  wifiBody = wrapLabel(screenWifi, "Loading...", &lv_font_montserrat_14, C_TEXT, 14, 70, 292); lv_obj_set_style_text_line_space(wifiBody, 9, 0);
  button(screenWifi, "Reconnect", 12, 304, 142, 52, [](lv_event_t*){ connectivity.reconnect(); }, nullptr, C_BLUE);
  button(screenWifi, "Forget", 166, 304, 142, 52, [](lv_event_t*){ connectivity.forget(); }, nullptr, C_RED);
  button(screenWifi, "Settings", 12, 370, 296, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Settings)), C_BLUE);
  addBottomNav(screenWifi, ScreenId::Apps);
}

static void createTimers() {
  screenTimers = lv_obj_create(nullptr); styleScreen(screenTimers); addStatusBar(screenTimers, "TIMERS");
  timerBody = wrapLabel(screenTimers, "No active timers", &lv_font_montserrat_14, C_TEXT, 14, 66, 292); lv_obj_set_style_text_line_space(timerBody, 9, 0);
  button(screenTimers, "5 min", 12, 250, 92, 58, [](lv_event_t*){ timerPlugin.start(state,300,"5 minute timer"); }, nullptr, C_ORANGE);
  button(screenTimers, "10 min", 114, 250, 92, 58, [](lv_event_t*){ timerPlugin.start(state,600,"10 minute timer"); }, nullptr, C_ORANGE);
  button(screenTimers, "30 min", 216, 250, 92, 58, [](lv_event_t*){ timerPlugin.start(state,1800,"30 minute timer"); }, nullptr, C_ORANGE);
  button(screenTimers, "Clear all", 12, 324, 296, 50, [](lv_event_t*){ for(int i=0;i<4;i++) timerPlugin.cancel(state,i); }, nullptr, C_RED);
  addBottomNav(screenTimers, ScreenId::Apps);
}

static void createPrinter() {
  screenPrinter = lv_obj_create(nullptr); styleScreen(screenPrinter); addStatusBar(screenPrinter, "PRINTER");

  lv_obj_t *hero = panel(screenPrinter, 12, 54, 296, 126, C_SURFACE_2);
  printerStateLabel = label(hero, "BAMBU P1S", &lv_font_montserrat_12, C_GREEN, 14, 10, 266);
  printerJobLabel = label(hero, "Printer not configured", &lv_font_montserrat_16, C_TEXT, 14, 34, 266);
  printerProgressLabel = label(hero, "--%", &lv_font_montserrat_28, C_TEXT, 14, 58, 100);
  printerRemainingLabel = label(hero, "-- remaining", &lv_font_montserrat_12, C_MUTED, 150, 69, 130);
  lv_obj_set_style_text_align(printerRemainingLabel, LV_TEXT_ALIGN_RIGHT, 0);
  printerProgressBar = lv_bar_create(hero);
  lv_obj_set_pos(printerProgressBar, 14, 95); lv_obj_set_size(printerProgressBar, 266, 8);
  lv_bar_set_range(printerProgressBar, 0, 100); lv_bar_set_value(printerProgressBar, 0, LV_ANIM_OFF);
  lv_obj_set_style_radius(printerProgressBar, 4, LV_PART_MAIN);
  lv_obj_set_style_radius(printerProgressBar, 4, LV_PART_INDICATOR);
  lv_obj_set_style_bg_color(printerProgressBar, C_BORDER, LV_PART_MAIN);
  lv_obj_set_style_bg_color(printerProgressBar, C_GREEN, LV_PART_INDICATOR);
  printerLayerLabel = label(hero, "Layer -- / --", &lv_font_montserrat_12, C_MUTED, 14, 108, 266);

  const char *statNames[] = {"NOZZLE", "BED", "CHAMBER"};
  lv_obj_t **statValues[] = {&printerNozzleLabel, &printerBedLabel, &printerChamberLabel};
  for (int i = 0; i < 3; ++i) {
    lv_obj_t *stat = panel(screenPrinter, 12 + i * 102, 190, 92, 64, C_SURFACE);
    label(stat, statNames[i], &lv_font_montserrat_12, C_DIM, 9, 8, 74);
    *statValues[i] = label(stat, "--°", &lv_font_montserrat_16, C_TEXT, 9, 32, 74);
  }

  label(screenPrinter, "AMS", &lv_font_montserrat_12, C_DIM, 12, 265);
  for (int i = 0; i < 4; ++i) {
    printerAmsPanels[i] = panel(screenPrinter, 12 + i * 76, 284, 68, 56, C_SURFACE);
    printerAmsLabels[i] = wrapLabel(printerAmsPanels[i], "A1\nEmpty", &lv_font_montserrat_12, C_MUTED, 8, 7, 52);
  }

  button(screenPrinter, "Pause", 12, 352, 92, 56, [](lv_event_t*){ bambuPlugin.pausePrint(); }, nullptr, C_ORANGE);
  button(screenPrinter, "Resume", 114, 352, 92, 56, [](lv_event_t*){ bambuPlugin.resumePrint(); }, nullptr, C_GREEN);
  lv_obj_t *stop = button(screenPrinter, "Hold Stop", 216, 352, 92, 56, nullptr, nullptr, C_RED);
  lv_obj_add_event_cb(stop, [](lv_event_t*){ bambuPlugin.stopPrint(); }, LV_EVENT_LONG_PRESSED, nullptr);
  addBottomNav(screenPrinter, ScreenId::Printer);
}

static void createFilament() {
  screenFilament = lv_obj_create(nullptr); styleScreen(screenFilament); addStatusBar(screenFilament, "FILAMENT");
  filamentBody = wrapLabel(screenFilament, "Filament Inventory not configured", &lv_font_montserrat_14, C_TEXT, 14, 64, 292); lv_obj_set_style_text_line_space(filamentBody, 10, 0);
  button(screenFilament, "Settings", 12, 370, 296, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Settings)), C_BLUE);
  addBottomNav(screenFilament, ScreenId::Apps);
}

static void createWorkshop() {
  screenWorkshop = lv_obj_create(nullptr); styleScreen(screenWorkshop); addStatusBar(screenWorkshop, "WORKSHOP");
  workshopBody = wrapLabel(screenWorkshop, "Workshop starting...", &lv_font_montserrat_12, C_TEXT, 14, 54, 292); lv_obj_set_style_text_line_space(workshopBody, 5, 0);
  button(screenWorkshop, "Air mode", 12, 304, 92, 46, [](lv_event_t*){ config.airMode=static_cast<AirMode>((static_cast<int>(config.airMode)+1)%4); state.workshop.airMode=config.airMode; configStore.save(config); }, nullptr, C_BLUE);
  button(screenWorkshop, "PETG dry", 114, 304, 92, 46, [](lv_event_t*){ workshopService.startDryer(state,"PETG",55,6UL*3600UL); }, nullptr, C_ORANGE);
  button(screenWorkshop, "Stop dryer", 216, 304, 92, 46, [](lv_event_t*){ workshopService.stopDryer(state); }, nullptr, C_RED);
  button(screenWorkshop, "Quick controls", 12, 366, 296, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Quick)), C_BLUE);
  addBottomNav(screenWorkshop, ScreenId::Apps);
}

static void createInsights() {
  screenInsights = lv_obj_create(nullptr); styleScreen(screenInsights); addStatusBar(screenInsights, "INSIGHTS");
  insightsBody = wrapLabel(screenInsights, "Evaluating current context...", &lv_font_montserrat_12, C_TEXT, 14, 54, 292);
  lv_obj_set_style_text_line_space(insightsBody, 5, 0);
  button(screenInsights, "Workshop", 12, 366, 142, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Workshop)), C_ORANGE);
  button(screenInsights, "Device", 166, 366, 142, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Devices)), C_BLUE);
  addBottomNav(screenInsights, ScreenId::Apps);
}

static void createAutomation() {
  screenAutomation = lv_obj_create(nullptr); styleScreen(screenAutomation); addStatusBar(screenAutomation, "AUTOMATION");
  automationBody = wrapLabel(screenAutomation, "Evaluating local rules...", &lv_font_montserrat_12, C_TEXT, 14, 54, 292); lv_obj_set_style_text_line_space(automationBody, 5, 0);
  button(screenAutomation, "Workshop", 12, 366, 142, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Workshop)), C_ORANGE);
  button(screenAutomation, "Insights", 166, 366, 142, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Insights)), C_PURPLE);
  addBottomNav(screenAutomation, ScreenId::Apps);
}

static void createActivity() {
  screenActivity = lv_obj_create(nullptr); styleScreen(screenActivity); addStatusBar(screenActivity, "ACTIVITY");
  activityBody = wrapLabel(screenActivity, "No recent activity", &lv_font_montserrat_12, C_TEXT, 14, 54, 292); lv_obj_set_style_text_line_space(activityBody, 5, 0);
  button(screenActivity, "Device", 12, 366, 296, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Devices)), C_BLUE);
  addBottomNav(screenActivity, ScreenId::Apps);
}

static void createDevices() {
  screenDevices = lv_obj_create(nullptr); styleScreen(screenDevices); addStatusBar(screenDevices, "DEVICES");
  devicesBody = wrapLabel(screenDevices, "Inspecting device health...", &lv_font_montserrat_12, C_TEXT, 14, 54, 292); lv_obj_set_style_text_line_space(devicesBody, 5, 0);
  button(screenDevices, "Activity", 12, 366, 92, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Activity)), C_PURPLE);
  button(screenDevices, "Settings", 114, 366, 92, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Settings)), C_BLUE);
  button(screenDevices, "Modes", 216, 366, 92, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Modes)), C_GREEN);
  addBottomNav(screenDevices, ScreenId::Apps);
}

static void applyOperationalMode(int mode) {
  if(mode == 0) { // Home / adaptive
    config.ambientMode = AmbientDisplayMode::Auto;
    config.airMode = AirMode::Auto;
    config.audioEnabled = true;
  } else if(mode == 1) { // Print focus
    config.ambientMode = AmbientDisplayMode::Printer;
    config.airMode = AirMode::Auto;
    config.audioEnabled = true;
  } else if(mode == 2) { // Workshop focus
    config.ambientMode = AmbientDisplayMode::Workshop;
    config.airMode = AirMode::Auto;
    config.audioEnabled = true;
  } else if(mode == 3) { // Quiet
    config.ambientMode = AmbientDisplayMode::Minimal;
    config.audioEnabled = false;
  }
  state.workshop.airMode = config.airMode;
  configStore.save(config);
  audio.setVolume(config.audioEnabled ? config.audioVolume : 0);
  lastUiRefreshMs = 0;
}

static void modeEvent(lv_event_t *e) {
  applyOperationalMode((int)reinterpret_cast<intptr_t>(lv_event_get_user_data(e)));
}

static void createModes() {
  screenModes = lv_obj_create(nullptr); styleScreen(screenModes); addStatusBar(screenModes, "MODES");
  modesBody = wrapLabel(screenModes, "Adaptive operating profiles", &lv_font_montserrat_12, C_MUTED, 14, 54, 292);
  button(screenModes, "Home", 12, 92, 142, 64, modeEvent, reinterpret_cast<void *>(0), C_GREEN);
  button(screenModes, "Print focus", 166, 92, 142, 64, modeEvent, reinterpret_cast<void *>(1), C_BLUE);
  button(screenModes, "Workshop", 12, 170, 142, 64, modeEvent, reinterpret_cast<void *>(2), C_ORANGE);
  button(screenModes, "Quiet", 166, 170, 142, 64, modeEvent, reinterpret_cast<void *>(3), C_PURPLE);
  button(screenModes, "Automation", 12, 366, 296, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Automation)), C_BLUE);
  addBottomNav(screenModes, ScreenId::Apps);
}

static void createReadiness() {
  screenReadiness = lv_obj_create(nullptr); styleScreen(screenReadiness); addStatusBar(screenReadiness, "READINESS");
  readinessBody = wrapLabel(screenReadiness, "Evaluating setup...", &lv_font_montserrat_12, C_TEXT, 14, 54, 292);
  lv_obj_set_style_text_line_space(readinessBody, 5, 0);
  button(screenReadiness, "Device", 12, 366, 142, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Devices)), C_BLUE);
  button(screenReadiness, "Settings", 166, 366, 142, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Settings)), C_PURPLE);
  addBottomNav(screenReadiness, ScreenId::Apps);
}

static void createSystem() {
  screenSystem = lv_obj_create(nullptr); styleScreen(screenSystem); addStatusBar(screenSystem, "SYSTEM");
  systemBody = wrapLabel(screenSystem, "Loading diagnostics...", &lv_font_montserrat_12, C_TEXT, 14, 58, 292); lv_obj_set_style_text_line_space(systemBody, 7, 0);
  button(screenSystem, "Readiness", 12, 362, 142, 48, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Readiness)), C_BLUE);
  button(screenSystem, "Activity", 166, 362, 142, 48, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Activity)), C_PURPLE);
  addBottomNav(screenSystem, ScreenId::Apps);
}

static void createRecovery() {
  screenRecovery = lv_obj_create(nullptr); styleScreen(screenRecovery); label(screenRecovery, "RECOVERY", &lv_font_montserrat_20, C_RED, 14, 22);
  label(screenRecovery, "Safe mode is active", &lv_font_montserrat_20, C_TEXT, 14, 72, 292);
  recoveryBody = wrapLabel(screenRecovery, "Boot-loop protection paused integrations. A new firmware version starts with a clean validation epoch. Try Normal Boot clears only the boot-loop counter; Wi-Fi and settings are preserved.", &lv_font_montserrat_14, C_MUTED, 14, 116, 292);
  button(screenRecovery, "Wi-Fi", 12, 296, 142, 54, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Wifi)), C_BLUE);
  button(screenRecovery, "System", 166, 296, 142, 54, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::System)), C_GREEN);
  button(screenRecovery, "Try normal boot", 12, 366, 296, 48, [](lv_event_t*){ bootGuard.clearRecovery(state); delay(80); ESP.restart(); }, nullptr, C_ORANGE);
}

static void createAmbient() {
  screenAmbient = lv_obj_create(nullptr); styleScreen(screenAmbient);
  ambientClock = label(screenAmbient, "--:--", &lv_font_montserrat_36, C_TEXT, 0, 132, 320); lv_obj_set_style_text_align(ambientClock, LV_TEXT_ALIGN_CENTER, 0);
  ambientDate = label(screenAmbient, "", &lv_font_montserrat_16, C_MUTED, 0, 184, 320); lv_obj_set_style_text_align(ambientDate, LV_TEXT_ALIGN_CENTER, 0);
  lv_obj_t *line = lv_obj_create(screenAmbient); lv_obj_set_pos(line, 126, 230); lv_obj_set_size(line, 68, 2); lv_obj_set_style_bg_color(line, C_GREEN, 0); lv_obj_set_style_border_width(line, 0, 0);
  ambientSummary = wrapLabel(screenAmbient, "Everything looks good\nTouch to wake", &lv_font_montserrat_14, C_MUTED, 28, 260, 264); lv_obj_set_style_text_align(ambientSummary, LV_TEXT_ALIGN_CENTER, 0);
}

static void createUi() {
  statusLabelCount = 0;
  createHome(); createToday(); createControls(); createApps(); createAttention(); createQuick(); createSettings(); createWifi(); createTimers(); createPrinter(); createFilament(); createWorkshop(); createInsights(); createAutomation(); createActivity(); createDevices(); createModes(); createReadiness(); createSystem(); createRecovery(); createAmbient();
  loadScreen(state.system.recoveryMode ? ScreenId::Recovery : ScreenId::Home);
}

static void refreshHome() {
  struct tm info; char timeBuf[16]="--:--"; char dateBuf[40]="Time not synced"; char greeting[28]="Hello";
  if (getLocalTime(&info,5)) { strftime(timeBuf,sizeof(timeBuf),"%l:%M %p",&info); if(timeBuf[0]==' ') memmove(timeBuf,timeBuf+1,strlen(timeBuf)); strftime(dateBuf,sizeof(dateBuf),"%A, %B %e",&info); snprintf(greeting,sizeof(greeting),info.tm_hour<12?"Good morning":info.tm_hour<17?"Good afternoon":"Good evening"); }
  if(homeClock) lv_label_set_text(homeClock,timeBuf); if(homeDate) lv_label_set_text(homeDate,dateBuf); if(homeGreeting) lv_label_set_text(homeGreeting,greeting);
  if(homeStatus) { char b[96]; snprintf(b,sizeof(b),"%s • %u alert%s",WiFi.status()==WL_CONNECTED?"Connected":state.system.setupApActive?"Setup available":"Local mode",state.alertCount,state.alertCount==1?"":"s"); lv_label_set_text(homeStatus,b); }
  updateHero();
  for(int i=0;i<3;i++){ String t,d,v; homeCardContent(config.homeCards[i],t,d,v); lv_label_set_text(homeCardTitle[i],t.c_str()); lv_label_set_text(homeCardDetail[i],d.c_str()); lv_label_set_text(homeCardState[i],v.c_str()); }
}

static void refreshToday() {
  if(todayWeather){
    char b[180];
    if(state.weather.online) {
      snprintf(b,sizeof(b),"%.0f°F  %s\nFeels %.0f° • H %.0f° / L %.0f°\nRain %d%% • RH %.0f%% • Wind %.0f mph",state.weather.temperatureC*9/5+32,state.weather.condition,state.weather.apparentC*9/5+32,state.weather.highC*9/5+32,state.weather.lowC*9/5+32,state.weather.precipitationPercent,state.weather.humidityPercent,state.weather.windKph*0.621371f);
    } else if(!config.weatherEnabled) {
      snprintf(b,sizeof(b),"Weather off\nEnable it in the web dashboard");
    } else if(!state.weather.configured) {
      snprintf(b,sizeof(b),"Weather not configured\n%s", strlen(state.weather.condition) ? state.weather.condition : "Set ZIP or City, State in dashboard");
    } else {
      snprintf(b,sizeof(b),"Weather temporarily unavailable\n%s", strlen(state.weather.lastError) ? state.weather.lastError : (WiFi.status()==WL_CONNECTED?"Online • retrying automatically":"Wi-Fi offline"));
    }
    lv_label_set_text(todayWeather,b);
  }
  if(todayAgenda){ char b[180]; if(state.calendar.online&&state.calendar.hasNext) snprintf(b,sizeof(b),"%s\n%s",state.calendar.nextTitle,state.calendar.nextWhen); else snprintf(b,sizeof(b),config.calendarEnabled?"No upcoming calendar event":"Calendar not configured\nAdd an ICS feed in the web dashboard"); lv_label_set_text(todayAgenda,b); }
  if(todayTimer) {
    String next = remainingTimerText();
    if(state.printer.printing) next += String("\nPrinter ")+state.printer.progress+"% • "+formatMinutes(state.printer.remainingMinutes)+" remaining";
    else if(state.workshop.dryer.running) next += String("\nDryer ")+state.workshop.dryer.material+" • "+(state.workshop.dryer.remainingSec/60UL)+" min";
    lv_label_set_text(todayTimer,next.c_str());
  }
}

static void refreshControls() {
  if(!controlsBody) return; String b;
  if(!config.homeAssistantEnabled) b="Home Assistant is not configured.\n\nOpen the local web dashboard to add its URL, token and entities.";
  else if(!state.homeAssistant.online) b="Home Assistant is configured but currently unavailable.";
  else { b="LIVE ENTITIES\n\n"; for(int i=0;i<4;i++){auto &e=state.homeAssistant.entities[i]; if(!e.configured)continue; b+=String(e.label)+"\n  "+e.value+"\n\n";} b+=String("Scene: ")+config.haSceneLabel+"\nAutomation: "+config.haAutomationLabel; }
  lv_label_set_text(controlsBody,b.c_str());
}

static void refreshAttention() {
  if(!attentionBody)return; String b;
  if(state.alertCount==0) b="ALL CLEAR\n\nNo active alerts. Network, services and device health are within the currently configured expectations.";
  else { for(uint8_t i=0;i<state.alertCount;i++){ auto &a=state.alerts[i]; b += (a.severity==AlertSeverity::Urgent?"URGENT":a.severity==AlertSeverity::Attention?"ATTENTION":"INFO"); b += String(" • ")+a.source+"\n"+a.title+"\n"+a.detail+"\n\n"; } }
  lv_label_set_text(attentionBody,b.c_str());
}

static void refreshSettings() {
  if(!settingsBody)return; char b[360]; snprintf(b,sizeof(b),"Brightness %u%% • dim %us @ %u%%\nTimezone %s\nTheme %s • NOW %s\nAmbient %s • Air %s\nCards: %s • %s • %s\nWeb: http://%s/",config.brightness,config.ambientTimeoutSec,config.ambientBrightness,config.timezoneId,themeName(config.theme),heroModeName(config.heroMode),ambientModeName(config.ambientMode),airModeName(config.airMode),homeCardName(config.homeCards[0]),homeCardName(config.homeCards[1]),homeCardName(config.homeCards[2]),state.system.ip); lv_label_set_text(settingsBody,b);
}

static void refreshWifi() {
  if(!wifiBody)return; char b[320]; if(WiFi.status()==WL_CONNECTED) snprintf(b,sizeof(b),"CONNECTED\n\nSSID  %s\nRSSI  %d dBm\nIP    %s\n\nBrowser dashboard:\nhttp://%s/",state.system.ssid,state.system.rssi,state.system.ip,state.system.ip); else snprintf(b,sizeof(b),"%s\n\nSetup network: %s\nSetup address: http://%s/\n\nJoin the setup Wi-Fi from your phone or Mac to configure a new network.",state.system.setupApActive?"SETUP PORTAL ACTIVE":"OFFLINE",SETUP_AP_NAME,state.system.ip); lv_label_set_text(wifiBody,b);
}

static void refreshTimers() {
  if(!timerBody)return; String b; for(int i=0;i<4;i++){auto &t=state.timers[i]; if(!t.active&&!t.fired)continue; if(t.fired){b+=String("DONE • ")+t.label+"\n\n";continue;} uint32_t left=(int32_t)(t.endMs-millis())>0?(t.endMs-millis())/1000UL:0; char x[80];snprintf(x,sizeof(x),"%s\n%02lu:%02lu remaining\n\n",t.label,left/60UL,left%60UL);b+=x;} if(!b.length())b="No active timers.\n\nStart a quick timer below or create one from the local web dashboard."; lv_label_set_text(timerBody,b.c_str());
}

static void refreshPrinter() {
  if (!printerStateLabel || !printerJobLabel || !printerProgressLabel || !printerProgressBar) return;

  const bool enabled = config.bambuEnabled;
  const bool online = state.printer.online;
  const bool printing = online && state.printer.printing;
  const char *name = strlen(state.printer.displayName) ? state.printer.displayName : (strlen(state.printer.model) ? state.printer.model : "Bambu printer");

  String stateLine = String(name) + " • " + (!enabled ? "SETUP" : !online ? "OFFLINE" : state.printer.error ? "ERROR" : printing ? "PRINTING" : state.printer.status);
  lv_label_set_text(printerStateLabel, stateLine.c_str());
  lv_obj_set_style_text_color(printerStateLabel, state.printer.error ? C_RED : printing ? C_GREEN : online ? C_BLUE : C_MUTED, 0);

  String job = !enabled ? "Connect Bambu from web dashboard" : !online ? "Waiting for local MQTT" : strlen(state.printer.jobName) ? state.printer.jobName : "Ready for the next print";
  lv_label_set_text(printerJobLabel, job.c_str());

  char progress[16]; snprintf(progress, sizeof(progress), "%u%%", online ? state.printer.progress : 0);
  lv_label_set_text(printerProgressLabel, progress);
  String remaining = printing ? formatMinutes(state.printer.remainingMinutes) + " remaining" : (online ? String(state.printer.status) : String("Not connected"));
  lv_label_set_text(printerRemainingLabel, remaining.c_str());
  lv_bar_set_value(printerProgressBar, online ? state.printer.progress : 0, LV_ANIM_ON);

  char layer[80];
  if (online && state.printer.totalLayers > 0) snprintf(layer, sizeof(layer), "Layer %d / %d • Speed %d%%", state.printer.currentLayer, state.printer.totalLayers, state.printer.speedPercent);
  else snprintf(layer, sizeof(layer), "%s", enabled ? "Printer telemetry unavailable" : "Scan or configure a printer to begin");
  lv_label_set_text(printerLayerLabel, layer);

  char temp[32];
  if (online) snprintf(temp, sizeof(temp), "%.0f° / %.0f°", state.printer.nozzleC, state.printer.nozzleTargetC); else snprintf(temp, sizeof(temp), "--°");
  lv_label_set_text(printerNozzleLabel, temp);
  if (online) snprintf(temp, sizeof(temp), "%.0f° / %.0f°", state.printer.bedC, state.printer.bedTargetC); else snprintf(temp, sizeof(temp), "--°");
  lv_label_set_text(printerBedLabel, temp);
  if (online) snprintf(temp, sizeof(temp), "%.0f°", state.printer.chamberC); else snprintf(temp, sizeof(temp), "--°");
  lv_label_set_text(printerChamberLabel, temp);

  for (int i = 0; i < 4; ++i) {
    if (!printerAmsLabels[i] || !printerAmsPanels[i]) continue;
    auto &slot = state.printer.amsSlots[i];
    String text = "A" + String(i + 1) + "\n";
    if (!online || !slot.loaded) text += "Empty";
    else {
      text += strlen(slot.material) ? slot.material : "Loaded";
      if (slot.remainingPercent >= 0) text += " " + String(slot.remainingPercent) + "%";
    }
    lv_label_set_text(printerAmsLabels[i], text.c_str());
    const bool active = online && (state.printer.activeTray == i || slot.active);
    lv_obj_set_style_border_color(printerAmsPanels[i], active ? C_GREEN : C_BORDER, 0);
    lv_obj_set_style_border_width(printerAmsPanels[i], active ? 2 : 1, 0);
    lv_obj_set_style_text_color(printerAmsLabels[i], active ? C_TEXT : C_MUTED, 0);
  }
}

static void refreshFilament() {
  if(!filamentBody)return; char b[420]; if(!config.filamentEnabled) snprintf(b,sizeof(b),"Filament Inventory is not configured.\n\nConnect this device to the private cloud inventory from the web dashboard."); else if(!state.filament.online) snprintf(b,sizeof(b),"Inventory unavailable\n\nProfile: %s\nEndpoint configured, waiting for cloud sync.",config.filamentProfile); else snprintf(b,sizeof(b),"PROFILE  %s\n\nTotal spools   %d\nLoaded         %d\nLow            %d\nEmpty          %d\nUnknown        %d\n\nCloud updated\n%s",state.filament.profile,state.filament.totalSpools,state.filament.loadedSpools,state.filament.lowSpools,state.filament.emptySpools,state.filament.unknownSpools,strlen(state.filament.updatedAt)?state.filament.updatedAt:"recently"); lv_label_set_text(filamentBody,b);
}

static void refreshWorkshop() {
  if(!workshopBody)return; String b="PRINTER\n";
  b += state.printer.online ? (String(state.printer.status)+" • "+state.printer.progress+"% • "+formatMinutes(state.printer.remainingMinutes)) : "Offline / not configured";
  b += "\n\nENVIRONMENT\n";
  auto &e=state.workshop.environment;
  if(!e.online) b += "No sensor connected";
  else { b += String(e.source)+" • "+(e.stale?"STALE":"LIVE")+"\n"+String(e.temperatureC,1)+"°C • "+String(e.humidity,0)+"% RH • PM2.5 "+String(e.pm25,1)+"\nVOC "+String(e.voc,0)+" • CO2 "+String(e.co2,0)+" ppm • Presence "+(e.presence?"yes":"no"); }
  b += "\n\nAIR  "; b += airModeName(config.airMode); b += state.workshop.filterRequested ? String(" • FILTER ON\n")+state.workshop.filterReason : " • filter idle";
  b += "\n\nDRYER  "; auto &d=state.workshop.dryer; if(d.running){ b += String(d.material)+" • "+d.targetC+"°C • "+(d.remainingSec/60UL)+" min"; } else b += d.completed?"Complete":"Idle";
  if(state.activityCount){ b+="\n\nRECENT  "; b+=state.activity[0].title; }
  lv_label_set_text(workshopBody,b.c_str());
}

static void refreshInsights() {
  if(!insightsBody) return;
  String b;
  int rank = 1;
  auto add = [&](const String &title, const String &detail) {
    b += String(rank++) + ". " + title + "\n";
    if(detail.length()) b += String("   ") + detail + "\n";
    b += "\n";
  };

  if(state.alertCount) {
    auto &a = state.alerts[0];
    if(a.severity == AlertSeverity::Urgent) add(String("URGENT • ") + a.title, a.detail);
  }
  if(state.system.updateAvailable) add(String("Update to ") + state.system.updateVersion, "Validated firmware is ready in the Update Center.");
  if(state.printer.error || state.printer.errorCode) add("Printer needs attention", state.printer.status);
  else if(state.printer.printing) add(String("Print ") + state.printer.progress + "% complete", formatMinutes(state.printer.remainingMinutes) + " remaining • " + state.printer.jobName);

  if(state.filament.online && state.filament.emptySpools > 0) add(String(state.filament.emptySpools) + " empty filament spool(s)", "Review inventory before the next print.");
  else if(state.filament.online && state.filament.lowSpools > 0) add(String(state.filament.lowSpools) + " low filament spool(s)", "Consider staging a replacement spool.");

  auto &env = state.workshop.environment;
  if(state.workshop.filterRequested) add("Air filtration requested", strlen(state.workshop.filterReason) ? state.workshop.filterReason : "Workshop automation requested filtration.");
  else if(env.online && !env.stale && env.pm25 >= config.pm25Alert) add("PM2.5 above target", String(env.pm25,1) + " vs " + String(config.pm25Alert,1) + " threshold");
  else if(env.online && !env.stale && env.voc >= config.vocAlert) add("VOC above target", String(env.voc,0) + " vs " + String(config.vocAlert,0) + " threshold");

  if(state.workshop.dryer.running) add(String("Drying ") + state.workshop.dryer.material, String(state.workshop.dryer.remainingSec/60UL) + " min remaining");
  if(state.weather.severeAlert) add("Weather alert", strlen(state.weather.alertHeadline) ? state.weather.alertHeadline : state.weather.condition);
  if(state.calendar.online && state.calendar.hasNext && state.calendar.nextEpoch > 0) {
    time_t now = time(nullptr);
    if(state.calendar.nextEpoch > now && state.calendar.nextEpoch - now <= 7200) add(String("Upcoming • ") + state.calendar.nextTitle, state.calendar.nextWhen);
  }

  if(rank == 1) {
    b = "ALL GOOD\n\nNo immediate actions are recommended.\n\n";
    if(!config.bambuEnabled && !config.weatherEnabled && !config.filamentEnabled && !config.homeAssistantEnabled && !config.calendarEnabled)
      b += "Next best step: connect an integration from the web dashboard.";
    else
      b += "The hub is watching printer, workshop, weather, inventory and system context for the next useful action.";
  }
  lv_label_set_text(insightsBody, b.c_str());
}

static void refreshAutomation() {
  if(!automationBody) return;
  String b = "LOCAL RULES\n\n";
  auto &e = state.workshop.environment;

  b += String("Air quality guard     ");
  if(config.airMode != AirMode::Auto) b += "Standby (Air not Auto)";
  else if(!e.online) b += "Waiting for sensor";
  else if(e.pm25 > config.pm25Alert || e.voc > config.vocAlert) b += state.workshop.filterRequested ? "ACTIVE • filter requested" : "Threshold exceeded";
  else b += "Armed";
  b += "\n";

  b += String("Post-print filter    ");
  if(config.airMode != AirMode::PostPrint) b += "Standby";
  else if(state.workshop.filterRequested) b += "ACTIVE";
  else b += "Armed";
  b += "\n";

  b += String("Presence wake        ");
  if(!config.presenceEnabled) b += "Disabled";
  else if(!e.online) b += "Waiting for sensor";
  else b += e.presence ? "ACTIVE • occupied" : "Armed";
  b += "\n";

  b += String("Print context        ") + (state.printer.printing ? "ACTIVE • printer view prioritized" : "Armed") + "\n";
  b += String("Severe weather       ") + (!config.severeWeatherEnabled ? "Disabled" : state.weather.severeAlert ? "ACTIVE • alert surfaced" : "Armed") + "\n";
  b += String("OTA boot protection  ") + (state.system.stableBoot ? "Armed" : "ACTIVE • validating boot") + "\n\n";

  b += "DECISION\n";
  if(state.alertCount && state.alerts[0].severity == AlertSeverity::Urgent) b += String("Urgent: ") + state.alerts[0].title;
  else if(state.workshop.filterRequested) b += String("Filtering: ") + (strlen(state.workshop.filterReason) ? state.workshop.filterReason : "automation request");
  else if(state.printer.printing) b += String("Printing: ") + state.printer.progress + "% • " + formatMinutes(state.printer.remainingMinutes) + " left";
  else if(state.workshop.dryer.running) b += String("Drying ") + state.workshop.dryer.material + " • " + (state.workshop.dryer.remainingSec/60UL) + " min left";
  else b += "No intervention needed";

  lv_label_set_text(automationBody, b.c_str());
}

static void refreshActivity() {
  if(!activityBody) return;
  String b;
  if(!state.activityCount) b = "No recent activity.\n\nEvents from updates, printing, workshop automation and alerts will appear here.";
  else {
    for(uint8_t i=0;i<state.activityCount && i<8;i++) {
      auto &a=state.activity[i]; if(!a.valid) continue;
      b += String(a.source)+"  •  "+a.title+"\n";
      if(strlen(a.detail)) b += String(a.detail)+"\n";
      b += "\n";
    }
  }
  lv_label_set_text(activityBody,b.c_str());
}

static void refreshDevices() {
  if(!devicesBody) return;
  String b="ONBOARD\n";
  b += String("Display + touch     ")+"Ready\n";
  b += String("Audio / ES8311     ")+(state.system.audioReady?"Ready":"Unavailable")+"\n";
  b += String("Wi-Fi              ")+(WiFi.status()==WL_CONNECTED?"Connected":"Offline")+"\n\nINTEGRATIONS\n";
  b += String("Weather            ")+(config.weatherEnabled?(state.weather.online?"Online":state.weather.configured?"Unavailable":"Needs setup"):"Disabled")+"\n";
  b += String("Bambu printer      ")+(config.bambuEnabled?(state.printer.online?"Online":"Offline"):"Disabled")+"\n";
  b += String("Filament inventory ")+(config.filamentEnabled?(state.filament.online?"Online":"Offline"):"Disabled")+"\n";
  b += String("Home Assistant     ")+(config.homeAssistantEnabled?(state.homeAssistant.online?"Online":"Offline"):"Disabled")+"\n";
  b += String("Calendar           ")+(config.calendarEnabled?(state.calendar.online?"Online":"Offline"):"Disabled")+"\n\nWORKSHOP\n";
  auto &e=state.workshop.environment;
  b += String("Environment sensor ")+(e.online?(e.stale?"Stale":"Live"):"Not connected")+"\n";
  b += String("Presence           ")+(config.presenceEnabled?(e.online?(e.presence?"Detected":"Clear"):"Not connected"):"Disabled")+"\n";
  b += String("Dryer              ")+(config.dryerEnabled?(state.workshop.dryer.running?"Running":"Ready"):"Disabled");
  lv_label_set_text(devicesBody,b.c_str());
}

static void refreshModes() {
  if(!modesBody) return;
  String b = "CURRENT PROFILE\n";
  if(config.ambientMode == AmbientDisplayMode::Printer) b += "Print focus";
  else if(config.ambientMode == AmbientDisplayMode::Workshop) b += "Workshop focus";
  else if(config.ambientMode == AmbientDisplayMode::Minimal && !config.audioEnabled) b += "Quiet";
  else b += "Home / adaptive";
  b += "\n\nAmbient  "; b += ambientModeName(config.ambientMode);
  b += "\nAir      "; b += airModeName(config.airMode);
  b += "\nAudio    "; b += config.audioEnabled ? "On" : "Muted";
  b += "\n\nProfiles change only local display/audio/filter policy. They do not start or stop a print.";
  lv_label_set_text(modesBody, b.c_str());
}

static void refreshReadiness() {
  if(!readinessBody) return;
  int configured=0, total=7;
  if(WiFi.status()==WL_CONNECTED) configured++;
  if(config.weatherEnabled && state.weather.configured) configured++;
  if(config.bambuEnabled && strlen(config.bambuHost)) configured++;
  if(config.filamentEnabled) configured++;
  if(config.calendarEnabled) configured++;
  if(config.homeAssistantEnabled) configured++;
  if(config.workshopEnabled) configured++;
  int score=(configured*100)/total;

  String b="SETUP READINESS  "+String(score)+"%\n\n";
  b += String(WiFi.status()==WL_CONNECTED?"✓":"○")+" Network           "+(WiFi.status()==WL_CONNECTED?"Connected":"Needs setup")+"\n";
  b += String(config.weatherEnabled&&state.weather.configured?"✓":"○")+" Weather           "+(config.weatherEnabled?(state.weather.configured?"Configured":"Needs location"):"Optional / off")+"\n";
  b += String(config.bambuEnabled&&strlen(config.bambuHost)?"✓":"○")+" Bambu printer     "+(config.bambuEnabled?(strlen(config.bambuHost)?"Configured":"Needs printer"):"Optional / off")+"\n";
  b += String(config.filamentEnabled?"✓":"○")+" Filament          "+(config.filamentEnabled?"Enabled":"Optional / off")+"\n";
  b += String(config.calendarEnabled?"✓":"○")+" Calendar          "+(config.calendarEnabled?"Enabled":"Optional / off")+"\n";
  b += String(config.homeAssistantEnabled?"✓":"○")+" Home Assistant    "+(config.homeAssistantEnabled?"Enabled":"Optional / off")+"\n";
  b += String(config.workshopEnabled?"✓":"○")+" Workshop          "+(config.workshopEnabled?"Enabled":"Disabled")+"\n\n";

  if(!state.system.stableBoot) b += "NEXT  Allow boot validation to complete.";
  else if(WiFi.status()!=WL_CONNECTED) b += "NEXT  Connect Wi-Fi from the setup portal.";
  else if(config.weatherEnabled&&!state.weather.configured) b += "NEXT  Set ZIP or City, State in Weather settings.";
  else if(config.bambuEnabled&&!strlen(config.bambuHost)) b += "NEXT  Scan for your Bambu printer or enter its IP.";
  else if(state.system.updateAvailable) b += String("NEXT  Firmware ")+state.system.updateVersion+" is available.";
  else b += "NEXT  Core setup is healthy. Add optional integrations when useful.";
  lv_label_set_text(readinessBody,b.c_str());
}

static void refreshSystem() {
  if(!systemBody)return;
  const esp_partition_t *running=esp_ota_get_running_partition();
  char b[760];
  snprintf(b,sizeof(b),"FIRMWARE  %s • %s\nBoot %lu • stable %s • recovery %s\nLast reset  %s\n\nNETWORK\n%s • %s • %d dBm\nWeb %s\n\nUPDATE CENTER\nOTA %s • slot %s\nUpdater %s\nLatest %s%s\n\nDEVICE HEALTH\nHeap %lu KB • PSRAM %lu KB\nAudio %s • watchdog active\nUptime %lu min",
    FW_VERSION,
    state.system.updateAvailable?"UPDATE READY":"CURRENT",
    (unsigned long)state.system.bootCount,
    state.system.stableBoot?"yes":"validating",
    state.system.recoveryMode?"YES":"no",
    state.system.resetReason,
    WiFi.status()==WL_CONNECTED?state.system.ssid:state.system.setupApActive?SETUP_AP_NAME:"offline",
    state.system.ip,state.system.rssi,
    state.system.webReady?"ready":"starting",
    state.system.otaInProgress?"installing":state.system.otaReadyToReboot?"ready to reboot":"idle",
    running?running->label:"unknown",
    strlen(state.system.updateStatus)?state.system.updateStatus:"Not checked",
    strlen(state.system.updateVersion)?state.system.updateVersion:"—",
    strlen(state.system.updateError)?" • ERROR":"",
    (unsigned long)(state.system.freeHeap/1024),(unsigned long)(state.system.freePsram/1024),
    state.system.audioReady?"ready":"unavailable",
    (unsigned long)(state.system.uptimeSec/60));
  lv_label_set_text(systemBody,b);
}

static void refreshAmbient() {
  if(!ambientClock)return; struct tm info; char t[16]="--:--",d[40]=""; if(getLocalTime(&info,5)){strftime(t,sizeof(t),"%l:%M %p",&info); if(t[0]==' ')memmove(t,t+1,strlen(t));strftime(d,sizeof(d),"%A, %B %e",&info);} lv_label_set_text(ambientClock,t);lv_label_set_text(ambientDate,d);
  String s; AmbientDisplayMode mode=config.ambientMode;
  if(mode==AmbientDisplayMode::Auto){ if(state.alertCount&&state.alerts[0].severity!=AlertSeverity::Info)s=String(state.alerts[0].title)+"\n"+state.alerts[0].detail; else if(state.printer.printing)mode=AmbientDisplayMode::Printer; else if(state.workshop.environment.online)mode=AmbientDisplayMode::Workshop; else mode=AmbientDisplayMode::Clock; }
  if(mode==AmbientDisplayMode::Minimal) s="";
  else if(mode==AmbientDisplayMode::Printer) s=state.printer.online ? String(state.printer.displayName)+" • "+state.printer.progress+"%\n"+formatMinutes(state.printer.remainingMinutes)+" remaining" : "Printer offline";
  else if(mode==AmbientDisplayMode::Workshop){ auto &e=state.workshop.environment; s=String("Workshop • ")+(state.workshop.filterRequested?"Filter on":"Air idle")+"\n"+(e.online?String(e.temperatureC,0)+"°C • "+String(e.humidity,0)+"% RH • PM2.5 "+String(e.pm25,0):"Sensors not connected"); }
  else if(!s.length()) s=state.weather.online?String((int)round(state.weather.temperatureC*9/5+32))+"°F • "+state.weather.condition+"\nTouch to wake":"Touch to wake";
  lv_label_set_text(ambientSummary,s.c_str());
}

static void refreshUi() {
  refreshStatusBars(); refreshHome(); refreshToday(); refreshControls(); refreshAttention(); refreshSettings(); refreshWifi(); refreshTimers(); refreshPrinter(); refreshFilament(); refreshWorkshop(); refreshInsights(); refreshAutomation(); refreshActivity(); refreshDevices(); refreshReadiness(); refreshSystem(); refreshAmbient();
}

static void applyTimeConfiguration() {
  if(WiFi.status()!=WL_CONNECTED)return;
  if(timeConfigured && !strcmp(appliedTimezone,config.timezonePosix))return;
  configTzTime(config.timezonePosix,"pool.ntp.org","time.nist.gov"); strlcpy(appliedTimezone,config.timezonePosix,sizeof(appliedTimezone)); timeConfigured=true;
}

static void enterAmbient() {
  if(ambientMode||state.system.recoveryMode)return; ambientMode=true; applyBacklight(config.ambientBrightness); refreshAmbient(); lv_scr_load_anim(screenAmbient,LV_SCR_LOAD_ANIM_FADE_ON,250,0,false);
}

static void wakeFromAmbient() { ambientMode=false;applyBacklight(config.brightness);loadScreen(ScreenId::Home); }

void setup() {
  Serial.begin(115200); delay(120); Serial.printf("Waveshare Home %s starting\n",FW_VERSION);
  configStore.begin(); configStore.load(config); bootGuard.begin(state); applyThemeTokens();
  Wire.begin(PIN_I2C_SDA,PIN_I2C_SCL); if(!ioExpander.begin())Serial.println("TCA9554 init warning"); ioExpander.pinMode1(1,OUTPUT); lcdReset();
  if(!touch.begin(Wire,FT6X36_SLAVE_ADDRESS))Serial.println("FT6336 touch warning");
  if(!gfx->begin()){Serial.println("ST7796 init failed");while(true)delay(1000);} gfx->fillScreen(RGB565_BLACK);
  ledcAttach(PIN_LCD_BL,5000,8);applyBacklight(config.brightness);

  lv_init(); const uint32_t pixels=SCREEN_W*80UL; drawBuf1=static_cast<lv_color_t*>(heap_caps_malloc(pixels*sizeof(lv_color_t),MALLOC_CAP_SPIRAM|MALLOC_CAP_8BIT)); drawBuf2=static_cast<lv_color_t*>(heap_caps_malloc(pixels*sizeof(lv_color_t),MALLOC_CAP_SPIRAM|MALLOC_CAP_8BIT));
  if(!drawBuf1||!drawBuf2){if(drawBuf1)heap_caps_free(drawBuf1);if(drawBuf2)heap_caps_free(drawBuf2);drawBuf1=static_cast<lv_color_t*>(heap_caps_malloc(SCREEN_W*40UL*sizeof(lv_color_t),MALLOC_CAP_8BIT));drawBuf2=nullptr;if(!drawBuf1){Serial.println("LVGL allocation failed");while(true)delay(1000);}lv_disp_draw_buf_init(&drawBuf,drawBuf1,nullptr,SCREEN_W*40UL);}else lv_disp_draw_buf_init(&drawBuf,drawBuf1,drawBuf2,pixels);
  lv_disp_drv_init(&displayDriver);displayDriver.hor_res=SCREEN_W;displayDriver.ver_res=SCREEN_H;displayDriver.flush_cb=displayFlush;displayDriver.draw_buf=&drawBuf;lv_disp_drv_register(&displayDriver);
  lv_indev_drv_init(&inputDriver);inputDriver.type=LV_INDEV_TYPE_POINTER;inputDriver.read_cb=touchRead;lv_indev_drv_register(&inputDriver);
  createUi();lastInteractionMs=millis();for(int i=0;i<8;i++){lv_timer_handler();delay(12);}

  connectivity.begin(config,state); webDashboard.begin(config,state); audio.begin(config,state);
  serviceManager.add(&weatherPlugin);serviceManager.add(&bambuPlugin);serviceManager.add(&filamentPlugin);serviceManager.add(&homeAssistantPlugin);serviceManager.add(&calendarPlugin);serviceManager.add(&timerPlugin);
  workshopService.begin(config,state);
  if(!state.system.recoveryMode)serviceManager.begin(config,state);
  attentionEngine.update(config,state);refreshUi();Serial.println("Waveshare Home platform ready");
}

void loop() {
  lv_timer_handler();bootGuard.loop(state);connectivity.loop(config,state);webDashboard.loop(config,state);bambuPlugin.serviceDiscovery();applyTimeConfiguration();
  if(!state.system.recoveryMode)serviceManager.loop(config,state);
  workshopService.loop(config,state); activityEngine.loop(state);
  if(config.presenceEnabled && state.workshop.environment.presence){lastInteractionMs=millis(); if(ambientMode)wakeFromAmbient();}
  if(webDashboard.configChanged()){webDashboard.clearConfigChanged();applyBacklight(config.brightness);audio.setVolume(config.audioVolume);timeConfigured=false;if(!state.system.recoveryMode)serviceManager.configChanged(config,state);workshopService.begin(config,state);lastUiRefreshMs=0;}
  if(millis()-lastAttentionMs>=ATTENTION_REFRESH_MS){lastAttentionMs=millis();attentionEngine.update(config,state);}
  if(millis()-lastUiRefreshMs>=UI_REFRESH_MS){lastUiRefreshMs=millis();refreshUi();}
  if(!ambientMode&&!state.system.recoveryMode&&millis()-lastInteractionMs>=config.ambientTimeoutSec*1000UL)enterAmbient();
  delay(5);
}
