#!/usr/bin/env python3
from __future__ import annotations
import argparse
from pathlib import Path

class PatchError(RuntimeError):
    pass

def once(text: str, old: str, new: str, label: str) -> str:
    n = text.count(old)
    if n != 1:
        raise PatchError(f"{label}: expected 1 match, found {n}")
    return text.replace(old, new, 1)

def replace_region(text: str, start: str, end: str, replacement: str, label: str) -> str:
    a = text.find(start)
    if a < 0:
        raise PatchError(f"{label}: start anchor not found")
    b = text.find(end, a + len(start))
    if b < 0:
        raise PatchError(f"{label}: end anchor not found")
    return text[:a] + replacement + text[b:]

def patch_build(repo: Path) -> None:
    p = repo / 'include' / 'smart_home_build.h'
    t = p.read_text()
    t = once(t, '#define SMART_HOME_VERSION "v9.9"', '#define SMART_HOME_VERSION "v9.9.1"', 'version')
    t = once(t, '#define SMART_HOME_PROFILE "display-experience"', '#define SMART_HOME_PROFILE "display-experience-boot-persistence"', 'profile')
    t = once(t, '#define SMART_HOME_BUILD_LABEL "Smart Home v9.9 Display Experience RC1"', '#define SMART_HOME_BUILD_LABEL "Smart Home v9.9.1 Boot + Persistence RC1"', 'build label')
    p.write_text(t)

def patch_display(repo: Path) -> None:
    p = repo / 'src' / 'display_ui.cpp'
    t = p.read_text()
    if '#include "smart_home_build.h"' not in t:
        t = once(t, '#include "smart_hub.h"\n', '#include "smart_hub.h"\n#include "smart_home_build.h"\n', 'build identity include')

    start = '  // Splash screen — center on actual canvas (rotation-aware for 240x320)\n  {'
    end = '\n}\n\n// Repaint helper:'
    splash = r'''  // Smart Home v9.9.1: workshop-OS boot splash. This is deliberately
  // rendered only after the panel/sprite is ready, so a reboot never flashes the
  // legacy screen between panel init and the Smart Home surface.
  {
    const int16_t sw = uiW();
    const int16_t sh = uiH();
    const bool landscape = sw > sh;
    const int16_t cx = sw / 2;
    const int16_t logoY = landscape ? 58 : 104;
    const int16_t heroY = landscape ? 112 : 176;
    const int16_t railY = landscape ? (sh - 46) : (sh - 82);
    const int16_t railX = 24;
    const int16_t railW = sw - 48;

    tft.fillScreen(CLR_BG);

    // Brand mark: simple enough to remain crisp on the 320x480 panel, but
    // visually distinct from both stock BambuHelper and the normal page chrome.
    tft.fillRoundRect(cx - 30, logoY - 30, 60, 60, 16, CLR_ORANGE);
    tft.drawRoundRect(cx - 30, logoY - 30, 60, 60, 16, TFT_WHITE);
    tft.setTextDatum(MC_DATUM);
    setFont(tft, FONT_LARGE);
    tft.setTextColor(TFT_WHITE, CLR_ORANGE);
    tft.drawString("WH", cx, logoY);

    setFont(tft, FONT_BODY);
    tft.setTextColor(CLR_TEXT, CLR_BG);
    tft.drawString("WAVESHARE HOME", cx, heroY);
    setFont(tft, FONT_SMALL);
    tft.setTextColor(CLR_ORANGE, CLR_BG);
    tft.drawString("WORKSHOP OS", cx, heroY + 24);
    tft.setTextColor(CLR_TEXT_DIM, CLR_BG);
    tft.drawString(SMART_HOME_VERSION, cx, heroY + 43);

    // Show the retained printer identity without ever putting the access code on
    // screen. Name -> serial -> generic fallback keeps this useful on first boot.
    uint8_t bootSlot = rotState.displayIndex < MAX_PRINTERS ? rotState.displayIndex : 0;
    const PrinterConfig& bootCfg = printers[bootSlot].config;
    const char* bootPrinter = bootCfg.name[0] ? bootCfg.name :
                              (bootCfg.serial[0] ? bootCfg.serial : "Local printer");
    char printerLine[64];
    snprintf(printerLine, sizeof(printerLine), "%s", bootPrinter);
    utf8TrimPartial(printerLine);
    setFont(tft, FONT_BODY);
    tft.setTextColor(CLR_TEXT, CLR_BG);
    tft.drawString(printerLine, cx, landscape ? 190 : 284);
    setFont(tft, FONT_SMALL);
    tft.setTextColor(CLR_GREEN, CLR_BG);
    tft.drawString("CONFIGURATION RETAINED", cx, landscape ? 211 : 308);

    // Boot rail: the remaining service initialization happens while this screen
    // stays visible. It avoids a visually dead two-second boot pause.
    tft.fillRoundRect(railX, railY, railW, 8, 4, CLR_TRACK);
    tft.fillRoundRect(railX, railY, (railW * 72) / 100, 8, 4, CLR_ORANGE);
    tft.fillCircle(railX + railW - 4, railY + 4, 3, CLR_TEXT_DIM);
    tft.setTextDatum(MC_DATUM);
    setFont(tft, FONT_SMALL);
    tft.setTextColor(CLR_TEXT_DIM, CLR_BG);
    tft.drawString("Starting local control plane...", cx, railY + 25);
    if (!landscape) {
      tft.drawString("Recovery ready  |  settings preserved", cx, sh - 24);
    }
#if PANEL_REQUIRES_AXS_FRAME_SPRITE
    flushFrame();
#endif
  }
'''
    t = replace_region(t, start, end, splash, 'boot splash')
    p.write_text(t)

def patch_web(repo: Path) -> None:
    p = repo / 'src' / 'web_server.cpp'
    t = p.read_text()

    # The config endpoint intentionally does not reveal the access code. Expose
    # only its presence so post-OTA acceptance can prove the secret was retained.
    t = once(t,
        '  doc["serial"] = cfg.serial;\n  doc["region"] = cfg.region == REGION_EU ? "eu" : (cfg.region == REGION_CN ? "cn" : "us");',
        '  doc["serial"] = cfg.serial;\n  doc["hasAccessCode"] = cfg.accessCode[0] != \'\\0\';\n  doc["configStorage"] = "NVS / OTA-preserved";\n  doc["region"] = cfg.region == REGION_EU ? "eu" : (cfg.region == REGION_CN ? "cn" : "us");',
        'non-secret retention status')

    # Flush every printer slot to the existing NVS schema immediately before
    # arming/rebooting into an accepted OTA image. OTA writes only the app slot;
    # this makes the retention contract explicit and prevents an in-RAM update
    # from being lost if the user updates firmware right after editing a printer.
    t = once(t,
        '  manualOtaPhase = "accepted";\n  manualOtaMessage = "Firmware accepted. Restarting";\n  recoveryArmCandidateBoot();',
        '  manualOtaPhase = "accepted";\n  manualOtaMessage = "Firmware accepted. Restarting";\n  for (uint8_t i = 0; i < MAX_PRINTERS; ++i) {\n    savePrinterConfig(i);\n  }\n  Serial.println("OTA: printer configuration flushed to NVS before candidate reboot");\n  recoveryArmCandidateBoot();',
        'OTA printer configuration flush')

    p.write_text(t)

def verify(repo: Path) -> None:
    build = (repo / 'include' / 'smart_home_build.h').read_text()
    display = (repo / 'src' / 'display_ui.cpp').read_text()
    web = (repo / 'src' / 'web_server.cpp').read_text()
    settings = (repo / 'src' / 'settings.cpp').read_text()

    for needle in ['Smart Home v9.9.1 Boot + Persistence RC1', 'display-experience-boot-persistence']:
        if needle not in build:
            raise PatchError('missing build identity: ' + needle)
    for needle in ['WAVESHARE HOME', 'WORKSHOP OS', 'CONFIGURATION RETAINED', 'Starting local control plane', 'SMART_HOME_VERSION']:
        if needle not in display:
            raise PatchError('missing splash invariant: ' + needle)
    for needle in ['doc["hasAccessCode"]', 'NVS / OTA-preserved', 'savePrinterConfig(i)', 'printer configuration flushed to NVS']:
        if needle not in web:
            raise PatchError('missing retention invariant: ' + needle)

    # Existing BambuHelper persistence is the canonical secret store. Guard its
    # key schema and blank-password behavior instead of duplicating secrets into
    # another namespace.
    for needle in ['p%d_ip', 'p%d_serial', 'p%d_code', 'p%d_name']:
        if needle not in settings:
            raise PatchError('printer NVS key contract missing: ' + needle)
    if 'prefs.putString(key, cfg.accessCode)' not in settings:
        raise PatchError('access-code NVS write contract missing')
    if 'prefs.getString(key, "").c_str(), sizeof(cfg.accessCode)' not in settings:
        raise PatchError('access-code NVS load contract missing')
    if 'server.hasArg("code") && server.arg("code").length() > 0' not in web:
        raise PatchError('blank access-code preserve contract missing')

    # OTA must never clear printer configuration or NVS as part of acceptance.
    a = web.find('static void handleOtaFinish()')
    b = web.find('// ---------------------------------------------------------------------------\n//  Hardware commissioning health snapshot', a)
    if a < 0 or b < 0:
        raise PatchError('OTA finish boundaries missing')
    ota = web[a:b]
    for forbidden in ['clearPrinterConfig(', 'prefs.clear(', 'factoryReset']:
        if forbidden in ota:
            raise PatchError('OTA retention violation: ' + forbidden)

def apply(repo: Path) -> None:
    patch_build(repo)
    patch_display(repo)
    patch_web(repo)
    verify(repo)

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', default='.')
    ap.add_argument('--apply', action='store_true')
    args = ap.parse_args()
    if not args.apply:
        print('Smart Home v9.9.1 boot + persistence patch ready. Use --apply.')
        return 0
    apply(Path(args.repo).resolve())
    print('Smart Home v9.9.1 Boot + Persistence applied')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
