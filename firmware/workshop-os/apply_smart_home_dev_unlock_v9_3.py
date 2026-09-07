#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path


class PatchError(RuntimeError):
    pass


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise PatchError(f"{label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)


def patch_security(repo: Path) -> None:
    p = repo / "src" / "security_manager.cpp"
    text = p.read_text(encoding="utf-8")

    text = replace_once(
        text,
        '#include "wifi_manager.h"\n',
        '#include "wifi_manager.h"\n#include "smart_home_build.h"\n',
        "security build include",
    )

    marker = 'bool g_sessionTokenReady = false;\n\n'
    helper = '''bool g_sessionTokenReady = false;\n\nstatic bool portalAuthRequired() {\n#if defined(BOARD_IS_WS350) && defined(SMART_HOME_DEV_UNLOCK) && SMART_HOME_DEV_UNLOCK\n  return false;\n#else\n  return true;\n#endif\n}\n\n'''
    text = replace_once(text, marker, helper, "portal auth policy")

    text = replace_once(
        text,
        '''bool securitySessionValid(WebServer& server) {\n  if (isAPMode()) return true;\n  ensureInitialized();\n  return cookieMatches(server);\n}\n''',
        '''bool securitySessionValid(WebServer& server) {\n  if (isAPMode()) return true;\n  if (!portalAuthRequired()) return true;\n  ensureInitialized();\n  return cookieMatches(server);\n}\n''',
        "session dev unlock",
    )

    text = replace_once(
        text,
        '''bool securityAuthorize(WebServer& server, bool mutating) {\n  if (isAPMode()) return true;\n  ensureInitialized();\n\n  if (!cookieMatches(server)) {\n''',
        '''bool securityAuthorize(WebServer& server, bool mutating) {\n  if (isAPMode()) return true;\n  ensureInitialized();\n\n  // Development phase: the WS350 portal stays open on the trusted LAN so a\n  // display/input regression cannot strand the owner behind a one-time code.\n  // Mutating browser requests still keep same-origin protection.\n  if (!portalAuthRequired()) {\n    if (mutating && !sameOrigin(server)) {\n      server.send(403, "application/json",\n          "{\\\"status\\\":\\\"error\\\",\\\"message\\\":\\\"Rejected by Smart Home same-origin protection.\\\"}");\n      return false;\n    }\n    return true;\n  }\n\n  if (!cookieMatches(server)) {\n''',
        "authorize dev unlock",
    )

    p.write_text(text, encoding="utf-8")


def patch_touch_guard(repo: Path) -> None:
    p = repo / "src" / "settings.cpp"
    text = p.read_text(encoding="utf-8")

    old = '''#if defined(USE_CST816) || defined(USE_CST328) || defined(USE_XPT2046) || defined(USE_FT5X06) || defined(USE_FT6336) || defined(USE_AXS_TOUCH) || defined(TOUCH_CS)\n  buttonType = (ButtonType)prefs.getUChar("btn_type", BTN_TOUCHSCREEN);\n#else\n  buttonType = (ButtonType)prefs.getUChar("btn_type", BTN_DISABLED);\n#endif\n'''
    new = '''#if defined(USE_CST816) || defined(USE_CST328) || defined(USE_XPT2046) || defined(USE_FT5X06) || defined(USE_FT6336) || defined(USE_AXS_TOUCH) || defined(TOUCH_CS)\n  buttonType = (ButtonType)prefs.getUChar("btn_type", BTN_TOUCHSCREEN);\n#else\n  buttonType = (ButtonType)prefs.getUChar("btn_type", BTN_DISABLED);\n#endif\n#if defined(BOARD_IS_WS350)\n  // The WS350 has an integrated FT6336 panel. During development it must never\n  // inherit a stale persisted Disabled input mode across OTA and become\n  // unreachable from the physical UI.\n  buttonType = BTN_TOUCHSCREEN;\n#endif\n'''
    text = replace_once(text, old, new, "WS350 boot touch guard")
    p.write_text(text, encoding="utf-8")

    p = repo / "src" / "web_server.cpp"
    text = p.read_text(encoding="utf-8")
    old = '''  // Button settings\n  if (server.hasArg("btntype")) {\n    uint8_t bt = server.arg("btntype").toInt();\n    if (bt <= 3) buttonType = (ButtonType)bt;\n  }\n'''
    new = '''  // Button settings\n#if defined(BOARD_IS_WS350)\n  // Integrated touch is a hardware requirement on this build. Do not permit a\n  // portal save to persist BTN_DISABLED and recreate the lockout state.\n  buttonType = BTN_TOUCHSCREEN;\n#else\n  if (server.hasArg("btntype")) {\n    uint8_t bt = server.arg("btntype").toInt();\n    if (bt <= 3) buttonType = (ButtonType)bt;\n  }\n#endif\n'''
    text = replace_once(text, old, new, "WS350 save touch guard")
    p.write_text(text, encoding="utf-8")


def patch_portal(repo: Path) -> None:
    p = repo / "web" / "app.js"
    text = p.read_text(encoding="utf-8")

    text = replace_once(
        text,
        "    pill.textContent = 'Smart Home v9.2';\n",
        "    pill.textContent = 'Smart Home v9.3 DEV';\n",
        "v9.3 portal identity",
    )

    anchor = "setTimeout(v92PortalEvolution, 0);\n\n/* BambuHelper smart display platform evolution v6 */\n"
    addition = r'''setTimeout(v92PortalEvolution, 0);

/* ============ Smart Home v9.3 development safety ============ */
function v93DevelopmentSafety(){
  var style = document.createElement('style');
  style.textContent = '.v93-dev-banner{margin:10px 0 16px;padding:11px 14px;border:1px solid rgba(255,176,32,.5);border-radius:10px;background:rgba(255,176,32,.09);color:var(--text);font-size:12.5px;line-height:1.45}.v93-dev-banner strong{color:#ffb020}';
  document.head.appendChild(style);

  var main = document.querySelector('main') || document.body;
  if (main && !document.getElementById('v93DevBanner')){
    var banner = document.createElement('div');
    banner.id = 'v93DevBanner';
    banner.className = 'v93-dev-banner';
    banner.innerHTML = '<strong>DEVELOPMENT MODE</strong> · Portal code is temporarily disabled on this WS350. Same-origin protection remains enabled for settings and OTA.';
    main.insertBefore(banner, main.firstChild);
  }

  var bt = document.getElementById('btntype');
  if (bt){
    bt.value = '3';
    bt.disabled = true;
    var row = bt.closest ? bt.closest('.field') : bt.parentElement;
    if (row && !document.getElementById('v93TouchNote')){
      var note = document.createElement('div');
      note.id = 'v93TouchNote';
      note.className = 'hint';
      note.textContent = 'WS350 integrated touchscreen is locked on during development to prevent a remote lockout.';
      row.appendChild(note);
    }
  }
}
setTimeout(v93DevelopmentSafety, 0);

/* BambuHelper smart display platform evolution v6 */
'''
    text = replace_once(text, anchor, addition, "v9.3 portal safety bootstrap")
    p.write_text(text, encoding="utf-8")


def patch_identity(repo: Path) -> None:
    p = repo / "include" / "smart_home_build.h"
    text = p.read_text(encoding="utf-8")
    text = replace_once(text, '#define SMART_HOME_VERSION "v9.2"\n', '#define SMART_HOME_VERSION "v9.3"\n', "version")
    text = replace_once(text, '#define SMART_HOME_PROFILE "smart-printer-control-plane"\n', '#define SMART_HOME_PROFILE "development-unlocked-control-plane"\n', "profile")
    text = replace_once(text, '#define SMART_HOME_BUILD_LABEL "Smart Home v9.2 Smart Printer RC1"\n', '#define SMART_HOME_BUILD_LABEL "Smart Home v9.3 Development Unlocked RC1"\n#define SMART_HOME_DEV_UNLOCK 1\n', "build label")
    p.write_text(text, encoding="utf-8")

    p = repo / "src" / "smart_hub.cpp"
    text = p.read_text(encoding="utf-8")
    text = replace_once(text, '    drawHeader("HOME", "v9.2", 0);\n', '    drawHeader("HOME", "v9.3 DEV", 0);\n', "home label")
    text = replace_once(text, '    drawHeader("SYSTEM", "v9.2", 3);\n', '    drawHeader("SYSTEM", "v9.3 DEV", 3);\n', "system label")
    text = replace_once(text, '  snprintf(build, sizeof(build), "Smart Printer RC1 • OTA + LAN discovery");\n', '  snprintf(build, sizeof(build), "DEV UNLOCKED • OTA + LAN discovery");\n', "system build label")
    p.write_text(text, encoding="utf-8")


def apply(repo: Path) -> None:
    patch_security(repo)
    patch_touch_guard(repo)
    patch_portal(repo)
    patch_identity(repo)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', default='.')
    ap.add_argument('--apply', action='store_true')
    args = ap.parse_args()
    repo = Path(args.repo).resolve()
    if not args.apply:
        print('Smart Home v9.3 development unlock patch ready. Use --apply to modify the target tree.')
        return 0
    apply(repo)
    print('Smart Home v9.3 Development Unlocked applied')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
