#!/usr/bin/env python3
from __future__ import annotations
import sys
from pathlib import Path


def need(body: str, marker: str, label: str) -> None:
    if marker not in body:
        raise SystemExit(f"V11.23 CONTRACT FAILED: missing {label}: {marker}")


def forbid(body: str, marker: str, label: str) -> None:
    if marker in body:
        raise SystemExit(f"V11.23 CONTRACT FAILED: forbidden {label}: {marker}")


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit(f"Usage: {sys.argv[0]} <reconstructed-repo>")
    repo=Path(sys.argv[1]).resolve()
    hub=(repo/'src/smart_hub.cpp').read_text(encoding='utf-8',errors='replace')
    web=(repo/'src/web_server.cpp').read_text(encoding='utf-8',errors='replace')
    build=(repo/'include/smart_home_build.h').read_text(encoding='utf-8',errors='replace')

    for m in ['SMART_HOME_VERSION "v11.23"','SMART_HOME_PROFILE "network-locale-layout"','Smart Home v11.23 Network Locale Layout RC1']:
        need(build,m,'release identity')
    for m in [
        'Smart Home v11.23 physical Network / Locale / Layout Expert controls',
        'HUB_NETWORK_PAGE_COUNT = 4',
        'hubStepTimezone', 'configTzTime(netSettings.timezoneStr',
        'hubLoadNetworkEdit', 'WiFi.localIP()', 'WiFi.gatewayIP()', 'WiFi.subnetMask()', 'WiFi.dnsIP()',
        'hubStaticNetworkValid', 'hubCommitNetworkAndRestart', 'netSettings.useDHCP=g_networkEditDhcp',
        'strlcpy(netSettings.staticIP', 'strlcpy(netSettings.gateway', 'strlcpy(netSettings.subnet', 'strlcpy(netSettings.dns',
        'g_networkSettingsPage==3&&longPress', 'ESP.restart()',
        '"TIME & LOCALE"', '"ADDRESS EDIT"', '"REVIEW"', '"HOSTNAME","PORTAL"',
        '"Hold to rotate clockwise"', 'dispSettings.rotation=(uint8_t)((dispSettings.rotation+1U)%4U)',
        'system-time-locale', 'system-network-address', 'system-network-review',
    ]:
        need(hub,m,'physical expert behavior')
    for m in ['system-time-locale','system-network-address','system-network-review']:
        need(web,m,'32-view capture catalog')
    if web.count('{"id":') < 32:
        raise SystemExit('V11.23 CONTRACT FAILED: capture catalog must contain at least 32 views')

    for m in ['netSettings.ssid=', 'netSettings.password=', 'requestSpeedCommand', 'requestFanCommand']:
        forbid(hub,m,'unsafe/unplanned physical behavior')

    for m in ['SECURE_GET("/hub/views", handleHubViews)','SECURE_GET("/hub/frame.ppm", handleHubFramePpm)','SECURE_POST("/hub/show", handleHubShow)']:
        need(web,m,'authenticated capture route')

    print('v11.23 Network / Locale / Layout Expert contract: PASS')
    print('Network pages: 4 (Essentials, Time & Locale, Address Edit, Review)')
    print('Static network apply: staged + hold-to-apply + reboot')
    print('Display rotation: hold-only physical mutation')
    print('Capture catalog: 32+ views')
    print('Wi-Fi credentials / hostname: portal-only')
    return 0

if __name__=='__main__':
    raise SystemExit(main())
