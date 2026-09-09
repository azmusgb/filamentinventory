#!/usr/bin/env python3
"""Apply Workshop OS v11.25 RC9 Premium Appliance UI after RC8.

RC9 is a presentation-only refinement. It keeps RC8 touch geometry, network
workflow semantics, guarded actions, authentication, recovery, printer command
authorization, and inventory authority boundaries while replacing the primary
native visual language with a calmer, border-light appliance UI.
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


def once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise PatchError(f"{label}: expected one anchor, found {count}")
    return text.replace(old, new, 1)


def block_end(text: str, start: int) -> int:
    i = text.find("{", start)
    if i < 0:
        raise PatchError("opening brace missing")
    depth = 0
    string = None
    escape = False
    line_comment = False
    block_comment = False
    while i < len(text):
        c = text[i]
        n = text[i + 1] if i + 1 < len(text) else ""
        if line_comment:
            if c == "\n":
                line_comment = False
        elif block_comment:
            if c == "*" and n == "/":
                block_comment = False
                i += 1
        elif string:
            if escape:
                escape = False
            elif c == "\\":
                escape = True
            elif c == string:
                string = None
        elif c == "/" and n == "/":
            line_comment = True
            i += 1
        elif c == "/" and n == "*":
            block_comment = True
            i += 1
        elif c in ('"', "'"):
            string = c
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    raise PatchError("unterminated block")


def replace_block(text: str, signature: str, replacement: str, label: str) -> str:
    start = text.find(signature)
    if start < 0 or text.find(signature, start + 1) >= 0:
        raise PatchError(f"{label}: signature missing/non-unique")
    return text[:start] + replacement.rstrip() + text[block_end(text, start):]


def sections(source_root: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    fragment_dir = source_root / "firmware" / "ui-v11.25-rc9"
    for path in fragment_dir.glob("*.cppfrag"):
        text = load(path)
        for line in text.splitlines():
            if line.startswith("@@") and line.endswith("@@") and not line.startswith("@@END_"):
                name = line[2:-2]
                end = f"@@END_{name}@@"
                if end not in text:
                    raise PatchError(f"{path.name}: missing {end}")
                values[name] = text.split(line, 1)[1].split(end, 1)[0].strip("\n")
    required = {
        "FINGERPRINT_HELPERS",
        "CARD",
        "MODE_TABS",
        "ACTION",
        "TELEMETRY",
        "AMS_SLOT",
        "HEADER",
        "BOTTOM_NAV",
        "HOME",
        "PRINTER",
        "WORKSHOP",
        "MORE",
        "SYSTEM",
    }
    missing = required - set(values)
    if missing:
        raise PatchError(f"missing RC9 fragments: {sorted(missing)}")
    return values


def normalize_copy(hub: str) -> str:
    replacements = (
        ('"LIGHT SENT"', '"Light sent"'),
        ('"RESUME SENT"', '"Resume sent"'),
        ('"PAUSE SENT"', '"Pause sent"'),
        ('"POWER NOT MAPPED"', '"Power not mapped"'),
        ('"HOLD TO STOP"', '"Hold to Stop"'),
        ('"STOP SENT"', '"Stop sent"'),
        ('"KEEP HOLDING"', '"Keep Holding"'),
        ('"HOLD TO APPLY"', '"Hold to Apply"'),
        ('"CHANGES NOT APPLIED"', '"Changes not applied"'),
        ('"REVIEW CHANGES"', '"Review Changes"'),
        ('"PRINTER ACTIVE - DISPLAY WILL RESTART"', '"Printer active - display will restart"'),
        ('drawHeader("NETWORK",title,3);', 'drawHeader("Network",title,3);'),
        (
            'const char* title=page==0?"STARTUP":page==1?"CLOCK":page==2?"DATE":page==3?"LOCAL NAME":page==4?"TIMEZONE":page==5?"ADDRESS":"REVIEW";',
            'const char* title=page==0?"Startup":page==1?"Clock":page==2?"Date":page==3?"Local Name":page==4?"Timezone":page==5?"Address":"Review";',
        ),
        (
            'const char* label=page==0?"SHOW IP AT STARTUP":page==1?"CLOCK FORMAT":page==2?"DATE FORMAT":"LOCAL NETWORK NAME";',
            'const char* label=page==0?"Show IP at Startup":page==1?"Clock Format":page==2?"Date Format":"Local Network Name";',
        ),
    )
    for old, new in replacements:
        hub = hub.replace(old, new)
    return hub


def patch(repo: Path) -> None:
    source_root = Path(__file__).resolve().parent
    f = sections(source_root)

    build_path = repo / "include" / "smart_home_build.h"
    build = load(build_path)
    build = once(
        build,
        '#define SMART_HOME_BUILD_LABEL "Workshop OS v11.25 RC8 Physical UI Polish"',
        '#define SMART_HOME_BUILD_LABEL "Workshop OS v11.25 RC9 Premium Appliance UI"',
        "RC9 build label",
    )
    build = once(
        build,
        '#define SMART_HOME_PROFILE "physical-ui-polish"',
        '#define SMART_HOME_PROFILE "premium-appliance-ui"',
        "RC9 profile",
    )
    build = once(
        build,
        '#define WORKSHOP_OS_UI_SCHEMA "UI8"',
        '#define WORKSHOP_OS_UI_SCHEMA "UI9"',
        "RC9 UI schema",
    )
    if "WORKSHOP_OS_V11_25_UI_RC9" not in build:
        build += "\n#define WORKSHOP_OS_V11_25_UI_RC9 1\n"
    build_path.write_text(build, encoding="utf-8")

    hub_path = repo / "src" / "smart_hub.cpp"
    hub = load(hub_path)
    for signature, key in (
        ("static const char* hubV1125UiFingerprint(uint8_t page)", "FINGERPRINT_HELPERS"),
        ("static void hubV1125Card(", "CARD"),
        ("static void hubV1125ModeTabs() {", "MODE_TABS"),
        ("static void hubV1125Action(", "ACTION"),
        ("static void hubV1125TelemetryColumn(", "TELEMETRY"),
        ("static void hubV1125AmsSlot(", "AMS_SLOT"),
        ("static void drawHeader(", "HEADER"),
        ("static void uiBottomNav(", "BOTTOM_NAV"),
        ("static void drawHome(bool full) {", "HOME"),
        ("static void drawPrinter(bool full) {", "PRINTER"),
        ("static void drawWorkshop(bool full) {", "WORKSHOP"),
        ("static void drawMore(bool full) {", "MORE"),
        ("static void drawSystem(bool full) {", "SYSTEM"),
    ):
        hub = replace_block(hub, signature, f[key], key)

    hub = normalize_copy(hub)

    if hub.count("securityPortalCode()") < 2:
        raise PatchError("RC9 lost secure portal-code visibility")
    if "TEST / NO CODE" in hub:
        raise PatchError("RC9 reintroduced insecure no-code copy")
    for forbidden in ("matchSpoolByColor", "matchSpoolByMaterial", "resolveSpool"):
        if forbidden in hub:
            raise PatchError(f"forbidden inventory inference present: {forbidden}")
    for marker in ("UI9-H", "UI9-P", "UI9-W", "UI9-M", "UI9-S", "Settings", "Printer material"):
        if marker not in hub:
            raise PatchError(f"missing RC9 UX marker: {marker}")

    hub_path.write_text(hub, encoding="utf-8")
    print("Workshop OS v11.25 RC9 Premium Appliance UI applied")


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
