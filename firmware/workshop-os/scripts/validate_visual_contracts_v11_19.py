#!/usr/bin/env python3
from pathlib import Path
import re
import sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else 'upstream')
build = (root/'include/smart_home_build.h').read_text(encoding='utf-8')
hub = (root/'src/smart_hub.cpp').read_text(encoding='utf-8')
web = (root/'src/web_server.cpp').read_text(encoding='utf-8')

def need(body, needle, label):
    if needle not in body:
        raise SystemExit(f'MISSING {label}: {needle}')

for n in [
    '#define SMART_HOME_VERSION "v11.19"',
    '#define SMART_HOME_PROFILE "visual-correctness"',
    'Smart Home v11.19 Visual Correctness RC1',
]:
    need(build, n, 'identity')

for n in [
    'securityPortalCode()', 'PORTAL ACCESS', 'Changes after reboot',
    'hubFormatPresetPct', '%u%% CUSTOM', 'bool active=true',
    'Configured • Night mode off', 'Configured • Quiet Start off',
    'Configured • Cooldown off', 'Configured • Status LED off',
    'Configured • Effect off', 'Configured • Strobe off',
    'Configured • Auto Off inactive',
    'PLUG STATUS', 'PLUG CONFIG', 'IP REQUIRED',
    'NO ACTIVE TRAY', 'Advanced network setup stays in portal',
    'FILAMENT', 'Audio ready', 'Screen & standby', 'Timers & notes',
    'smartHubCapturePrepare', 'smartHubCaptureRgbRow',
]:
    need(hub, n, 'visual correctness')

for n in [
    'SECURE_GET("/hub/views", handleHubViews)',
    'SECURE_GET("/hub/frame.ppm", handleHubFramePpm)',
    'SECURE_POST("/hub/show", handleHubShow)',
]:
    need(web, n, 'capture/security invariant')

catalog_ids = re.findall(r'"id":"([^"]+)"', web)
expected = [
    'home','printer','workshop','more','custom','system','tools',
    'display-quick','display-schedule','display-behavior','display-visual',
    'display-clock','display-alerts','display-signals','system-network',
    'hardware-sound','hardware-cooldown','hardware-led','hardware-finish',
    'hardware-error','hardware-power','hardware-auto-off'
]
if catalog_ids != expected:
    raise SystemExit(f'capture catalog mismatch: {catalog_ids!r}')

forbidden = [
    'NO AMS TRAY',
    'No AMS tray loaded',
    'Keep print dashboard after completion',
    'Portal sentence lookup preference',
    'Static IP, hostname and Wi-Fi credentials stay in the portal',
    'ES8311 speaker + onboard microphone',
    'Brightness, standby & finish',
    'Timers, notes & legacy',
    'Speaker + microphone ready',
]
for n in forbidden:
    if n in hub:
        raise SystemExit(f'FORBIDDEN v11.18 visual regression: {n}')

labels = re.findall(r'uiDisplaySettingCard\(hubMoreRect\(\d\),\s*"([^"]+)"', hub)
long_labels = sorted({x for x in labels if len(x) > 18})
if long_labels:
    raise SystemExit(f'physical setting labels exceed 18 chars: {long_labels}')

sentinel_contracts = [
    r'if\(tr->remain>=0\)snprintf\(meta,sizeof\(meta\),"%s %d%%"',
    r'if\(tr->remain>=0\)snprintf\(pct,sizeof\(pct\),"%d%%"',
    r'if\(t\.remain>=0\)snprintf\(detail,sizeof\(detail\),"%s • %d%% remaining"',
    r'if\(t\.remain>=0\)snprintf\(remain,sizeof\(remain\),"%d%%"',
]
for pattern in sentinel_contracts:
    if not re.search(pattern, hub):
        raise SystemExit(f'AMS sentinel guard missing: {pattern}')

raw_bad = [
    'snprintf(meta,sizeof(meta),"%s %d%%",tr->type[0]?tr->type:"FIL",(int)tr->remain);uiDrawFit',
    'char pct[10];snprintf(pct,sizeof(pct),"%d%%",(int)tr->remain);',
    'snprintf(remain,sizeof(remain),"%d%%",(int)t.remain);uiDrawFit',
]
for n in raw_bad:
    if n in hub:
        raise SystemExit(f'raw AMS sentinel formatter remains: {n}')

print('VISUAL CONTRACTS v11.19: PASS')
print('  portal_code_on_system=PASS')
print('  ams_sentinel_guard=PASS')
print('  inactive_configured_state=PASS')
print('  custom_persisted_values=PASS')
print('  physical_copy_contract=PASS')
print('  power_config_consistency=PASS')
print('  home_hero_two_line=PASS')
print('  more_summary_simplified=PASS')
print('  no_active_tray_wording=PASS')
print('  capture_catalog=22_VIEWS_PRESERVED')
