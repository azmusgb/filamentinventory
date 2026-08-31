from pathlib import Path

p = Path(__file__).resolve().parents[1] / 'firmware/waveshare-home/WaveshareHome/Services.h'
s = p.read_text()
old = '  int mqttState() const { return mqtt_.state(); }'
new = '  int mqttState() { return mqtt_.state(); }'
if old not in s:
    raise SystemExit('expected rc6 mqttState getter not found')
p.write_text(s.replace(old, new, 1))
print('rc6 compile fix applied')
