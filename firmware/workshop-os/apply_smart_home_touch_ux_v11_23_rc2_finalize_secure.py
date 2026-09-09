#!/usr/bin/env python3
"""Run v11.23 RC2 physical-touch finalization on the secure touch base.

The historical finalizer keys off the old RC2 marker string.  This compatibility
wrapper swaps only that inert comment marker long enough to run the finalizer,
then restores the secure marker.  It never enables the historical LAN bypass.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import apply_smart_home_touch_ux_v11_23_rc2 as legacy_touch
import apply_smart_home_touch_ux_v11_23_rc2_finalize as legacy_finalize

SAFE_MARKER = "Workshop OS v11.23 RC2 secure touch UX"
LEGACY_MARKER = legacy_touch.MARKER
FINAL_MARKER = legacy_finalize.MARKER


def fail(message: str) -> None:
    raise SystemExit(message)


def assert_secure(repo: Path) -> None:
    build = (repo / "include" / "smart_home_build.h").read_text(encoding="utf-8")
    security = (repo / "src" / "security_manager.cpp").read_text(encoding="utf-8")
    app = (repo / "web" / "app.js").read_text(encoding="utf-8")
    for forbidden in (
        "WORKSHOP_OS_TEMP_LAN_OPEN",
        "if (!isAPMode()) return true;",
        "TEMPORARY TRUSTED-LAN MODE",
        "v1123Rc2LanOpenBanner",
    ):
        if forbidden in build + security + app:
            fail(f"secure RC2 finalizer found forbidden marker: {forbidden}")


def apply(repo: Path) -> None:
    hub_path = repo / "src" / "smart_hub.cpp"
    if not hub_path.exists():
        fail(f"missing reconstructed source: {hub_path}")

    hub = hub_path.read_text(encoding="utf-8")
    if FINAL_MARKER in hub:
        if LEGACY_MARKER in hub:
            hub = hub.replace(LEGACY_MARKER, SAFE_MARKER)
            hub_path.write_text(hub, encoding="utf-8")
        assert_secure(repo)
        print("v11.23 RC2 secure physical touch finalization already applied")
        return
    if SAFE_MARKER not in hub:
        fail("secure RC2 touch base marker missing")

    # Compatibility marker only: no build flag, auth bypass, or browser banner
    # is ever introduced.  The legacy finalizer checks this exact comment.
    hub_path.write_text(hub.replace(SAFE_MARKER, LEGACY_MARKER), encoding="utf-8")
    try:
        legacy_finalize.apply(repo)
    finally:
        current = hub_path.read_text(encoding="utf-8")
        current = current.replace(LEGACY_MARKER, SAFE_MARKER)
        hub_path.write_text(current, encoding="utf-8")

    assert_secure(repo)
    if FINAL_MARKER not in hub_path.read_text(encoding="utf-8"):
        fail("secure RC2 physical-touch finalization marker missing")
    print("Workshop OS v11.23 RC2 secure physical touch finalization applied")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if not args.apply:
        fail("refusing to modify source without --apply")
    apply(Path(args.repo).resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
