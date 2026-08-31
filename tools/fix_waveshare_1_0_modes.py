from pathlib import Path

root = Path(__file__).resolve().parents[1]
ino = root / 'firmware/waveshare-home/WaveshareHome/WaveshareHome.ino'
model = root / 'firmware/waveshare-home/WaveshareHome/AppModel.h'

s = ino.read_text()
m = model.read_text()

if 'FW_VERSION[] = "1.0.0"' not in m:
    raise SystemExit('Expected stable 1.0.0 source before applying fix')

old = 'Timers, Printer, Filament, Workshop, Insights, Automation, Activity, Devices, Readiness, System, Recovery, Ambient'
new = 'Timers, Printer, Filament, Workshop, Insights, Automation, Activity, Devices, Readiness, Modes, System, Recovery, Ambient'

if old in s:
    s = s.replace(old, new, 1)
elif 'Readiness, Modes, System' not in s:
    raise SystemExit('ScreenId enum shape not recognized')

required = [
    'case ScreenId::Modes: return screenModes;',
    '{"Modes", ScreenId::Modes',
    'ScreenId::Modes)), C_BLUE);',
]
for token in required:
    if token not in s:
        raise SystemExit(f'Modes implementation reference missing: {token}')

ino.write_text(s)
print('Stable 1.0.0 ScreenId::Modes fix applied')
