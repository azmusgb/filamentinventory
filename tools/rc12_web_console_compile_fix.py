from pathlib import Path

path = Path('firmware/waveshare-home/WaveshareHome/Services.cpp')
text = path.read_text()

old = 'document.querySelectorAll("form[action=\'/update/check\'],form[action=\'/update/install\']")'
new = 'document.querySelectorAll(\\"form[action=\'/update/check\'],form[action=\'/update/install\']\\")'

count = text.count(old)
if count != 1:
    raise SystemExit(f'expected one async OTA selector, found {count}')

text = text.replace(old, new, 1)
path.write_text(text)
print('escaped async OTA selector for C++ F() string')
