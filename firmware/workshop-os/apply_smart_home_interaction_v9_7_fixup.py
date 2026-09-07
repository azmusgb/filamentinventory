#!/usr/bin/env python3
from pathlib import Path
import argparse


class FixupError(RuntimeError):
    pass


def replace_exactly_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise FixupError(f"{label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)


def patch_smart_hub_boundaries(repo: Path) -> None:
    p = repo / "src" / "smart_hub.cpp"
    text = p.read_text(encoding="utf-8")

    # v9.7 block replacement intentionally anchors on the following function
    # name. rb() preserves that end anchor, so RC1 composition can expose a
    # duplicated declaration at a replacement boundary. Normalize only the
    # exact known seams; fail closed if the generated source changes shape.
    text = replace_exactly_once(
        text,
        "static void uiWifiGlyphstatic void uiWifiGlyph",
        "static void uiWifiGlyph",
        "v97/ui-wifi-glyph-boundary",
    )
    text = replace_exactly_once(
        text,
        "static void drawTapHintstatic void drawTapHint",
        "static void drawTapHint",
        "v97/draw-tap-hint-boundary",
    )
    text = replace_exactly_once(
        text,
        "void smartHubReturnToPrinter() {\nvoid smartHubReturnToPrinter() {",
        "void smartHubReturnToPrinter() {",
        "v97/return-to-printer-boundary",
    )
    text = replace_exactly_once(
        text,
        "void smartHubDraw(ScreenState screen, bool forceRedraw) {\nvoid smartHubDraw(ScreenState screen, bool forceRedraw) {",
        "void smartHubDraw(ScreenState screen, bool forceRedraw) {",
        "v97/smart-hub-draw-boundary",
    )

    # The System replacement similarly retained the namespace end anchor after
    # writing its own copy. Keep exactly one anonymous-namespace close.
    text = replace_exactly_once(
        text,
        "\n} // namespace\n\n} // namespace\n",
        "\n} // namespace\n",
        "v97/namespace-boundary",
    )

    p.write_text(text, encoding="utf-8")


def verify_secret_safe_backup(repo: Path) -> None:
    # The composed v8.3+ stack already carries the v8.2 redaction semantics.
    # Recovery RC3 exposes /settings/export directly, so verify those semantics
    # at the final v9.7 source shape rather than attempting to apply the older
    # patch a second time.
    web = (repo / "src" / "web_server.cpp").read_text(encoding="utf-8")
    required = [
        'doc["_secretsIncluded"] = false;',
        'wifi["pass"] = "";',
        'wifi["passRedacted"] = true;',
        'p["accessCode"] = "";',
        'p["accessCodeRedacted"] = true;',
        'p["cloudUserId"] = "";',
        'p["cloudIdentityRedacted"] = true;',
        "importedPass[0] != '\\0'",
        "importedCode[0] != '\\0'",
        "importedUser[0] != '\\0'",
    ]
    forbidden = [
        'wifi["pass"] = wifiPass;',
        'p["accessCode"] = cfg.accessCode;',
        'p["cloudUserId"] = cfg.cloudUserId;',
    ]
    for needle in required:
        if needle not in web:
            raise FixupError(f"v97/secret-safe-backup: missing {needle}")
    for needle in forbidden:
        if needle in web:
            raise FixupError(f"v97/secret-safe-backup: secret serialization remains: {needle}")


def apply(repo: Path) -> None:
    patch_smart_hub_boundaries(repo)
    verify_secret_safe_backup(repo)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if not args.apply:
        raise SystemExit("Pass --apply")
    apply(Path(args.repo))
    print("Smart Home v9.7 boundary + secret-safe recovery verification applied")
