#!/usr/bin/env python3
from __future__ import annotations
import argparse, base64, zlib
from pathlib import Path

class PatchError(RuntimeError):
    pass

def once(text, old, new, label):
    n = text.count(old)
    if n != 1:
        raise PatchError(f"{label}: expected 1 match, found {n}")
    return text.replace(old, new, 1)

def replace_region(text, start, end, new, label):
    a = text.find(start)
    if a < 0:
        raise PatchError(f"{label}: start not found")
    b = text.find(end, a + len(start))
    if b < 0:
        raise PatchError(f"{label}: end not found")
    return text[:a] + new + text[b:]

def payload(name: str) -> str:
    p = Path(__file__).resolve().parent / '.bambuhelper-validation' / name
    return zlib.decompress(base64.b64decode(p.read_text().strip())).decode()

def patch_smart_hub(repo: Path, hub_block: str, touch_handler: str):
    p = repo / 'src' / 'smart_hub.cpp'
    t = p.read_text()
    if '#include "button.h"' not in t:
        t = once(t, '#include "recovery_manager.h"\n', '#include "recovery_manager.h"\n#include "button.h"\n', 'button health include')
    t = replace_region(
        t,
        'static void uiCopyShort(char* out, size_t len, const char* src, size_t maxChars) {',
        '\n\n} // namespace\n\nvoid smartHubInit() {',
        hub_block,
        'unified hub visual block')
    old = '''bool smartHubShouldYieldToPrinter(bool printing) {\n  if (getScreenState() == SCREEN_HUB_PRINTER) return false;\n  if (!g_cfg.enabled || !printing || g_cfg.returnSeconds == 0) return false;\n  if (g_userHoldUntilMs == 0) return true;\n  return (long)(millis() - g_userHoldUntilMs) >= 0;\n}'''
    new = '''bool smartHubShouldYieldToPrinter(bool printing) {\n  // v9.8: native Smart Home Printer is the normal live-print surface.\n  // Classic Printer remains an explicit advanced destination.\n  (void)printing;\n  return false;\n}'''
    t = once(t, old, new, 'live-print unification')
    a = t.find('bool smartHubHandleTouch(uint16_t rawX, uint16_t rawY, bool longPress) {')
    b = t.find('\n\nconst SmartHubConfig& smartHubGetConfig()', a)
    if a < 0 or b < 0:
        raise PatchError('touch handler boundaries missing')
    t = t[:a] + touch_handler + t[b:]
    p.write_text(t)

def patch_build(repo: Path):
    p = repo / 'include' / 'smart_home_build.h'
    t = p.read_text()
    t = once(t, '#define SMART_HOME_VERSION "v9.7.2"', '#define SMART_HOME_VERSION "v9.8"', 'version')
    t = once(t, '#define SMART_HOME_PROFILE "interaction-layout-touch-recovery-reliability"', '#define SMART_HOME_PROFILE "unified-responsive-display"', 'profile')
    t = once(t, '#define SMART_HOME_BUILD_LABEL "Smart Home v9.7.2 Recovery Safari RC1"', '#define SMART_HOME_BUILD_LABEL "Smart Home v9.8 Unified Display RC1"', 'build label')
    p.write_text(t)

def patch_display_ui(repo: Path):
    p = repo / 'src' / 'display_ui.cpp'
    t = p.read_text()
    t = once(t, 'tft.drawString("v9 PRINT",312,15);', 'tft.drawString("CLASSIC",312,15);', 'legacy print version label')
    old = '''static void v9pBottomNav() {\n  tft.fillRoundRect(8,438,304,34,11,V9P_PANEL2);\n  tft.drawRoundRect(8,438,304,34,11,V9P_BORDER);\n  const char* labels[4]={"HOME","PRINTER","WORKSHOP","SYSTEM"};\n  const int16_t xs[4]={46,121,203,277};\n  for(int i=0;i<4;i++){\n    uint16_t c=(i==1)?V9P_ORANGE:V9P_DIM;\n    if(i==1){tft.fillRoundRect(xs[i]-31,442,62,26,9,0x2103);tft.drawRoundRect(xs[i]-31,442,62,26,9,V9P_ORANGE);}\n    tft.setTextDatum(MC_DATUM); setFont(tft,FONT_SMALL); tft.setTextColor(c,i==1?0x2103:V9P_PANEL2);\n    tft.drawString(labels[i],xs[i],455);\n  }\n}'''
    new = '''static void v9pBottomNav() {\n  // Explicit legacy surface. Normal live printing stays in Smart Home Printer,\n  // which owns the real Home / Printer / Workshop / More navigation.\n  tft.fillRoundRect(8,438,304,34,11,V9P_PANEL2);\n  tft.drawRoundRect(8,438,304,34,11,V9P_BORDER);\n  tft.setTextDatum(ML_DATUM); setFont(tft,FONT_SMALL); tft.setTextColor(V9P_DIM,V9P_PANEL2);\n  tft.drawString("CLASSIC PRINTER",20,455);\n  tft.setTextDatum(MR_DATUM); tft.setTextColor(V9P_ORANGE,V9P_PANEL2);\n  tft.drawString("tap → Smart Home",300,455);\n}'''
    t = once(t, old, new, 'legacy nav de-duplication')
    t = once(t, 'tft.drawString("LIVE PRINT COMMAND CENTER",20,412);', 'tft.drawString("CLASSIC LIVE PRINT",20,412);', 'legacy context label')
    p.write_text(t)

def patch_web(repo: Path, js: str, css: str):
    p = repo / 'web' / 'app.js'
    t = p.read_text()
    t = once(t, "ccText('ccFirmware',d.build||'Smart Home v9.4');", "ccText('ccFirmware',d.build||'Smart Home');", 'browser build fallback')
    t = once(t, "pill.textContent = 'Smart Home v9.4 DEV';", "pill.textContent = 'Smart Home DEV';", 'browser dev pill')
    if 'Smart Home v9.8 unified physical display preview' not in t:
        t += js
    p.write_text(t)
    p = repo / 'web' / 'app.css'
    t = p.read_text()
    if 'Smart Home v9.8 unified display-system preview' not in t:
        t += css
    p.write_text(t)

def verify(repo: Path):
    hub = (repo / 'src' / 'smart_hub.cpp').read_text()
    app = (repo / 'web' / 'app.js').read_text()
    css = (repo / 'web' / 'app.css').read_text()
    build = (repo / 'include' / 'smart_home_build.h').read_text()
    disp = (repo / 'src' / 'display_ui.cpp').read_text()
    for x in ['HubRect', 'hubLandscape()', 'uiFitText', 'buttonTouchReadFailures', 'SMART_HOME_BUILD_LABEL', 'hubMoreRect(i).contains', 'hubPrinterActionRect(0).contains']:
        if x not in hub:
            raise PatchError('missing hub invariant ' + x)
    for x in ['v98DeviceCanvas', 'v98SetPreviewOrientation', '480×320', 'v98FamilyFromName']:
        if x not in app:
            raise PatchError('missing browser invariant ' + x)
    for x in ['.v98-device-canvas.portrait', '.v98-device-canvas.landscape']:
        if x not in css:
            raise PatchError('missing css invariant ' + x)
    if 'Smart Home v9.8 Unified Display RC1' not in build:
        raise PatchError('build identity missing')
    if '"v9 PRINT"' in disp:
        raise PatchError('stale live-print visible version')
    if 'Smart Home v9.7' in hub:
        raise PatchError('stale visible v9.7 literal in hub')

def apply(repo: Path):
    patch_smart_hub(repo, payload('v98-hub.zlib.b64'), payload('v98-touch.zlib.b64'))
    patch_build(repo)
    patch_display_ui(repo)
    patch_web(repo, payload('v98-webjs.zlib.b64'), payload('v98-webcss.zlib.b64'))
    verify(repo)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', default='.')
    ap.add_argument('--apply', action='store_true')
    args = ap.parse_args()
    repo = Path(args.repo).resolve()
    if not args.apply:
        print('Smart Home v9.8 unified display patch ready. Use --apply.')
        return 0
    apply(repo)
    print('Smart Home v9.8 Unified Display applied')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
