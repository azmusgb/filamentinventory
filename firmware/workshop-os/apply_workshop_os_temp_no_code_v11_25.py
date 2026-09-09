#!/usr/bin/env python3
"""Temporarily disable the station-mode portal/device code for WS350 testing.

This is intentionally test-only. It bypasses the boot-scoped portal session on
normal station-mode LAN access while preserving the same-origin guard for
mutating requests and the existing AP/setup/recovery route policy.

Important: the v11.20 auth hardening intentionally removed smart_home_build.h
from security_manager.cpp. A no-code test marker defined only in that header
therefore does nothing unless this patch explicitly restores the include. The
test bypass must also apply to securityAuthorize(); changing only
securitySessionValid() is insufficient because protected routes call
securityAuthorize() directly.
"""
from __future__ import annotations

import argparse
from pathlib import Path

MARKER = "WORKSHOP_OS_TEMP_NO_CODE_LAN"


def fail(message: str) -> None:
    raise SystemExit(message)


def block_end(text: str, start: int) -> int:
    brace = text.find("{", start)
    if brace < 0:
        fail("opening brace missing")
    depth = 0
    string = None
    escape = False
    line_comment = False
    block_comment = False
    i = brace
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
    fail("unterminated braced block")


def replace_block(text: str, signature: str, replacement: str, label: str) -> str:
    start = text.find(signature)
    if start < 0 or text.find(signature, start + 1) >= 0:
        fail(f"{label}: signature missing/non-unique")
    return text[:start] + replacement.rstrip() + text[block_end(text, start):]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        fail(f"{label}: expected exactly one anchor, found {count}")
    return text.replace(old, new, 1)


def apply(repo: Path) -> None:
    build_path = repo / "include" / "smart_home_build.h"
    build = build_path.read_text(encoding="utf-8")
    if "WORKSHOP_OS_V11_25_UI_OVERHAUL_RC2 1" not in build:
        fail("temporary no-code mode requires v11.25 RC2 source")
    if MARKER not in build:
        build += (
            f"\n// TEMPORARY physical-acceptance mode; remove before promotion.\n"
            f"#define {MARKER} 1\n"
        )
    build_path.write_text(build, encoding="utf-8")

    security_path = repo / "src" / "security_manager.cpp"
    security = security_path.read_text(encoding="utf-8")
    if "if (mutating && !sameOrigin(server))" not in security:
        fail("same-origin mutating-request guard is missing")

    # v11.20 deliberately removed this include. Restore it for the physical-test
    # candidate so WORKSHOP_OS_TEMP_NO_CODE_LAN is an actual compile-time input,
    # not a marker that exists only in an unrelated translation unit.
    if '#include "smart_home_build.h"' not in security:
        security = replace_once(
            security,
            '#include "security_manager.h"\n',
            '#include "security_manager.h"\n#include "smart_home_build.h"\n',
            "restore test-build identity include",
        )

    # Fail the build instead of silently shipping a supposedly no-code binary
    # whose security translation unit cannot see the test marker.
    guard = """#if !defined(WORKSHOP_OS_TEMP_NO_CODE_LAN) || !WORKSHOP_OS_TEMP_NO_CODE_LAN
#error \"v11.25 physical-test no-code build requires WORKSHOP_OS_TEMP_NO_CODE_LAN=1\"
#endif
"""
    if "v11.25 physical-test no-code build requires" not in security:
        anchor = '#include "smart_home_build.h"\n'
        security = replace_once(
            security,
            anchor,
            anchor + "\n" + guard,
            "compile-time no-code marker guard",
        )

    security = replace_block(
        security,
        "bool securitySessionValid(WebServer& server)",
        """bool securitySessionValid(WebServer& server) {
  ensureInitialized();
#if defined(WORKSHOP_OS_TEMP_NO_CODE_LAN) && WORKSHOP_OS_TEMP_NO_CODE_LAN
  // TEMPORARY: normal station-mode LAN access does not require the boot code.
  // This also makes an explicitly revisited /login URL redirect back to /.
  if (!isAPMode()) return true;
#endif
  return cookieMatches(server);
}""",
        "session policy",
    )

    # Protected portal/API routes use securityAuthorize() directly; bypassing
    # only securitySessionValid() leaves the root portal trapped behind /login.
    auth_anchor = """bool securityAuthorize(WebServer& server, bool mutating) {
  ensureInitialized();

  if (apPublicRouteAllowed(server)) {
"""
    auth_replacement = """bool securityAuthorize(WebServer& server, bool mutating) {
  ensureInitialized();

#if defined(WORKSHOP_OS_TEMP_NO_CODE_LAN) && WORKSHOP_OS_TEMP_NO_CODE_LAN
  // TEMPORARY physical-test mode: station-LAN authentication is bypassed, but
  // browser provenance remains required for every mutating operation.
  if (!isAPMode()) {
    if (mutating && !sameOrigin(server)) {
      server.send(403, \"application/json\",
          \"{\\\"status\\\":\\\"error\\\",\\\"message\\\":\\\"Rejected by Workshop OS same-origin protection.\\\"}\");
      return false;
    }
    return true;
  }
#endif

  if (apPublicRouteAllowed(server)) {
"""
    security = replace_once(
        security,
        auth_anchor,
        auth_replacement,
        "station-LAN authorization bypass",
    )

    security_path.write_text(security, encoding="utf-8")
    print("Workshop OS v11.25 station-LAN device code disabled for physical testing")


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
