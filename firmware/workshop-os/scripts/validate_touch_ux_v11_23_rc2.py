#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

SAFE_MARKER = "Workshop OS v11.23 RC2 secure touch UX"
FINAL_MARKER = "Workshop OS v11.23 RC2 physical touch finalization"


def need(body: str, marker: str, label: str) -> None:
    if marker not in body:
        raise SystemExit(f"V11.23 RC2 TOUCH FAILED: missing {label}: {marker}")


def forbid(body: str, marker: str, label: str) -> None:
    if marker in body:
        raise SystemExit(f"V11.23 RC2 TOUCH FAILED: forbidden {label}: {marker}")


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit(f"Usage: {sys.argv[0]} <reconstructed-repo>")

    repo = Path(sys.argv[1]).resolve()
    hub = (repo / "src/smart_hub.cpp").read_text(encoding="utf-8", errors="replace")
    web = (repo / "src/web_server.cpp").read_text(encoding="utf-8", errors="replace")
    app = (repo / "web/app.js").read_text(encoding="utf-8", errors="replace")
    security = (repo / "src/security_manager.cpp").read_text(encoding="utf-8", errors="replace")
    build = (repo / "include/smart_home_build.h").read_text(encoding="utf-8", errors="replace")

    for marker in [
        'SMART_HOME_VERSION "v11.23"',
        'SMART_HOME_PROFILE "network-touch-ux"',
        'Smart Home v11.23 Network Locale Layout RC2',
        '#define WORKSHOP_OS_RC2_TOUCH_UX 1',
        SAFE_MARKER,
    ]:
        need(build, marker, "RC2 secure touch identity")

    need(hub, SAFE_MARKER, "secure touch implementation marker")
    for marker in [
        "hubRc2ButtonRef",
        "hubRc2CardRef",
        "hubRc2HitRef",
        "hubRc2PageIndicator",
        '"STAGED - NOT APPLIED"',
        '"< PREV"',
        '"NEXT >"',
        '"-10"',
        '"+10"',
        '"DISCARD"',
        '"HOLD APPLY + RESTART"',
        "hubNetworkDiscardEdit",
        "if(longPress&&hubStaticNetworkValid())hubCommitNetworkAndRestart()",
        "const bool hubRc2Reverse=(x<tft.width()/2)",
    ]:
        need(hub, marker, "touch UX")

    # Before finalization, rotation still uses the original guarded hold slot.
    # After finalization, that exact source is intentionally replaced by the
    # dedicated preview modal and Hold Commit flow. Validate the correct stage
    # instead of falsely requiring both mutually-exclusive representations.
    if FINAL_MARKER in hub:
        need(hub, "g_rotationPreviewMode", "finalized rotation preview")
        need(hub, '"HOLD TO COMMIT ROTATION"', "finalized guarded rotation")
        forbid(hub, "i==3&&longPress", "superseded direct rotation mutation")
    else:
        need(hub, "i==3&&longPress", "pre-finalization guarded rotation")
        need(hub, "HOLD TO ROTATE CLOCKWISE", "pre-finalization rotation copy")

    forbid(hub, "Tap next / hold previous", "hidden reverse gesture copy")
    forbid(hub, "Tap next / hold prev", "hidden reverse gesture copy")

    for marker in [
        'SECURE_GET("/", handleRoot)',
        'SECURE_POST("/printer/control", handlePrinterControl)',
        'SECURE_GET("/hub/views", handleHubViews)',
        'SECURE_GET("/hub/frame.ppm", handleHubFramePpm)',
        'SECURE_POST("/hub/show", handleHubShow)',
    ]:
        need(web, marker, "centralized route wrapper")

    # Authentication is an invariant at every active reconstruction stage.
    combined = build + security + app
    for marker in [
        "WORKSHOP_OS_TEMP_LAN_OPEN",
        "if (!isAPMode()) return true;",
        "TEMPORARY TRUSTED-LAN MODE",
        "v1123Rc2LanOpenBanner",
    ]:
        forbid(combined, marker, "historical trusted-LAN bypass")
    need(security, "return cookieMatches(server);", "portal session validation")
    need(security, "if (mutating && !sameOrigin(server))", "same-origin mutation guard")

    for marker in ["requestSpeedCommand", "requestFanCommand"]:
        forbid(hub, marker, "speculative printer command")

    stage = "finalized" if FINAL_MARKER in hub else "touch-base"
    print(f"v11.23 RC2 secure touch UX contract: PASS ({stage})")
    print("Touch UX: explicit navigation + explicit increment/decrement controls")
    print("Network staging: visible NOT APPLIED state + Back / Discard / guarded Apply")
    print("Security: authenticated v11.20 boundary preserved throughout reconstruction")
    print("Historical trusted-LAN bypass: ABSENT")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
