#!/usr/bin/env python3
"""Robust v1.1 applicator for Workshop Instrument UI auto orientation.

The v1 applicator intentionally used exact include anchors. Reconstructed
BambuHelper source has legitimate trailing comments on some include lines (for
example display_split.cpp), so v1.1 preserves all v1 behavior while making only
include insertion line-aware. It still fails closed on zero or multiple anchors.

This branch also carries the approved v11.24 Instrument UI + Audio Console
identity. The orientation implementation is unchanged; only the prerequisite
identity list is widened explicitly to the two reviewed Instrument UI labels.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import apply_workshop_auto_orientation_v1 as v1


APPROVED_INSTRUMENT_UI_LABELS = (
    "Smart Home v11.23 Instrument UI Prototype",
    "Smart Home v11.24 Instrument UI Prototype + Audio Console",
)


def line_aware_add_include(text: str, anchor: str, include: str, label: str) -> str:
    if include in text:
        return text

    wanted = anchor.strip()
    if wanted.startswith("#include"):
        lines = text.splitlines(keepends=True)
        matches = [
            i for i, line in enumerate(lines)
            if line.lstrip().startswith(wanted)
        ]
        if len(matches) != 1:
            raise v1.PatchError(
                f"{label}: expected exactly one include line beginning {wanted!r}, "
                f"found {len(matches)}"
            )
        insert_at = matches[0] + 1
        lines.insert(insert_at, include)
        return "".join(lines)

    return v1.once(text, anchor, anchor + include, label)


def apply(root: Path) -> None:
    # Preserve every reviewed orientation transformation from v1 and only
    # replace the fragile include matching plus the explicit prerequisite
    # identity check. All other security and post-apply verification remains v1.
    v1.add_include = line_aware_add_include
    v1.assert_secure(root)
    build = v1.load(root, "include/smart_home_build.h")
    if not any(label in build for label in APPROVED_INSTRUMENT_UI_LABELS):
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
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if not args.apply:
        raise SystemExit("refusing to modify reconstructed source without --apply")
    apply(Path(args.repo).resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
