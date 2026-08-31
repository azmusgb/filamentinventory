from pathlib import Path

root = Path(__file__).resolve().parents[1]
model = root / 'firmware/waveshare-home/WaveshareHome/AppModel.h'
ino = root / 'firmware/waveshare-home/WaveshareHome/WaveshareHome.ino'

m = model.read_text()
s = ino.read_text()

if '1.0.0-rc21' not in m and '1.0.0"' not in m:
    raise SystemExit('Unexpected firmware version; expected rc21 or 1.0.0')

m = m.replace('1.0.0-rc21', '1.0.0')

# Keep 1.0 promotion deliberately feature-frozen. Add a visible stable-release marker
# to the System screen if the current rendering contains the firmware line.
if 'STABLE RELEASE' not in s:
    target = 'Firmware      %s\\n'
    if target in s:
        s = s.replace(target, 'Firmware      %s\\nRelease       STABLE 1.0\\n', 1)

model.write_text(m)
ino.write_text(s)
print('Waveshare Home promoted to stable 1.0.0')
