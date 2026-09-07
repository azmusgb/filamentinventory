#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path


def fail(message: str) -> None:
    raise SystemExit(message)


def read(root: Path, rel: str) -> str:
    p = root / rel
    if not p.exists():
        fail(f"missing reconstructed source: {rel}")
    return p.read_text(encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    args = ap.parse_args()
    root = Path(args.repo).resolve()

    build = read(root, "include/smart_home_build.h")
    hub = read(root, "src/smart_hub.cpp")
    security = read(root, "src/security_manager.cpp")
    app = read(root, "web/app.js")

    required_build = (
        'SMART_HOME_VERSION "v11.23"',
        'SMART_HOME_BUILD_LABEL "Smart Home v11.23 Instrument UI Prototype"',
        'SMART_HOME_PROFILE "instrument-ui-prototype"',
        'WORKSHOP_OS_INSTRUMENT_UI_PROTOTYPE 1',
    )
    for needle in required_build:
        if needle not in build:
            fail(f"build identity invariant missing: {needle}")

    required_hub = (
        "Workshop Instrument UI v1 reference-synthesis prototype",
        "BambuState::progress",
        "Live printer state",
        "uiDisplaySettingCard",
        "hubRc2ButtonRef",
        "hubRc2CardRef",
        "STAGED - NOT APPLIED",
        "HOLD APPLY + RESTART",
        "PORTAL ACCESS",
        "securityPortalCode()",
    )
    for needle in required_hub:
        if needle not in hub:
            fail(f"visual/source invariant missing: {needle}")

    # The design applicator must not alter the v11.23 secure boundary.
    combined = build + "\n" + security + "\n" + app
    for forbidden in (
        "WORKSHOP_OS_TEMP_LAN_OPEN",
        "TEMPORARY TRUSTED-LAN MODE",
        "if (!isAPMode()) return true;",
        "v1123Rc2LanOpenBanner",
    ):
        if forbidden in combined:
            fail(f"forbidden security regression present: {forbidden}")

    # The System credential surface is intentionally left in place because the
    # physical capture helper redacts a known region. A redesign must update the
    # redaction contract in a separate hardware-facing change.
    if hub.count("securityPortalCode()") < 1:
        fail("portal-code renderer unexpectedly removed")

    print("Workshop Instrument UI v1 source contract: PASS")
    print("NOTE: source validation is not native build, runtime validation, or WS350 physical acceptance")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
