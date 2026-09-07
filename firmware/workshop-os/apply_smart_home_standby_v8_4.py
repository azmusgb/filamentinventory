#!/usr/bin/env python3
"""Apply the Smart Home v8.4 ambient Standby experience."""

from pathlib import Path
import argparse


class PatchError(RuntimeError):
    pass


STANDBY = r'''static uint8_t standbyLoadedTrayCount(const BambuState& s) {
  if (!s.ams.present) return 0;
  uint8_t units = s.ams.unitCount;
  if (units > 4) units = 4;
  uint8_t loaded = 0;
  for (uint8_t i = 0; i < units * 4; ++i) {
    if (s.ams.trays[i].present) ++loaded;
  }
  return loaded;
}

static void drawStandbyBadge(int16_t x, int16_t y, const char* text,
                             uint16_t color) {
  setFont(tft, FONT_SMALL);
  int16_t textW = tft.textWidth(text && *text ? text : "—");
  int16_t w = textW + 22;
  tft.fillRoundRect(x, y, w, 24, 12, dispSettings.trackColor);
  tft.fillCircle(x + 11, y + 12, 4, color);
  tft.setTextDatum(ML_DATUM);
  tft.setTextColor(CLR_TEXT, dispSettings.trackColor);
  tft.drawString(text && *text ? text : "—", x + 20, y + 12);
}

static void drawStandbyValue(int16_t x, int16_t y, const char* label,
                             const char* value, uint16_t color) {
  setFont(tft, FONT_SMALL);
  tft.setTextDatum(TL_DATUM);
  tft.setTextColor(CLR_TEXT_DIM, dispSettings.bgColor);
  tft.drawString(label, x, y);
  setFont(tft, FONT_BODY);
  tft.setTextColor(color, dispSettings.bgColor);
  tft.drawString(value && *value ? value : "—", x, y + 20);
}

static void drawHome(bool full) {
  static int lastMinute = -1;
  static bool frameDrawn = false;

  struct tm nowTm {};
  time_t now = time(nullptr);
  const bool synced = now > 1700000000;
  if (synced) localtime_r(&now, &nowTm);

  const int minuteKey = synced ? nowTm.tm_min : -1;
  if (!full && frameDrawn && minuteKey == lastMinute && !g_dirty) return;

  const bool fullRedraw = full || !frameDrawn;
  frameDrawn = true;
  lastMinute = minuteKey;

  if (fullRedraw) {
    tft.fillScreen(dispSettings.bgColor);
    drawHeader("STANDBY", "Smart Home v8.4", 0);

    // A quiet accent rail anchors the clock without animated visual noise.
    tft.fillRoundRect(16, 151, tft.width() - 32, 4, 2,
                      dispSettings.progress.value);
    drawTapHint("WORKSHOP");
  } else {
    // Preserve the header, accent rail and footer. Only changed regions repaint.
    tft.fillRect(0, 35, tft.width(), 114, dispSettings.bgColor);
    tft.fillRect(0, 164, tft.width(), tft.height() - 164 - 31,
                 dispSettings.bgColor);
  }

  char timeBuf[12] = "--:--";
  char periodBuf[4] = "";
  char dateBuf[32] = "WAITING FOR TIME";
  if (synced) {
    strftime(timeBuf, sizeof(timeBuf), "%I:%M", &nowTm);
    if (timeBuf[0] == '0') memmove(timeBuf, timeBuf + 1, strlen(timeBuf));
    strftime(periodBuf, sizeof(periodBuf), "%p", &nowTm);
    strftime(dateBuf, sizeof(dateBuf), "%A  ·  %B %d", &nowTm);
  }

  // Oversized time is the primary across-the-room information.
  setFont(tft, FONT_XLARGE);
  tft.setTextDatum(MC_DATUM);
  tft.setTextColor(dispSettings.clockTimeColor, dispSettings.bgColor);
  tft.drawString(timeBuf, tft.width() / 2 - 12, 81);

  setFont(tft, FONT_BODY);
  tft.setTextDatum(ML_DATUM);
  tft.setTextColor(dispSettings.clockDateColor, dispSettings.bgColor);
  tft.drawString(periodBuf, tft.width() - 55, 91);

  setFont(tft, FONT_SMALL);
  tft.setTextDatum(MC_DATUM);
  tft.setTextColor(CLR_TEXT_DIM, dispSettings.bgColor);
  tft.drawString(dateBuf, tft.width() / 2, 126);

  const int16_t x = 16;
  const int16_t y = 174;
  const int16_t w = tft.width() - 32;
  const int16_t h = 238;
  tft.fillRoundRect(x, y, w, h, 14, dispSettings.trackColor);
  tft.fillRoundRect(x + 1, y + 1, w - 2, h - 2, 13,
                    dispSettings.bgColor);

  if (!isAnyPrinterConfigured()) {
    drawStandbyBadge(x + 14, y + 14, "SETUP NEEDED",
                     dispSettings.etaColor);
    setFont(tft, FONT_LARGE);
    tft.setTextDatum(MC_DATUM);
    tft.setTextColor(CLR_TEXT, dispSettings.bgColor);
    tft.drawString("Make it yours", tft.width() / 2, y + 91);
    setFont(tft, FONT_BODY);
    tft.setTextColor(CLR_TEXT_DIM, dispSettings.bgColor);
    tft.drawString("Connect a Bambu printer", tft.width() / 2, y + 128);
    tft.drawString("from the local portal", tft.width() / 2, y + 154);
  } else {
    const PrinterSlot& p = displayedPrinter();
    const BambuState& s = p.state;
    const bool active = s.printing;
    const uint16_t stateColor = s.connected
        ? dispSettings.statusOkColor : CLR_TEXT_DIM;

    drawStandbyBadge(x + 14, y + 14,
                     active ? "PRINTING" : (s.connected ? "READY" : "OFFLINE"),
                     active ? dispSettings.progress.value : stateColor);

    setFont(tft, FONT_BODY);
    tft.setTextDatum(TR_DATUM);
    tft.setTextColor(dispSettings.printerNameColor, dispSettings.bgColor);
    tft.drawString(p.config.name[0] ? p.config.name : "Bambu printer",
                   x + w - 14, y + 26);

    if (active) {
      const char* job = jobDisplayName(s);
      setFont(tft, FONT_LARGE);
      tft.setTextDatum(TL_DATUM);
      tft.setTextColor(CLR_TEXT, dispSettings.bgColor);
      tft.drawString(job && *job ? job : "Active print", x + 14, y + 65);

      char pct[12];
      snprintf(pct, sizeof(pct), "%u%%", (unsigned)s.progress);
      setFont(tft, FONT_XLARGE);
      tft.setTextColor(dispSettings.progress.value, dispSettings.bgColor);
      tft.drawString(pct, x + 14, y + 101);
      drawProgressTrack(x + 14, y + 151, w - 28, s.progress);

      char remain[18];
      formatDuration(s.remainingMinutes, remain, sizeof(remain));
      drawStandbyValue(x + 14, y + 179, "REMAINING", remain,
                       dispSettings.etaColor);

      char layer[20];
      snprintf(layer, sizeof(layer), "%u / %u",
               (unsigned)s.layerNum, (unsigned)s.totalLayers);
      drawStandbyValue(x + 160, y + 179, "LAYER", layer,
                       dispSettings.nozzle.value);
    } else {
      setFont(tft, FONT_LARGE);
      tft.setTextDatum(TL_DATUM);
      tft.setTextColor(CLR_TEXT, dispSettings.bgColor);
      tft.drawString(s.connected ? "Ready to print" : "Printer unavailable",
                     x + 14, y + 71);

      setFont(tft, FONT_SMALL);
      tft.setTextColor(CLR_TEXT_DIM, dispSettings.bgColor);
      tft.drawString(s.connected
                         ? "Your workshop is standing by"
                         : "Check printer power and connection",
                     x + 14, y + 106);

      char ams[18];
      const uint8_t loaded = standbyLoadedTrayCount(s);
      if (s.ams.present)
        snprintf(ams, sizeof(ams), "%u loaded", (unsigned)loaded);
      else
        strlcpy(ams, "Not detected", sizeof(ams));

      char thermal[20];
      if (s.dualNozzle)
        snprintf(thermal, sizeof(thermal), "%.0f° / %.0f°",
                 s.nozzleTempN[1], s.nozzleTempN[0]);
      else
        snprintf(thermal, sizeof(thermal), "%.0f°", s.nozzleTemp);

      char wifi[18];
      if (WiFi.status() == WL_CONNECTED)
        snprintf(wifi, sizeof(wifi), "%d dBm", WiFi.RSSI());
      else
        strlcpy(wifi, "Offline", sizeof(wifi));

      drawStandbyValue(x + 14, y + 148, "AMS", ams,
                       dispSettings.progress.value);
      drawStandbyValue(x + 112, y + 148, "NOZZLE", thermal,
                       dispSettings.nozzle.value);
      drawStandbyValue(x + 210, y + 148, "WI-FI", wifi,
                       WiFi.status() == WL_CONNECTED
                           ? dispSettings.statusOkColor : CLR_TEXT_DIM);
    }
  }

  markFrameDirty();
  g_dirty = false;
}

'''


def replace_between(text: str, start: str, end: str,
                    replacement: str, name: str) -> str:
    a = text.find(start)
    if a < 0:
        raise PatchError(f"{name}: start anchor not found")
    b = text.find(end, a)
    if b < 0:
        raise PatchError(f"{name}: end anchor not found")
    return text[:a] + replacement + text[b:]


def apply(repo: Path) -> None:
    hub = repo / "src" / "smart_hub.cpp"
    text = hub.read_text(encoding="utf-8")
    if "// Smart Home v8.4 ambient Standby" in text:
        return

    text = replace_between(
        text,
        "static void drawHome(bool full) {",
        "static void drawWorkshop(bool full) {",
        STANDBY + "static void drawWorkshop(bool full) {",
        "ambient Standby renderer",
    )
    text = text.replace(
        "static void drawWorkshop(bool full) {static void drawWorkshop(bool full) {",
        "static void drawWorkshop(bool full) {",
        1,
    )
    text = text.replace(
        'drawHeader("SYSTEM", "Smart Home v8.3 RC3", 3);',
        'drawHeader("SYSTEM", "Smart Home v8.4 RC1", 3);',
    )
    text += "\n// Smart Home v8.4 ambient Standby\n"
    hub.write_text(text, encoding="utf-8")

    build = repo / "include" / "smart_home_build.h"
    build_text = build.read_text(encoding="utf-8")
    build_text = build_text.replace(
        '#define SMART_HOME_VERSION "v8.3"',
        '#define SMART_HOME_VERSION "v8.4"',
    ).replace(
        '#define SMART_HOME_BUILD_LABEL "Smart Home v8.3 RC3"',
        '#define SMART_HOME_BUILD_LABEL "Smart Home v8.4 RC1"',
    )
    build.write_text(build_text, encoding="utf-8")

    out = hub.read_text(encoding="utf-8")
    for required in [
        'drawHeader("STANDBY", "Smart Home v8.4", 0);',
        "Ready to print",
        "standbyLoadedTrayCount",
        "minuteKey == lastMinute",
        "Only changed regions repaint",
        'drawTapHint("WORKSHOP")',
        "Smart Home v8.4 RC1",
    ]:
        if required not in out:
            raise PatchError(f"Standby contract missing: {required}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if not args.apply:
        raise SystemExit("Pass --apply")
    apply(Path(args.repo))
    print("Smart Home v8.4 ambient Standby applied")
