#!/usr/bin/env python3
"""Fix UI13 declaration order without duplicating printer-power authority.

The historical `hubPowerConfigPlug()` implementation is intentionally retained.
UI13 renders Printer & Power before that implementation appears in the
translation unit, so provide only a forward declaration before the first UI13
use. No behavior or mapping semantics are changed.
"""
from __future__ import annotations

import argparse
from pathlib import Path


DECL = "static uint8_t hubPowerConfigPlug();\n\n"
ANCHOR = "static void drawUi13PrinterPower() {"


def apply(repo: Path) -> None:
    path = repo / "src" / "smart_hub.cpp"
    if not path.is_file():
        raise SystemExit(f"missing reconstructed source: {path}")
    text = path.read_text(encoding="utf-8")
    if '#define WORKSHOP_OS_V11_28_UI13 1' not in (repo / "include" / "smart_home_build.h").read_text(encoding="utf-8"):
        raise SystemExit("UI13 compile-order fix requires reconstructed v11.28 UI13 source")
    if text.count(ANCHOR) != 1:
        raise SystemExit(f"UI13 Printer & Power renderer anchor count={text.count(ANCHOR)}")
    before = text[:text.index(ANCHOR)]
    if "static uint8_t hubPowerConfigPlug();" not in before:
        text = text.replace(ANCHOR, DECL + ANCHOR, 1)
    if text.count("static uint8_t hubPowerConfigPlug() {") != 1:
        raise SystemExit("historical hubPowerConfigPlug implementation missing/non-unique")
    path.write_text(text, encoding="utf-8")
    print("Workshop OS UI13 printer-power declaration order fixed")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if not args.apply:
        raise SystemExit("refusing to modify source without --apply")
    apply(Path(args.repo).resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
