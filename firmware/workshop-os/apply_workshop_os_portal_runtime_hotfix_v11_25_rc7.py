#!/usr/bin/env python3
"""RC7 portal runtime hotfix.

Fixes three browser-side defects observed during physical RC7 acceptance:
1. gauge UI can read _profileCaps before capabilities are populated;
2. dashboard editor can call HH_WIDGET_IDS.slice() before widget IDs exist;
3. Safari can reject the compact ranged portal-code pattern despite a valid code.

The server remains authoritative for portal-code authentication. This patch does
not weaken authentication, session, same-origin, recovery, or command guards.
"""
from __future__ import annotations

import argparse
from pathlib import Path


class PatchError(RuntimeError):
    pass


def load(path: Path) -> str:
    if not path.exists():
        raise PatchError(f"missing {path}")
    return path.read_text(encoding="utf-8")


def replace_required(text: str, old: str, new: str, label: str, minimum: int = 1) -> str:
    count = text.count(old)
    if count < minimum:
        raise PatchError(f"{label}: expected at least {minimum} occurrence(s), found {count}")
    return text.replace(old, new)


def patch_app_js(repo: Path) -> None:
    path = repo / "web" / "app.js"
    text = load(path)

    # Some boot paths render profile-specific controls before profile capabilities
    # have arrived. Preserve the existing behavior once populated, but fail closed
    # to single-nozzle/default capability semantics while undefined.
    text = replace_required(
        text,
        "_profileCaps.hasDualNozzle",
        "!!(_profileCaps && _profileCaps.hasDualNozzle)",
        "profile capability boot guard",
    )

    # The custom-dashboard editor can initialize before the widget-ID registry.
    # An empty list is the correct pre-init state and avoids aborting the rest of boot.
    text = replace_required(
        text,
        "HH_WIDGET_IDS.slice()",
        "(Array.isArray(HH_WIDGET_IDS) ? HH_WIDGET_IDS : []).slice()",
        "dashboard widget registry boot guard",
    )

    path.write_text(text, encoding="utf-8")


def patch_login_pattern(repo: Path) -> None:
    path = repo / "src" / "web_server.cpp"
    text = load(path)

    # Avoid hyphen/range parsing differences in modern HTML pattern engines.
    # This is only client-side UX validation; the device's server-side code check
    # remains authoritative and unchanged.
    text = replace_required(
        text,
        "pattern='[A-HJ-NP-Z2-9]{10}'",
        "pattern='[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}'",
        "Safari-safe portal-code pattern",
    )
    path.write_text(text, encoding="utf-8")


def patch(repo: Path) -> None:
    patch_app_js(repo)
    patch_login_pattern(repo)

    app = load(repo / "web" / "app.js")
    web = load(repo / "src" / "web_server.cpp")

    profile_guard = "!!(_profileCaps && _profileCaps.hasDualNozzle)"
    widget_guard = "(Array.isArray(HH_WIDGET_IDS) ? HH_WIDGET_IDS : []).slice()"

    # Verify the guarded forms are present, then remove them before checking that
    # no raw unsafe reads remain elsewhere. This avoids false positives caused by
    # the guarded expressions necessarily containing the original property names.
    if profile_guard not in app:
        raise PatchError("guarded profile capability expression missing")
    if "_profileCaps.hasDualNozzle" in app.replace(profile_guard, ""):
        raise PatchError("unguarded _profileCaps.hasDualNozzle remains")

    if widget_guard not in app:
        raise PatchError("guarded dashboard widget registry expression missing")
    if "HH_WIDGET_IDS.slice()" in app.replace(widget_guard, ""):
        raise PatchError("unguarded HH_WIDGET_IDS.slice() remains")

    if "[A-HJ-NP-Z2-9]{10}" in web:
        raise PatchError("legacy Safari-sensitive portal-code pattern remains")
    if "[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}" not in web:
        raise PatchError("Safari-safe portal-code pattern missing")

    print("Workshop OS v11.25 RC7 portal runtime hotfix applied")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if not args.apply:
        raise SystemExit("refusing to modify source without --apply")
    patch(Path(args.repo).resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
