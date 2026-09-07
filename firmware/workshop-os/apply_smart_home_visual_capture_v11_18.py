#!/usr/bin/env python3
from pathlib import Path
import argparse


class PatchError(RuntimeError):
    pass


def load(root: Path, rel: str) -> str:
    p = root / rel
    if not p.exists():
        raise PatchError(f"missing {rel}")
    return p.read_text(encoding="utf-8")


def save(root: Path, rel: str, text: str) -> None:
    (root / rel).write_text(text, encoding="utf-8")


def once(text: str, old: str, new: str, label: str) -> str:
    n = text.count(old)
    if n != 1:
        raise PatchError(f"{label}: expected one anchor, found {n}")
    return text.replace(old, new, 1)


def replace_between(text: str, start: str, end: str, replacement: str, label: str) -> str:
    a = text.find(start)
    b = text.find(end, a + len(start)) if a >= 0 else -1
    if a < 0 or b < 0:
        raise PatchError(f"{label}: boundary missing")
    return text[:a] + replacement + text[b:]


SHOW_AND_CAPTURE = r'''bool smartHubShowPage(const char* pageName) {
  if (!pageName) return false;
  if (strcmp(pageName, "legacy-printer") == 0) { smartHubReturnToPrinter(); return true; }
  if (!g_cfg.enabled) return false;

  if (strcmp(pageName, "home") == 0) { setPage(SCREEN_HUB_HOME); return true; }
  if (strcmp(pageName, "printer") == 0) { setPage(SCREEN_HUB_PRINTER); return true; }
  if (strcmp(pageName, "workshop") == 0) { setPage(SCREEN_HUB_WORKSHOP); return true; }

  if (strcmp(pageName, "more") == 0) {
    setPage(SCREEN_HUB_MORE);
    g_toolsView = false;
    g_displayExperienceView = false;
    g_displayExperiencePage = 0;
    g_dirty = true;
    return true;
  }

  if (strcmp(pageName, "tools") == 0) {
    setPage(SCREEN_HUB_MORE);
    g_displayExperienceView = false;
    g_displayExperiencePage = 0;
    g_toolsView = true;
    g_dirty = true;
    return true;
  }

  static const char* const kDisplayPages[] = {
    "display-quick", "display-schedule", "display-behavior",
    "display-visual", "display-clock", "display-alerts", "display-signals"
  };
  for (uint8_t i = 0; i < 7; ++i) {
    if (strcmp(pageName, kDisplayPages[i]) == 0 ||
        (i == 0 && strcmp(pageName, "display") == 0)) {
      setPage(SCREEN_HUB_MORE);
      g_toolsView = false;
      g_displayExperienceView = true;
      g_displayExperiencePage = i;
      g_dirty = true;
      return true;
    }
  }

  if (strcmp(pageName, "custom") == 0) { setPage(SCREEN_HUB_CUSTOM); return true; }

  if (strcmp(pageName, "system") == 0) {
    setPage(SCREEN_HUB_SYSTEM);
    g_networkSettingsView = false;
    g_audioSettingsView = false;
    g_audioSettingsPage = 0;
    g_dirty = true;
    return true;
  }

  if (strcmp(pageName, "system-network") == 0) {
    setPage(SCREEN_HUB_SYSTEM);
    g_audioSettingsView = false;
    g_audioSettingsPage = 0;
    g_networkSettingsView = true;
    g_dirty = true;
    return true;
  }

  static const char* const kHardwarePages[] = {
    "hardware-sound", "hardware-cooldown", "hardware-led",
    "hardware-finish", "hardware-error", "hardware-power", "hardware-auto-off"
  };
  for (uint8_t i = 0; i < 7; ++i) {
    if (strcmp(pageName, kHardwarePages[i]) == 0) {
      setPage(SCREEN_HUB_SYSTEM);
      g_networkSettingsView = false;
      g_audioSettingsView = true;
      g_audioSettingsPage = i;
      g_dirty = true;
      return true;
    }
  }

  return false;
}

// Prepare a pixel-accurate capture from the same 16-bit PSRAM sprite that is
// committed to the physical LCD. Calling this forces the requested view to be
// fully composed before the web server streams it.
bool smartHubCapturePrepare(uint16_t* width, uint16_t* height) {
  if (!g_cfg.enabled) return false;
  smartHubDraw(getScreenState(), true);
  if (!g_hubFrame || !g_hubFrame->getBuffer() || g_hubFrameW <= 0 || g_hubFrameH <= 0)
    return false;
  if (width) *width = (uint16_t)g_hubFrameW;
  if (height) *height = (uint16_t)g_hubFrameH;
  return true;
}

// Convert one sprite row from its logical RGB565 pixels to RGB888. readPixel()
// deliberately returns standard RGB565 regardless of the sprite's internal
// byte order, so the capture stays correct if LovyanGFX storage details change.
bool smartHubCaptureRgbRow(uint16_t y, uint8_t* out, size_t outLen) {
  if (!out || !g_hubFrame || !g_hubFrame->getBuffer()) return false;
  if (y >= (uint16_t)g_hubFrameH) return false;
  const size_t need = (size_t)g_hubFrameW * 3U;
  if (outLen < need) return false;

  for (int16_t x = 0; x < g_hubFrameW; ++x) {
    const uint16_t c = g_hubFrame->readPixel(x, (int16_t)y);
    const uint8_t r5 = (uint8_t)((c >> 11) & 0x1F);
    const uint8_t g6 = (uint8_t)((c >> 5) & 0x3F);
    const uint8_t b5 = (uint8_t)(c & 0x1F);
    out[(size_t)x * 3U + 0U] = (uint8_t)((r5 << 3) | (r5 >> 2));
    out[(size_t)x * 3U + 1U] = (uint8_t)((g6 << 2) | (g6 >> 4));
    out[(size_t)x * 3U + 2U] = (uint8_t)((b5 << 3) | (b5 >> 2));
  }
  return true;
}

'''


WEB_CAPTURE = r'''
// ---------------------------------------------------------------------------
// Workshop OS physical-view capture (v11.18)
// ---------------------------------------------------------------------------
extern bool smartHubCapturePrepare(uint16_t* width, uint16_t* height);
extern bool smartHubCaptureRgbRow(uint16_t y, uint8_t* out, size_t outLen);

static void handleHubViews() {
  // Deterministic physical navigation/capture order. These IDs are accepted by
  // /hub/show and are intentionally separate from human-facing labels.
  static const char kCatalog[] = R"json({"version":1,"views":[
    {"id":"home","label":"Home","group":"Primary"},
    {"id":"printer","label":"Printer","group":"Primary"},
    {"id":"workshop","label":"Workshop","group":"Primary"},
    {"id":"more","label":"More","group":"Primary"},
    {"id":"custom","label":"Custom","group":"Primary"},
    {"id":"system","label":"System","group":"Primary"},
    {"id":"tools","label":"Tools","group":"More"},
    {"id":"display-quick","label":"Display - Quick","group":"Display"},
    {"id":"display-schedule","label":"Display - Schedule","group":"Display"},
    {"id":"display-behavior","label":"Display - Behavior","group":"Display"},
    {"id":"display-visual","label":"Display - Visual","group":"Display"},
    {"id":"display-clock","label":"Display - Clock","group":"Display"},
    {"id":"display-alerts","label":"Display - Alerts","group":"Display"},
    {"id":"display-signals","label":"Display - Signals","group":"Display"},
    {"id":"system-network","label":"Network Essentials","group":"System"},
    {"id":"hardware-sound","label":"Hardware - Sound","group":"Hardware"},
    {"id":"hardware-cooldown","label":"Hardware - Cooldown","group":"Hardware"},
    {"id":"hardware-led","label":"Hardware - LED","group":"Hardware"},
    {"id":"hardware-finish","label":"Hardware - Finish","group":"Hardware"},
    {"id":"hardware-error","label":"Hardware - Error","group":"Hardware"},
    {"id":"hardware-power","label":"Hardware - Power","group":"Hardware"},
    {"id":"hardware-auto-off","label":"Hardware - Auto Off","group":"Hardware"}
  ]})json";
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json", kCatalog);
}

static void handleHubFramePpm() {
  uint16_t w = 0, h = 0;
  if (!smartHubCapturePrepare(&w, &h) || w == 0 || h == 0) {
    server.send(503, "application/json",
                "{\"status\":\"error\",\"message\":\"Physical framebuffer is unavailable\"}");
    return;
  }

  // The validated WS350 landscape framebuffer is 480x320. Keep this bounded
  // so an accidental future geometry change fails closed rather than overruns.
  if (w > 480 || h > 480) {
    server.send(500, "application/json",
                "{\"status\":\"error\",\"message\":\"Unexpected framebuffer geometry\"}");
    return;
  }

  char ppmHeader[40];
  const int headerLen = snprintf(ppmHeader, sizeof(ppmHeader),
                                 "P6\n%u %u\n255\n",
                                 (unsigned)w, (unsigned)h);
  if (headerLen <= 0 || headerLen >= (int)sizeof(ppmHeader)) {
    server.send(500, "application/json", "{\"status\":\"error\"}");
    return;
  }

  const size_t rowBytes = (size_t)w * 3U;
  const size_t totalBytes = (size_t)headerLen + rowBytes * (size_t)h;
  static uint8_t row[480U * 3U];

  server.sendHeader("Cache-Control", "no-store");
  server.sendHeader("X-BambuHelper-Capture", "lcd-framebuffer-rgb888");
  server.sendHeader("X-BambuHelper-Width", String((unsigned)w));
  server.sendHeader("X-BambuHelper-Height", String((unsigned)h));
  server.sendHeader("Content-Disposition", "inline; filename=\"bambuhelper-frame.ppm\"");
  server.setContentLength(totalBytes);
  server.send(200, "image/x-portable-pixmap", "");
  server.sendContent(ppmHeader, (size_t)headerLen);

  for (uint16_t y = 0; y < h; ++y) {
    if (!smartHubCaptureRgbRow(y, row, sizeof(row))) return;
    server.sendContent((const char*)row, rowBytes);
  }
}

'''


def patch(root: Path) -> None:
    rel = "include/smart_home_build.h"
    t = load(root, rel)
    t = once(t, '#define SMART_HOME_VERSION "v11.17"',
             '#define SMART_HOME_VERSION "v11.18"', 'version')
    t = once(t, '#define SMART_HOME_PROFILE "power-automation"',
             '#define SMART_HOME_PROFILE "visual-capture"', 'profile')
    t = once(t, '#define SMART_HOME_BUILD_LABEL "Smart Home v11.17 Power Automation RC1"',
             '#define SMART_HOME_BUILD_LABEL "Smart Home v11.18 Visual Capture RC1"', 'build label')
    save(root, rel, t)

    rel = "src/smart_hub.cpp"
    t = load(root, rel)
    t = replace_between(t,
                        'bool smartHubShowPage(const char* pageName) {',
                        'void smartHubDraw(ScreenState screen, bool forceRedraw) {',
                        SHOW_AND_CAPTURE,
                        'show page + capture API')

    stub_anchor = 'bool smartHubShowPage(const char*) { return false; }\nvoid smartHubDraw(ScreenState, bool) {}'
    stub_new = ('bool smartHubShowPage(const char*) { return false; }\n'
                'bool smartHubCapturePrepare(uint16_t*, uint16_t*) { return false; }\n'
                'bool smartHubCaptureRgbRow(uint16_t, uint8_t*, size_t) { return false; }\n'
                'void smartHubDraw(ScreenState, bool) {}')
    t = once(t, stub_anchor, stub_new, 'non-WS350 capture stubs')
    save(root, rel, t)

    rel = "src/web_server.cpp"
    t = load(root, rel)
    handler_anchor = 'static void handleHubTimerStatus(){'
    t = once(t, handler_anchor, WEB_CAPTURE + handler_anchor, 'capture handlers')
    route_anchor = '  SECURE_POST("/hub/show", handleHubShow);\n'
    route_new = (route_anchor +
                 '  SECURE_GET("/hub/views", handleHubViews);\n'
                 '  SECURE_GET("/hub/frame.ppm", handleHubFramePpm);\n')
    t = once(t, route_anchor, route_new, 'capture routes')
    save(root, rel, t)

    checks = {
        "include/smart_home_build.h": [
            'SMART_HOME_VERSION "v11.18"',
            'SMART_HOME_PROFILE "visual-capture"',
            'Smart Home v11.18 Visual Capture RC1',
        ],
        "src/smart_hub.cpp": [
            'display-signals', 'system-network', 'hardware-auto-off',
            'smartHubCapturePrepare', 'smartHubCaptureRgbRow',
            'g_hubFrame->readPixel',
        ],
        "src/web_server.cpp": [
            'handleHubViews', 'handleHubFramePpm',
            'SECURE_GET("/hub/views", handleHubViews)',
            'SECURE_GET("/hub/frame.ppm", handleHubFramePpm)',
            'X-BambuHelper-Capture',
        ],
    }
    for check_rel, needles in checks.items():
        body = load(root, check_rel)
        for needle in needles:
            if needle not in body:
                raise PatchError(f"{check_rel}: missing {needle}")


def main() -> int:
    ap = argparse.ArgumentParser(description="Apply Workshop OS v11.18 visual capture")
    ap.add_argument("--repo", required=True, help="Reconstructed BambuHelper source tree")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if not args.apply:
        raise SystemExit("Pass --apply")
    patch(Path(args.repo))
    print("Smart Home v11.18 Visual Capture RC1 applied")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
