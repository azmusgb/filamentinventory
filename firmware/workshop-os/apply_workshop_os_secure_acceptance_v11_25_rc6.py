#!/usr/bin/env python3
"""Apply Workshop OS v11.25 RC6 secure physical-acceptance hardening after RC5.

RC6 deliberately keeps the RC5 UI5 presentation authority and removes the
physical-test station-LAN no-code bypass. It restores boot-scoped portal-code
authentication, makes the access state visible on-device, and exposes non-secret
runtime auth/network mode diagnostics through /recovery/status.
"""
from __future__ import annotations

import argparse
from pathlib import Path

TEMP_MARKER = "WORKSHOP_OS_TEMP_NO_CODE_LAN"


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
    brace = text.find("{", start)
    if brace < 0:
        raise PatchError("opening brace missing")
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
    raise PatchError("unterminated block")


def replace_block(text: str, signature: str, replacement: str, label: str) -> str:
    start = text.find(signature)
    if start < 0 or text.find(signature, start + 1) >= 0:
        raise PatchError(f"{label}: signature missing/non-unique")
    return text[:start] + replacement.rstrip() + text[block_end(text, start):]


def remove_preprocessor_block(text: str, start_marker: str, label: str) -> str:
    pos = text.find(start_marker)
    if pos < 0:
        return text
    end = text.find("#endif", pos)
    if end < 0:
        raise PatchError(f"{label}: #endif missing")
    end = text.find("\n", end)
    end = len(text) if end < 0 else end + 1
    return text[:pos] + text[end:]


def patch_build(repo: Path) -> None:
    path = repo / "include" / "smart_home_build.h"
    text = load(path)
    if 'Workshop OS v11.25 RC5 Native UI Acceptance' not in text:
        raise PatchError("RC6 requires RC5 source to be applied first")

    text = once(
        text,
        '#define SMART_HOME_BUILD_LABEL "Workshop OS v11.25 RC5 Native UI Acceptance"',
        '#define SMART_HOME_BUILD_LABEL "Workshop OS v11.25 RC6 Secure Physical Acceptance"',
        "RC6 build label",
    )
    text = once(
        text,
        '#define SMART_HOME_PROFILE "native-ui-acceptance"',
        '#define SMART_HOME_PROFILE "secure-physical-acceptance"',
        "RC6 build profile",
    )
    text = text.replace(
        "\n// TEMPORARY physical-acceptance mode; remove before promotion.\n"
        f"#define {TEMP_MARKER} 1\n",
        "\n",
    )
    if TEMP_MARKER in text:
        raise PatchError("RC6 build still contains temporary no-code marker")
    if "WORKSHOP_OS_V11_25_SECURE_ACCEPTANCE_RC6" not in text:
        text += (
            "\n#define WORKSHOP_OS_V11_25_SECURE_ACCEPTANCE_RC6 1\n"
            '#define WORKSHOP_OS_AUTH_MODE "portal-code"\n'
        )
    path.write_text(text, encoding="utf-8")


def patch_security(repo: Path) -> None:
    path = repo / "src" / "security_manager.cpp"
    text = load(path)

    if '#include "smart_home_build.h"' not in text:
        text = once(
            text,
            '#include "security_manager.h"\n',
            '#include "security_manager.h"\n#include "smart_home_build.h"\n',
            "RC6 build identity include",
        )

    text = remove_preprocessor_block(
        text,
        "#if !defined(WORKSHOP_OS_TEMP_NO_CODE_LAN) || !WORKSHOP_OS_TEMP_NO_CODE_LAN",
        "RC5 test-build compile guard",
    )
    text = replace_block(
        text,
        "bool securitySessionValid(WebServer& server)",
        """bool securitySessionValid(WebServer& server) {
  ensureInitialized();
  return cookieMatches(server);
}""",
        "secure session policy",
    )
    text = remove_preprocessor_block(
        text,
        "#if defined(WORKSHOP_OS_TEMP_NO_CODE_LAN) && WORKSHOP_OS_TEMP_NO_CODE_LAN",
        "temporary station-LAN authorization bypass",
    )

    fail_closed_guard = """#if defined(WORKSHOP_OS_TEMP_NO_CODE_LAN)
#error \"RC6 secure physical acceptance forbids WORKSHOP_OS_TEMP_NO_CODE_LAN\"
#endif
"""
    if "RC6 secure physical acceptance forbids" not in text:
        anchor = '#include "smart_home_build.h"\n'
        text = once(text, anchor, anchor + "\n" + fail_closed_guard, "RC6 secure compile guard")

    if "if (!isAPMode()) return true;" in text or TEMP_MARKER in text.replace(fail_closed_guard, ""):
        raise PatchError("RC6 security still contains station-LAN no-code bypass")
    if "if (mutating && !sameOrigin(server))" not in text:
        raise PatchError("RC6 lost same-origin mutation guard")
    path.write_text(text, encoding="utf-8")


def patch_hub(repo: Path) -> None:
    path = repo / "src" / "smart_hub.cpp"
    text = load(path)

    old_landscape = (
        'hubV1125Card(access,W25_WARN,false);uiDrawFit("ACCESS",access.x+10,access.y+10,access.w-20,FONT_SMALL,TL_DATUM,W25_MUTED,W25_SURFACE);'
        'uiDrawFit("OPEN",access.x+10,access.y+36,access.w-20,FONT_LARGE,TL_DATUM,W25_WARN,W25_SURFACE);'
        'uiDrawFit("TEST / NO CODE",access.x+10,access.y+72,access.w-20,FONT_SMALL,TL_DATUM,W25_MUTED,W25_SURFACE);'
    )
    new_landscape = (
        'hubV1125Card(access,W25_ACCENT,false);uiDrawFit("ACCESS",access.x+10,access.y+10,access.w-20,FONT_SMALL,TL_DATUM,W25_MUTED,W25_SURFACE);'
        'uiDrawFit(securityPortalCode(),access.x+10,access.y+36,access.w-20,FONT_BODY,TL_DATUM,W25_TEXT,W25_SURFACE);'
        'uiDrawFit("PORTAL CODE",access.x+10,access.y+72,access.w-20,FONT_SMALL,TL_DATUM,W25_ACCENT,W25_SURFACE);'
    )
    text = once(text, old_landscape, new_landscape, "System landscape secure access card")

    old_portrait = (
        'hubV1125Card(access,W25_WARN,false);uiDrawFit("ACCESS",access.x+12,access.y+12,access.w-24,FONT_SMALL,TL_DATUM,W25_MUTED,W25_SURFACE);'
        'uiDrawFit("OPEN · TEST / NO CODE",access.x+12,access.y+42,access.w-24,FONT_BODY,TL_DATUM,W25_WARN,W25_SURFACE);'
    )
    new_portrait = (
        'hubV1125Card(access,W25_ACCENT,false);uiDrawFit("ACCESS",access.x+12,access.y+12,access.w-24,FONT_SMALL,TL_DATUM,W25_MUTED,W25_SURFACE);'
        'uiDrawFit(securityPortalCode(),access.x+12,access.y+42,access.w-24,FONT_BODY,TL_DATUM,W25_TEXT,W25_SURFACE);'
    )
    text = once(text, old_portrait, new_portrait, "System portrait secure access card")

    text = text.replace('"TEST / NO CODE"', '"PORTAL CODE"')

    if "TEST / NO CODE" in text:
        raise PatchError("RC6 native UI still contains no-code test copy")
    if text.count("securityPortalCode()") < 2:
        raise PatchError("RC6 System screen does not expose portal code in both layouts")
    path.write_text(text, encoding="utf-8")


def patch_web(repo: Path) -> None:
    path = repo / "src" / "web_server.cpp"
    text = load(path)

    login = r'''static void sendPortalLoginPage(bool badCode = false) {
  String html;
  html.reserve(3600);
  html += F("<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
            "<meta name='color-scheme' content='dark'><title>Workshop OS Secure Sign In</title><style>"
            ":root{color-scheme:dark;--bg:#0b0e10;--surface:#121719;--surface2:#171e20;--line:#2a3436;--text:#f4f7f6;--muted:#98a6a3;--accent:#20b7a8;--danger:#ef7676;}"
            "*{box-sizing:border-box}body{margin:0;min-height:100vh;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}"
            ".wrap{max-width:430px;margin:0 auto;padding:40px 22px}.eyebrow{color:var(--accent);font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;margin-bottom:10px}"
            ".brand{font-weight:820;font-size:29px;letter-spacing:-.02em;margin-bottom:8px}.sub{color:var(--muted);line-height:1.5;margin-bottom:24px}"
            ".card{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:22px;box-shadow:0 14px 40px #0008}"
            "label{display:block;font-weight:760;margin-bottom:10px}input{width:100%;min-height:52px;font-size:22px;letter-spacing:.14em;text-transform:uppercase;background:var(--surface2);color:var(--text);border:1px solid #3b494b;border-radius:12px;padding:13px 14px;outline:none}"
            "input:focus-visible{border-color:var(--accent);box-shadow:0 0 0 3px #20b7a833}button{width:100%;min-height:52px;margin-top:16px;border:1px solid #37c9bb;border-radius:12px;padding:13px;background:var(--accent);color:#06110f;font-size:17px;font-weight:850;cursor:pointer}"
            "button:focus-visible{outline:3px solid #8ff4e8;outline-offset:3px}.hint{color:var(--muted);font-size:14px;line-height:1.5;margin-top:16px}.err{background:#351c1f;color:#ffd0d0;border:1px solid #74343b;border-radius:10px;padding:11px 12px;margin-bottom:15px}"
            "@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}@media(forced-colors:active){input,button,.card{forced-color-adjust:auto;border:1px solid CanvasText}}"
            "</style></head><body><main class='wrap'><div class='eyebrow'>Secure LAN access</div><div class='brand'>Workshop OS</div>"
            "<div class='sub'>Enter the current portal code shown on the physical System screen. The session is boot-scoped and stays local to this device.</div><div class='card'>");
  if (badCode) html += F("<div class='err' role='alert'>That portal code was not accepted. Check System on the WS350 and try again.</div>");
  html += F("<form method='post' action='/login'><label for='code'>Portal code</label>"
            "<input id='code' name='code' maxlength='10' minlength='10' pattern='[A-HJ-NP-Z2-9]{10}' autocomplete='one-time-code' autocapitalize='characters' spellcheck='false' autofocus required>"
            "<button type='submit'>Sign in securely</button></form>"
            "<div class='hint'>The code changes whenever the display reboots. No Bambu account, printer access code, or cloud password is requested here.</div></div></main></body></html>");
  server.sendHeader("Cache-Control", "no-store");
  server.send(badCode ? 401 : 200, "text/html", html);
}'''
    text = replace_block(text, "static void sendPortalLoginPage(bool badCode = false)", login, "secure login page")

    status = r'''static void handleRecoveryStatus(){
  JsonDocument d;
  const bool ap=isAPMode();
  const bool stationConnected=WiFi.status()==WL_CONNECTED;
  d["build"]=SMART_HOME_BUILD_LABEL;
  d["safeMode"]=recoverySafeModeActive();
  d["authMode"]=ap?(recoverySafeModeActive()?"recovery-safe-mode":"setup-ap"):WORKSHOP_OS_AUTH_MODE;
  d["apMode"]=ap;
  d["stationConnected"]=stationConnected;
  d["stationIp"]=stationConnected?WiFi.localIP().toString():String("");
  d["softApIp"]=ap?WiFi.softAPIP().toString():String("");
  d["ip"]=ap?WiFi.softAPIP().toString():WiFi.localIP().toString();
  d["touch"]=buttonType==BTN_TOUCHSCREEN?"FT6336 · FORCED ON":"NOT READY";
#if defined(USE_FT6336)
  const uint32_t touchLast=buttonTouchLastGoodPollMs();
  d["touchResponsive"]=touchLast>0 && (uint32_t)(millis()-touchLast)<2000;
  d["touchReadFailures"]=buttonTouchReadFailures();
  d["touchRecoveries"]=buttonTouchRecoveryCount();
  d["touchPresses"]=buttonPressCount();
#endif
  d["runningSlot"]=recoveryCurrentSlot();
  d["knownGood"]=recoveryKnownGoodSlot();
  d["fallback"]=recoveryFallbackSlot();
  d["candidatePending"]=recoveryCandidatePending();
  d["candidateAttempts"]=recoveryCandidateAttempts();
  d["webReady"]=recoveryWebReady();
  d["rapidBootCount"]=recoveryRapidBootCount();
  String o;serializeJson(d,o);server.sendHeader("Cache-Control","no-store");server.send(200,"application/json",o);
}'''
    text = replace_block(text, "static void handleRecoveryStatus()", status, "RC6 recovery status observability")

    text = once(
        text,
        "['Auth','ON · PORTAL CODE']",
        "['Auth',d.authMode==='portal-code'?'ON · PORTAL CODE':(d.authMode||'UNKNOWN')]",
        "dynamic recovery auth row",
    )

    path.write_text(text, encoding="utf-8")


def patch(repo: Path) -> None:
    patch_build(repo)
    patch_security(repo)
    patch_hub(repo)
    patch_web(repo)
    print("Workshop OS v11.25 RC6 Secure Physical Acceptance applied")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if not args.apply:
        raise SystemExit("refusing to modify source without --apply")
    try:
        patch(Path(args.repo).resolve())
    except PatchError as exc:
        raise SystemExit(f"FAIL: {exc}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
