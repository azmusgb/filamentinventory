#!/usr/bin/env python3
from pathlib import Path
import argparse


class PatchError(RuntimeError):
    pass


def replace_once(text: str, old: str, new: str, name: str) -> str:
    count = text.count(old)
    if count != 1:
        raise PatchError(f"{name}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)


def patch_display_header(repo: Path) -> None:
    """Pre-seed v9.7 Hub states without depending on enum line formatting.

    Historical Smart Home patch layers have emitted both one-entry-per-line and
    compact enum formatting. v9.7 needs two additional states, and inserting
    them here lets the later interaction patch remain deterministic regardless
    of which historical representation produced display_ui.h.
    """
    p = repo / "src" / "display_ui.h"
    text = p.read_text(encoding="utf-8")
    if "SCREEN_HUB_PRINTER" in text:
        return
    needle = "SCREEN_HUB_SYSTEM"
    count = text.count(needle)
    if count != 1:
        raise PatchError(
            f"display/header-v97-states: expected exactly 1 {needle}, found {count}"
        )
    pos = text.find(needle) + len(needle)
    text = (
        text[:pos]
        + ", SCREEN_HUB_PRINTER, SCREEN_HUB_MORE"
        + text[pos:]
    )
    p.write_text(text, encoding="utf-8")


def patch_smart_hub(repo: Path) -> None:
    p = repo / "src" / "smart_hub.cpp"
    text = p.read_text(encoding="utf-8")

    text = replace_once(
        text,
        "#include <math.h>\n",
        "#include <math.h>\n#include <new>\n",
        "smart-hub/new-include",
    )

    # Existing v9.5 renderers call markFrameDirty() only when they actually
    # paint. Route those calls through a local dirty bit so the framebuffer is
    # pushed only when something changed instead of on every display tick.
    dirty_count = text.count("markFrameDirty();")
    if dirty_count < 4:
        raise PatchError(
            f"smart-hub/dirty-sites: expected >=4 existing marks, found {dirty_count}"
        )
    text = text.replace("markFrameDirty();", "hubMarkFrameDirty();")

    anchor = "static const uint16_t UI_CYAN_BG  = 0x0966;\n"
    helper = r'''

// Smart Home v9.6.1 zero-blip compositor.
//
// WS350 normally draws directly to the ST7796. A page transition therefore
// exposes the background clear and then every card/label as it is painted.
// Render Smart Home into a 16-bit PSRAM sprite first and commit the complete
// frame to the panel only after drawing finishes. The previous page stays
// visible during composition, eliminating the blank/intermediate frame.
static lgfx::LovyanGFX* g_hubPanelCanvas = nullptr;
static lgfx::LGFX_Sprite* g_hubFrame = nullptr;
static int16_t g_hubFrameW = 0;
static int16_t g_hubFrameH = 0;
static bool g_hubFrameDirty = true;
static bool g_hubFramePrimed = false;

static bool hubEnsureFrame() {
  if (!g_hubPanelCanvas) g_hubPanelCanvas = tft_ptr;
  if (!g_hubPanelCanvas) return false;

  const int16_t w = (int16_t)g_hubPanelCanvas->width();
  const int16_t h = (int16_t)g_hubPanelCanvas->height();
  if (w <= 0 || h <= 0) return false;

  if (g_hubFrame && g_hubFrameW == w && g_hubFrameH == h &&
      g_hubFrame->getBuffer()) {
    return true;
  }

  if (g_hubFrame) {
    g_hubFrame->deleteSprite();
    delete g_hubFrame;
    g_hubFrame = nullptr;
  }

  g_hubFrame = new (std::nothrow) lgfx::LGFX_Sprite(g_hubPanelCanvas);
  if (!g_hubFrame) return false;
  g_hubFrame->setPsram(true);
  g_hubFrame->setColorDepth(16);
  if (!g_hubFrame->createSprite(w, h)) {
    delete g_hubFrame;
    g_hubFrame = nullptr;
    return false;
  }

  g_hubFrameW = w;
  g_hubFrameH = h;
  g_hubFrame->fillScreen(UI_BG);
  g_hubFrameDirty = true;
  g_hubFramePrimed = false;
  return true;
}

static inline void hubMarkFrameDirty() {
  g_hubFrameDirty = true;
  markFrameDirty();
}

static void hubCommitFrame() {
  if (!g_hubFrame || !g_hubFrame->getBuffer()) return;
  g_hubFrame->pushSprite(0, 0);
  g_hubFrameDirty = false;
  g_hubFramePrimed = true;
}
'''
    text = replace_once(
        text,
        anchor,
        anchor + helper,
        "smart-hub/framebuffer-helper",
    )

    old_draw = '''void smartHubDraw(ScreenState screen, bool forceRedraw) {
  if (!g_cfg.enabled) return;
  switch (screen) {
    case SCREEN_HUB_HOME:     drawHome(forceRedraw);     break;
    case SCREEN_HUB_WORKSHOP: drawWorkshop(forceRedraw); break;
    case SCREEN_HUB_CUSTOM:   drawCustom(forceRedraw);   break;
    case SCREEN_HUB_SYSTEM:   drawSystem(forceRedraw);   break;
    default: break;
  }
}
'''
    new_draw = '''void smartHubDraw(ScreenState screen, bool forceRedraw) {
  if (!g_cfg.enabled) return;

  lgfx::LovyanGFX* panel = tft_ptr;
  const bool buffered = hubEnsureFrame();
  if (buffered) {
    panel = g_hubPanelCanvas;
    tft_ptr = g_hubFrame;
    g_hubFrameDirty = false;
  }

  const bool effectiveForce = forceRedraw || (buffered && !g_hubFramePrimed);
  switch (screen) {
    case SCREEN_HUB_HOME:     drawHome(effectiveForce);     break;
    case SCREEN_HUB_WORKSHOP: drawWorkshop(effectiveForce); break;
    case SCREEN_HUB_CUSTOM:   drawCustom(effectiveForce);   break;
    case SCREEN_HUB_SYSTEM:   drawSystem(effectiveForce);   break;
    default: break;
  }

  if (buffered) {
    // Restore the real panel before the sprite pushes to its parent device.
    tft_ptr = panel;
    if (g_hubFrameDirty || effectiveForce) {
      g_hubFrameDirty = true;
      hubCommitFrame();
    }
  }
}
'''
    text = replace_once(
        text,
        old_draw,
        new_draw,
        "smart-hub/buffered-draw",
    )

    p.write_text(text, encoding="utf-8")


def patch_display_ui(repo: Path) -> None:
    p = repo / "src" / "display_ui.cpp"
    text = p.read_text(encoding="utf-8")

    if '#include "smart_hub.h"' not in text:
        text = replace_once(
            text,
            '#include "display_ui.h"\n',
            '#include "display_ui.h"\n#include "smart_hub.h"\n',
            "display/smart-hub-include",
        )

    old = '''    tft.fillScreen(currentScreen == SCREEN_OFF ? TFT_BLACK : dispSettings.bgColor);
    markFrameDirty();
    forceRedraw = true;
'''
    new = '''    // Smart Home v9.6.1 zero-blip transition: buffered Smart Home pages
    // perform their clear off-screen. Do not blank the physical WS350 first.
    // The old page remains visible until smartHubDraw() commits the complete
    // replacement frame from PSRAM.
    if (!smartHubIsScreen(currentScreen)) {
      tft.fillScreen(currentScreen == SCREEN_OFF ? TFT_BLACK : dispSettings.bgColor);
      markFrameDirty();
    }
    forceRedraw = true;
'''
    text = replace_once(text, old, new, "display/screen-transition-preclear")

    p.write_text(text, encoding="utf-8")


def apply(repo: Path) -> None:
    patch_display_header(repo)
    patch_smart_hub(repo)
    patch_display_ui(repo)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if not args.apply:
        raise SystemExit("Pass --apply")
    apply(Path(args.repo))
    print("Smart Home v9.6.1 zero-blip framebuffer patch applied")
