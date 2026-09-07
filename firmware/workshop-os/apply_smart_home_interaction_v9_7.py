#!/usr/bin/env python3
from pathlib import Path
import argparse, re

class PatchError(RuntimeError):
    pass

def need_once(text, needle, name):
    n=text.count(needle)
    if n!=1: raise PatchError(f"{name}: expected exactly 1 match, found {n}")

def ro(text, old, new, name):
    need_once(text, old, name)
    return text.replace(old,new,1)

def rb(text, start, end, new, name):
    a=text.find(start)
    if a<0: raise PatchError(f"{name}: start anchor not found")
    b=text.find(end,a+len(start))
    if b<0: raise PatchError(f"{name}: end anchor not found")
    return text[:a]+new+text[b:]

def insert_before(text, anchor, content, name):
    need_once(text, anchor, name)
    return text.replace(anchor, content+anchor,1)

def insert_after(text, anchor, content, name):
    need_once(text, anchor, name)
    return text.replace(anchor, anchor+content,1)

# ---------------------------------------------------------------------------
# Touch coordinate plumbing
# ---------------------------------------------------------------------------
def patch_touch(repo: Path):
    p=repo/'src'/'button_touch_backend.h'; t=p.read_text()
    old='''struct TouchPoll {\n  TouchEvent ev;\n  bool isDown;  // meaningful for level backends (ev == None); raw finger-down\n};'''
    new='''struct TouchPoll {\n  TouchEvent ev;\n  bool isDown;  // meaningful for level backends (ev == None); raw finger-down\n  uint16_t x;\n  uint16_t y;\n  bool hasPosition;\n\n  TouchPoll(TouchEvent e = TouchEvent::None, bool down = false,\n            uint16_t px = 0, uint16_t py = 0, bool positioned = false)\n      : ev(e), isDown(down), x(px), y(py), hasPosition(positioned) {}\n};'''
    t=ro(t,old,new,'touch/backend-coordinate-struct'); p.write_text(t)

    p=repo/'src'/'button_touch_focaltech.cpp'; t=p.read_text()
    t=insert_after(t, '''static bool ft5x06ReadReg(uint8_t reg, uint8_t& value) {\n  Wire.beginTransmission(TOUCH_SLAVE_ADDRESS);\n  Wire.write(reg);\n  if (Wire.endTransmission(false) != 0) return false;\n  if (Wire.requestFrom((uint8_t)TOUCH_SLAVE_ADDRESS, (uint8_t)1) != 1) return false;\n  value = Wire.read();\n  return true;\n}\n''', r'''

// Read first contact coordinates (P1_XH..P1_YL, registers 0x03..0x06).
// FT6336 reports the native portrait sensor space: X=0..319, Y=0..479 on
// ws_lcd_350. Rotation mapping belongs to Smart Home so the backend remains
// reusable by the other FocalTech boards.
static bool ft5x06ReadPoint(uint16_t& x, uint16_t& y) {
  Wire.beginTransmission(TOUCH_SLAVE_ADDRESS);
  Wire.write((uint8_t)0x03);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom((uint8_t)TOUCH_SLAVE_ADDRESS, (uint8_t)4) != 4) return false;
  uint8_t xh = Wire.read(), xl = Wire.read(), yh = Wire.read(), yl = Wire.read();
  x = (uint16_t)(((xh & 0x0F) << 8) | xl);
  y = (uint16_t)(((yh & 0x0F) << 8) | yl);
  return true;
}
''','touch/focaltech-point-reader')
    old='''  // TD_STATUS low nibble = active touch points; mask off the reserved high bits so\n  // a stray high bit can't be misread as a permanent touch.\n  return {TouchEvent::None, (bool)((touchPoints & 0x0F) > 0)};'''
    new='''  // TD_STATUS low nibble = active touch points; mask off reserved high bits.\n  const bool down = (touchPoints & 0x0F) > 0;\n  if (down) {\n    uint16_t x = 0, y = 0;\n    if (ft5x06ReadPoint(x, y))\n      return {TouchEvent::None, true, x, y, true};\n  }\n  return {TouchEvent::None, down};'''
    t=ro(t,old,new,'touch/focaltech-return-coordinate'); p.write_text(t)

    p=repo/'src'/'button.h'; t=p.read_text()
    t=insert_before(t,'\n#endif // BUTTON_H\n',r'''
// Last valid capacitive-touch position observed by wasButtonPressed().
// Coordinates are raw controller/native-portrait coordinates; callers that
// care about display rotation must map them to the active canvas.
bool buttonGetTouchPosition(uint16_t* x, uint16_t* y);
''','touch/button-position-decl'); p.write_text(t)

    p=repo/'src'/'button.cpp'; t=p.read_text()
    t=insert_after(t,'static const unsigned long DEBOUNCE_MS = 50;\n',r'''
static uint16_t lastTouchX = 0;
static uint16_t lastTouchY = 0;
static bool lastTouchPositionValid = false;
''','touch/button-coordinate-cache')
    old='''    TouchPoll tp = touchPoll();\n    // A failed bus/read must NOT disturb debounce or hold state - it is not a'''
    new='''    TouchPoll tp = touchPoll();\n    if (tp.hasPosition) {\n      lastTouchX = tp.x;\n      lastTouchY = tp.y;\n      lastTouchPositionValid = true;\n    }\n    // A failed bus/read must NOT disturb debounce or hold state - it is not a'''
    t=ro(t,old,new,'touch/button-cache-position')
    t=insert_before(t,'\nuint32_t buttonHoldDurationMs() {\n',r'''
bool buttonGetTouchPosition(uint16_t* x, uint16_t* y) {
  if (!lastTouchPositionValid) return false;
  if (x) *x = lastTouchX;
  if (y) *y = lastTouchY;
  return true;
}

''','touch/button-position-getter')
    p.write_text(t)

# ---------------------------------------------------------------------------
# Screen enum / Smart Hub declarations / display switch
# ---------------------------------------------------------------------------
def patch_headers_and_display(repo: Path):
    p=repo/'src'/'display_ui.h'; t=p.read_text()
    if 'SCREEN_HUB_PRINTER' not in t:
        m=re.search(r'(?m)^(\s*)SCREEN_HUB_SYSTEM\s*,?\s*$',t)
        if not m: raise PatchError('display/enum: SCREEN_HUB_SYSTEM line not found')
        indent=m.group(1)
        repl=f'{indent}SCREEN_HUB_SYSTEM,\n{indent}SCREEN_HUB_PRINTER,\n{indent}SCREEN_HUB_MORE'
        t=t[:m.start()]+repl+t[m.end():]
    p.write_text(t)

    p=repo/'src'/'smart_hub.h'; t=p.read_text()
    if 'smartHubHandleTouch' not in t:
        t=insert_before(t,'\n#endif',r'''
// v9.7 coordinate-driven interaction. rawX/rawY are native FT6336 portrait
// coordinates; Smart Home maps them through the current display rotation.
bool smartHubHandleTouch(uint16_t rawX, uint16_t rawY, bool longPress);
bool smartHubIsNativePrinterScreen(ScreenState screen);
''','hub/header-touch-api')
    p.write_text(t)

    p=repo/'src'/'display_ui.cpp'; t=p.read_text()
    old='''    case SCREEN_HUB_HOME:\n    case SCREEN_HUB_WORKSHOP:\n    case SCREEN_HUB_CUSTOM:\n    case SCREEN_HUB_SYSTEM:\n      smartHubDraw(currentScreen, forceRedraw);'''
    new='''    case SCREEN_HUB_HOME:\n    case SCREEN_HUB_PRINTER:\n    case SCREEN_HUB_WORKSHOP:\n    case SCREEN_HUB_MORE:\n    case SCREEN_HUB_CUSTOM:\n    case SCREEN_HUB_SYSTEM:\n      smartHubDraw(currentScreen, forceRedraw);'''
    t=ro(t,old,new,'display/hub-screen-cases'); p.write_text(t)

# ---------------------------------------------------------------------------
# Main input dispatch: touchscreen owns coordinate gesture while in hub
# ---------------------------------------------------------------------------
def patch_main(repo: Path):
    p=repo/'src'/'main.cpp'; t=p.read_text()
    anchor='''  // Flush a buffered multi-click once the window closes: 1 click = the normal tap\n  // action, 2+ = open the power-confirm modal for the frozen target slot.\n'''
    block=r'''
  // Smart Home v9.7: on touchscreen-backed Hub pages, the display owns the
  // entire touch gesture. Capture the FT6336 coordinate on press, suppress the
  // LED hold-to-dim gesture, and dispatch either a tap or long-press on release.
  // Board-button input remains a simple next-page fallback.
  static bool hubTouchTracking = false;
  static bool hubTouchWasHeld = false;
  static bool hubTouchHasPoint = false;
  static uint16_t hubTouchX = 0, hubTouchY = 0;
  static uint32_t hubTouchMaxHoldMs = 0;
  if (smartHubIsScreen(getScreenState()) && buttonType == BTN_TOUCHSCREEN) {
    if (touchPress) {
      hubTouchTracking = true;
      hubTouchMaxHoldMs = 0;
      hubTouchHasPoint = buttonGetTouchPosition(&hubTouchX, &hubTouchY);
      buzzerPlayClick();
      ledOnUserInteraction();
    }
    if (isButtonHeld() && hubTouchTracking) {
      uint16_t x = 0, y = 0;
      if (buttonGetTouchPosition(&x, &y)) {
        hubTouchX = x; hubTouchY = y; hubTouchHasPoint = true;
      }
      uint32_t d = buttonHoldDurationMs();
      if (d > hubTouchMaxHoldMs) hubTouchMaxHoldMs = d;
    }
    const bool releaseEdge = hubTouchWasHeld && !isButtonHeld();
    hubTouchWasHeld = isButtonHeld();
    // Drain LED save debounce but never start brightness-dimming from a Hub
    // touch; Hub long-press is reserved for widget editing.
    ledHoldDimUpdate(isButtonHeld(), buttonHoldDurationMs(), /*suppressDim=*/true);
    if (boardPress) {
      buzzerPlayClick(); ledOnUserInteraction(); smartHubAdvance();
    }
    if (releaseEdge && hubTouchTracking) {
      if (hmsScreenAlerting() && openHmsScreen(HMS_SCREEN_MS)) {
        // Error detail retains priority over navigation.
      } else if (hubTouchHasPoint) {
        smartHubHandleTouch(hubTouchX, hubTouchY, hubTouchMaxHoldMs >= 650);
      } else {
        smartHubAdvance();
      }
      hubTouchTracking = false;
      hubTouchHasPoint = false;
      hubTouchMaxHoldMs = 0;
    }
    return;
  } else {
    hubTouchTracking = false;
    hubTouchWasHeld = false;
    hubTouchHasPoint = false;
    hubTouchMaxHoldMs = 0;
  }

'''
    t=insert_before(t,anchor,block,'main/hub-coordinate-dispatch')
    p.write_text(t)

# ---------------------------------------------------------------------------
# Smart Hub v9.7 visual/interaction layer
# ---------------------------------------------------------------------------
def patch_hub(repo: Path):
    p=repo/'src'/'smart_hub.cpp'; t=p.read_text()
    if '#include "recovery_manager.h"' not in t:
        t=ro(t,'#include "smart_home_build.h"\n','#include "smart_home_build.h"\n#include "recovery_manager.h"\n','hub/recovery-include')
    if '#include <ctype.h>' not in t:
        t=ro(t,'#include <new>\n','#include <new>\n#include <ctype.h>\n','hub/ctype-include')

    global_anchor='unsigned long g_userHoldUntilMs = 0;\n'
    globals=r'''

// v9.7 built-in Custom widget deck. These live in the existing Smart Hub NVS
// namespace so browser and recovery reset behavior stay coherent.
enum HubWidgetKind : uint8_t {
  HUB_W_PROGRESS = 0, HUB_W_NOZZLE, HUB_W_BED, HUB_W_CHAMBER,
  HUB_W_WIFI, HUB_W_AMS, HUB_W_LAYER, HUB_W_ETA, HUB_W_FAN, HUB_W_UPTIME,
  HUB_W_COUNT
};
uint8_t g_widgets[4] = { HUB_W_PROGRESS, HUB_W_NOZZLE, HUB_W_BED, HUB_W_WIFI };
bool g_widgetEditMode = false;
uint8_t g_widgetSelected = 0;
'''
    t=insert_after(t,global_anchor,globals,'hub/widget-globals')

    t=ro(t,'  safeCopy(g_cfg.customUrl, sizeof(g_cfg.customUrl), u.c_str());\n  p.end();',
         '  safeCopy(g_cfg.customUrl, sizeof(g_cfg.customUrl), u.c_str());\n  for (uint8_t i = 0; i < 4; i++) {\n    char key[4]; snprintf(key, sizeof(key), "w%u", (unsigned)i);\n    uint8_t v = p.getUChar(key, g_widgets[i]);\n    g_widgets[i] = v < HUB_W_COUNT ? v : g_widgets[i];\n  }\n  p.end();','hub/widget-prefs-load')
    t=ro(t,'  p.putString("url", g_cfg.customUrl);\n  p.end();',
         '  p.putString("url", g_cfg.customUrl);\n  for (uint8_t i = 0; i < 4; i++) {\n    char key[4]; snprintf(key, sizeof(key), "w%u", (unsigned)i);\n    p.putUChar(key, g_widgets[i]);\n  }\n  p.end();','hub/widget-prefs-save')

    art_end='static void uiSpool(int16_t cx, int16_t cy, uint16_t color,\n'
    family_helper=r'''
static bool uiNameHas(const char* name, const char* token) {
  if (!name || !token || !*token) return false;
  for (const char* p = name; *p; ++p) {
    const char* a = p; const char* b = token;
    while (*a && *b && toupper((unsigned char)*a) == toupper((unsigned char)*b)) { ++a; ++b; }
    if (!*b) return true;
  }
  return false;
}

static uint8_t uiPrinterFamily(const PrinterSlot& p) {
  if (p.state.dualNozzle || uiNameHas(p.config.name, "H2")) return 3;
  if (uiNameHas(p.config.name, "A1 MINI")) return 2;
  if (uiNameHas(p.config.name, "A1")) return 1;
  return 0;
}

static void uiPrinterArtFamily(int16_t x, int16_t y, int16_t w, int16_t h,
                               uint16_t accent, const PrinterSlot& p) {
  const uint8_t family = uiPrinterFamily(p);
  if (family == 1 || family == 2) {
    const int16_t cx = x + w / 2;
    const int16_t bedY = y + h * 4 / 5;
    tft.fillRoundRect(x + w/5, bedY - 4, w*3/5, 7, 3, UI_BORDER);
    tft.drawFastVLine(x + w/4, y + h/5, h*3/5, UI_MUTED);
    tft.drawFastHLine(x + w/4, y + h/4, w/2, UI_MUTED);
    tft.fillRoundRect(cx - 11, y + h/3, 22, 15, 4, UI_PANEL_2);
    tft.fillCircle(cx, y + h/3 + 7, 3, accent);
    tft.fillTriangle(cx - 9, bedY - 5, cx, bedY - 25, cx + 9, bedY - 5, accent);
    if (family == 2) {
      setFont(tft, FONT_SMALL); tft.setTextDatum(TC_DATUM);
      tft.setTextColor(UI_MUTED, UI_BG); tft.drawString("mini", cx, y + h - 5);
    }
    return;
  }
  uiPrinterArt(x, y, w, h, accent);
  if (family == 3) {
    const int16_t cx = x + w / 2;
    tft.fillCircle(cx - 6, y + h/2, 3, UI_ORANGE);
    tft.fillCircle(cx + 6, y + h/2, 3, UI_CYAN);
    tft.drawFastHLine(x + w/4, y + h*4/5, w/2, UI_PURPLE);
  }
}

'''
    t=insert_before(t,art_end,family_helper,'hub/family-art-helper')

    t=rb(t,'static void uiSpool(int16_t cx, int16_t cy, uint16_t color,\n','static void uiWifiGlyph',r'''static void uiSpool(int16_t cx, int16_t cy, uint16_t color,
                    int8_t remain, bool active) {
  (void)remain;
  if (!color) color = UI_MUTED;
  if (active) tft.fillCircle(cx, cy, 23, UI_ORANGE);
  tft.fillCircle(cx, cy, 21, UI_BORDER);
  tft.fillCircle(cx, cy, 17, color);
  tft.fillCircle(cx, cy, 8, UI_BG);
  tft.drawCircle(cx, cy, 12, UI_PANEL_2);
}

static void uiSpoolCaption(int16_t cx, int16_t y, const char* type, int8_t remain) {
  char tbuf[7]; uiCopyShort(tbuf, sizeof(tbuf), type && *type ? type : "—", 5);
  char line[16];
  if (remain >= 0) snprintf(line, sizeof(line), "%s · %d%%", tbuf, (int)remain);
  else snprintf(line, sizeof(line), "%s", tbuf);
  setFont(tft, FONT_SMALL); tft.setTextDatum(TC_DATUM);
  tft.setTextColor(UI_DIM, UI_PANEL); tft.drawString(line, cx, y);
}

static void uiWifiGlyph''','hub/spool-spacing')

    t=rb(t,'static void uiBottomNav(uint8_t active, const char* nextPage) {\n','static void drawTapHint',r'''static void uiBottomNav(uint8_t active, const char* nextPage) {
  (void)nextPage;
  const int16_t H = 48;
  const int16_t y = tft.height() - H;
  const int16_t W = tft.width();
  tft.fillRect(0, y, W, H, UI_BG);
  tft.drawFastHLine(8, y, W - 16, UI_BORDER);
  static const char* labels[] = {"HOME", "PRINTER", "WORKSHOP", "MORE"};
  const int16_t cell = W / 4;
  for (uint8_t i = 0; i < 4; i++) {
    const int16_t x = i * cell;
    const uint16_t c = i == active ? UI_ORANGE : UI_MUTED;
    if (i == active) {
      tft.fillRoundRect(x + 5, y + 4, cell - 10, H - 8, 9, UI_WARN_BG);
      tft.drawRoundRect(x + 5, y + 4, cell - 10, H - 8, 9, UI_ORANGE);
    }
    uiNavIcon(x + cell/2, y + 15, i, c);
    setFont(tft, FONT_SMALL); tft.setTextDatum(TC_DATUM);
    tft.setTextColor(c, i == active ? UI_WARN_BG : UI_BG);
    tft.drawString(labels[i], x + cell/2, y + 29);
  }
}

static void uiActionButton(int16_t x, int16_t y, int16_t w, int16_t h,
                           const char* label, uint16_t accent, bool filled=false) {
  const uint16_t bg = filled ? accent : UI_PANEL_2;
  tft.fillRoundRect(x, y, w, h, 9, bg);
  tft.drawRoundRect(x, y, w, h, 9, accent);
  setFont(tft, FONT_SMALL); tft.setTextDatum(MC_DATUM);
  tft.setTextColor(filled ? UI_BG : accent, bg);
  tft.drawString(label, x + w/2, y + h/2);
}

static void drawTapHint''','hub/primary-bottom-nav')

    widget_helpers=r'''
// ---------------------------------------------------------------------------
// v9.7 built-in widget deck + common telemetry rails
// ---------------------------------------------------------------------------
static const char* hubWidgetLabel(uint8_t kind) {
  static const char* labels[] = {"PROGRESS","NOZZLE","BED","CHAMBER","WI-FI","AMS","LAYER","ETA","FAN","UPTIME"};
  return kind < HUB_W_COUNT ? labels[kind] : "WIDGET";
}

static void hubWidgetValue(uint8_t kind, char* value, size_t valueLen,
                           char* sub, size_t subLen) {
  const bool configured = isAnyPrinterConfigured();
  const BambuState* s = configured ? &displayedPrinter().state : nullptr;
  strlcpy(value, "—", valueLen); strlcpy(sub, configured ? stateText(*s) : "no printer", subLen);
  switch (kind) {
    case HUB_W_PROGRESS: if (s) snprintf(value,valueLen,"%u%%",(unsigned)s->progress); strlcpy(sub,s&&s->printing?"active job":"printer ready",subLen); break;
    case HUB_W_NOZZLE: if (s) snprintf(value,valueLen,"%.0f°",s->nozzleTemp); strlcpy(sub,"live thermal",subLen); break;
    case HUB_W_BED: if (s) snprintf(value,valueLen,"%.0f°",s->bedTemp); strlcpy(sub,"live thermal",subLen); break;
    case HUB_W_CHAMBER: if (s) snprintf(value,valueLen,"%.0f°",s->chamberTemp); strlcpy(sub,"enclosure",subLen); break;
    case HUB_W_WIFI: snprintf(value,valueLen,"%d dBm",WiFi.status()==WL_CONNECTED?WiFi.RSSI():-100); strlcpy(sub,WiFi.status()==WL_CONNECTED?"connected":"offline",subLen); break;
    case HUB_W_AMS: if (s&&s->ams.present) snprintf(value,valueLen,"%u trays",(unsigned)(s->ams.unitCount*4)); strlcpy(sub,s&&s->ams.present?"material deck":"not present",subLen); break;
    case HUB_W_LAYER: if (s) snprintf(value,valueLen,"%u/%u",(unsigned)s->layerNum,(unsigned)s->totalLayers); strlcpy(sub,"layer",subLen); break;
    case HUB_W_ETA: if (s) formatDuration(s->remainingMinutes,value,valueLen); strlcpy(sub,"remaining",subLen); break;
    case HUB_W_FAN: if (s) snprintf(value,valueLen,"%u%%",(unsigned)s->coolingFanPct); strlcpy(sub,"part fan",subLen); break;
    case HUB_W_UPTIME: { uint32_t m=millis()/60000UL; snprintf(value,valueLen,"%uh %02um",(unsigned)(m/60),(unsigned)(m%60)); strlcpy(sub,"device",subLen); break; }
  }
}

static void drawWidgetCard(uint8_t slot, int16_t x, int16_t y, int16_t w, int16_t h,
                           bool selected=false) {
  static const uint16_t accents[4] = {UI_ORANGE,UI_CYAN,UI_AMBER,UI_GREEN};
  char value[20], sub[24]; hubWidgetValue(g_widgets[slot],value,sizeof(value),sub,sizeof(sub));
  uiMetric(x,y,w,h,hubWidgetLabel(g_widgets[slot]),value,selected?UI_ORANGE:accents[slot],sub);
  if (selected) tft.drawRoundRect(x+2,y+2,w-4,h-4,9,UI_ORANGE);
}

static void drawTelemetryRail(int16_t y, const BambuState& s) {
  const int16_t W=tft.width();
  uiCard(8,y,W-16,60,UI_BORDER,false);
  const char* labels[4]={"NOZZLE","BED","CHAMBER","FAN"};
  char vals[4][12];
  snprintf(vals[0],sizeof(vals[0]),"%.0f°",s.nozzleTemp);
  snprintf(vals[1],sizeof(vals[1]),"%.0f°",s.bedTemp);
  snprintf(vals[2],sizeof(vals[2]),"%.0f°",s.chamberTemp);
  snprintf(vals[3],sizeof(vals[3]),"%u%%",(unsigned)s.coolingFanPct);
  const int16_t cell=(W-16)/4;
  for(uint8_t i=0;i<4;i++){
    if(i)tft.drawFastVLine(8+i*cell,y+9,42,UI_BORDER);
    int16_t cx=8+i*cell+cell/2;
    setFont(tft,FONT_SMALL);tft.setTextDatum(TC_DATUM);tft.setTextColor(UI_DIM,UI_PANEL);tft.drawString(labels[i],cx,y+9);
    setFont(tft,FONT_BODY);tft.setTextColor(i==0?UI_ORANGE:i==1?UI_AMBER:i==2?UI_BLUE:UI_CYAN,UI_PANEL);tft.drawString(vals[i],cx,y+31);
  }
}

static void drawAmsCompact(int16_t y, int16_t h, const BambuState& s) {
  const int16_t W=tft.width(); uiCard(8,y,W-16,h,UI_PURPLE,false); uiSectionLabel(18,y+8,"AMS / FILAMENT",UI_PURPLE);
  uint8_t trayCount=s.ams.present?s.ams.unitCount*4:0;if(trayCount>4)trayCount=4;
  if(!trayCount){setFont(tft,FONT_BODY);tft.setTextDatum(MC_DATUM);tft.setTextColor(UI_DIM,UI_PANEL);tft.drawString("No AMS data",W/2,y+h/2+8);return;}
  const int16_t cell=(W-28)/4; const int16_t cy=y+48;
  for(uint8_t i=0;i<4;i++){int16_t cx=20+cell/2+i*cell;if(i<trayCount&&s.ams.trays[i].present){const AmsTray& tr=s.ams.trays[i];uiSpool(cx,cy,tr.colorRgb565,tr.remain,s.ams.activeTray==i);uiSpoolCaption(cx,cy+27,tr.type,tr.remain);}else{tft.drawCircle(cx,cy,18,UI_BORDER);setFont(tft,FONT_SMALL);tft.setTextDatum(MC_DATUM);tft.setTextColor(UI_MUTED,UI_PANEL);tft.drawString("—",cx,cy);}}
}

'''
    t=insert_before(t,'static void drawHome(bool full) {\n',widget_helpers,'hub/widget-helpers')

    home=r'''static void drawHome(bool full) {
  static bool initialized=false; static uint32_t prevSig=0xffffffffu;
  const bool configured=isAnyPrinterConfigured(); const int16_t W=tft.width();
  uint32_t sig=configured?uiAmsSignature(displayedPrinter().state):0;
  if(configured){const BambuState&s=displayedPrinter().state;sig^=((uint32_t)s.progress<<24)^((uint32_t)s.layerNum<<8)^s.remainingMinutes;sig^=(uint32_t)((int)s.nozzleTemp*13+(int)s.bedTemp*17+(int)s.chamberTemp*19+s.coolingFanPct*23+s.wifiSignal);}
  if(!full&&initialized&&sig==prevSig&&!g_dirty)return;
  tft.fillScreen(UI_BG);
  if(!configured){drawHeader("HOME",WiFi.status()==WL_CONNECTED?"READY":"SETUP",0);uiBottomNav(0,nullptr);uiCard(10,50,W-20,360,UI_ORANGE,true);uiPrinterArt(58,92,204,145,UI_ORANGE);setFont(tft,FONT_LARGE);tft.setTextDatum(MC_DATUM);tft.setTextColor(UI_TEXT,UI_PANEL);tft.drawString("READY FOR A PRINTER",W/2,262);setFont(tft,FONT_SMALL);tft.setTextColor(UI_DIM,UI_PANEL);tft.drawString("Open the web portal and scan your LAN",W/2,294);String ip=WiFi.status()==WL_CONNECTED?WiFi.localIP().toString():String("WiFi setup required");setFont(tft,FONT_BODY);tft.setTextColor(WiFi.status()==WL_CONNECTED?UI_GREEN:UI_AMBER,UI_PANEL);tft.drawString(ip,W/2,325);hubMarkFrameDirty();initialized=true;prevSig=sig;g_dirty=false;return;}
  const PrinterSlot&p=displayedPrinter();const BambuState&s=p.state;const uint16_t stateColor=uiStateColor(s);
  drawHeader("HOME",s.printing?"PRINTING":(s.connected?"ONLINE":"OFFLINE"),0);uiBottomNav(0,nullptr);
  uiCard(8,43,W-16,156,UI_ORANGE,true);char name[24],job[34];uiCopyShort(name,sizeof(name),p.config.name[0]?p.config.name:"Bambu printer",20);uiCopyShort(job,sizeof(job),jobDisplayName(s),29);setFont(tft,FONT_BODY);tft.setTextDatum(TL_DATUM);tft.setTextColor(UI_TEXT,UI_PANEL);tft.drawString(name,20,54);uiPill(W-88,50,68,stateText(s),stateColor);setFont(tft,FONT_SMALL);tft.setTextColor(UI_DIM,UI_PANEL);tft.drawString(job,20,80);uiPrinterArtFamily(24,99,112,76,stateColor,p);uiProgressRing(248,125,46,s.progress,UI_ORANGE);char pct[10];snprintf(pct,sizeof(pct),"%u%%",(unsigned)s.progress);setFont(tft,FONT_LARGE);tft.setTextDatum(MC_DATUM);tft.setTextColor(UI_TEXT,UI_PANEL);tft.drawString(pct,248,121);char rem[18],ly[20];formatDuration(s.remainingMinutes,rem,sizeof(rem));snprintf(ly,sizeof(ly),"L%u / %u",(unsigned)s.layerNum,(unsigned)s.totalLayers);setFont(tft,FONT_SMALL);tft.setTextDatum(BL_DATUM);tft.setTextColor(UI_DIM,UI_PANEL);tft.drawString("ETA",20,188);tft.setTextColor(UI_TEXT,UI_PANEL);tft.drawString(rem,50,188);tft.setTextDatum(BR_DATUM);tft.setTextColor(UI_DIM,UI_PANEL);tft.drawString(ly,W-20,188);
  drawTelemetryRail(207,s);drawAmsCompact(275,110,s);
  uiPanelFill(8,393,W-16,31);char strip[64];snprintf(strip,sizeof(strip),"WiFi %d dBm   •   %s   •   %u alert%s",(int)s.wifiSignal,uiSpeedText(s.speedLevel),(unsigned)uiHmsCount(s),uiHmsCount(s)==1?"":"s");setFont(tft,FONT_SMALL);tft.setTextDatum(MC_DATUM);tft.setTextColor(uiHmsCount(s)?UI_AMBER:UI_GREEN,UI_PANEL_2);tft.drawString(strip,W/2,408);
  hubMarkFrameDirty();initialized=true;prevSig=sig;g_dirty=false;
}

'''
    t=rb(t,'static void drawHome(bool full) {\n','static void drawWorkshop(bool full) {\n',home+'static void drawWorkshop(bool full) {\n','hub/home-v97')

    workshop_body=r'''static void drawWorkshop(bool full) {
  (void)full; const int16_t W=tft.width(); tft.fillScreen(UI_BG); drawHeader("WORKSHOP",isAnyPrinterConfigured()?"READY":"SETUP",2); uiBottomNav(2,nullptr);
  if(!isAnyPrinterConfigured()){uiCard(10,50,W-20,350,UI_BLUE,true);setFont(tft,FONT_LARGE);tft.setTextDatum(MC_DATUM);tft.setTextColor(UI_TEXT,UI_PANEL);tft.drawString("WORKSHOP",W/2,130);setFont(tft,FONT_BODY);tft.setTextColor(UI_DIM,UI_PANEL);tft.drawString("Connect a printer to unlock tools",W/2,165);uiPrinterArt(62,200,196,130,UI_BLUE);hubMarkFrameDirty();g_dirty=false;return;}
  const PrinterSlot&p=displayedPrinter();const BambuState&s=p.state;const int16_t gap=8,cw=(W-16-gap)/2;
  uiCard(8,47,cw,96,UI_ORANGE,false);uiSectionLabel(18,56,"PRINT",UI_ORANGE);char pct[12],rem[18],line[26];snprintf(pct,sizeof(pct),"%u%%",(unsigned)s.progress);formatDuration(s.remainingMinutes,rem,sizeof(rem));setFont(tft,FONT_LARGE);tft.setTextDatum(TL_DATUM);tft.setTextColor(UI_ORANGE,UI_PANEL);tft.drawString(pct,18,80);setFont(tft,FONT_SMALL);tft.setTextColor(UI_DIM,UI_PANEL);snprintf(line,sizeof(line),"ETA %s",rem);tft.drawString(line,18,113);snprintf(line,sizeof(line),"Layer %u/%u",(unsigned)s.layerNum,(unsigned)s.totalLayers);tft.drawString(line,18,128);
  const int16_t rx=8+cw+gap;uiCard(rx,47,cw,96,UI_CYAN,false);uiSectionLabel(rx+10,56,"ENVIRONMENT",UI_CYAN);char env[20];snprintf(env,sizeof(env),"%.0f°C",s.chamberTemp);setFont(tft,FONT_LARGE);tft.setTextDatum(TL_DATUM);tft.setTextColor(UI_BLUE,UI_PANEL);tft.drawString(env,rx+10,80);setFont(tft,FONT_SMALL);tft.setTextColor(UI_DIM,UI_PANEL);snprintf(env,sizeof(env),"Fan %u%%",(unsigned)s.coolingFanPct);tft.drawString(env,rx+10,113);snprintf(env,sizeof(env),"WiFi %d dBm",(int)s.wifiSignal);tft.drawString(env,rx+10,128);
  drawAmsCompact(151,120,s);
  uiCard(8,279,W-16,145,UI_GREEN,false);uiSectionLabel(18,288,"QUICK ACTIONS",UI_GREEN);const int16_t bw=(W-42)/2;uiActionButton(18,316,bw,42,s.lightState==1?"LIGHT OFF":"LIGHT ON",UI_AMBER);uiActionButton(24+bw,316,bw,42,"CUSTOM",UI_PURPLE);uiActionButton(18,368,bw,42,"SYSTEM",UI_BLUE);uiActionButton(24+bw,368,bw,42,"CLASSIC",UI_MUTED);
  hubMarkFrameDirty();g_dirty=false;
}

'''
    t=rb(t,'static void drawWorkshop(bool full) {\n','static void drawCustom(bool full) {\n',workshop_body+'static void drawCustom(bool full) {\n','hub/workshop-v97')

    custom_body=r'''static void drawCustom(bool full) {
  (void)full; const int16_t W=tft.width(); tft.fillScreen(UI_BG); drawHeader("CUSTOM",g_widgetEditMode?"EDIT MODE":(g_custom.valid?"LIVE FEED":"FALLBACK"),3); uiBottomNav(3,nullptr);
  const bool useFeed=g_cfg.customUrl[0]&&g_custom.valid&&!g_widgetEditMode;
  if(useFeed){uiCard(8,45,W-16,78,UI_PURPLE,true);setFont(tft,FONT_LARGE);tft.setTextDatum(TL_DATUM);tft.setTextColor(UI_TEXT,UI_PANEL);char title[30];uiCopyShort(title,sizeof(title),g_custom.title,25);tft.drawString(title,20,57);setFont(tft,FONT_SMALL);tft.setTextColor(UI_DIM,UI_PANEL);char sub[42];uiCopyShort(sub,sizeof(sub),g_custom.subtitle,38);tft.drawString(sub,20,90);uiPill(220,93,80,g_custom.healthy?"LIVE":"FEED",g_custom.healthy?UI_GREEN:UI_AMBER);const uint16_t accents[4]={UI_CYAN,UI_ORANGE,UI_GREEN,UI_PURPLE};const int16_t gap=8,margin=8,cardW=(W-margin*2-gap)/2,cardH=112,top=132;for(uint8_t i=0;i<4;i++){int16_t x=margin+(i%2)*(cardW+gap),y=top+(i/2)*(cardH+gap);const char* label=i<g_custom.metricCount?g_custom.metrics[i].label:"WIDGET";const char* value=i<g_custom.metricCount?g_custom.metrics[i].value:"—";uiMetric(x,y,cardW,cardH,label,value,accents[i],"custom feed");}uiPanelFill(8,365,W-16,56);setFont(tft,FONT_SMALL);tft.setTextDatum(MC_DATUM);tft.setTextColor(UI_GREEN,UI_PANEL_2);tft.drawString("Custom feed healthy • long-press to edit fallback",W/2,393);}else{uiCard(8,45,W-16,70,g_cfg.customUrl[0]?UI_AMBER:UI_PURPLE,true);setFont(tft,FONT_BODY);tft.setTextDatum(TL_DATUM);tft.setTextColor(UI_TEXT,UI_PANEL);tft.drawString(g_widgetEditMode?"EDIT MY WIDGETS":"MY WIDGETS",20,58);setFont(tft,FONT_SMALL);tft.setTextColor(g_cfg.customUrl[0]?UI_AMBER:UI_DIM,UI_PANEL);tft.drawString(g_cfg.customUrl[0]?"Custom feed offline • fallback remains live":"Long-press anywhere here to customize",20,88);const int16_t gap=8,margin=8,cardW=(W-margin*2-gap)/2,cardH=116,top=124;for(uint8_t i=0;i<4;i++){int16_t x=margin+(i%2)*(cardW+gap),y=top+(i/2)*(cardH+gap);drawWidgetCard(i,x,y,cardW,cardH,g_widgetEditMode&&i==g_widgetSelected);}uiPanelFill(8,365,W-16,56);setFont(tft,FONT_SMALL);tft.setTextDatum(MC_DATUM);tft.setTextColor(g_widgetEditMode?UI_ORANGE:UI_DIM,UI_PANEL_2);tft.drawString(g_widgetEditMode?"Tap a tile to cycle • long-press Done":"Fallback deck stays useful if the feed fails",W/2,393);}
  hubMarkFrameDirty();g_dirty=false;
}

'''
    t=rb(t,'static void drawCustom(bool full) {\n','static void drawSystem(bool full) {\n',custom_body+'static void drawSystem(bool full) {\n','hub/custom-v97')

    system_and_extra=r'''static void drawPrinter(bool full) {
  (void)full; const int16_t W=tft.width(); tft.fillScreen(UI_BG); drawHeader("PRINTER",isAnyPrinterConfigured()?stateText(displayedPrinter().state):"SETUP",1); uiBottomNav(1,nullptr);
  if(!isAnyPrinterConfigured()){uiCard(10,50,W-20,360,UI_ORANGE,true);uiPrinterArt(62,95,196,145,UI_ORANGE);setFont(tft,FONT_LARGE);tft.setTextDatum(MC_DATUM);tft.setTextColor(UI_TEXT,UI_PANEL);tft.drawString("NO PRINTER YET",W/2,270);setFont(tft,FONT_SMALL);tft.setTextColor(UI_DIM,UI_PANEL);tft.drawString("Configure from the web Printer workspace",W/2,304);hubMarkFrameDirty();g_dirty=false;return;}
  const PrinterSlot&p=displayedPrinter();const BambuState&s=p.state;const uint16_t sc=uiStateColor(s);char name[24],job[34];uiCopyShort(name,sizeof(name),p.config.name[0]?p.config.name:"Bambu printer",20);uiCopyShort(job,sizeof(job),jobDisplayName(s),29);
  uiCard(8,43,W-16,166,sc,true);setFont(tft,FONT_BODY);tft.setTextDatum(TL_DATUM);tft.setTextColor(UI_TEXT,UI_PANEL);tft.drawString(name,20,55);uiPill(W-88,51,68,stateText(s),sc);setFont(tft,FONT_SMALL);tft.setTextColor(UI_DIM,UI_PANEL);tft.drawString(job,20,82);uiPrinterArtFamily(24,104,105,72,sc,p);uiProgressRing(242,132,50,s.progress,UI_ORANGE);char pct[10];snprintf(pct,sizeof(pct),"%u%%",(unsigned)s.progress);setFont(tft,FONT_LARGE);tft.setTextDatum(MC_DATUM);tft.setTextColor(UI_TEXT,UI_PANEL);tft.drawString(pct,242,128);char rem[18];formatDuration(s.remainingMinutes,rem,sizeof(rem));setFont(tft,FONT_SMALL);tft.setTextColor(UI_DIM,UI_PANEL);tft.drawString(rem,242,160);char layer[20];snprintf(layer,sizeof(layer),"Layer %u/%u",(unsigned)s.layerNum,(unsigned)s.totalLayers);tft.drawString(layer,242,180);
  drawTelemetryRail(217,s);drawAmsCompact(285,102,s);uiActionButton(18,395,132,30,s.lightState==1?"LIGHT OFF":"LIGHT ON",UI_AMBER);uiActionButton(170,395,132,30,"CLASSIC DETAILS",UI_MUTED);
  hubMarkFrameDirty();g_dirty=false;
}

static void drawMore(bool full) {
  (void)full; const int16_t W=tft.width(); tft.fillScreen(UI_BG); drawHeader("MORE","TOOLS & SETTINGS",3); uiBottomNav(3,nullptr);const int16_t gap=10,m=10,cw=(W-2*m-gap)/2,ch=116;
  const char* titles[4]={"CUSTOM","SYSTEM","EDIT WIDGETS","CLASSIC PRINTER"};const char* subs[4]={"Personal dashboard","Device & recovery","On-device layout","Full legacy surface"};const uint16_t colors[4]={UI_PURPLE,UI_BLUE,UI_ORANGE,UI_MUTED};
  for(uint8_t i=0;i<4;i++){int16_t x=m+(i%2)*(cw+gap),y=52+(i/2)*(ch+10);uiCard(x,y,cw,ch,colors[i],false);tft.fillCircle(x+24,y+27,11,colors[i]);setFont(tft,FONT_BODY);tft.setTextDatum(TL_DATUM);tft.setTextColor(UI_TEXT,UI_PANEL);tft.drawString(titles[i],x+14,y+52);setFont(tft,FONT_SMALL);tft.setTextColor(UI_DIM,UI_PANEL);tft.drawString(subs[i],x+14,y+78);tft.setTextColor(colors[i],UI_PANEL);tft.drawString("OPEN ›",x+14,y+98);}
  uiPanelFill(10,310,W-20,105);setFont(tft,FONT_SMALL);tft.setTextDatum(TL_DATUM);tft.setTextColor(UI_DIM,UI_PANEL_2);tft.drawString("DEVICE",20,322);setFont(tft,FONT_BODY);tft.setTextColor(UI_TEXT,UI_PANEL_2);tft.drawString("Smart Home v9.7 Interaction",20,344);setFont(tft,FONT_SMALL);tft.setTextColor(recoveryWebReady()?UI_GREEN:UI_AMBER,UI_PANEL_2);tft.drawString(recoveryWebReady()?"Recovery ready":"Recovery starting",20,371);tft.setTextColor(UI_DIM,UI_PANEL_2);String ip=WiFi.status()==WL_CONNECTED?WiFi.localIP().toString():String("No IP");tft.drawString(ip,20,394);
  hubMarkFrameDirty();g_dirty=false;
}

static void drawSystem(bool full) {
  (void)full; const int16_t W=tft.width();tft.fillScreen(UI_BG);drawHeader("SYSTEM",recoveryWebReady()?"HEALTHY":"CHECK",3);uiBottomNav(3,nullptr);
  const bool wifi=WiFi.status()==WL_CONNECTED;uiCard(8,47,W-16,82,wifi?UI_GREEN:UI_RED,true);uiWifiGlyph(20,63,wifi?WiFi.RSSI():-100);setFont(tft,FONT_BODY);tft.setTextDatum(TL_DATUM);tft.setTextColor(UI_TEXT,UI_PANEL);tft.drawString("Network",58,58);uiPill(214,54,86,wifi?"CONNECTED":"OFFLINE",wifi?UI_GREEN:UI_RED);setFont(tft,FONT_SMALL);tft.setTextColor(UI_DIM,UI_PANEL);String ip=wifi?WiFi.localIP().toString():String("No IP address");tft.drawString(ip,20,101);if(wifi){char r[20];snprintf(r,sizeof(r),"%d dBm",WiFi.RSSI());tft.setTextDatum(TR_DATUM);tft.drawString(r,W-20,101);}
  uiCard(8,139,W-16,82,UI_CYAN,false);uiSectionLabel(18,149,"DEVICE",UI_CYAN);uint32_t mins=millis()/60000UL;char up[24];snprintf(up,sizeof(up),"Uptime %uh %02um",(unsigned)(mins/60),(unsigned)(mins%60));setFont(tft,FONT_BODY);tft.setTextDatum(TL_DATUM);tft.setTextColor(UI_TEXT,UI_PANEL);tft.drawString("Waveshare WS350",18,173);setFont(tft,FONT_SMALL);tft.setTextColor(UI_DIM,UI_PANEL);tft.drawString(up,18,200);tft.setTextDatum(TR_DATUM);tft.drawString("Touch FT6336",W-18,200);
  uiCard(8,231,W-16,82,UI_PURPLE,false);uiSectionLabel(18,241,"UPDATE & RECOVERY",UI_PURPLE);setFont(tft,FONT_BODY);tft.setTextDatum(TL_DATUM);tft.setTextColor(UI_TEXT,UI_PANEL);tft.drawString("Smart Home v9.7",18,265);setFont(tft,FONT_SMALL);tft.setTextColor(recoveryWebReady()?UI_GREEN:UI_AMBER,UI_PANEL);tft.drawString(recoveryWebReady()?"Recovery console ready":"Recovery console starting",18,292);tft.setTextDatum(TR_DATUM);tft.setTextColor(UI_DIM,UI_PANEL);tft.drawString(recoveryCurrentSlot(),W-18,292);
  uiCard(8,323,W-16,92,UI_BLUE,false);uiSectionLabel(18,333,"DIAGNOSTICS",UI_BLUE);const uint32_t freeHeap=ESP.getFreeHeap()/1024,psram=ESP.getFreePsram()/1024;const bool healthy=freeHeap>60&&psram>256;setFont(tft,FONT_LARGE);tft.setTextDatum(TL_DATUM);tft.setTextColor(healthy?UI_GREEN:UI_AMBER,UI_PANEL);tft.drawString(healthy?"Healthy":"Watch",18,360);setFont(tft,FONT_SMALL);tft.setTextColor(UI_DIM,UI_PANEL);char diag[48];snprintf(diag,sizeof(diag),"Memory %u KB • PSRAM %u KB",(unsigned)freeHeap,(unsigned)psram);tft.drawString(diag,18,393);tft.setTextDatum(TR_DATUM);tft.setTextColor(UI_BLUE,UI_PANEL);tft.drawString("details in web Diagnostics",W-18,393);
  hubMarkFrameDirty();g_dirty=false;
}

'''
    t=rb(t,'static void drawSystem(bool full) {\n','\n} // namespace\n',system_and_extra+'\n} // namespace\n','hub/system-printer-more-v97')

    old='''bool smartHubIsScreen(ScreenState screen) {\n  return screen == SCREEN_HUB_HOME ||\n         screen == SCREEN_HUB_WORKSHOP ||\n         screen == SCREEN_HUB_CUSTOM ||\n         screen == SCREEN_HUB_SYSTEM;\n}'''
    new='''bool smartHubIsScreen(ScreenState screen) {\n  return screen == SCREEN_HUB_HOME ||\n         screen == SCREEN_HUB_PRINTER ||\n         screen == SCREEN_HUB_WORKSHOP ||\n         screen == SCREEN_HUB_MORE ||\n         screen == SCREEN_HUB_CUSTOM ||\n         screen == SCREEN_HUB_SYSTEM;\n}\n\nbool smartHubIsNativePrinterScreen(ScreenState screen) {\n  return screen == SCREEN_HUB_PRINTER;\n}'''
    t=ro(t,old,new,'hub/is-screen-v97')
    t=ro(t,'bool smartHubShouldYieldToPrinter(bool printing) {\n  if (!g_cfg.enabled || !printing || g_cfg.returnSeconds == 0) return false;',
         'bool smartHubShouldYieldToPrinter(bool printing) {\n  if (getScreenState() == SCREEN_HUB_PRINTER) return false;\n  if (!g_cfg.enabled || !printing || g_cfg.returnSeconds == 0) return false;','hub/native-printer-sticky')

    t=rb(t,'void smartHubAdvance() {\n','void smartHubReturnToPrinter() {\n',r'''void smartHubAdvance() {
  if (!g_cfg.enabled) { smartHubReturnToPrinter(); return; }
  switch (getScreenState()) {
    case SCREEN_HUB_HOME:     setPage(SCREEN_HUB_PRINTER);  break;
    case SCREEN_HUB_PRINTER:  setPage(SCREEN_HUB_WORKSHOP); break;
    case SCREEN_HUB_WORKSHOP: setPage(SCREEN_HUB_MORE);     break;
    case SCREEN_HUB_MORE:
    case SCREEN_HUB_CUSTOM:
    case SCREEN_HUB_SYSTEM:   setPage(SCREEN_HUB_HOME);     break;
    default:                   setPage(SCREEN_HUB_HOME);     break;
  }
}

void smartHubReturnToPrinter() {
''','hub/advance-v97')

    t=rb(t,'bool smartHubShowPage(const char* pageName) {\n','void smartHubDraw(ScreenState screen, bool forceRedraw) {\n',r'''bool smartHubShowPage(const char* pageName) {
  if (!pageName) return false;
  if (strcmp(pageName, "legacy-printer") == 0) { smartHubReturnToPrinter(); return true; }
  if (!g_cfg.enabled) return false;
  if (strcmp(pageName, "home") == 0) { setPage(SCREEN_HUB_HOME); return true; }
  if (strcmp(pageName, "printer") == 0) { setPage(SCREEN_HUB_PRINTER); return true; }
  if (strcmp(pageName, "workshop") == 0) { setPage(SCREEN_HUB_WORKSHOP); return true; }
  if (strcmp(pageName, "more") == 0) { setPage(SCREEN_HUB_MORE); return true; }
  if (strcmp(pageName, "custom") == 0) { setPage(SCREEN_HUB_CUSTOM); return true; }
  if (strcmp(pageName, "system") == 0) { setPage(SCREEN_HUB_SYSTEM); return true; }
  return false;
}

void smartHubDraw(ScreenState screen, bool forceRedraw) {
''','hub/show-page-v97')

    old='''    case SCREEN_HUB_HOME:     drawHome(effectiveForce);     break;\n    case SCREEN_HUB_WORKSHOP: drawWorkshop(effectiveForce); break;\n    case SCREEN_HUB_CUSTOM:   drawCustom(effectiveForce);   break;\n    case SCREEN_HUB_SYSTEM:   drawSystem(effectiveForce);   break;'''
    new='''    case SCREEN_HUB_HOME:     drawHome(effectiveForce);     break;\n    case SCREEN_HUB_PRINTER:  drawPrinter(effectiveForce);  break;\n    case SCREEN_HUB_WORKSHOP: drawWorkshop(effectiveForce); break;\n    case SCREEN_HUB_MORE:     drawMore(effectiveForce);     break;\n    case SCREEN_HUB_CUSTOM:   drawCustom(effectiveForce);   break;\n    case SCREEN_HUB_SYSTEM:   drawSystem(effectiveForce);   break;'''
    t=ro(t,old,new,'hub/draw-cases-v97')

    handler=r'''
static void mapHubTouch(uint16_t rawX, uint16_t rawY, int16_t& x, int16_t& y) {
  switch (dispSettings.rotation & 3) {
    case 1: x = (int16_t)rawY;       y = (int16_t)(319 - rawX); break;
    case 2: x = (int16_t)(319-rawX); y = (int16_t)(479 - rawY); break;
    case 3: x = (int16_t)(479-rawY); y = (int16_t)rawX; break;
    default:x = (int16_t)rawX;       y = (int16_t)rawY; break;
  }
  if (x < 0) x = 0; if (y < 0) y = 0;
  if (x >= tft.width()) x = tft.width() - 1;
  if (y >= tft.height()) y = tft.height() - 1;
}

bool smartHubHandleTouch(uint16_t rawX, uint16_t rawY, bool longPress) {
  if (!g_cfg.enabled || !smartHubIsScreen(getScreenState())) return false;
  int16_t x=0,y=0; mapHubTouch(rawX,rawY,x,y); const int16_t W=tft.width(),H=tft.height();
  ScreenState cur=getScreenState();
  if (longPress && cur==SCREEN_HUB_CUSTOM) {
    g_widgetEditMode=!g_widgetEditMode; g_widgetSelected=0; g_dirty=true; return true;
  }
  if (y >= H-48) {
    uint8_t n=(uint8_t)constrain((int)(x/(W/4)),0,3);
    if(n==0)setPage(SCREEN_HUB_HOME);else if(n==1)setPage(SCREEN_HUB_PRINTER);else if(n==2)setPage(SCREEN_HUB_WORKSHOP);else setPage(SCREEN_HUB_MORE);
    return true;
  }
  if(cur==SCREEN_HUB_CUSTOM && g_widgetEditMode && y>=124 && y<356){
    const int16_t gap=8,margin=8,cw=(W-margin*2-gap)/2,ch=116;
    int col=x>=margin+cw+gap?1:0,row=y>=124+ch+gap?1:0;uint8_t slot=(uint8_t)(row*2+col);if(slot<4){g_widgetSelected=slot;g_widgets[slot]=(uint8_t)((g_widgets[slot]+1)%HUB_W_COUNT);prefsSave();g_dirty=true;}return true;
  }
  if(cur==SCREEN_HUB_MORE){
    if(y>=52&&y<294){uint8_t col=x>=W/2?1:0,row=y>=178?1:0,slot=(uint8_t)(row*2+col);if(slot==0)setPage(SCREEN_HUB_CUSTOM);else if(slot==1)setPage(SCREEN_HUB_SYSTEM);else if(slot==2){g_widgetEditMode=true;g_widgetSelected=0;setPage(SCREEN_HUB_CUSTOM);}else smartHubReturnToPrinter();return true;}
  }
  if(cur==SCREEN_HUB_PRINTER && y>=390&&y<430){
    if(x<W/2 && isAnyPrinterConfigured()){BambuState&s=displayedPrinter().state;requestLightCommand(rotState.displayIndex,s.lightState!=1);g_dirty=true;}else if(x>=W/2)smartHubReturnToPrinter();return true;
  }
  if(cur==SCREEN_HUB_WORKSHOP && y>=310&&y<416){
    const bool left=x<W/2, top=y<363;if(top&&left&&isAnyPrinterConfigured()){BambuState&s=displayedPrinter().state;requestLightCommand(rotState.displayIndex,s.lightState!=1);g_dirty=true;}else if(top&&!left)setPage(SCREEN_HUB_CUSTOM);else if(!top&&left)setPage(SCREEN_HUB_SYSTEM);else smartHubReturnToPrinter();return true;
  }
  return true;
}

'''
    t=insert_before(t,'const SmartHubConfig& smartHubGetConfig() {\n',handler,'hub/touch-handler')

    if 'bool smartHubHandleTouch(uint16_t, uint16_t, bool)' not in t:
        t=t.replace('bool smartHubIsScreen(ScreenState) { return false; }\n',
                    'bool smartHubIsScreen(ScreenState) { return false; }\nbool smartHubIsNativePrinterScreen(ScreenState) { return false; }\nbool smartHubHandleTouch(uint16_t, uint16_t, bool) { return false; }\n',1)
    p.write_text(t)

# ---------------------------------------------------------------------------
# Browser v9.7 layout polish
# ---------------------------------------------------------------------------
def patch_browser(repo: Path):
    p=repo/'web'/'app.js'; t=p.read_text()
    addon=r'''

/* Smart Home v9.7 Interaction & Layout */
function v97FamilyFromName(name){name=String(name||'').toUpperCase();if(name.indexOf('H2')>=0||name.indexOf('X2')>=0)return 'h2';if(name.indexOf('A1 MINI')>=0)return 'a1mini';if(name.indexOf('A1')>=0)return 'a1';if(name.indexOf('P1')>=0)return 'p1';if(name.indexOf('X1')>=0)return 'x1';return 'generic'}
function v97ApplyPrinterFamily(){var art=v96ById('v97PrinterArt')||document.querySelector('.v96-printer-art');if(!art)return;var n=(v96ById('v96PrinterName')||{}).textContent||'';art.className='v96-printer-art v97-family-'+v97FamilyFromName(n)}
v96PrinterArt=function(){return '<div class="v96-printer-art v97-family-generic" id="v97PrinterArt" aria-hidden="true"><div class="v96-ams"><i class="v96-spool"></i><i class="v96-spool"></i><i class="v96-spool"></i><i class="v96-spool"></i></div><div class="v96-machine"><i class="v96-bed"></i><i class="v96-part"></i><i class="v97-tool-left"></i><i class="v97-tool-right"></i></div></div>'}
var v97BaseRefresh=v96RefreshPrinterWorkspace;v96RefreshPrinterWorkspace=function(){var r=v97BaseRefresh.apply(this,arguments);setTimeout(v97ApplyPrinterFamily,180);return r}
function v97UpgradePrinterWorkspace(){var root=v96ById('v96PrinterWorkspace');if(!root)return;var legacy=v96ById('v96LegacyPrinter');if(legacy){var health=v96FindCard(root,'Setup health');if(health)health.style.display='none';var display=v96ById('v96DisplayCards');if(display&&!v96ById('v97LegacyDisplay')){var details=document.createElement('details');details.id='v97LegacyDisplay';details.className='v97-legacy-display';details.innerHTML='<summary>Advanced display configuration</summary><p class="text-dim">Original BambuHelper profile and slot controls. The visual preview and Widget Library above are the primary experience.</p>';var profile=v96FindCard(root,'Remote monitor profile'),gauges=v96FindCard(root,'Gauge Layout');if(profile)details.appendChild(profile);if(gauges)details.appendChild(gauges);display.appendChild(details)}}v97ApplyPrinterFamily()}
setTimeout(v97UpgradePrinterWorkspace,650);setTimeout(v97UpgradePrinterWorkspace,1400);
'''
    if 'Smart Home v9.7 Interaction & Layout' not in t: t += addon
    p.write_text(t)

    p=repo/'web'/'app.css'; t=p.read_text()
    css=r'''

/* Smart Home v9.7 Interaction & Layout */
.v96-screen{width:min(100%,280px);max-width:280px;aspect-ratio:320/480;box-sizing:border-box;display:flex;flex-direction:column;justify-content:flex-start}
.v96-screen-grid{flex:0 0 auto}.v96-ready-preview{flex:0 0 auto}
.v96-live-grid{grid-template-columns:repeat(auto-fit,minmax(145px,1fr))}
.v96-printer-hero{grid-template-columns:minmax(0,1.45fr) minmax(190px,.55fr);padding:20px;min-height:150px}
.v96-printer-art{height:138px}.v96-machine{width:150px;height:108px}.v96-ams{width:132px;height:40px}.v96-spool{width:21px;height:21px}
.v97-legacy-display{margin-top:4px;border:1px solid var(--line);border-radius:14px;background:var(--bg-sub);padding:0 14px 14px}.v97-legacy-display>summary{cursor:pointer;padding:14px 2px;font-size:12px;font-weight:800;color:var(--text-mid)}.v97-legacy-display>p{margin:0 0 12px;font-size:11px}.v97-legacy-display>.card{margin-top:10px!important}
.v96-state{pointer-events:none}.v96-live-card{box-shadow:none}.v96-widget,.v96-preset,.v96-tab,.btn{transition:transform .12s ease,border-color .12s ease,background .12s ease}.v96-widget:active,.v96-preset:active,.v96-tab:active,.btn:active{transform:translateY(1px)}
.v97-family-a1 .v96-ams,.v97-family-a1mini .v96-ams{display:none}.v97-family-a1 .v96-machine,.v97-family-a1mini .v96-machine{background:transparent;border:0;box-shadow:none}.v97-family-a1 .v96-machine:before,.v97-family-a1mini .v96-machine:before{left:22px;right:22px;top:14px;bottom:16px;border:2px solid #4b5862;background:transparent;border-bottom:0}.v97-family-a1 .v96-machine:after,.v97-family-a1mini .v96-machine:after{right:70px;top:37px;width:20px;height:18px;border-color:#697984;background:#1b242b}.v97-family-a1mini .v96-machine{transform:scale(.82)}
.v97-tool-left,.v97-tool-right{display:none;position:absolute;width:7px;height:7px;border-radius:50%;top:50px}.v97-family-h2 .v97-tool-left,.v97-family-h2 .v97-tool-right{display:block}.v97-family-h2 .v97-tool-left{left:69px;background:#ef6a3b}.v97-family-h2 .v97-tool-right{left:82px;background:#43a7ff}.v97-family-h2 .v96-machine{width:165px}
@media(max-width:920px){.v96-printer-hero{grid-template-columns:1fr 110px;gap:12px}.v96-printer-art{display:flex;height:82px;transform:scale(.66);transform-origin:center}.v96-screen{width:min(100%,260px);max-width:260px}.v96-tabs{top:58px}}
@media(max-width:620px){.v96-printer-hero{grid-template-columns:1fr 58px}.v96-printer-art{height:56px;transform:scale(.42)}.v96-live-grid{grid-template-columns:repeat(auto-fit,minmax(125px,1fr))}.v96-screen{width:min(100%,240px);max-width:240px}}
'''
    if 'Smart Home v9.7 Interaction & Layout' not in t: t += css
    p.write_text(t)

def apply(repo: Path):
    patch_touch(repo)
    patch_headers_and_display(repo)
    patch_main(repo)
    patch_hub(repo)
    patch_browser(repo)

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--repo',required=True);ap.add_argument('--apply',action='store_true');args=ap.parse_args()
    if not args.apply: raise SystemExit('Pass --apply')
    apply(Path(args.repo));print('Smart Home v9.7 Interaction & Layout patch applied')
