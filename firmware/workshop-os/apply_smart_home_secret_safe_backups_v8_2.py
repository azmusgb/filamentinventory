#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path


class PatchError(RuntimeError):
    pass


def replace_once(text: str, old: str, new: str, name: str) -> str:
    count = text.count(old)
    if count != 1:
        raise PatchError(f"{name}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)


def validate(text: str) -> None:
    forbidden = [
        'wifi["pass"] = wifiPass;',
        'p["accessCode"] = cfg.accessCode;',
        'p["cloudUserId"] = cfg.cloudUserId;',
    ]
    for needle in forbidden:
        if needle in text:
            raise PatchError(f"secret-safe export validation failed: {needle} remains")

    required = [
        'doc["_secretsIncluded"] = false;',
        'wifi["passRedacted"] = true;',
        'p["accessCodeRedacted"] = true;',
        'p["cloudIdentityRedacted"] = true;',
        "importedPass[0] != '\\0'",
        "importedCode[0] != '\\0'",
        "importedUser[0] != '\\0'",
    ]
    for needle in required:
        if needle not in text:
            raise PatchError(f"secret-safe export validation failed: missing {needle}")


def patch_web_server(repo: Path) -> None:
    p = repo / "src" / "web_server.cpp"
    text = p.read_text(encoding="utf-8")

    # Backups are intentionally configuration-only. They must never contain
    # Wi-Fi credentials, printer LAN access codes, cloud user IDs or account
    # tokens/passwords. This keeps a settings backup safe to attach to an issue,
    # store in cloud storage, or share during troubleshooting.
    text = replace_once(
        text,
        '  doc["_version"] = FW_VERSION;\n\n  // WiFi\n',
        '  doc["_version"] = FW_VERSION;\n'
        '  doc["_secretsIncluded"] = false;\n'
        '  doc["_secretPolicy"] = "redacted; re-enter WiFi and printer access codes after restore";\n\n'
        '  // WiFi (SSID is configuration; password is deliberately omitted)\n',
        "backup metadata",
    )

    text = replace_once(
        text,
        '  wifi["ssid"] = wifiSSID;\n  wifi["pass"] = wifiPass;\n',
        '  wifi["ssid"] = wifiSSID;\n  wifi["pass"] = "";\n  wifi["passRedacted"] = true;\n',
        "redact WiFi password",
    )

    text = replace_once(
        text,
        '    p["accessCode"] = cfg.accessCode;\n    p["cloudUserId"] = cfg.cloudUserId;\n',
        '    p["accessCode"] = "";\n'
        '    p["accessCodeRedacted"] = true;\n'
        '    p["cloudUserId"] = "";\n'
        '    p["cloudIdentityRedacted"] = true;\n',
        "redact printer credentials",
    )

    # A redacted backup restored onto the same device should not destroy the
    # already-provisioned credentials. A fresh device simply keeps these fields
    # empty and the portal asks for them again.
    text = replace_once(
        text,
        '    if (wifi["pass"].is<const char*>()) strlcpy(wifiPass, wifi["pass"], sizeof(wifiPass));\n',
        '    if (wifi["pass"].is<const char*>()) {\n'
        '      const char* importedPass = wifi["pass"];\n'
        '      if (importedPass && importedPass[0] != \'\\0\')\n'
        '        strlcpy(wifiPass, importedPass, sizeof(wifiPass));\n'
        '    }\n',
        "preserve WiFi password on redacted import",
    )

    text = replace_once(
        text,
        '      if (p["accessCode"].is<const char*>())  strlcpy(cfg.accessCode, p["accessCode"], sizeof(cfg.accessCode));\n'
        '      if (p["cloudUserId"].is<const char*>()) strlcpy(cfg.cloudUserId, p["cloudUserId"], sizeof(cfg.cloudUserId));\n',
        '      if (p["accessCode"].is<const char*>()) {\n'
        '        const char* importedCode = p["accessCode"];\n'
        '        if (importedCode && importedCode[0] != \'\\0\')\n'
        '          strlcpy(cfg.accessCode, importedCode, sizeof(cfg.accessCode));\n'
        '      }\n'
        '      if (p["cloudUserId"].is<const char*>()) {\n'
        '        const char* importedUser = p["cloudUserId"];\n'
        '        if (importedUser && importedUser[0] != \'\\0\')\n'
        '          strlcpy(cfg.cloudUserId, importedUser, sizeof(cfg.cloudUserId));\n'
        '      }\n',
        "preserve printer credentials on redacted import",
    )

    validate(text)
    p.write_text(text, encoding="utf-8")


def patch_web_app(repo: Path) -> None:
    p = repo / "web" / "app.js"
    text = p.read_text(encoding="utf-8")

    old = "function exportSettings(){\n  fetch('/settings/export').then(function(r){return r.text();}).then(function(t){"
    new = (
        "function exportSettings(){\n"
        "  fetch('/settings/export').then(function(r){return r.text();}).then(function(t){\n"
        "    try {\n"
        "      var meta = JSON.parse(t);\n"
        "      if (meta._secretsIncluded === false)\n"
        "        showToast('Backup created without WiFi or printer secrets');\n"
        "    } catch(e){}"
    )
    text = replace_once(text, old, new, "backup UI notice")
    p.write_text(text, encoding="utf-8")


def apply(repo: Path) -> None:
    patch_web_server(repo)
    patch_web_app(repo)


def main() -> int:
    ap = argparse.ArgumentParser(description="Apply Smart Home v8.2 secret-safe backup policy")
    ap.add_argument("--repo", required=True)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if not args.apply:
        raise SystemExit("Pass --apply")
    apply(Path(args.repo))
    print("Smart Home v8.2 secret-safe backup patch applied")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
