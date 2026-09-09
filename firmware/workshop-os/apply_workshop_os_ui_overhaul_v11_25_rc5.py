#!/usr/bin/env python3
"""Apply Workshop OS v11.25 RC5 native UI acceptance refinements after RC4.

RC5 keeps the existing authority, command, recovery, and test-only no-code
boundaries. It owns the final native presentation for physical acceptance and
adds an explicit UI5 runtime fingerprint so captured frames can prove which
renderer actually ran on the WS350.
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
    fragment_dir = source_root / "firmware" / "ui-v11.25-rc5"
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
        raise PatchError(f"missing RC5 fragments: {sorted(missing)}")
    return values


def sanitize_generated_source(repo: Path) -> None:
    """Remove accidental literal NUL bytes from reconstructed C++ source.

    An older generator emitted a real NUL byte inside the intended C++ '\\0'
    character literal in settings.cpp. GCC accepted it but warned on every
    WS350/regression build. Convert only that exact character-literal form and
    fail closed if any other NUL byte remains in the source file.
    """
    path = repo / "src" / "settings.cpp"
    if not path.exists():
        raise PatchError(f"missing {path}")
    data = path.read_bytes()
    literal = b"'\x00'"
    replacements = data.count(literal)
    if replacements:
        data = data.replace(literal, b"'\\0'")
        path.write_bytes(data)
    if b"\x00" in data:
        raise PatchError("settings.cpp still contains an embedded NUL byte")
    print(f"RC5 source hygiene: settings.cpp embedded-NUL replacements={replacements}")


def patch(repo: Path) -> None:
    source_root = Path(__file__).resolve().parent
    f = sections(source_root)

    # Source hygiene is part of the final UI authority reconstruction so every
    # RC5/RC6-derived build is warning-clean before compilation.
    sanitize_generated_source(repo)

    build_path = repo / "include" / "smart_home_build.h"
    build = load(build_path)
    build = once(
        build,
        '#define SMART_HOME_BUILD_LABEL "Workshop OS v11.25 Full Device UI Overhaul RC4 Product Polish"',
        '#define SMART_HOME_BUILD_LABEL "Workshop OS v11.25 RC5 Native UI Acceptance"',
        "RC5 build label",
    )
    if '#define SMART_HOME_PROFILE "full-device-ui-overhaul"' in build:
        build = once(
            build,
            '#define SMART_HOME_PROFILE "full-device-ui-overhaul"',
            '#define SMART_HOME_PROFILE "native-ui-acceptance"',
            "RC5 build profile",
        )
    if "WORKSHOP_OS_V11_25_UI_RC5" not in build:
        build += "\n#define WORKSHOP_OS_V11_25_UI_RC5 1\n"
    if "WORKSHOP_OS_UI_SCHEMA" not in build:
        build += '#define WORKSHOP_OS_UI_SCHEMA "UI5"\n'
    build_path.write_text(build, encoding="utf-8")

    hub_path = repo / "src" / "smart_hub.cpp"
    hub = load(hub_path)
    helper_marker = "static const char* hubV1125UiFingerprint(uint8_t page)"
    if helper_marker not in hub:
        pos = hub.find("static void drawHeader(")
        if pos < 0:
            raise PatchError("RC5 header anchor missing")
        hub = hub[:pos] + f["FINGERPRINT_HELPERS"].rstrip() + "\n\n" + hub[pos:]

    for signature, key in [
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
    ]:
        hub = replace_block(hub, signature, f[key], key)

    for forbidden in ("matchSpoolByColor", "matchSpoolByMaterial", "resolveSpool"):
        if forbidden in hub:
            raise PatchError(f"forbidden firmware inventory inference present: {forbidden}")
    hub_path.write_text(hub, encoding="utf-8")

    css_path = repo / "web" / "app.css"
    css = load(css_path)
    layer = load(source_root / "assets" / "v11_25_rc5_portal.css")
    marker = "Workshop OS v11.25 RC5 Native UI Acceptance"
    if marker not in css:
        css += "\n\n" + layer.rstrip() + "\n"
    css_path.write_text(css, encoding="utf-8")

    print("Workshop OS v11.25 RC5 Native UI Acceptance applied")


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
