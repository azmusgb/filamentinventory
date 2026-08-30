#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <time.h>
#include <Preferences.h>
#include <WiFiManager.h>
#include <lvgl.h>
#include <Arduino_GFX_Library.h>
#include "TCA9554.h"
#include "TouchDrvFT6X36.hpp"

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
static constexpr uint8_t ES8311_ADDR = 0x18;
static constexpr uint8_t DEFAULT_BRIGHTNESS = 82;
static constexpr uint32_t AMBIENT_AFTER_MS = 120000UL;
static constexpr uint32_t WIFI_CONNECT_GRACE_MS = 8000UL;
static constexpr uint32_t BRIGHTNESS_SAVE_DELAY_MS = 900UL;
static constexpr char FW_VERSION[] = "0.3.0";
static constexpr char DEVICE_NAME[] = "Waveshare Home";
static constexpr char SETUP_AP[] = "WaveshareHome-Setup";

TCA9554 ioExpander(0x20);
TouchDrvFT6X36 touch;
Preferences prefs;
WiFiManager wifiManager;
Arduino_DataBus *bus = new Arduino_ESP32SPI(PIN_LCD_DC, PIN_LCD_CS, PIN_SPI_SCLK, PIN_SPI_MOSI, PIN_SPI_MISO);
Arduino_GFX *gfx = new Arduino_ST7796(bus, PIN_LCD_RST, 0, true, SCREEN_W, SCREEN_H);

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
static lv_obj_t *screenSystem = nullptr;
static lv_obj_t *screenAmbient = nullptr;

static lv_obj_t *homeClock = nullptr;
static lv_obj_t *homeDate = nullptr;
static lv_obj_t *homeGreeting = nullptr;
static lv_obj_t *homeStatus = nullptr;
static lv_obj_t *homeNet = nullptr;
static lv_obj_t *ambientClock = nullptr;
static lv_obj_t *ambientDate = nullptr;
static lv_obj_t *ambientNet = nullptr;
static lv_obj_t *systemBody = nullptr;
static lv_obj_t *brightnessValue = nullptr;
static lv_obj_t *controlsBody = nullptr;
static lv_obj_t *controlsTabs[3] = {nullptr, nullptr, nullptr};
static lv_obj_t *topStatusLabels[8] = {nullptr};
static uint8_t topStatusCount = 0;

static const lv_color_t C_BG = lv_color_hex(0x020609);
static const lv_color_t C_SURFACE = lv_color_hex(0x071015);
static const lv_color_t C_SURFACE_2 = lv_color_hex(0x0B171E);
static const lv_color_t C_SURFACE_3 = lv_color_hex(0x10212A);
static const lv_color_t C_BORDER = lv_color_hex(0x18303A);
static const lv_color_t C_TEXT = lv_color_hex(0xF6FAFC);
static const lv_color_t C_MUTED = lv_color_hex(0x91A1AA);
static const lv_color_t C_DIM = lv_color_hex(0x60717A);
static const lv_color_t C_GREEN = lv_color_hex(0x4ADE80);
static const lv_color_t C_BLUE = lv_color_hex(0x60A5FA);
static const lv_color_t C_PURPLE = lv_color_hex(0xA78BFA);
static const lv_color_t C_ORANGE = lv_color_hex(0xFDBA74);
static const lv_color_t C_RED = lv_color_hex(0xFB7185);

static uint32_t lastInteractionMs = 0;
static uint32_t lastClockRefreshMs = 0;
static uint32_t lastSystemRefreshMs = 0;
static uint32_t wifiStartMs = 0;
static uint32_t brightnessChangedMs = 0;
static uint8_t brightnessPct = DEFAULT_BRIGHTNESS;
static uint8_t controlsTab = 0;
static bool ambientMode = false;
static bool audioCodecDetected = false;
static bool portalRunning = false;
static bool timeConfigured = false;
static bool brightnessDirty = false;
static wl_status_t previousWifiStatus = WL_NO_SHIELD;

static void applyBacklight(uint8_t percent) {
  brightnessPct = constrain(percent, 5, 100);
  const uint32_t duty = map(brightnessPct, 0, 100, 0, 255);
  ledcWrite(PIN_LCD_BL, duty);
}

static void markBrightnessForSave(uint8_t percent) {
  applyBacklight(percent);
  brightnessChangedMs = millis();
  brightnessDirty = true;
}

static void serviceBrightnessPersistence() {
  if (!brightnessDirty) return;
  if (millis() - brightnessChangedMs < BRIGHTNESS_SAVE_DELAY_MS) return;
  prefs.putUChar("brightness", brightnessPct);
  brightnessDirty = false;
}

static void lcdReset() {
  ioExpander.write1(1, 1); delay(10);
  ioExpander.write1(1, 0); delay(10);
  ioExpander.write1(1, 1); delay(200);
}

static bool i2cPresent(uint8_t address) {
  Wire.beginTransmission(address);
  return Wire.endTransmission() == 0;
}

static void displayFlush(lv_disp_drv_t *drv, const lv_area_t *area, lv_color_t *colorP) {
  const uint32_t w = static_cast<uint32_t>(area->x2 - area->x1 + 1);
  const uint32_t h = static_cast<uint32_t>(area->y2 - area->y1 + 1);
#if (LV_COLOR_16_SWAP != 0)
  gfx->draw16bitBeRGBBitmap(area->x1, area->y1, reinterpret_cast<uint16_t *>(&colorP->full), w, h);
#else
  gfx->draw16bitRGBBitmap(area->x1, area->y1, reinterpret_cast<uint16_t *>(&colorP->full), w, h);
#endif
  lv_disp_flush_ready(drv);
}

static void wakeFromAmbient();

static void touchRead(lv_indev_drv_t *, lv_indev_data_t *data) {
  int16_t x[1] = {0};
  int16_t y[1] = {0};
  const uint8_t count = touch.getPoint(x, y, 1);
  if (count > 0) {
    data->state = LV_INDEV_STATE_PR;
    data->point.x = constrain(x[0], 0, SCREEN_W - 1);
    data->point.y = constrain(y[0], 0, SCREEN_H - 1);
    lastInteractionMs = millis();
    if (ambientMode) wakeFromAmbient();
  } else {
    data->state = LV_INDEV_STATE_REL;
  }
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
  if (w != LV_SIZE_CONTENT) {
    lv_obj_set_width(obj, w);
    lv_label_set_long_mode(obj, LV_LABEL_LONG_DOT);
  }
  return obj;
}

static lv_obj_t *wrapLabel(lv_obj_t *parent, const char *text, const lv_font_t *font, lv_color_t color,
                           int x, int y, int w) {
  lv_obj_t *obj = label(parent, text, font, color, x, y, w);
  lv_label_set_long_mode(obj, LV_LABEL_LONG_WRAP);
  return obj;
}

static lv_obj_t *panel(lv_obj_t *parent, int x, int y, int w, int h, lv_color_t bg = C_SURFACE) {
  lv_obj_t *obj = lv_obj_create(parent);
  lv_obj_set_pos(obj, x, y);
  lv_obj_set_size(obj, w, h);
  lv_obj_set_style_radius(obj, 16, 0);
  lv_obj_set_style_bg_color(obj, bg, 0);
  lv_obj_set_style_bg_opa(obj, LV_OPA_COVER, 0);
  lv_obj_set_style_border_width(obj, 1, 0);
  lv_obj_set_style_border_color(obj, C_BORDER, 0);
  lv_obj_set_style_pad_all(obj, 0, 0);
  lv_obj_clear_flag(obj, LV_OBJ_FLAG_SCROLLABLE);
  return obj;
}

static lv_obj_t *button(lv_obj_t *parent, const char *text, int x, int y, int w, int h,
                        lv_event_cb_t cb, void *userData = nullptr, lv_color_t accent = C_GREEN) {
  lv_obj_t *btn = lv_btn_create(parent);
  lv_obj_set_pos(btn, x, y);
  lv_obj_set_size(btn, w, h);
  lv_obj_set_style_radius(btn, 13, 0);
  lv_obj_set_style_bg_color(btn, C_SURFACE_2, 0);
  lv_obj_set_style_bg_color(btn, accent, LV_STATE_PRESSED);
  lv_obj_set_style_border_width(btn, 1, 0);
  lv_obj_set_style_border_color(btn, C_BORDER, 0);
  lv_obj_set_style_shadow_width(btn, 0, 0);
  if (cb) lv_obj_add_event_cb(btn, cb, LV_EVENT_CLICKED, userData);
  lv_obj_t *txt = lv_label_create(btn);
  lv_label_set_text(txt, text);
  lv_obj_set_style_text_font(txt, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(txt, C_TEXT, 0);
  lv_obj_center(txt);
  return btn;
}

static const char *networkStateText() {
  if (WiFi.status() == WL_CONNECTED) return "ONLINE";
  if (portalRunning) return "SETUP";
  return "OFFLINE";
}

static lv_color_t networkStateColor() {
  if (WiFi.status() == WL_CONNECTED) return C_GREEN;
  if (portalRunning) return C_ORANGE;
  return C_DIM;
}

static void refreshNetworkLabels() {
  const char *state = networkStateText();
  const lv_color_t color = networkStateColor();
  if (homeNet) {
    lv_label_set_text(homeNet, state);
    lv_obj_set_style_text_color(homeNet, color, 0);
  }
  if (ambientNet) {
    lv_label_set_text(ambientNet, state);
    lv_obj_set_style_text_color(ambientNet, color, 0);
  }
  for (uint8_t i = 0; i < topStatusCount; ++i) {
    if (!topStatusLabels[i]) continue;
    lv_label_set_text(topStatusLabels[i], state);
    lv_obj_set_style_text_color(topStatusLabels[i], color, 0);
  }
}

static void load(lv_obj_t *screen) {
  lastInteractionMs = millis();
  if (screen) lv_scr_load_anim(screen, LV_SCR_LOAD_ANIM_FADE_ON, 120, 0, false);
}

static void navEvent(lv_event_t *e) {
  const intptr_t target = reinterpret_cast<intptr_t>(lv_event_get_user_data(e));
  switch (target) {
    case 0: load(screenHome); break;
    case 1: load(screenToday); break;
    case 2: load(screenControls); break;
    case 3: load(screenApps); break;
    case 4: load(screenAttention); break;
    case 5: load(screenQuick); break;
    case 6: load(screenSystem); break;
    default: load(screenHome); break;
  }
}

static void addTopBar(lv_obj_t *screen, const char *title) {
  label(screen, title, &lv_font_montserrat_20, C_TEXT, 14, 18);
  lv_obj_t *status = label(screen, networkStateText(), &lv_font_montserrat_12,
                           networkStateColor(), 244, 22, 64);
  lv_obj_set_style_text_align(status, LV_TEXT_ALIGN_RIGHT, 0);
  if (topStatusCount < 8) topStatusLabels[topStatusCount++] = status;
}

static void addBottomNav(lv_obj_t *screen, int active) {
  lv_obj_t *bar = panel(screen, 8, 425, 304, 47, lv_color_hex(0x050B0F));
  const char *names[3] = {"Home", "Today", "Controls"};
  for (int i = 0; i < 3; ++i) {
    lv_obj_t *btn = button(bar, names[i], 4 + i * 99, 5, 95, 37, navEvent,
                           reinterpret_cast<void *>(static_cast<intptr_t>(i)));
    if (i == active) {
      lv_obj_set_style_bg_color(btn, lv_color_hex(0x102A1B), 0);
      lv_obj_set_style_border_color(btn, lv_color_hex(0x1E5132), 0);
      lv_obj_t *txt = lv_obj_get_child(btn, 0);
      if (txt) lv_obj_set_style_text_color(txt, C_GREEN, 0);
    }
  }
}

static void createHome() {
  screenHome = lv_obj_create(nullptr); styleScreen(screenHome);
  homeClock = label(screenHome, "--:--", &lv_font_montserrat_18, C_TEXT, 14, 13);
  homeNet = label(screenHome, "STARTING", &lv_font_montserrat_12, C_ORANGE, 238, 17, 68);
  lv_obj_set_style_text_align(homeNet, LV_TEXT_ALIGN_RIGHT, 0);
  homeDate = label(screenHome, "Starting...", &lv_font_montserrat_13, C_MUTED, 14, 42);
  homeGreeting = label(screenHome, "Hello", &lv_font_montserrat_20, C_TEXT, 14, 68);
  homeStatus = label(screenHome, "Home Hub is starting", &lv_font_montserrat_12, C_MUTED, 14, 96, 292);

  lv_obj_t *hero = panel(screenHome, 12, 120, 296, 128, C_SURFACE_2);
  label(hero, "NOW", &lv_font_montserrat_12, C_GREEN, 14, 11);
  label(hero, "Waveshare Home", &lv_font_montserrat_18, C_TEXT, 14, 35);
  label(hero, "Ready", &lv_font_montserrat_36, C_TEXT, 14, 59);
  label(hero, "Tap to open Apps", &lv_font_montserrat_12, C_MUTED, 14, 105);
  lv_obj_add_flag(hero, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_add_event_cb(hero, navEvent, LV_EVENT_CLICKED, reinterpret_cast<void *>(3));

  label(screenHome, "AT A GLANCE", &lv_font_montserrat_12, C_DIM, 14, 263);
  const char *titles[] = {"Home", "Today", "System"};
  const char *subs[] = {"Controls", "Agenda", "Health"};
  const char *states[] = {"Ready", "Open", "Good"};
  const lv_color_t colors[] = {C_GREEN, C_BLUE, C_GREEN};
  const intptr_t targets[] = {2, 1, 6};
  for (int i = 0; i < 3; ++i) {
    lv_obj_t *card = panel(screenHome, 12 + i * 102, 282, 92, 112);
    label(card, titles[i], &lv_font_montserrat_16, C_TEXT, 10, 13);
    label(card, subs[i], &lv_font_montserrat_12, C_MUTED, 10, 42);
    label(card, states[i], &lv_font_montserrat_14, colors[i], 10, 72);
    lv_obj_add_flag(card, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(card, navEvent, LV_EVENT_CLICKED, reinterpret_cast<void *>(targets[i]));
  }
  addBottomNav(screenHome, 0);
}

static void createToday() {
  screenToday = lv_obj_create(nullptr); styleScreen(screenToday); addTopBar(screenToday, "TODAY");
  lv_obj_t *weather = panel(screenToday, 12, 62, 296, 106, C_SURFACE_2);
  label(weather, "WEATHER", &lv_font_montserrat_12, C_BLUE, 14, 12);
  label(weather, "Not configured", &lv_font_montserrat_20, C_TEXT, 14, 38);
  wrapLabel(weather, "Add a location when weather integration is enabled.", &lv_font_montserrat_12, C_MUTED, 14, 69, 266);

  lv_obj_t *agenda = panel(screenToday, 12, 180, 296, 164);
  label(agenda, "AGENDA", &lv_font_montserrat_12, C_PURPLE, 14, 12);
  label(agenda, "No calendar connected", &lv_font_montserrat_18, C_TEXT, 14, 40);
  wrapLabel(agenda, "Calendar events will appear here without changing the Home layout.", &lv_font_montserrat_12, C_MUTED, 14, 72, 266);
  label(agenda, "Clock", &lv_font_montserrat_12, C_DIM, 14, 126);
  label(agenda, "Synced over Wi-Fi", &lv_font_montserrat_13, C_GREEN, 86, 123);

  lv_obj_t *footer = panel(screenToday, 12, 356, 296, 56);
  label(footer, "Today is ready for live services", &lv_font_montserrat_13, C_TEXT, 14, 11);
  label(footer, "Weather  •  calendar  •  timers", &lv_font_montserrat_12, C_MUTED, 14, 32);
  addBottomNav(screenToday, 1);
}

static void renderControlsBody() {
  if (!controlsBody) return;
  lv_obj_clean(controlsBody);
  const char *tabNames[] = {"Rooms", "Scenes", "Devices"};
  for (int i = 0; i < 3; ++i) {
    if (!controlsTabs[i]) continue;
    lv_obj_t *txt = lv_obj_get_child(controlsTabs[i], 0);
    lv_obj_set_style_bg_color(controlsTabs[i], i == controlsTab ? lv_color_hex(0x102A1B) : C_SURFACE_2, 0);
    lv_obj_set_style_border_color(controlsTabs[i], i == controlsTab ? lv_color_hex(0x1E5132) : C_BORDER, 0);
    if (txt) lv_obj_set_style_text_color(txt, i == controlsTab ? C_GREEN : C_MUTED, 0);
  }

  if (controlsTab == 0) {
    const char *names[] = {"Living Room", "Kitchen", "Workshop", "Bedroom"};
    for (int i = 0; i < 4; ++i) {
      lv_obj_t *row = panel(controlsBody, 0, i * 68, 296, 58, C_SURFACE_2);
      label(row, names[i], &lv_font_montserrat_14, C_TEXT, 16, 10);
      label(row, "Ready for smart-home integration", &lv_font_montserrat_11, C_MUTED, 16, 34, 260);
    }
  } else if (controlsTab == 1) {
    label(controlsBody, "Scenes", &lv_font_montserrat_20, C_TEXT, 12, 18);
    wrapLabel(controlsBody, "No scenes configured yet. Future scenes can combine lights, switches and maker-space actions.", &lv_font_montserrat_13, C_MUTED, 12, 56, 270);
    label(controlsBody, "Examples", &lv_font_montserrat_12, C_DIM, 12, 132);
    label(controlsBody, "Good night  •  Movie  •  Workshop", &lv_font_montserrat_13, C_BLUE, 12, 158, 270);
  } else {
    label(controlsBody, "Devices", &lv_font_montserrat_20, C_TEXT, 12, 18);
    wrapLabel(controlsBody, "No smart-home provider is connected. Device discovery will live here once an integration is configured.", &lv_font_montserrat_13, C_MUTED, 12, 56, 270);
    label(controlsBody, "Local UI remains available offline", &lv_font_montserrat_12, C_GREEN, 12, 142, 270);
  }
}

static void controlsTabEvent(lv_event_t *e) {
  controlsTab = static_cast<uint8_t>(reinterpret_cast<intptr_t>(lv_event_get_user_data(e)));
  renderControlsBody();
}

static void createControls() {
  screenControls = lv_obj_create(nullptr); styleScreen(screenControls); addTopBar(screenControls, "CONTROLS");
  const char *tabs[] = {"Rooms", "Scenes", "Devices"};
  for (int i = 0; i < 3; ++i) {
    controlsTabs[i] = button(screenControls, tabs[i], 12 + i * 100, 62, 96, 42,
                             controlsTabEvent, reinterpret_cast<void *>(static_cast<intptr_t>(i)), C_GREEN);
  }
  controlsBody = lv_obj_create(screenControls);
  lv_obj_set_pos(controlsBody, 12, 116);
  lv_obj_set_size(controlsBody, 296, 296);
  lv_obj_set_style_bg_opa(controlsBody, LV_OPA_TRANSP, 0);
  lv_obj_set_style_border_width(controlsBody, 0, 0);
  lv_obj_set_style_pad_all(controlsBody, 0, 0);
  lv_obj_clear_flag(controlsBody, LV_OBJ_FLAG_SCROLLABLE);
  renderControlsBody();
  addBottomNav(screenControls, 2);
}

static void createApps() {
  screenApps = lv_obj_create(nullptr); styleScreen(screenApps); addTopBar(screenApps, "APPS");
  const char *apps[] = {"Home", "Today", "Controls", "Attention", "Quick", "System", "Printer", "Filament", "Weather"};
  const intptr_t targets[] = {0, 1, 2, 4, 5, 6, 4, 4, 1};
  const lv_color_t colors[] = {C_GREEN, C_BLUE, C_GREEN, C_RED, C_ORANGE, C_PURPLE, C_GREEN, C_BLUE, C_BLUE};
  for (int i = 0; i < 9; ++i) {
    const int col = i % 3;
    const int row = i / 3;
    lv_obj_t *btn = button(screenApps, apps[i], 12 + col * 102, 72 + row * 94, 92, 80,
                           navEvent, reinterpret_cast<void *>(targets[i]), colors[i]);
    lv_obj_set_style_border_color(btn, colors[i], 0);
  }
  label(screenApps, "Printer, Filament and Weather are integration-ready placeholders.", &lv_font_montserrat_11, C_MUTED, 12, 366, 296);
  button(screenApps, "Back Home", 12, 390, 296, 32, navEvent, reinterpret_cast<void *>(0));
}

static void createAttention() {
  screenAttention = lv_obj_create(nullptr); styleScreen(screenAttention); addTopBar(screenAttention, "ATTENTION");
  lv_obj_t *ok = panel(screenAttention, 12, 72, 296, 116, C_SURFACE_2);
  label(ok, "ALL CLEAR", &lv_font_montserrat_12, C_GREEN, 16, 14);
  label(ok, "No active alerts", &lv_font_montserrat_20, C_TEXT, 16, 42);
  wrapLabel(ok, "Important system and service events will be promoted here.", &lv_font_montserrat_12, C_MUTED, 16, 75, 260);

  lv_obj_t *model = panel(screenAttention, 12, 202, 296, 154);
  label(model, "PRIORITY", &lv_font_montserrat_12, C_DIM, 16, 14);
  label(model, "Normal", &lv_font_montserrat_14, C_GREEN, 16, 44);
  label(model, "Information", &lv_font_montserrat_14, C_BLUE, 16, 69);
  label(model, "Attention", &lv_font_montserrat_14, C_ORANGE, 16, 94);
  label(model, "Urgent", &lv_font_montserrat_14, C_RED, 16, 119);
  button(screenAttention, "Back Home", 12, 372, 296, 42, navEvent, reinterpret_cast<void *>(0));
}

static void brightnessEvent(lv_event_t *e) {
  lv_obj_t *slider = lv_event_get_target(e);
  const uint8_t value = static_cast<uint8_t>(lv_slider_get_value(slider));
  markBrightnessForSave(value);
  if (brightnessValue) {
    char buf[16]; snprintf(buf, sizeof(buf), "%u%%", value);
    lv_label_set_text(brightnessValue, buf);
  }
}

static void resetWifiEvent(lv_event_t *) {
  wifiManager.resetSettings();
  WiFi.disconnect(true, true);
  portalRunning = false;
  timeConfigured = false;
  wifiStartMs = millis() - WIFI_CONNECT_GRACE_MS;
  refreshNetworkLabels();
}

static void createQuick() {
  screenQuick = lv_obj_create(nullptr); styleScreen(screenQuick); addTopBar(screenQuick, "QUICK");
  lv_obj_t *network = panel(screenQuick, 12, 68, 296, 92, C_SURFACE_2);
  label(network, "NETWORK", &lv_font_montserrat_12, C_BLUE, 16, 12);
  label(network, "Waveshare Home", &lv_font_montserrat_16, C_TEXT, 16, 36);
  label(network, "Wi-Fi provisioning remains available when offline", &lv_font_montserrat_11, C_MUTED, 16, 64, 264);

  lv_obj_t *brightness = panel(screenQuick, 12, 174, 296, 112);
  label(brightness, "Brightness", &lv_font_montserrat_14, C_TEXT, 16, 14);
  char pct[16]; snprintf(pct, sizeof(pct), "%u%%", brightnessPct);
  brightnessValue = label(brightness, pct, &lv_font_montserrat_14, C_GREEN, 238, 14, 42);
  lv_obj_set_style_text_align(brightnessValue, LV_TEXT_ALIGN_RIGHT, 0);
  lv_obj_t *slider = lv_slider_create(brightness);
  lv_obj_set_pos(slider, 16, 64); lv_obj_set_size(slider, 264, 10);
  lv_slider_set_range(slider, 5, 100); lv_slider_set_value(slider, brightnessPct, LV_ANIM_OFF);
  lv_obj_set_style_bg_color(slider, lv_color_hex(0x1A2930), LV_PART_MAIN);
  lv_obj_set_style_bg_color(slider, C_GREEN, LV_PART_INDICATOR);
  lv_obj_set_style_bg_color(slider, C_GREEN, LV_PART_KNOB);
  lv_obj_add_event_cb(slider, brightnessEvent, LV_EVENT_VALUE_CHANGED, nullptr);

  button(screenQuick, "Apps", 12, 302, 142, 48, navEvent, reinterpret_cast<void *>(3), C_BLUE);
  button(screenQuick, "System", 166, 302, 142, 48, navEvent, reinterpret_cast<void *>(6), C_PURPLE);
  button(screenQuick, "Reset Wi-Fi", 12, 362, 142, 46, resetWifiEvent, nullptr, C_ORANGE);
  button(screenQuick, "Home", 166, 362, 142, 46, navEvent, reinterpret_cast<void *>(0), C_GREEN);
}

static void updateSystemText() {
  if (!systemBody) return;
  char ip[24] = "Not connected";
  if (WiFi.status() == WL_CONNECTED) snprintf(ip, sizeof(ip), "%s", WiFi.localIP().toString().c_str());
  char body[500];
  snprintf(body, sizeof(body),
           "Firmware       %s\n"
           "Network        %s\n"
           "IP             %s\n"
           "RSSI           %ld dBm\n"
           "Free heap      %u KB\n"
           "Free PSRAM     %u KB\n"
           "Audio codec    %s\n"
           "Brightness     %u%%\n"
           "Uptime         %lu min",
           FW_VERSION,
           networkStateText(),
           ip,
           WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0L,
           ESP.getFreeHeap() / 1024U,
           ESP.getFreePsram() / 1024U,
           audioCodecDetected ? "ES8311 detected" : "Not detected",
           brightnessPct,
           millis() / 60000UL);
  lv_label_set_text(systemBody, body);
}

static void createSystem() {
  screenSystem = lv_obj_create(nullptr); styleScreen(screenSystem); addTopBar(screenSystem, "SYSTEM");
  lv_obj_t *card = panel(screenSystem, 12, 68, 296, 286, C_SURFACE_2);
  label(card, "DEVICE DIAGNOSTICS", &lv_font_montserrat_12, C_GREEN, 16, 14);
  systemBody = label(card, "Loading...", &lv_font_montserrat_12, C_TEXT, 16, 46, 264);
  lv_obj_set_style_text_line_space(systemBody, 9, 0);
  button(screenSystem, "Quick", 12, 370, 142, 44, navEvent, reinterpret_cast<void *>(5), C_BLUE);
  button(screenSystem, "Home", 166, 370, 142, 44, navEvent, reinterpret_cast<void *>(0), C_GREEN);
  updateSystemText();
}

static void createAmbient() {
  screenAmbient = lv_obj_create(nullptr); styleScreen(screenAmbient);
  ambientNet = label(screenAmbient, networkStateText(), &lv_font_montserrat_12, networkStateColor(), 238, 20, 68);
  lv_obj_set_style_text_align(ambientNet, LV_TEXT_ALIGN_RIGHT, 0);
  ambientClock = label(screenAmbient, "--:--", &lv_font_montserrat_36, C_TEXT, 0, 145, 320);
  lv_obj_set_style_text_align(ambientClock, LV_TEXT_ALIGN_CENTER, 0);
  ambientDate = label(screenAmbient, "", &lv_font_montserrat_16, C_MUTED, 0, 197, 320);
  lv_obj_set_style_text_align(ambientDate, LV_TEXT_ALIGN_CENTER, 0);
  lv_obj_t *line = lv_obj_create(screenAmbient);
  lv_obj_set_pos(line, 124, 242); lv_obj_set_size(line, 72, 2);
  lv_obj_set_style_bg_color(line, C_GREEN, 0); lv_obj_set_style_border_width(line, 0, 0);
  lv_obj_t *hint = label(screenAmbient, "Waveshare Home\nTouch to wake", &lv_font_montserrat_14, C_MUTED, 0, 270, 320);
  lv_obj_set_style_text_align(hint, LV_TEXT_ALIGN_CENTER, 0);
}

static void wakeFromAmbient() {
  ambientMode = false;
  applyBacklight(brightnessPct);
  load(screenHome);
}

static void enterAmbient() {
  if (ambientMode) return;
  ambientMode = true;
  const uint8_t ambientBrightness = max<uint8_t>(10, brightnessPct / 4);
  ledcWrite(PIN_LCD_BL, map(ambientBrightness, 0, 100, 0, 255));
  lv_scr_load_anim(screenAmbient, LV_SCR_LOAD_ANIM_FADE_ON, 260, 0, false);
}

static void createUi() {
  createHome();
  createToday();
  createControls();
  createApps();
  createAttention();
  createQuick();
  createSystem();
  createAmbient();
  load(screenHome);
}

static void updateClockAndGreeting() {
  if (millis() - lastClockRefreshMs < 1000UL) return;
  lastClockRefreshMs = millis();

  struct tm info;
  char timeBuf[16] = "--:--";
  char dateBuf[40] = "Time not synced";
  char greetingBuf[32] = "Hello";
  if (getLocalTime(&info, 10)) {
    strftime(timeBuf, sizeof(timeBuf), "%l:%M %p", &info);
    while (timeBuf[0] == ' ') memmove(timeBuf, timeBuf + 1, strlen(timeBuf));
    strftime(dateBuf, sizeof(dateBuf), "%A, %B %e", &info);
    if (info.tm_hour < 12) snprintf(greetingBuf, sizeof(greetingBuf), "Good morning");
    else if (info.tm_hour < 17) snprintf(greetingBuf, sizeof(greetingBuf), "Good afternoon");
    else snprintf(greetingBuf, sizeof(greetingBuf), "Good evening");
  }

  if (homeClock) lv_label_set_text(homeClock, timeBuf);
  if (homeDate) lv_label_set_text(homeDate, dateBuf);
  if (homeGreeting) lv_label_set_text(homeGreeting, greetingBuf);
  if (ambientClock) lv_label_set_text(ambientClock, timeBuf);
  if (ambientDate) lv_label_set_text(ambientDate, dateBuf);

  if (homeStatus) {
    if (WiFi.status() == WL_CONNECTED) lv_label_set_text(homeStatus, "Connected • time sync active");
    else if (portalRunning) lv_label_set_text(homeStatus, "Wi-Fi setup available • local UI active");
    else lv_label_set_text(homeStatus, "Offline • local UI active");
  }
  refreshNetworkLabels();
}

static void startPortal() {
  if (portalRunning) return;
  wifiManager.setConfigPortalBlocking(false);
  wifiManager.setConfigPortalTimeout(0);
  wifiManager.setConnectTimeout(15);
  wifiManager.setHostname("waveshare-home");
  wifiManager.startConfigPortal(SETUP_AP);
  portalRunning = true;
  refreshNetworkLabels();
}

static void serviceWifi() {
  const wl_status_t status = WiFi.status();

  if (status == WL_CONNECTED) {
    if (portalRunning) {
      wifiManager.stopConfigPortal();
      portalRunning = false;
    }
    if (!timeConfigured) {
      configTzTime("EST5EDT,M3.2.0/2,M11.1.0/2", "pool.ntp.org", "time.nist.gov");
      timeConfigured = true;
    }
  } else {
    if (portalRunning) wifiManager.process();
    if (!portalRunning && millis() - wifiStartMs >= WIFI_CONNECT_GRACE_MS) startPortal();
  }

  if (status != previousWifiStatus) {
    previousWifiStatus = status;
    refreshNetworkLabels();
    updateSystemText();
  }
}

static void serviceIdleMode() {
  if (ambientMode) return;
  if (millis() - lastInteractionMs >= AMBIENT_AFTER_MS) enterAmbient();
}

void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.printf("%s %s starting...\n", DEVICE_NAME, FW_VERSION);

  prefs.begin("waveshare-home", false);
  brightnessPct = prefs.getUChar("brightness", DEFAULT_BRIGHTNESS);

  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  if (!ioExpander.begin()) Serial.println("Warning: TCA9554 init failed");
  ioExpander.pinMode1(1, OUTPUT);
  lcdReset();

  if (!touch.begin(Wire, FT6X36_SLAVE_ADDRESS)) Serial.println("Warning: touch controller not detected");
  audioCodecDetected = i2cPresent(ES8311_ADDR);

  if (!gfx->begin()) {
    Serial.println("Fatal: ST7796 display init failed");
    while (true) delay(1000);
  }
  gfx->fillScreen(RGB565_BLACK);

  ledcAttach(PIN_LCD_BL, 5000, 8);
  applyBacklight(brightnessPct);

  lv_init();
  const uint32_t pixelCount = SCREEN_W * 80UL;
  drawBuf1 = static_cast<lv_color_t *>(heap_caps_malloc(pixelCount * sizeof(lv_color_t), MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  drawBuf2 = static_cast<lv_color_t *>(heap_caps_malloc(pixelCount * sizeof(lv_color_t), MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  if (!drawBuf1 || !drawBuf2) {
    if (drawBuf1) heap_caps_free(drawBuf1);
    if (drawBuf2) heap_caps_free(drawBuf2);
    drawBuf1 = static_cast<lv_color_t *>(heap_caps_malloc(SCREEN_W * 40UL * sizeof(lv_color_t), MALLOC_CAP_8BIT));
    drawBuf2 = nullptr;
    if (!drawBuf1) {
      Serial.println("Fatal: LVGL buffer allocation failed");
      while (true) delay(1000);
    }
    lv_disp_draw_buf_init(&drawBuf, drawBuf1, nullptr, SCREEN_W * 40UL);
  } else {
    lv_disp_draw_buf_init(&drawBuf, drawBuf1, drawBuf2, pixelCount);
  }

  lv_disp_drv_init(&displayDriver);
  displayDriver.hor_res = SCREEN_W;
  displayDriver.ver_res = SCREEN_H;
  displayDriver.flush_cb = displayFlush;
  displayDriver.draw_buf = &drawBuf;
  lv_disp_drv_register(&displayDriver);

  lv_indev_drv_init(&inputDriver);
  inputDriver.type = LV_INDEV_TYPE_POINTER;
  inputDriver.read_cb = touchRead;
  lv_indev_drv_register(&inputDriver);

  createUi();
  lastInteractionMs = millis();

  for (int i = 0; i < 8; ++i) {
    lv_timer_handler();
    delay(12);
  }

  WiFi.mode(WIFI_STA);
  WiFi.setHostname("waveshare-home");
  WiFi.begin();
  wifiStartMs = millis();
  previousWifiStatus = WiFi.status();
  updateClockAndGreeting();
  updateSystemText();
  Serial.println("Waveshare Home UI ready");
}

void loop() {
  lv_timer_handler();
  serviceWifi();
  updateClockAndGreeting();
  serviceIdleMode();
  serviceBrightnessPersistence();
  if (millis() - lastSystemRefreshMs >= 5000UL) {
    lastSystemRefreshMs = millis();
    updateSystemText();
  }
  delay(5);
}
