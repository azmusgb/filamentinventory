#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

import apply_workshop_auto_orientation_v1 as v1
import apply_workshop_auto_orientation_v1_1 as v11

ALLOWED_BUILD_LABELS = (
    "Smart Home v11.23 Instrument UI Prototype",
    "Smart Home v11.24 Instrument UI Prototype + Audio Console",
)


def apply(root: Path) -> None:
    # Preserve the reviewed v1 behavior and the v1.1 line-aware include
    # insertion, while explicitly allowing the v11.24 combined Instrument UI
    # identity. Fail closed for every other reconstruction.
    v1.add_include = v11.line_aware_add_include
    v1.assert_secure(root)
    build = v1.load(root, "include/smart_home_build.h")
    if not any(label in build for label in ALLOWED_BUILD_LABELS):
        raise v1.PatchError(
            "QMI8658 auto orientation requires an approved Instrument UI reconstructed source"
        )
    v1.patch_settings(root)
    v1.write_module(root)
    v1.patch_effective_rotation(root)
    v1.patch_rotation_modal(root)
    v1.verify(root)
    print("Workshop Instrument UI QMI8658 auto orientation applied")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if not args.apply:
        raise SystemExit("refusing to modify reconstructed source without --apply")
    apply(Path(args.repo).resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
