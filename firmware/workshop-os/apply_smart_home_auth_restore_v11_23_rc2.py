#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

MARKER = "Workshop OS v11.23 RC2 authenticated LAN restore"


def fail(message: str) -> None:
    raise SystemExit(message)


def replace_braced_block(text: str, start: str, replacement: str, label: str) -> str:
    pos = text.find(start)
    if pos < 0:
        fail(f"{label}: start anchor missing")
    brace = text.find("{", pos)
    if brace < 0:
        fail(f"{label}: opening brace missing")
    depth = 0
    in_string = False
    quote = ""
    escape = False
    for i in range(brace, len(text)):
        c = text[i]
        if in_string:
            if escape:
                escape = False
            elif c == "\\":
                escape = True
            elif c == quote:
                in_string = False
            continue
        if c in ("'", '"'):
            in_string = True
            quote = c
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return text[:pos] + replacement + text[i + 1:]
    fail(f"{label}: closing brace missing")


def remove_preprocessor_block(text: str, start_marker: str, label: str) -> str:
    pos = text.find(start_marker)
    if pos < 0:
        return text
    end = text.find("#endif", pos)
    if end < 0:
        fail(f"{label}: #endif missing")
    end = text.find("\n", end)
    if end < 0:
        end = len(text)
    else:
        end += 1
    return text[:pos] + text[end:]


def patch_build(repo: Path) -> None:
    path = repo / "include" / "smart_home_build.h"
    text = path.read_text(encoding="utf-8")
    text = text.replace("#define WORKSHOP_OS_TEMP_LAN_OPEN 1\n", "")
    if "WORKSHOP_OS_TEMP_LAN_OPEN" in text:
        fail("build: trusted-LAN bypass marker still present")
    if MARKER not in text:
        text += f"\n// {MARKER}\n"
    path.write_text(text, encoding="utf-8")


def patch_security(repo: Path) -> None:
    path = repo / "src" / "security_manager.cpp"
    text = path.read_text(encoding="utf-8")

    text = replace_braced_block(
        text,
        "bool securitySessionValid(WebServer& server)",
        """bool securitySessionValid(WebServer& server) {
  ensureInitialized();
  return cookieMatches(server);
}""",
        "session policy",
    )

    text = remove_preprocessor_block(
        text,
        "#if defined(WORKSHOP_OS_TEMP_LAN_OPEN) && WORKSHOP_OS_TEMP_LAN_OPEN",
        "trusted-LAN authorize block",
    )

    if "WORKSHOP_OS_TEMP_LAN_OPEN" in text:
        fail("security: trusted-LAN bypass marker still present")
    if "if (!isAPMode()) return true;" in text:
        fail("security: normal-LAN session bypass still present")
    path.write_text(text, encoding="utf-8")


def patch_browser(repo: Path) -> None:
    path = repo / "web" / "app.js"
    text = path.read_text(encoding="utf-8")
    start = text.find("function v1123Rc2LanOpenBanner(){")
    if start >= 0:
        end_marker = "setTimeout(v1123Rc2LanOpenBanner,0);"
        end = text.find(end_marker, start)
        if end < 0:
            fail("browser: LAN-open banner terminator missing")
        end += len(end_marker)
        while end < len(text) and text[end] in "\r\n":
            end += 1
        text = text[:start] + text[end:]
    for forbidden in ("v1123Rc2LanOpenBanner", "TEMPORARY TRUSTED-LAN MODE"):
        if forbidden in text:
            fail(f"browser: temporary trusted-LAN disclosure remains: {forbidden}")
    path.write_text(text, encoding="utf-8")


def apply(repo: Path) -> None:
    build = repo / "include" / "smart_home_build.h"
    if not build.exists():
        fail(f"missing reconstructed source: {build}")
    if "Smart Home v11.23 Network Locale Layout RC2" not in build.read_text(encoding="utf-8"):
        fail("auth restore requires reconstructed v11.23 RC2 source")
    patch_build(repo)
    patch_security(repo)
    patch_browser(repo)
    print("Workshop OS v11.23 RC2 authenticated LAN boundary restored")


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
