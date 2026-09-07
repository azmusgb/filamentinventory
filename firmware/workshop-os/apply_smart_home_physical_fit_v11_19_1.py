#!/usr/bin/env python3
from pathlib import Path
import argparse


class PatchError(RuntimeError):
    pass


def load(root: Path, rel: str) -> str:
    p = root / rel
    if not p.exists():
        raise PatchError(f"missing {rel}")
    return p.read_text(encoding="utf-8")


def save(root: Path, rel: str, text: str) -> None:
    (root / rel).write_text(text, encoding="utf-8")


def once(text: str, old: str, new: str, label: str) -> str:
    n = text.count(old)
    if n != 1:
        raise PatchError(f"{label}: expected one anchor, found {n}")
    return text.replace(old, new, 1)


def exact_count(text: str, old: str, new: str, count: int, label: str) -> str:
    n = text.count(old)
    if n != count:
        raise PatchError(f"{label}: expected {count} anchors, found {n}")
    return text.replace(old, new)


def patch(root: Path) -> None:
    rel = "include/smart_home_build.h"
    t = load(root, rel)
    t = once(t, '#define SMART_HOME_VERSION "v11.19"', '#define SMART_HOME_VERSION "v11.19.1"', 'version')
    t = once(t, '#define SMART_HOME_PROFILE "visual-correctness"', '#define SMART_HOME_PROFILE "physical-fit"', 'profile')
    t = once(t, '#define SMART_HOME_BUILD_LABEL "Smart Home v11.19 Visual Correctness RC1"',
             '#define SMART_HOME_BUILD_LABEL "Smart Home v11.19.1 Physical Fit RC2"', 'build label')
    save(root, rel, t)

    rel = "src/smart_hub.cpp"
    t = load(root, rel)

    # Physical v11.19 capture proved that the semantically-correct landscape
    # string "NO ACTIVE TRAY" still exceeded the rendered card budget and was
    # ellipsized. Use a shorter, equally accurate operational state.
    t = once(
        t,
        'uiDrawFit("NO ACTIVE TRAY",loadedCard.x+12,loadedCard.y+54,loadedCard.w-24,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL);',
        'uiDrawFit("AMS IDLE",loadedCard.x+12,loadedCard.y+54,loadedCard.w-24,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL);',
        'landscape no-active-tray rendered fit',
    )

    # Keep portrait wording consistent with the physical state vocabulary.
    t = once(
        t,
        'strlcpy(value,"No active AMS tray",sizeof(value));',
        'strlcpy(value,"AMS idle",sizeof(value));',
        'portrait no-active-tray wording',
    )

    # The v11.19 physical System capture showed the third Audio Lab action as
    # "EVENTS...". State is already communicated immediately above by
    # "Event sounds active/muted" and by the button accent, so the action label
    # can remain a stable, fully-rendered noun.
    t = exact_count(
        t,
        'uiActionButton(eventsBtn,buzzerSettings.enabled?"EVENTS ON":"EVENTS OFF",buzzerSettings.enabled?UI_GREEN:UI_MUTED);',
        'uiActionButton(eventsBtn,"EVENTS",buzzerSettings.enabled?UI_GREEN:UI_MUTED);',
        2,
        'System events action rendered fit',
    )

    save(root, rel, t)

    # Static post-patch assertions are intentionally stricter than v11.19's
    # source-string contract. These are the exact fixed labels that physically
    # overflowed the WS350 capture and must never regress to the longer forms.
    build = load(root, "include/smart_home_build.h")
    hub = load(root, "src/smart_hub.cpp")
    for needle in [
        'SMART_HOME_VERSION "v11.19.1"',
        'SMART_HOME_PROFILE "physical-fit"',
        'Smart Home v11.19.1 Physical Fit RC2',
    ]:
        if needle not in build:
            raise PatchError(f"missing build identity: {needle}")
    for needle in [
        'uiDrawFit("AMS IDLE"',
        'strlcpy(value,"AMS idle"',
        'uiActionButton(eventsBtn,"EVENTS"',
        'securityPortalCode()',
        'hubFormatPresetPct',
        'smartHubCapturePrepare',
    ]:
        if needle not in hub:
            raise PatchError(f"missing physical-fit invariant: {needle}")
    for forbidden in [
        'uiDrawFit("NO ACTIVE TRAY"',
        'strlcpy(value,"No active AMS tray"',
        '"EVENTS ON":"EVENTS OFF"',
    ]:
        if forbidden in hub:
            raise PatchError(f"render-overflow regression remains: {forbidden}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if not args.apply:
        raise SystemExit("Pass --apply")
    patch(Path(args.repo))
    print("Smart Home v11.19.1 Physical Fit RC2 applied")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
