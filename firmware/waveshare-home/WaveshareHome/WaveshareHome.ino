#include <Arduino.h>
#include <Wire.h>
#include <lvgl.h>
#include <Arduino_GFX_Library.h>
#include "TCA9554.h"
#include "TouchDrvFT6X36.hpp"

// Waveshare ESP32-S3-Touch-LCD-3.5 reference pinout.
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

TCA9554 ioExpander(0x20);
TouchDrvFT6X36 touch;
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
static lv_obj_t *clockLabel = nullptr;

static const lv_color_t C_BG = lv_color_hex(0x071016);
static const lv_color_t C_PANEL = lv_color_hex(0x0E1B23);
static const lv_color_t C_PANEL_2 = lv_color_hex(0x132630);
static const lv_color_t C_BORDER = lv_color_hex(0x25404C);
static const lv_color_t C_TEXT = lv_color_hex(0xF2F7FA);
static const lv_color_t C_MUTED = lv_color_hex(0xA9B5BD);
static const lv_color_t C_GREEN = lv_color_hex(0x21E56B);
static const lv_color_t C_ORANGE = lv_color_hex(0xFF8A3D);
static const lv_color_t C_BLUE = lv_color_hex(0x58A6FF);
static const lv_color_t C_PURPLE = lv_color_hex(0xA47BFF);
static const lv_color_t C_RED = lv_color_hex(0xFF5B4D);

static uint32_t bootMillis = 0;

void lcdReset() {
  ioExpander.write1(1, 1);
  delay(10);
  ioExpander.write1(1, 0);
  delay(10);
  ioExpander.write1(1, 1);
  delay(200);
}

void displayFlush(lv_disp_drv_t *drv, const lv_area_t *area, lv_color_t *colorP) {
  const uint32_t w = static_cast<uint32_t>(area->x2 - area->x1 + 1);
  const uint32_t h = static_cast<uint32_t>(area->y2 - area->y1 + 1);
#if (LV_COLOR_16_SWAP != 0)
  gfx->draw16bitBeRGBBitmap(area->x1, area->y1, reinterpret_cast<uint16_t *>(&colorP->full), w, h);
#else
  gfx->draw16bitRGBBitmap(area->x1, area->y1, reinterpret_cast<uint16_t *>(&colorP->full), w, h);
#endif
  lv_disp_flush_ready(drv);
}

void touchRead(lv_indev_drv_t *drv, lv_indev_data_t *data) {
  (void)drv;
  int16_t x[1] = {0};
  int16_t y[1] = {0};
  const uint8_t count = touch.getPoint(x, y, 1);
  if (count > 0) {
    data->state = LV_INDEV_STATE_PR;
    data->point.x = constrain(x[0], 0, SCREEN_W - 1);
    data->point.y = constrain(y[0], 0, SCREEN_H - 1);
  } else {
    data->state = LV_INDEV_STATE_REL;
  }
}

void styleScreen(lv_obj_t *screen) {
  lv_obj_set_style_bg_color(screen, C_BG, 0);
  lv_obj_set_style_bg_opa(screen, LV_OPA_COVER, 0);
  lv_obj_set_style_text_color(screen, C_TEXT, 0);
  lv_obj_clear_flag(screen, LV_OBJ_FLAG_SCROLLABLE);
}

lv_obj_t *makeLabel(lv_obj_t *parent, const char *text, const lv_font_t *font,
                    lv_color_t color, int x, int y, int w = LV_SIZE_CONTENT) {
  lv_obj_t *label = lv_label_create(parent);
  lv_label_set_text(label, text);
  lv_obj_set_style_text_font(label, font, 0);
  lv_obj_set_style_text_color(label, color, 0);
  lv_obj_set_pos(label, x, y);
  if (w != LV_SIZE_CONTENT) {
    lv_obj_set_width(label, w);
    lv_label_set_long_mode(label, LV_LABEL_LONG_DOT);
  }
  return label;
}

lv_obj_t *makePanel(lv_obj_t *parent, int x, int y, int w, int h, lv_color_t bg = C_PANEL) {
  lv_obj_t *panel = lv_obj_create(parent);
  lv_obj_set_pos(panel, x, y);
  lv_obj_set_size(panel, w, h);
  lv_obj_set_style_radius(panel, 14, 0);
  lv_obj_set_style_bg_color(panel, bg, 0);
  lv_obj_set_style_bg_opa(panel, LV_OPA_COVER, 0);
  lv_obj_set_style_border_width(panel, 1, 0);
  lv_obj_set_style_border_color(panel, C_BORDER, 0);
  lv_obj_set_style_pad_all(panel, 0, 0);
  lv_obj_clear_flag(panel, LV_OBJ_FLAG_SCROLLABLE);
  return panel;
}

lv_obj_t *makeButton(lv_obj_t *parent, const char *text, int x, int y, int w, int h,
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
  lv_obj_t *label = lv_label_create(btn);
  lv_label_set_text(label, text);
  lv_obj_set_style_text_font(label, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(label, C_TEXT, 0);
  lv_obj_center(label);
  return btn;
}

void loadScreen(lv_obj_t *screen) {
  if (screen) lv_scr_load_anim(screen, LV_SCR_LOAD_ANIM_FADE_ON, 180, 0, false);
}

void navEvent(lv_event_t *e) {
  const intptr_t target = reinterpret_cast<intptr_t>(lv_event_get_user_data(e));
  switch (target) {
    case 0: loadScreen(screenHome); break;
    case 1: loadScreen(screenToday); break;
    case 2: loadScreen(screenControls); break;
    case 3: loadScreen(screenApps); break;
    case 4: loadScreen(screenAttention); break;
    case 5: loadScreen(screenQuick); break;
    default: loadScreen(screenHome); break;
  }
}

void addStatusBar(lv_obj_t *screen, bool showBack = false) {
  if (showBack) {
    makeButton(screen, "<", 8, 8, 40, 36, navEvent, reinterpret_cast<void *>(0));
    clockLabel = makeLabel(screen, "1:46 PM", &lv_font_montserrat_16, C_TEXT, 58, 17);
  } else {
    clockLabel = makeLabel(screen, "1:46 PM", &lv_font_montserrat_18, C_TEXT, 14, 14);
  }
  makeLabel(screen, "Wi-Fi", &lv_font_montserrat_12, C_MUTED, 242, 18);
  lv_obj_t *dot = lv_obj_create(screen);
  lv_obj_set_size(dot, 10, 10);
  lv_obj_set_pos(dot, 295, 19);
  lv_obj_set_style_radius(dot, LV_RADIUS_CIRCLE, 0);
  lv_obj_set_style_bg_color(dot, C_GREEN, 0);
  lv_obj_set_style_border_width(dot, 0, 0);
}

void addBottomNav(lv_obj_t *screen, int active) {
  lv_obj_t *bar = makePanel(screen, 8, 424, 304, 48, lv_color_hex(0x0A151B));
  lv_obj_set_style_radius(bar, 14, 0);
  const char *labels[3] = {"Home", "Today", "Controls"};
  for (int i = 0; i < 3; ++i) {
    lv_obj_t *btn = makeButton(bar, labels[i], 4 + i * 99, 5, 95, 38, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(i)));
    if (i == active) {
      lv_obj_set_style_bg_color(btn, lv_color_hex(0x103825), 0);
      lv_obj_t *label = lv_obj_get_child(btn, 0);
      if (label) lv_obj_set_style_text_color(label, C_GREEN, 0);
    }
  }
}

void createHome() {
  screenHome = lv_obj_create(nullptr);
  styleScreen(screenHome);
  addStatusBar(screenHome);
  makeLabel(screenHome, "Sunday, August 30", &lv_font_montserrat_14, C_MUTED, 14, 47);
  makeLabel(screenHome, "82°", &lv_font_montserrat_28, C_TEXT, 242, 44);
  makeLabel(screenHome, "Good afternoon, Bill", &lv_font_montserrat_20, C_TEXT, 14, 76);
  makeLabel(screenHome, "Everything looks good.", &lv_font_montserrat_14, C_MUTED, 14, 103);

  lv_obj_t *now = makePanel(screenHome, 12, 130, 296, 126);
  makeLabel(now, "NOW", &lv_font_montserrat_12, C_GREEN, 14, 10);
  makeLabel(now, "P1S  •  Printing", &lv_font_montserrat_16, C_TEXT, 14, 33);
  makeLabel(now, "63%", &lv_font_montserrat_36, C_TEXT, 14, 54);
  makeLabel(now, "1h 12m remaining", &lv_font_montserrat_14, C_MUTED, 112, 69);
  lv_obj_t *bar = lv_bar_create(now);
  lv_obj_set_pos(bar, 14, 105); lv_obj_set_size(bar, 268, 8);
  lv_bar_set_range(bar, 0, 100); lv_bar_set_value(bar, 63, LV_ANIM_OFF);
  lv_obj_set_style_bg_color(bar, lv_color_hex(0x263740), LV_PART_MAIN);
  lv_obj_set_style_bg_color(bar, C_GREEN, LV_PART_INDICATOR);
  lv_obj_set_style_radius(bar, 6, LV_PART_MAIN); lv_obj_set_style_radius(bar, 6, LV_PART_INDICATOR);
  lv_obj_add_event_cb(now, navEvent, LV_EVENT_CLICKED, reinterpret_cast<void *>(3));
  lv_obj_add_flag(now, LV_OBJ_FLAG_CLICKABLE);

  makeLabel(screenHome, "AT A GLANCE", &lv_font_montserrat_12, C_MUTED, 14, 270);
  lv_obj_t *home = makePanel(screenHome, 12, 289, 92, 110);
  makeLabel(home, "Home", &lv_font_montserrat_16, C_TEXT, 10, 14);
  makeLabel(home, "Everything", &lv_font_montserrat_12, C_MUTED, 10, 42);
  makeLabel(home, "Normal", &lv_font_montserrat_14, C_GREEN, 10, 68);
  lv_obj_add_event_cb(home, navEvent, LV_EVENT_CLICKED, reinterpret_cast<void *>(2)); lv_obj_add_flag(home, LV_OBJ_FLAG_CLICKABLE);

  lv_obj_t *filament = makePanel(screenHome, 114, 289, 92, 110);
  makeLabel(filament, "Filament", &lv_font_montserrat_16, C_TEXT, 10, 14);
  makeLabel(filament, "18 spools", &lv_font_montserrat_12, C_MUTED, 10, 42);
  makeLabel(filament, "2 low", &lv_font_montserrat_14, C_RED, 10, 68);
  lv_obj_add_event_cb(filament, navEvent, LV_EVENT_CLICKED, reinterpret_cast<void *>(4)); lv_obj_add_flag(filament, LV_OBJ_FLAG_CLICKABLE);

  lv_obj_t *next = makePanel(screenHome, 216, 289, 92, 110);
  makeLabel(next, "Next", &lv_font_montserrat_16, C_TEXT, 10, 14);
  makeLabel(next, "3:30 PM", &lv_font_montserrat_12, C_PURPLE, 10, 42);
  makeLabel(next, "Grocery", &lv_font_montserrat_12, C_MUTED, 10, 66);
  makeLabel(next, "pickup", &lv_font_montserrat_12, C_MUTED, 10, 82);
  lv_obj_add_event_cb(next, navEvent, LV_EVENT_CLICKED, reinterpret_cast<void *>(1)); lv_obj_add_flag(next, LV_OBJ_FLAG_CLICKABLE);
  addBottomNav(screenHome, 0);
}

void createToday() {
  screenToday = lv_obj_create(nullptr); styleScreen(screenToday); addStatusBar(screenToday);
  makeLabel(screenToday, "TODAY", &lv_font_montserrat_20, C_TEXT, 14, 48);
  makeLabel(screenToday, "1 of 3", &lv_font_montserrat_12, C_MUTED, 262, 52);
  lv_obj_t *weather = makePanel(screenToday, 12, 78, 296, 86);
  makeLabel(weather, "82°", &lv_font_montserrat_28, C_TEXT, 18, 16);
  makeLabel(weather, "Partly Cloudy", &lv_font_montserrat_14, C_MUTED, 92, 23);
  makeLabel(weather, "H 87°", &lv_font_montserrat_14, C_RED, 226, 16);
  makeLabel(weather, "L 71°", &lv_font_montserrat_14, C_BLUE, 226, 45);
  lv_obj_t *agenda = makePanel(screenToday, 12, 176, 296, 176);
  makeLabel(agenda, "3:30 PM", &lv_font_montserrat_12, C_PURPLE, 18, 16);
  makeLabel(agenda, "Grocery pickup", &lv_font_montserrat_16, C_TEXT, 18, 38);
  makeLabel(agenda, "6:00 PM", &lv_font_montserrat_12, C_PURPLE, 18, 86);
  makeLabel(agenda, "Dinner with Aimee", &lv_font_montserrat_16, C_TEXT, 18, 108);
  makeLabel(agenda, "All day", &lv_font_montserrat_12, C_GREEN, 18, 142);
  makeLabel(agenda, "No tasks completed", &lv_font_montserrat_12, C_MUTED, 86, 142);
  lv_obj_t *sunset = makePanel(screenToday, 12, 364, 296, 48);
  makeLabel(sunset, "Sunset", &lv_font_montserrat_14, C_ORANGE, 16, 14);
  makeLabel(sunset, "7:52 PM", &lv_font_montserrat_14, C_TEXT, 226, 14);
  addBottomNav(screenToday, 1);
}

void createControls() {
  screenControls = lv_obj_create(nullptr); styleScreen(screenControls); addStatusBar(screenControls);
  makeLabel(screenControls, "CONTROLS", &lv_font_montserrat_20, C_TEXT, 14, 48);
  lv_obj_t *tabs = makePanel(screenControls, 12, 78, 296, 46);
  makeLabel(tabs, "Rooms", &lv_font_montserrat_14, C_GREEN, 24, 15);
  makeLabel(tabs, "Scenes", &lv_font_montserrat_14, C_MUTED, 118, 15);
  makeLabel(tabs, "Devices", &lv_font_montserrat_14, C_MUTED, 216, 15);
  const char *rooms[] = {"Living Room", "Kitchen", "Workshop", "Bedroom"};
  const char *details[] = {"3 lights on", "1 light on", "P1S printing", "Everything off"};
  const char *temps[] = {"72°", "71°", "74°", "70°"};
  const lv_color_t accents[] = {C_GREEN, C_ORANGE, C_BLUE, C_PURPLE};
  for (int i = 0; i < 4; ++i) {
    lv_obj_t *row = makePanel(screenControls, 12, 136 + i * 67, 296, 58);
    lv_obj_t *dot = lv_obj_create(row);
    lv_obj_set_pos(dot, 12, 20); lv_obj_set_size(dot, 14, 14); lv_obj_set_style_radius(dot, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(dot, accents[i], 0); lv_obj_set_style_border_width(dot, 0, 0);
    makeLabel(row, rooms[i], &lv_font_montserrat_14, C_TEXT, 38, 9);
    makeLabel(row, details[i], &lv_font_montserrat_12, C_MUTED, 38, 31);
    makeLabel(row, temps[i], &lv_font_montserrat_16, C_TEXT, 242, 20);
  }
  addBottomNav(screenControls, 2);
}

void createApps() {
  screenApps = lv_obj_create(nullptr); styleScreen(screenApps); addStatusBar(screenApps, true);
  makeLabel(screenApps, "APPS", &lv_font_montserrat_20, C_TEXT, 124, 48);
  const char *apps[] = {"Printer", "Filament", "Home", "Weather", "Agenda", "Timers", "Tools", "System", "Photos"};
  const lv_color_t accents[] = {C_GREEN, C_BLUE, C_GREEN, C_ORANGE, C_PURPLE, C_BLUE, C_MUTED, C_BLUE, C_PURPLE};
  for (int i = 0; i < 9; ++i) {
    const int col = i % 3; const int row = i / 3;
    lv_obj_t *btn = makeButton(screenApps, apps[i], 12 + col * 102, 92 + row * 90, 92, 76, nullptr, nullptr, accents[i]);
    lv_obj_set_style_border_color(btn, accents[i], 0);
  }
  makeButton(screenApps, "Edit Apps", 12, 374, 296, 42, navEvent, reinterpret_cast<void *>(0));
}

void createAttention() {
  screenAttention = lv_obj_create(nullptr); styleScreen(screenAttention); addStatusBar(screenAttention, true);
  makeLabel(screenAttention, "ATTENTION", &lv_font_montserrat_20, C_TEXT, 64, 48);
  makeLabel(screenAttention, "2", &lv_font_montserrat_20, C_RED, 286, 48);
  lv_obj_t *one = makePanel(screenAttention, 12, 86, 296, 116);
  makeLabel(one, "!", &lv_font_montserrat_28, C_ORANGE, 16, 22);
  makeLabel(one, "Black PLA is low", &lv_font_montserrat_16, C_TEXT, 54, 16);
  makeLabel(one, "~94 g remaining in AMS slot 4", &lv_font_montserrat_12, C_MUTED, 54, 48, 220);
  makeLabel(one, "4 minutes ago", &lv_font_montserrat_12, C_MUTED, 54, 76);
  lv_obj_t *two = makePanel(screenAttention, 12, 214, 296, 116);
  makeLabel(two, "i", &lv_font_montserrat_28, C_BLUE, 19, 22);
  makeLabel(two, "P1S print completed", &lv_font_montserrat_16, C_TEXT, 54, 16);
  makeLabel(two, "Modular Storage Bin", &lv_font_montserrat_12, C_MUTED, 54, 48);
  makeLabel(two, "18 minutes ago", &lv_font_montserrat_12, C_MUTED, 54, 76);
  makeButton(screenAttention, "Clear all", 12, 346, 296, 52, navEvent, reinterpret_cast<void *>(0));
}

void createQuick() {
  screenQuick = lv_obj_create(nullptr); styleScreen(screenQuick); addStatusBar(screenQuick, true);
  makeLabel(screenQuick, "QUICK PANEL", &lv_font_montserrat_20, C_TEXT, 86, 48);
  const char *top[] = {"Wi-Fi", "Home", "P1S"};
  for (int i = 0; i < 3; ++i) {
    lv_obj_t *btn = makeButton(screenQuick, top[i], 12 + i * 102, 90, 92, 74, nullptr, nullptr, C_GREEN);
    lv_obj_set_style_bg_color(btn, lv_color_hex(0x15382A), 0);
  }
  makeButton(screenQuick, "Printer Light", 12, 178, 142, 52, nullptr, nullptr, C_ORANGE);
  makeButton(screenQuick, "Workshop Lights", 166, 178, 142, 52, nullptr, nullptr, C_GREEN);
  lv_obj_t *brightness = makePanel(screenQuick, 12, 244, 296, 80);
  makeLabel(brightness, "Brightness", &lv_font_montserrat_14, C_TEXT, 14, 10);
  lv_obj_t *slider = lv_slider_create(brightness);
  lv_obj_set_pos(slider, 14, 46); lv_obj_set_size(slider, 268, 10);
  lv_slider_set_range(slider, 10, 100); lv_slider_set_value(slider, 80, LV_ANIM_OFF);
  lv_obj_set_style_bg_color(slider, lv_color_hex(0x263740), LV_PART_MAIN);
  lv_obj_set_style_bg_color(slider, C_GREEN, LV_PART_INDICATOR);
  lv_obj_set_style_bg_color(slider, C_GREEN, LV_PART_KNOB);
  makeButton(screenQuick, "Quiet Mode", 12, 340, 142, 58, nullptr, nullptr, C_PURPLE);
  makeButton(screenQuick, "Settings", 166, 340, 142, 58, navEvent, reinterpret_cast<void *>(3), C_BLUE);
}

void createUi() {
  createHome(); createToday(); createControls(); createApps(); createAttention(); createQuick(); loadScreen(screenHome);
}

void updateClock() {
  static uint32_t last = 0;
  const uint32_t now = millis(); if (now - last < 1000) return; last = now;
  const uint32_t elapsedMinutes = (now - bootMillis) / 60000UL;
  const uint32_t totalMinutes = 13UL * 60UL + 46UL + elapsedMinutes;
  uint32_t hour24 = (totalMinutes / 60UL) % 24UL; const uint32_t minute = totalMinutes % 60UL;
  const bool pm = hour24 >= 12; uint32_t hour12 = hour24 % 12; if (hour12 == 0) hour12 = 12;
  char buffer[16];
  snprintf(buffer, sizeof(buffer), "%lu:%02lu %s", static_cast<unsigned long>(hour12), static_cast<unsigned long>(minute), pm ? "PM" : "AM");
  if (clockLabel && lv_obj_is_valid(clockLabel)) lv_label_set_text(clockLabel, buffer);
}

void setup() {
  Serial.begin(115200); delay(100); Serial.println("Waveshare Home starting...");
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  if (!ioExpander.begin()) Serial.println("Warning: TCA9554 init failed");
  ioExpander.pinMode1(1, OUTPUT); lcdReset();
  if (!touch.begin(Wire, FT6X36_SLAVE_ADDRESS)) Serial.println("Warning: FT6336/FT6X36 touch controller not detected");
  if (!gfx->begin()) { Serial.println("Fatal: ST7796 display init failed"); while (true) delay(1000); }
  gfx->fillScreen(RGB565_BLACK); pinMode(PIN_LCD_BL, OUTPUT); digitalWrite(PIN_LCD_BL, HIGH);
  lv_init();
  const uint32_t pixelCount = SCREEN_W * 80UL;
  drawBuf1 = static_cast<lv_color_t *>(heap_caps_malloc(pixelCount * sizeof(lv_color_t), MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  drawBuf2 = static_cast<lv_color_t *>(heap_caps_malloc(pixelCount * sizeof(lv_color_t), MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  if (!drawBuf1 || !drawBuf2) {
    Serial.println("PSRAM allocation failed; retrying internal RAM with one buffer");
    if (drawBuf1) heap_caps_free(drawBuf1); if (drawBuf2) heap_caps_free(drawBuf2);
    drawBuf1 = static_cast<lv_color_t *>(heap_caps_malloc(SCREEN_W * 40UL * sizeof(lv_color_t), MALLOC_CAP_8BIT)); drawBuf2 = nullptr;
    if (!drawBuf1) { Serial.println("Fatal: LVGL buffer allocation failed"); while (true) delay(1000); }
    lv_disp_draw_buf_init(&drawBuf, drawBuf1, nullptr, SCREEN_W * 40UL);
  } else { lv_disp_draw_buf_init(&drawBuf, drawBuf1, drawBuf2, pixelCount); }
  lv_disp_drv_init(&displayDriver); displayDriver.hor_res = SCREEN_W; displayDriver.ver_res = SCREEN_H;
  displayDriver.flush_cb = displayFlush; displayDriver.draw_buf = &drawBuf; lv_disp_drv_register(&displayDriver);
  lv_indev_drv_init(&inputDriver); inputDriver.type = LV_INDEV_TYPE_POINTER; inputDriver.read_cb = touchRead; lv_indev_drv_register(&inputDriver);
  createUi(); bootMillis = millis(); Serial.println("Waveshare Home ready");
}

void loop() { lv_timer_handler(); updateClock(); delay(5); }
