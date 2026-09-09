#!/usr/bin/env python3
"""Validate final Workshop OS UI13 product-finish invariants."""
from __future__ import annotations

import argparse
from pathlib import Path


def need(text: str, marker: str, label: str) -> None:
    if marker not in text:
        raise SystemExit(f"MISSING {label}: {marker}")


def forbid(text: str, marker: str, label: str) -> None:
    if marker in text:
        raise SystemExit(f"FORBIDDEN {label}: {marker}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    args = ap.parse_args()
    repo = Path(args.repo).resolve()

    build = (repo / "include" / "smart_home_build.h").read_text(encoding="utf-8")
    hub = (repo / "src" / "smart_hub.cpp").read_text(encoding="utf-8")

    need(build, '#define WORKSHOP_OS_V11_28_UI13 1', "UI13 build identity")

    # Finger-first geometry: routine landscape controls expose at least a 48 px
    # hit target even when their visual chrome is inset within the row.
    for marker in (
        'return hubLandscape()?hr(8,214,112,48):hr(8,366,112,48);',
        'return hubLandscape()?hr(W-188,214,180,48):hr(W-188,366,180,48);',
        'return hr(r.x+r.w-236,r.y,52,r.h);',
        'return hr(r.x+r.w-60,r.y,52,r.h);',
        'return hr(r.x+r.w-96,r.y,96,r.h);',
        'uiDrawFit(value,r.x+r.w-178,r.y+r.h/2,112,FONT_BODY,MC_DATUM,C10_TEXT,C10_SURFACE);',
    ):
        need(hub, marker, "48px touch/value geometry")

    # Final state semantics are calm and meaningful across the product. A
    # disconnected printer/network is a warning/degraded condition, not a
    # destructive fault. Actual printer alerts may still use red.
    for marker in (
        'static uint16_t hubUi13HeaderStateColor',
        'return online?C10_GREEN:C10_ORANGE;',
        'strcmp(state,"Connected")==0',
        'strcmp(state,"Healthy")==0',
        'strcmp(state,"Ready")==0',
        'strcmp(state,"Offline")==0',
        'strcmp(state,"Check Device")==0',
        'strcmp(state,"Unknown")==0) return C10_MUTED;',
        'const uint16_t sc=!configured?C10_MUTED:(!online?C10_ORANGE:(alert?C10_RED:(paused?C10_ORANGE:(printing?C10_ACCENT:C10_GREEN))));',
        'const uint16_t sc=!s.connected?C10_ORANGE:(paused?C10_ORANGE:(s.printing?C10_ACCENT:C10_GREEN));',
        'hubV1125Card(r,s.connected?C10_GREEN:C10_ORANGE,false);',
    ):
        need(hub, marker, "semantic product state")
    for marker in (
        'const uint16_t c=right&&right[0]?C10_ACCENT:(online?C10_GREEN:C10_RED);',
        'const uint16_t sc=!s.connected?C10_RED:(paused?C10_ORANGE:(s.printing?C10_ACCENT:C10_GREEN));',
        'hubV1125Card(r,s.connected?C10_GREEN:C10_RED,false);',
    ):
        forbid(hub, marker, "legacy alarming disconnected state")

    # Product copy should read like a finished appliance, not an engineering
    # acceptance screen. Keep implementation language out of routine settings.
    for marker in (
        "Visible - / + controls",
        "Choose previous / next explicitly",
        "Master printer-error notification policy",
        "HMS UI is not supported on this board",
        "Preset delay before finish transition",
        "Address and plug type stay in Local Portal",
    ):
        forbid(hub, marker, "engineering copy on normal UI")
    for marker in (
        '"Feedback when you tap"',
        '"Make Workshop OS easy to find"',
        '"Manage mapping in Local Portal"',
        '"UI13 · pre-release build"',
    ):
        need(hub, marker, "finished product copy")

    # The compile-order repair must preserve one authoritative implementation.
    need(hub, "static uint8_t hubPowerConfigPlug();", "printer power forward declaration")
    if hub.count("static uint8_t hubPowerConfigPlug() {") != 1:
        raise SystemExit("hubPowerConfigPlug implementation must remain unique")

    # Product polish must not turn the pre-release Update surface into a fake
    # installer or blur the recovery/full-image boundary.
    need(hub, "On-device install is not enabled in this build", "truthful update capability")
    for marker in ("Install Now", "Download & Install"):
        forbid(hub, marker, "unsupported device-native installer")

    print("Workshop OS v11.28 UI13 product finish validation: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
