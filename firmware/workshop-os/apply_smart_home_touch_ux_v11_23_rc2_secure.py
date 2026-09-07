#!/usr/bin/env python3
"""Apply the v11.23 RC2 touch UX without ever enabling the historical LAN bypass.

The original RC2 iteration bundled two independent concerns: useful touch/layout
changes and a temporary trusted-LAN development bypass.  Final RC2 must never
reconstruct the latter.  This applicator deliberately reuses only the legacy
build-identity and smart-hub transformations, immediately removes the temporary
build flag/wording, and never invokes the legacy security/browser patchers.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import apply_smart_home_touch_ux_v11_23_rc2 as legacy

SAFE_MARKER = "Workshop OS v11.23 RC2 secure touch UX"
LEGACY_MARKER = legacy.MARKER
TEMP_DEFINE = "#define WORKSHOP_OS_TEMP_LAN_OPEN 1\n"


def fail(message: str) -> None:
    raise SystemExit(message)


def assert_secure(repo: Path) -> None:
    build = (repo / "include" / "smart_home_build.h").read_text(encoding="utf-8")
    security = (repo / "src" / "security_manager.cpp").read_text(encoding="utf-8")
    app = (repo / "web" / "app.js").read_text(encoding="utf-8")
    combined = build + security + app
    for forbidden in (
        "WORKSHOP_OS_TEMP_LAN_OPEN",
        "if (!isAPMode()) return true;",
        "TEMPORARY TRUSTED-LAN MODE",
        "v1123Rc2LanOpenBanner",
    ):
        if forbidden in combined:
            fail(f"secure RC2 touch applicator left forbidden marker: {forbidden}")


def patch_build(repo: Path) -> None:
    # Reuse only the RC1 -> RC2 identity/profile transformation.  The legacy
    # helper also writes the old temporary flag and marker, so remove both in
    # the same operation before any downstream source is built or validated.
    legacy.patch_build(repo)
    path = repo / "include" / "smart_home_build.h"
    text = path.read_text(encoding="utf-8")
    text = text.replace(TEMP_DEFINE, "")
    text = text.replace(LEGACY_MARKER, SAFE_MARKER)
    if '#define WORKSHOP_OS_RC2_TOUCH_UX 1' not in text:
        fail("secure RC2 build flag missing")
    path.write_text(text, encoding="utf-8")


def patch_hub(repo: Path) -> None:
    # patch_hub contains only the touch/layout changes.  Do not call the
    # legacy patch_security() or patch_browser() functions.
    legacy.patch_hub(repo)
    path = repo / "src" / "smart_hub.cpp"
    text = path.read_text(encoding="utf-8")
    text = text.replace(LEGACY_MARKER, SAFE_MARKER)
    path.write_text(text, encoding="utf-8")


def apply(repo: Path) -> None:
    build = repo / "include" / "smart_home_build.h"
    if not build.exists():
        fail(f"missing reconstructed source: {build}")
    text = build.read_text(encoding="utf-8")
    if SAFE_MARKER in text:
        assert_secure(repo)
        print("v11.23 RC2 secure touch UX already applied")
        return
    if 'SMART_HOME_BUILD_LABEL "Smart Home v11.23 Network Locale Layout RC1"' not in text:
        fail("secure v11.23 RC2 touch patch requires reconstructed v11.23 RC1 source")

    patch_build(repo)
    patch_hub(repo)
    assert_secure(repo)
    print("Workshop OS v11.23 RC2 secure touch UX applied")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=".")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if not args.apply:
        print("v11.23 RC2 secure touch UX patch ready. Use --apply to modify reconstructed source.")
        return 0
    apply(Path(args.repo).resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
