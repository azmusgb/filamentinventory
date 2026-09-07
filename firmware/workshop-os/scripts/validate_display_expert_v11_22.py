#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

MARKER = "Smart Home v11.22 physical Display Expert controls"
NEW_VIEW_IDS = (
    "display-theme",
    "display-gauge-colors",
    "display-gauge-scales",
    "display-gauge-behavior",
    "display-glow",
    "display-layout",
    "display-extras",
)


def need(body: str, needle: str, label: str) -> None:
    if needle not in body:
        raise SystemExit(f"DISPLAY EXPERT CONTRACT FAILED: missing {label}: {needle}")


def block_between(text: str, start: str, end: str) -> str:
    a = text.find(start)
    if a < 0:
        raise SystemExit(f"DISPLAY EXPERT CONTRACT FAILED: start marker not found: {start}")
    b = text.find(end, a + len(start))
    if b < 0:
        raise SystemExit(f"DISPLAY EXPERT CONTRACT FAILED: end marker not found: {end}")
    return text[a:b]


def validate(repo: Path) -> None:
    hub_path = repo / "src" / "smart_hub.cpp"
    web_path = repo / "src" / "web_server.cpp"
    build_path = repo / "include" / "smart_home_build.h"
    for path in (hub_path, web_path, build_path):
        if not path.is_file():
            raise SystemExit(f"DISPLAY EXPERT CONTRACT FAILED: missing reconstructed source: {path}")

    hub = hub_path.read_text(encoding="utf-8", errors="replace")
    web = web_path.read_text(encoding="utf-8", errors="replace")
    build = build_path.read_text(encoding="utf-8", errors="replace")

    for n in (
        'SMART_HOME_VERSION "v11.22"',
        'SMART_HOME_PROFILE "display-expert"',
        'Smart Home v11.22 Display Expert RC1',
    ):
        need(build, n, "v11.22 build identity")

    need(hub, MARKER, "implementation marker")
    need(hub, "HUB_DISPLAY_PAGE_COUNT = 14", "14-page Display Experience")
    need(hub, "g_displayGaugeColorIndex", "gauge editor state")
    need(hub, "hubPersistDisplayExpert", "expert persistence path")

    for view_id in NEW_VIEW_IDS:
        need(hub, f'"{view_id}"', f"hub capture view {view_id}")
        need(web, f'\"id\":\"{view_id}\"', f"web capture catalog view {view_id}")

    required_hub = (
        '"THEME PALETTE"',
        "hubApplyThemePreset",
        "clockTimeColor=hubCycleExpertColor",
        "clockDateColor=hubCycleExpertColor",
        '"GAUGE COLORS"',
        "hubSelectedGaugeColors",
        "gc->arc=hubCycleExpertColor",
        "gc->label=hubCycleExpertColor",
        "gc->value=hubCycleExpertColor",
        '"NOZZLE SCALE"',
        "nozzleScaleMax=hubStepPreset16",
        "bedScaleMax=hubStepPreset16",
        "chamberScaleMax=hubStepPreset16",
        "powerScaleW=hubStepPreset16",
        '"SMOOTHING"',
        "gaugeSmoothing=",
        "warnThresholdPct=hubStepPreset",
        "warnColor=hubCycleExpertColor",
        '"GLOW MODE"',
        "glowMode=",
        "glowStyle=",
        "glowDuration=",
        "glowColor=hubCycleExpertColor",
        '"8-SLOT LANDSCAPE"',
        "landscape8Slots=!dispSettings.landscape8Slots",
        "portrait9Slots=!dispSettings.portrait9Slots",
        "splitEnabled=!rotState.splitEnabled",
        "splitForce=!rotState.splitForce",
        '"CLOCK INFO"',
        "showClockInfo=!dispSettings.showClockInfo",
        '"AMS TRAY TYPES"',
        "amsTrayTypes=!dispSettings.amsTrayTypes",
    )
    for marker in required_hub:
        need(hub, marker, "Display Expert behavior")

    expert = block_between(
        hub,
        f"// {MARKER}",
        "static void drawDisplayExperience(bool full)",
    )

    if "dispSettings.rotation" in expert:
        raise SystemExit(
            "DISPLAY EXPERT CONTRACT FAILED: v11.22 expert helper mutates display rotation; rotation belongs to v11.23"
        )
    for forbidden in ("requestSpeedCommand", "requestFanCommand"):
        if forbidden in hub or forbidden in web:
            raise SystemExit(
                f"DISPLAY EXPERT CONTRACT FAILED: speculative printer command introduced: {forbidden}"
            )

    need(hub, '"GAUGE LABELS", "PORTAL"', "portal-only gauge label boundary")
    need(hub, '"ROTATION", "v11.23"', "deferred rotation boundary")

    display_fn = block_between(
        hub,
        "static void drawDisplayExperience(bool full)",
        "static void drawMore(bool full)",
    )
    touch_fn = block_between(
        hub,
        "if(g_displayExperienceView){",
        "if(g_toolsView){",
    )
    if "gaugeLabels." in display_fn or "gaugeLabels." in touch_fn:
        raise SystemExit(
            "DISPLAY EXPERT CONTRACT FAILED: gauge label free-text mutation leaked into physical Display Expert surface"
        )

    print("Display Expert v11.22 reconstructed-source contract: PASS")
    print(f"Display Expert capture catalog: PASS ({len(NEW_VIEW_IDS)} new views; 29 total expected)")
    print("v11.23 rotation boundary: PASS")
    print("Portal-only gauge-label boundary: PASS")
    print("No speculative printer commands: PASS")


def main() -> int:
    ap = argparse.ArgumentParser(description="Validate Workshop OS v11.22 Display Expert RC1.")
    ap.add_argument("repo", help="Reconstructed BambuHelper source root")
    args = ap.parse_args()
    validate(Path(args.repo).resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
