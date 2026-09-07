#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path


def need(body: str, marker: str, label: str) -> None:
    if marker not in body:
        raise SystemExit(f"V11.23 AUTH RESTORE FAILED: missing {label}: {marker}")


def forbid(body: str, marker: str, label: str) -> None:
    if marker in body:
        raise SystemExit(f"V11.23 AUTH RESTORE FAILED: forbidden {label}: {marker}")


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit(f"Usage: {sys.argv[0]} <reconstructed-repo>")
    repo = Path(sys.argv[1]).resolve()
    build = (repo / "include/smart_home_build.h").read_text(encoding="utf-8", errors="replace")
    security = (repo / "src/security_manager.cpp").read_text(encoding="utf-8", errors="replace")
    web = (repo / "src/web_server.cpp").read_text(encoding="utf-8", errors="replace")
    app = (repo / "web/app.js").read_text(encoding="utf-8", errors="replace")

    for marker in [
        'SMART_HOME_VERSION "v11.23"',
        'Smart Home v11.23 Network Locale Layout RC2',
        'Workshop OS v11.23 RC2 authenticated LAN restore',
    ]:
        need(build, marker, "release/auth identity")

    for marker in [
        "bool securitySessionValid(WebServer& server)",
        "ensureInitialized();",
        "return cookieMatches(server);",
        "if (mutating && !sameOrigin(server))",
        "static bool apPublicRouteAllowed(WebServer& server)",
    ]:
        need(security, marker, "authenticated security policy")

    for marker in [
        "WORKSHOP_OS_TEMP_LAN_OPEN",
        "if (!isAPMode()) return true;",
        "TEMPORARY TRUSTED-LAN MODE",
        "v1123Rc2LanOpenBanner",
    ]:
        forbid(build + security + app, marker, "trusted-LAN bypass")

    for marker in [
        'SECURE_GET("/", handleRoot)',
        'SECURE_POST("/printer/control", handlePrinterControl)',
        'SECURE_GET("/hub/views", handleHubViews)',
        'SECURE_GET("/hub/frame.ppm", handleHubFramePpm)',
        'SECURE_POST("/hub/show", handleHubShow)',
    ]:
        need(web, marker, "centralized protected route")

    print("v11.23 RC2 authenticated LAN restore: PASS")
    print("Normal Wi-Fi portal session: REQUIRED")
    print("Same-origin mutation guard: PRESERVED")
    print("AP/recovery route scoping: PRESERVED")
    print("Temporary trusted-LAN bypass: ABSENT")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
