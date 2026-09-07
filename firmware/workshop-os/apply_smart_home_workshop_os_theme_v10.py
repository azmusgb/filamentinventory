#!/usr/bin/env python3
from __future__ import annotations

import argparse
import urllib.request
from pathlib import Path

CORE_URL = "https://raw.githubusercontent.com/azmusgb/bambuhelper-smart-display/eecddd896a3836da42bf8cbbb2c3723cca62b29a/apply_smart_home_workshop_os_theme_v10.py"


class PatchError(RuntimeError):
    pass


def load_core():
    with urllib.request.urlopen(CORE_URL, timeout=30) as r:
        source = r.read().decode("utf-8")
    ns = {"__name__": "v10_theme_core", "__file__": CORE_URL}
    exec(compile(source, CORE_URL, "exec"), ns, ns)
    if "apply" not in ns:
        raise PatchError("v10 core apply() missing")
    return ns


def dedupe_action_button(repo: Path) -> None:
    p = repo / "src" / "smart_hub.cpp"
    text = p.read_text()
    signature = "static void uiActionButton("
    starts = []
    pos = 0
    while True:
        i = text.find(signature, pos)
        if i < 0:
            break
        starts.append(i)
        pos = i + len(signature)
    if len(starts) != 2:
        raise PatchError(
            f"uiActionButton: expected 2 definitions before v10 fixup, found {len(starts)}"
        )
    start = starts[1]
    brace = text.find("{", start)
    if brace < 0:
        raise PatchError("second uiActionButton opening brace missing")
    depth = 0
    end = None
    for i in range(brace, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    if end is None:
        raise PatchError("second uiActionButton closing brace missing")
    while end < len(text) and text[end] in " \t":
        end += 1
    if end < len(text) and text[end] == "\n":
        end += 1
    text = text[:start] + text[end:]
    if text.count(signature) != 1:
        raise PatchError("uiActionButton deduplication failed")
    a = text.index(signature)
    b = text.find("\nstatic void ", a + 1)
    body = text[a : b if b > 0 else len(text)]
    for needle in [
        "primary=filled || accent==UI_ORANGE",
        "UI_PANEL_2",
        "UI_ORANGE",
    ]:
        if needle not in body:
            raise PatchError("retained v10 action button theme missing: " + needle)
    p.write_text(text)


def normalize_strong_card_backgrounds(repo: Path) -> None:
    """Keep elevated-card hierarchy without opaque child-background artifacts.

    The inherited v9.9 renderers intentionally draw text and artwork with an
    explicit UI_PANEL background. The v10 core initially changed only the
    strong-card interior to UI_PANEL_3, which makes those opaque child draws
    appear as rectangular UI_PANEL patches. Strong cards retain their v10 glow,
    accent rail/dot, shadow, and accent border; only the interior returns to the
    shared UI_PANEL surface so every child renderer composes cleanly.
    """

    p = repo / "src" / "smart_hub.cpp"
    text = p.read_text()
    old = (
        "  tft.fillRoundRect(x + 1, y + 1, w - 2, h - 2, 10, "
        "strong ? UI_PANEL_3 : UI_PANEL);"
    )
    new = "  tft.fillRoundRect(x + 1, y + 1, w - 2, h - 2, 10, UI_PANEL);"
    count = text.count(old)
    if count != 1:
        raise PatchError(
            f"strong-card background: expected one v10 core fill, found {count}"
        )
    text = text.replace(old, new, 1)

    card_start = text.find("static void uiCard(")
    card_end = text.find("\nstatic void uiPanelFill(", card_start)
    if card_start < 0 or card_end < 0:
        raise PatchError("strong-card background: uiCard region missing")
    card_body = text[card_start:card_end]
    if new.strip() not in card_body:
        raise PatchError("strong-card background normalization did not persist")
    if "strong ? UI_PANEL_3 : UI_PANEL" in card_body:
        raise PatchError("strong-card mixed interior background remains")
    for needle in [
        "strong ? UI_GLOW : UI_BORDER_2",
        "strong ? accent : UI_BORDER",
        "strong ? 3 : 2",
    ]:
        if needle not in card_body:
            raise PatchError(
                "strong-card hierarchy unexpectedly weakened while fixing background: "
                + needle
            )
    p.write_text(text)


def apply(repo: Path) -> None:
    core = load_core()
    core["apply"](repo)
    dedupe_action_button(repo)
    normalize_strong_card_backgrounds(repo)
    core["verify"](repo)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=".")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if not args.apply:
        print("Smart Home v10 Workshop OS theme patch ready. Use --apply.")
        return 0
    apply(Path(args.repo).resolve())
    print(
        "Smart Home v10 Workshop OS Theme applied "
        "(compile + elevated-card background fixups included)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
