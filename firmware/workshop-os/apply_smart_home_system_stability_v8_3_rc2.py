#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path


class PatchError(RuntimeError):
    pass


def replace_once(text: str, old: str, new: str, name: str) -> str:
    count = text.count(old)
    if count != 1:
        raise PatchError(f"{name}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)


def apply(repo: Path) -> None:
    """Eliminate the physical WS350 System-screen blink found during v8.3 acceptance.

    v7.2 stabilized Workshop, but System still cleared the entire 320x480 TFT
    whenever its periodic renderer ran. On the physical Waveshare panel this
    presents as a visible blink/rolling blank frame. System telemetry does not
    need sub-second refresh, so keep the static frame resident and repaint only
    the metric cards/text every five seconds.
    """
    p = repo / "src" / "smart_hub.cpp"
    text = p.read_text(encoding="utf-8")

    old = '''static void drawSystem(bool full) {
  static unsigned long lastDraw = 0;
  if (!full && !g_dirty && millis() - lastDraw < 1000) return;
  lastDraw = millis();

  tft.fillScreen(dispSettings.bgColor);
  drawHeader("SYSTEM", "Smart Home v8.3", 3);
'''

    new = '''static void drawSystem(bool full) {
  // v8.3 RC2 physical-display stability fix. System used to clear the whole
  // WS350 every refresh, creating a visible blank-frame blink. Draw the static
  // frame only when the page is entered, then repaint cards/text in place.
  static unsigned long lastDraw = 0;
  const unsigned long now = millis();
  if (!full && lastDraw != 0 && now - lastDraw < 5000) return;
  const bool fullRedraw = full || lastDraw == 0;
  lastDraw = now;

  if (fullRedraw) {
    tft.fillScreen(dispSettings.bgColor);
    drawHeader("SYSTEM", "Smart Home v8.3", 3);
  }
'''

    text = replace_once(text, old, new, "System full-frame redraw removal")

    # Defensive contracts: the old one-second full-screen pattern must not
    # survive, and the new resident-frame behavior must be present.
    forbidden = [
        'if (!full && !g_dirty && millis() - lastDraw < 1000) return;',
        'lastDraw = millis();\n\n  tft.fillScreen(dispSettings.bgColor);\n  drawHeader("SYSTEM", "Smart Home v8.3", 3);',
    ]
    for needle in forbidden:
        if needle in text:
            raise PatchError(f"System stability validation failed: old redraw path remains: {needle}")

    required = [
        'if (!full && lastDraw != 0 && now - lastDraw < 5000) return;',
        'const bool fullRedraw = full || lastDraw == 0;',
        'if (fullRedraw) {',
        'drawHeader("SYSTEM", "Smart Home v8.3", 3);',
    ]
    for needle in required:
        if needle not in text:
            raise PatchError(f"System stability validation failed: missing {needle}")

    marker = '// BambuHelper display stability evolution v7.2'
    rc2_marker = '// Smart Home v8.3 RC2 System display stability fix'
    if rc2_marker not in text:
        if marker in text:
            text = text.replace(marker, marker + '\n' + rc2_marker, 1)
        else:
            text = rc2_marker + '\n' + text

    p.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Apply Smart Home v8.3 RC2 System-screen stability fix")
    ap.add_argument("--repo", required=True)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if not args.apply:
        raise SystemExit("Pass --apply")
    apply(Path(args.repo))
    print("Smart Home v8.3 RC2 System display stability fix applied")
