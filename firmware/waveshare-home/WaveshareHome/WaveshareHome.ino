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
static constexpr uint32_t AMBIENT_AFTER_MS = 60000UL;
static constexpr uint32_t DIM_AFTER_MS = 120000UL;
static constexpr uint8_t DEFAULT_BRIGHTNESS = 82;
static constexpr char FW_VERSION[] = "0.2.0";

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
static lv_obj_t *homeWifi = nullptr;
static lv_obj_t *homeStatus = nullptr;
static lv_obj_t *ambientClock = nullptr;
static lv_obj_t *ambientDate = nullptr;
static lv_obj_t *systemBody = nullptr;
static lv_obj_t *brightnessValue = nullptr;

static const lv_color_t C_BG = lv_color_hex(0x03080C);
static const lv_color_t C_PANEL = lv_color_hex(0x0A1319);
static const lv_color_t C_PANEL_2 = lv_color_hex(0x0E1B23);
static const lv_color_t C_PANEL_3 = lv_color_hex(0x13252E);
static const lv_color_t C_BORDER = lv_color_hex(0x1C3039);
static const lv_color_t C_TEXT = lv_color_hex(0xF4F8FA);
static const lv_color_t C_MUTED = lv_color_hex(0x93A3AC);
static const lv_color_t C_GREEN = lv_color_hex(0x20E26A);
static const lv_color_t C_ORANGE = lv_color_hex(0xFF9B42);
static const lv_color_t C_BLUE = lv_color_hex(0x5EA9FF);
static const lv_color_t C_PURPLE = lv_color_hex(0xA98BFF);
static const lv_color_t C_RED = lv_color_hex(0xFF6258);

static uint32_t lastInteractionMs = 0;
static uint32_t lastClockRefreshMs = 0;
static uint32_t lastSystemRefreshMs = 0;
static uint8_t brightnessPct = DEFAULT_BRIGHTNESS;
static bool ambientMode = false;
static bool audioCodecDetected = false;

static void setBacklight(uint8_t percent) {
  brightnessPct = constrain(percent, 5, 100);
  const uint32_t duty = map(brightnessPct, 0, 100, 0, 255);
  ledcWrite(PIN_LCD_BL, duty);
  prefs.putUChar("brightness", brightnessPct);
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

static lv_obj_t *panel(lv_obj_t *parent, int x, int y, int w, int h, lv_color_t bg = C_PANEL) {
  lv_obj_t *obj = lv_obj_create(parent);
  lv_obj_set_pos(obj, x, y);
  lv_obj_set_size(obj, w, h);
  lv_obj_set_style_radius(obj, 14, 0);
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
  lv_obj_set_style_radius(btn, 12, 0);
  lv_obj_set_style_bg_color(btn, C_PANEL_2, 0);
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

static void load(lv_obj_t *screen) {
  lastInteractionMs = millis();
  if (screen) lv_scr_load_anim(screen, LV_SCR_LOAD_ANIM_FADE_ON, 140, 0, false);
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

static void addTopBar(lv_obj_t *screen, const char *title = nullptr) {
  if (title) label(screen, title, &lv_font_montserrat_20, C_TEXT, 14, 18);
  label(screen, WiFi.status() == WL_CONNECTED ? "ONLINE" : "OFFLINE", &lv_font_montserrat_12,
        WiFi.status() == WL_CONNECTED ? C_GREEN : C_ORANGE, 246, 22);
}

static void addBottomNav(lv_obj_t *screen, int active) {
  lv_obj_t *bar = panel(screen, 8, 424, 304, 48, lv_color_hex(0x070F14));
  const char *names[3] = {"Home", "Today", "Controls"};
  for (int i = 0; i < 3; ++i) {
    lv_obj_t *btn = button(bar, names[i], 4 + i * 99, 5, 95, 38, navEvent,
                           reinterpret_cast<void *>(static_cast<intptr_t>(i)));
    if (i == active) {
      lv_obj_set_style_bg_color(btn, lv_color_hex(0x0E3520), 0);
      lv_obj_t *txt = lv_obj_get_child(btn, 0);
      if (txt) lv_obj_set_style_text_color(txt, C_GREEN, 0);
    }
  }
}

static void createHome() {
  screenHome = lv_obj_create(nullptr); styleScreen(screenHome);
  homeClock = label(screenHome, "--:--", &lv_font_montserrat_18, C_TEXT, 14, 14);
  homeWifi = label(screenHome, "OFFLINE", &lv_font_montserrat_12, C_ORANGE, 250, 18);
  homeDate = label(screenHome, "Starting...", &lv_font_montserrat_14, C_MUTED, 14, 45);
  label(screenHome, "Good afternoon", &lv_font_montserrat_20, C_TEXT, 14, 73);
  homeStatus = label(screenHome, "Home Hub is ready.", &lv_font_montserrat_14, C_MUTED, 14, 101, 292);

  lv_obj_t *now = panel(screenHome, 12, 130, 296, 124, C_PANEL_2);
  label(now, "NOW", &lv_font_montserrat_12, C_GREEN, 14, 10);
  label(now, "Home Hub", &lv_font_montserrat_18, C_TEXT, 14, 34);
  label(now, "Ready", &lv_font_montserrat_36, C_TEXT, 14, 58);
  label(now, "Live services connect as configured", &lv_font_montserrat_12, C_MUTED, 14, 101, 265);
  lv_obj_add_flag(now, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_add_event_cb(now, navEvent, LV_EVENT_CLICKED, reinterpret_cast<void *>(3));

  label(screenHome, "AT A GLANCE", &lv_font_montserrat_12, C_MUTED, 14, 269);
  lv_obj_t *house = panel(screenHome, 12, 288, 92, 110);
  label(house, "Home", &lv_font_montserrat_16, C_TEXT, 10, 14);
  label(house, "Controls", &lv_font_montserrat_12, C_MUTED, 10, 42);
  label(house, "Ready", &lv_font_montserrat_14, C_GREEN, 10, 70);
  lv_obj_add_flag(house, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_add_event_cb(house, navEvent, LV_EVENT_CLICKED, reinterpret_cast<void *>(2));

  lv_obj_t *today = panel(screenHome, 114, 288, 92, 110);
  label(today, "Today", &lv_font_montserrat_16, C_TEXT, 10, 14);
  label(today, "Agenda", &lv_font_montserrat_12, C_MUTED, 10, 42);
  label(today, "Open", &lv_font_montserrat_14, C_BLUE, 10, 70);
  lv_obj_add_flag(today, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_add_event_cb(today, navEvent, LV_EVENT_CLICKED, reinterpret_cast<void *>(1));

  lv_obj_t *system = panel(screenHome, 216, 288, 92, 110);
  label(system, "System", &lv_font_montserrat_16, C_TEXT, 10, 14);
  label(system, "Health", &lv_font_montserrat_12, C_MUTED, 10, 42);
  label(system, "Good", &lv_font_montserrat_14, C_GREEN, 10, 70);
  lv_obj_add_flag(system, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_add_event_cb(system, navEvent, LV_EVENT_CLICKED, reinterpret_cast<void *>(6));

  addBottomNav(screenHome, 0);
}

static void createToday() {
  screenToday = lv_obj_create(nullptr); styleScreen(screenToday); addTopBar(screenToday, "TODAY");
  lv_obj_t *weather = panel(screenToday, 12, 62, 296, 96, C_PANEL_2);
  label(weather, "WEATHER", &lv_font_montserrat_12, C_BLUE, 14, 12);
  label(weather, "Add location", &lv_font_montserrat_20, C_TEXT, 14, 38);
  label(weather, "Weather service ready to configure", &lv_font_montserrat_12, C_MUTED, 14, 70, 270);

  lv_obj_t *agenda = panel(screenToday, 12, 170, 296, 176);
  label(agenda, "AGENDA", &lv_font_montserrat_12, C_PURPLE, 14, 12);
  label(agenda, "No calendar connected", &lv_font_montserrat_18, C_TEXT, 14, 42);
  label(agenda, "Calendar integration can be added without changing the Home layout.", &lv_font_montserrat_12, C_MUTED, 14, 77, 266);
  label(agenda, "NTP time", &lv_font_montserrat_12, C_GREEN, 14, 135);
  label(agenda, WiFi.status() == WL_CONNECTED ? "Synced" : "Waiting for Wi-Fi", &lv_font_montserrat_14,
        WiFi.status() == WL_CONNECTED ? C_GREEN : C_ORANGE, 112, 132);

  lv_obj_t *footer = panel(screenToday, 12, 358, 296, 54);
  label(footer, "Adaptive Today view", &lv_font_montserrat_14, C_TEXT, 14, 10);
  label(footer, "Weather • calendar • timers", &lv_font_montserrat_12, C_MUTED, 14, 31);
  addBottomNav(screenToday, 1);
}

static void createControls() {
  screenControls = lv_obj_create(nullptr); styleScreen(screenControls); addTopBar(screenControls, "CONTROLS");
  lv_obj_t *tabs = panel(screenControls, 12, 62, 296, 46);
  label(tabs, "Rooms", &lv_font_montserrat_14, C_GREEN, 24, 15);
  label(tabs, "Scenes", &lv_font_montserrat_14, C_MUTED, 118, 15);
  label(tabs, "Devices", &lv_font_montserrat_14, C_MUTED, 216, 15);

  const char *rooms[] = {"Living Room", "Kitchen", "Workshop", "Bedroom"};
  const char *details[] = {"Ready to connect", "Ready to connect", "Maker space", "Ready to connect"};
  const lv_color_t colors[] = {C_GREEN, C_ORANGE, C_BLUE, C_PURPLE};
  for (int i = 0; i < 4; ++i) {
    lv_obj_t *row = panel(screenControls, 12, 120 + i * 70, 296, 60);
    lv_obj_t *dot = lv_obj_create(row);
    lv_obj_set_pos(dot, 14, 22); lv_obj_set_size(dot, 12, 12);
    lv_obj_set_style_radius(dot, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(dot, colors[i], 0); lv_obj_set_style_border_width(dot, 0, 0);
    label(row, rooms[i], &lv_font_montserrat_14, C_TEXT, 40, 10);
    label(row, details[i], &lv_font_montserrat_12, C_MUTED, 40, 34, 230);
  }
  addBottomNav(screenControls, 2);
}

static void createApps() {
  screenApps = lv_obj_create(nullptr); styleScreen(screenApps); addTopBar(screenApps, "APPS");
  const char *apps[] = {"Home", "Weather", "Agenda", "Printer", "Filament", "Timers", "Attention", "Quick", "System"};
  const intptr_t targets[] = {2, 1, 1, 0, 4, 0, 4, 5, 6};
  const lv_color_t colors[] = {C_GREEN, C_BLUE, C_PURPLE, C_GREEN, C_BLUE, C_ORANGE, C_RED, C_GREEN, C_BLUE};
  for (int i = 0; i < 9; ++i) {
    const int col = i % 3;
    const int row = i / 3;
    lv_obj_t *btn = button(screenApps, apps[i], 12 + col * 102, 74 + row * 92, 92, 78,
                           navEvent, reinterpret_cast<void *>(targets[i]), colors[i]);
    lv_obj_set_style_border_color(btn, colors[i], 0);
  }
  button(screenApps, "Home", 12, 372, 296, 44, navEvent, reinterpret_cast<void *>(0));
}

static void createAttention() {
  screenAttention = lv_obj_create(nullptr); styleScreen(screenAttention); addTopBar(screenAttention, "ATTENTION");
  lv_obj_t *ok = panel(screenAttention, 12, 76, 296, 118, C_PANEL_2);
  label(ok, "ALL CLEAR", &lv_font_montserrat_12, C_GREEN, 16, 14);
  label(ok, "No active alerts", &lv_font_montserrat_20, C_TEXT, 16, 42);
  label(ok, "Important events will be promoted here and on Home.", &lv_font_montserrat_12, C_MUTED, 16, 76, 260);

  lv_obj_t *rules = panel(screenAttention, 12, 208, 296, 142);
  label(rules, "PRIORITY MODEL", &lv_font_montserrat_12, C_MUTED, 16, 14);
  label(rules, "Normal", &lv_font_montserrat_14, C_GREEN, 16, 42);
  label(rules, "Information", &lv_font_montserrat_14, C_BLUE, 16, 66);
  label(rules, "Attention", &lv_font_montserrat_14, C_ORANGE, 16, 90);
  label(rules, "Urgent", &lv_font_montserrat_14, C_RED, 16, 114);
  button(screenAttention, "Back Home", 12, 366, 296, 48, navEvent, reinterpret_cast<void *>(0));
}

static void brightnessEvent(lv_event_t *e) {
  lv_obj_t *slider = lv_event_get_target(e);
  const uint8_t value = static_cast<uint8_t>(lv_slider_get_value(slider));
  setBacklight(value);
  if (brightnessValue) {
    char buf[16]; snprintf(buf, sizeof(buf), "%u%%", value);
    lv_label_set_text(brightnessValue, buf);
  }
}

static void createQuick() {
  screenQuick = lv_obj_create(nullptr); styleScreen(screenQuick); addTopBar(screenQuick, "QUICK PANEL");
  lv_obj_t *connectivity = panel(screenQuick, 12, 72, 296, 92, C_PANEL_2);
  label(connectivity, "Wi-Fi", &lv_font_montserrat_14, C_TEXT, 16, 14);
  label(connectivity, WiFi.status() == WL_CONNECTED ? "Connected" : "Setup available", &lv_font_montserrat_12,
        WiFi.status() == WL_CONNECTED ? C_GREEN : C_ORANGE, 16, 40);
  label(connectivity, audioCodecDetected ? "Audio codec detected" : "Audio codec not detected", &lv_font_montserrat_12,
        audioCodecDetected ? C_GREEN : C_ORANGE, 16, 64);

  lv_obj_t *brightness = panel(screenQuick, 12, 178, 296, 112);
  label(brightness, "Brightness", &lv_font_montserrat_14, C_TEXT, 16, 14);
  char pct[16]; snprintf(pct, sizeof(pct), "%u%%", brightnessPct);
  brightnessValue = label(brightness, pct, &lv_font_montserrat_14, C_GREEN, 242, 14);
  lv_obj_t *slider = lv_slider_create(brightness);
  lv_obj_set_pos(slider, 16, 63); lv_obj_set_size(slider, 264, 10);
  lv_slider_set_range(slider, 5, 100); lv_slider_set_value(slider, brightnessPct, LV_ANIM_OFF);
  lv_obj_set_style_bg_color(slider, lv_color_hex(0x22323A), LV_PART_MAIN);
  lv_obj_set_style_bg_color(slider, C_GREEN, LV_PART_INDICATOR);
  lv_obj_set_style_bg_color(slider, C_GREEN, LV_PART_KNOB);
  lv_obj_add_event_cb(slider, brightnessEvent, LV_EVENT_VALUE_CHANGED, nullptr);

  button(screenQuick, "Apps", 12, 306, 142, 54, navEvent, reinterpret_cast<void *>(3), C_BLUE);
  button(screenQuick, "System", 166, 306, 142, 54, navEvent, reinterpret_cast<void *>(6), C_PURPLE);
  button(screenQuick, "Home", 12, 374, 296, 42, navEvent, reinterpret_cast<void *>(0));
}

static void updateSystemText() {
  if (!systemBody) return;
  char ip[24] = "Not connected";
  if (WiFi.status() == WL_CONNECTED) snprintf(ip, sizeof(ip), "%s", WiFi.localIP().toString().c_str());
  char body[420];
  snprintf(body, sizeof(body),
           "Firmware        %s\n"
           "Wi-Fi          %s\n"
           "IP             %s\n"
           "RSSI           %ld dBm\n"
           "Free heap      %u KB\n"
           "PSRAM          %u KB free\n"
           "Audio codec    %s\n"
           "Brightness     %u%%\n"
           "Uptime         %lu min",
           FW_VERSION,
           WiFi.status() == WL_CONNECTED ? "Connected" : "Offline",
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
  lv_obj_t *card = panel(screenSystem, 12, 70, 296, 282, C_PANEL_2);
  label(card, "DEVICE DIAGNOSTICS", &lv_font_montserrat_12, C_GREEN, 16, 14);
  systemBody = label(card, "Loading...", &lv_font_montserrat_12, C_TEXT, 16, 46, 264);
  lv_obj_set_style_text_line_space(systemBody, 9, 0);
  button(screenSystem, "Quick Panel", 12, 366, 142, 48, navEvent, reinterpret_cast<void *>(5), C_BLUE);
  button(screenSystem, "Home", 166, 366, 142, 48, navEvent, reinterpret_cast<void *>(0), C_GREEN);
  updateSystemText();
}

static void createAmbient() {
  screenAmbient = lv_obj_create(nullptr); styleScreen(screenAmbient);
  ambientClock = label(screenAmbient, "--:--", &lv_font_montserrat_36, C_TEXT, 0, 142, 320);
  lv_obj_set_style_text_align(ambientClock, LV_TEXT_ALIGN_CENTER, 0);
  ambientDate = label(screenAmbient, "", &lv_font_montserrat_16, C_MUTED, 0, 194, 320);
  lv_obj_set_style_text_align(ambientDate, LV_TEXT_ALIGN_CENTER, 0);
  lv_obj_t *line = lv_obj_create(screenAmbient);
  lv_obj_set_pos(line, 108, 236); lv_obj_set_size(line, 104, 2);
  lv_obj_set_style_bg_color(line, C_GREEN, 0); lv_obj_set_style_border_width(line, 0, 0);
  lv_obj_set_style_radius(line, 2, 0);
  lv_obj_t *hint = label(screenAmbient, "Everything looks good\nTouch to wake", &lv_font_montserrat_14, C_MUTED, 0, 266, 320);
  lv_obj_set_style_text_align(hint, LV_TEXT_ALIGN_CENTER, 0);
}

static void wakeFromAmbient() {
  ambientMode = false;
  setBacklight(brightnessPct);
  load(screenHome);
}

static void enterAmbient() {
  if (ambientMode) return;
  ambientMode = true;
  const uint8_t ambientBrightness = max<uint8_t>(12, brightnessPct / 3);
  ledcWrite(PIN_LCD_BL, map(ambientBrightness, 0, 100, 0, 255));
  lv_scr_load_anim(screenAmbient, LV_SCR_LOAD_ANIM_FADE_ON, 300, 0, false);
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

static void updateClock() {
  const uint32_t nowMs = millis();
  if (nowMs - lastClockRefreshMs < 1000UL) return;
  lastClockRefreshMs = nowMs;

  struct tm info;
  char timeBuf[16] = "--:--";
  char dateBuf[40] = "Time not synced";
  if (getLocalTime(&info, 10)) {
    strftime(timeBuf, sizeof(timeBuf), "%l:%M %p", &info);
    strftime(dateBuf, sizeof(dateBuf), "%A, %B %e", &info);
  }
  if (homeClock) lv_label_set_text(homeClock, timeBuf);
  if (homeDate) lv_label_set_text(homeDate, dateBuf);
  if (ambientClock) lv_label_set_text(ambientClock, timeBuf);
  if (ambientDate) lv_label_set_text(ambientDate, dateBuf);
  if (homeWifi) {
    const bool online = WiFi.status() == WL_CONNECTED;
    lv_label_set_text(homeWifi, online ? "ONLINE" : "OFFLINE");
    lv_obj_set_style_text_color(homeWifi, online ? C_GREEN : C_ORANGE, 0);
  }
  if (homeStatus) {
    lv_label_set_text(homeStatus, WiFi.status() == WL_CONNECTED ? "Connected • time synced • system healthy" : "Offline • local controls remain available");
  }
}

static void serviceIdleMode() {
  if (ambientMode) return;
  const uint32_t idle = millis() - lastInteractionMs;
  if (idle >= DIM_AFTER_MS) enterAmbient();
}

static void connectWifi() {
  WiFi.mode(WIFI_STA);
  wifiManager.setConfigPortalTimeout(180);
  wifiManager.setConnectTimeout(20);
  wifiManager.setHostname("waveshare-home");
  const bool connected = wifiManager.autoConnect("WaveshareHome-Setup");
  if (connected) {
    configTzTime("EST5EDT,M3.2.0/2,M11.1.0/2", "pool.ntp.org", "time.nist.gov");
    Serial.printf("Wi-Fi connected: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("Wi-Fi setup timed out; continuing offline");
  }
}

void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.printf("Waveshare Home %s starting...\n", FW_VERSION);

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
  setBacklight(brightnessPct);

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
  connectWifi();
  updateClock();
  updateSystemText();
  Serial.println("Waveshare Home ready");
}

void loop() {
  lv_timer_handler();
  updateClock();
  serviceIdleMode();
  if (millis() - lastSystemRefreshMs >= 5000UL) {
    lastSystemRefreshMs = millis();
    updateSystemText();
  }
  delay(5);
}
