#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else '.').resolve()


def read(rel: str) -> str:
    p = root / rel
    if not p.exists():
        raise SystemExit(f"FAIL: missing {rel}")
    return p.read_text(encoding='utf-8')

build = read('include/smart_home_build.h')
hub = read('src/smart_hub.cpp')
auto = read('src/workshop_auto_orientation.cpp')
settings_h = read('src/settings.h')
settings_cpp = read('src/settings.cpp')

required = {
    'instrument identity': ('Instrument UI Prototype', build),
    'auto setting field': ('bool     autoOrientation;', settings_h),
    'auto setting default': ('ds.autoOrientation = false;', settings_cpp),
    'auto setting load': ('prefs.getBool("dsp_arot"', settings_cpp),
    'auto setting save': ('prefs.putBool("dsp_arot"', settings_cpp),
    'QMI address': ('QMI8658_ADDR = 0x6B', auto),
    'QMI identity': ('QMI_CHIP_ID = 0x05', auto),
    'stable debounce': ('STABLE_MS = 600', auto),
    'touch hold guard': ('isButtonHeld()', auto),
    'effective rotation': ('workshopEffectiveRotation()', auto),
    'runtime no-save comment': ('deliberately do not save', auto),
    'auto UI on': ('AUTO ORIENT: ON', hub),
    'auto UI off': ('AUTO ORIENT: OFF', hub),
    'manual fallback': ('HOLD COMMIT MANUAL', hub),
}
for label, (needle, body) in required.items():
    if needle not in body:
        raise SystemExit(f"FAIL: {label}: missing {needle}")

# Automatic orientation is runtime state. The commit function is forbidden from
# writing NVS; persisted rotation remains an explicit manual action only.
commit = auto.split('static void commitRuntimeRotation', 1)
if len(commit) != 2:
    raise SystemExit('FAIL: runtime rotation commit helper missing')
commit_body = commit[1].split('#endif', 1)[0]
if 'saveSettings()' in commit_body:
    raise SystemExit('FAIL: automatic runtime rotation persists to NVS')

for rel in ('src/display_ui.cpp','src/display_split.cpp','src/camera_client.cpp','src/display_gauges.cpp'):
    body = read(rel)
    if 'dispSettings.rotation' in body:
        raise SystemExit(f'FAIL: {rel}: direct persisted rotation still used for rendering')
    if 'workshopEffectiveRotation()' not in body:
        raise SystemExit(f'FAIL: {rel}: effective runtime orientation missing')

combined = '\n'.join(read(rel) for rel in (
    'include/smart_home_build.h','src/security_manager.cpp','web/app.js'))
for forbidden in (
    'WORKSHOP_OS_TEMP_LAN_OPEN',
    'TEMPORARY TRUSTED-LAN MODE',
    'if (!isAPMode()) return true;',
    'v1123Rc2LanOpenBanner',
):
    if forbidden in combined:
        raise SystemExit(f'FAIL: insecure marker present: {forbidden}')

print('PASS: Workshop Instrument UI v1 auto-orientation contracts')
