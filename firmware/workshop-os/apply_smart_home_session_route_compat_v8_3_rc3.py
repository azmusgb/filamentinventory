#!/usr/bin/env python3
from pathlib import Path
import argparse


class PatchError(RuntimeError):
    pass


def replace_once(text: str, old: str, new: str, name: str) -> str:
    count = text.count(old)
    if count != 1:
        raise PatchError(f"{name}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)


def apply(repo: Path) -> None:
    p = repo / "src" / "web_server.cpp"
    text = p.read_text(encoding="utf-8")

    text = replace_once(
        text,
        '  PUBLIC_GET("/login", handlePortalLoginPage);',
        '  server.on("/login", HTTP_GET, handlePortalLoginPage);',
        "public login GET route",
    )
    text = replace_once(
        text,
        '  PUBLIC_POST("/login", handlePortalLoginSubmit);',
        '  server.on("/login", HTTP_POST, handlePortalLoginSubmit);',
        "public login POST route",
    )

    # The helper macros are no longer used after making the exception explicit.
    text = text.replace('#define PUBLIC_GET(path, handler) server.on(path, HTTP_GET, handler)\n', '')
    text = text.replace('#define PUBLIC_POST(path, handler) server.on(path, HTTP_POST, handler)\n', '')

    if 'server.on("/login", HTTP_GET, handlePortalLoginPage);' not in text:
        raise PatchError("explicit login GET route missing")
    if 'server.on("/login", HTTP_POST, handlePortalLoginSubmit);' not in text:
        raise PatchError("explicit login POST route missing")

    p.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if not args.apply:
        raise SystemExit("Pass --apply")
    apply(Path(args.repo))
    print("Smart Home v8.3 RC3 explicit login-route compatibility applied")
