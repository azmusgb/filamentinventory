#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from pathlib import Path


PUBLIC_GETS = {
    "/generate_204",
    "/gen_204",
    "/connecttest.txt",
    "/hotspot-detect.html",
    "/canonical.html",
    "/app.css",
    "/app.js",
}


def apply(repo: Path) -> None:
    path = repo / "src" / "web_server.cpp"
    text = path.read_text(encoding="utf-8")

    start = text.index("void initWebServer() {")
    end = text.index("\nvoid handleWebServer()", start)
    block = text[start:end]

    # Catch legacy registrations whose spacing differs from the upstream style
    # used by the primary v8 patch. Existing SECURE_* registrations do not match
    # this expression, so this pass is idempotent.
    simple = re.compile(
        r'server\.on\("([^"]+)"\s*,\s*HTTP_(GET|POST)\s*,\s*'
        r'([A-Za-z_][A-Za-z0-9_]*)\s*\);'
    )

    def secure_simple(m: re.Match[str]) -> str:
        route, method, handler = m.group(1), m.group(2), m.group(3)
        if method == "GET" and route in PUBLIC_GETS:
            return m.group(0)
        macro = "SECURE_GET" if method == "GET" else "SECURE_POST"
        return f'{macro}("{route}", {handler});'

    block = simple.sub(secure_simple, block)

    upload = re.compile(
        r'server\.on\("([^"]+)"\s*,\s*HTTP_POST\s*,\s*'
        r'([A-Za-z_][A-Za-z0-9_]*)\s*,\s*'
        r'([A-Za-z_][A-Za-z0-9_]*)\s*\);'
    )
    block = upload.sub(
        lambda m: f'SECURE_UPLOAD("{m.group(1)}", {m.group(2)}, {m.group(3)});',
        block,
    )

    # Fail closed if a future upstream route uses a registration form this
    # guard does not understand. That keeps new management surfaces from being
    # accidentally published without authentication.
    leftovers: list[tuple[str, str]] = []
    for m in re.finditer(r'server\.on\("([^"]+)"\s*,\s*HTTP_(GET|POST)', block):
        route, method = m.group(1), m.group(2)
        if method == "GET" and route in PUBLIC_GETS:
            continue
        leftovers.append((route, method))

    if leftovers:
        raise RuntimeError(f"unprotected route registrations remain: {leftovers}")

    text = text[:start] + block + text[end:]
    path.write_text(text, encoding="utf-8")
    print("Smart Home v8 route guard applied")


def main() -> int:
    parser = argparse.ArgumentParser(description="Close legacy route-registration gaps after Smart Home v8 hardening")
    parser.add_argument("--repo", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if not args.apply:
        raise SystemExit("Pass --apply")
    apply(Path(args.repo))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
