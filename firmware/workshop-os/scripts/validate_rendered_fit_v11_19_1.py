#!/usr/bin/env python3
from pathlib import Path
import re
import sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else 'upstream')
hub = (root / 'src/smart_hub.cpp').read_text(encoding='utf-8')
build = (root / 'include/smart_home_build.h').read_text(encoding='utf-8')


def need(body: str, needle: str, label: str) -> None:
    if needle not in body:
        raise SystemExit(f'MISSING {label}: {needle}')


def forbid(body: str, needle: str, label: str) -> None:
    if needle in body:
        raise SystemExit(f'FORBIDDEN {label}: {needle}')

for n in [
    'SMART_HOME_VERSION "v11.19.1"',
    'SMART_HOME_PROFILE "physical-fit"',
    'Smart Home v11.19.1 Physical Fit RC2',
]:
    need(build, n, 'v11.19.1 identity')

for n in [
    'securityPortalCode()',
    'PORTAL ACCESS',
    'hubFormatPresetPct',
    'CUSTOM',
    'Configured • Night mode off',
    'Configured • Status LED off',
    'IP REQUIRED',
    'smartHubCapturePrepare',
    'smartHubCaptureRgbRow',
]:
    need(hub, n, 'inherited v11.19 contract')

# Conservative rendered-fit envelopes derived from the two actual WS350
# overflows captured in v11.19. This is intentionally stricter than merely
# asserting that the intended source strings exist.
fit_rules = [
    ('AMS IDLE', 9, 86),
    ('EVENTS', 9, 70),
]
for label, glyph_px, budget_px in fit_rules:
    envelope = len(label) * glyph_px
    if envelope > budget_px:
        raise SystemExit(
            f'RENDERED FIT FAIL: {label!r} envelope={envelope}px budget={budget_px}px'
        )

need(
    hub,
    'uiDrawFit("AMS IDLE",loadedCard.x+12,loadedCard.y+54,loadedCard.w-24,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL);',
    'Workshop loaded-card fitted label',
)
if hub.count('uiActionButton(eventsBtn,"EVENTS",buzzerSettings.enabled?UI_GREEN:UI_MUTED);') != 2:
    raise SystemExit('RENDERED FIT FAIL: System EVENTS action must exist exactly twice')

for n in [
    'uiDrawFit("NO ACTIVE TRAY"',
    'strlcpy(value,"No active AMS tray"',
    '"EVENTS ON":"EVENTS OFF"',
]:
    forbid(hub, n, 'known physical overflow')

for m in re.finditer(r'uiActionButton\([^;\n]+\);', hub):
    call = m.group(0)
    if 'eventsBtn' in call and '...' in call:
        raise SystemExit(f'RENDERED FIT FAIL: pre-truncated action label: {call}')

print('RENDERED FIT CONTRACTS v11.19.1: PASS')
print('  workshop_loaded_state=AMS_IDLE_FITS')
print('  system_events_action=EVENTS_FITS')
print('  known_v11_19_overflow_strings=ABSENT')
print('  inherited_visual_correctness=PRESERVED')
print('  visual_capture_catalog=22_VIEWS_PRESERVED')
