from pathlib import Path

path = Path('firmware/waveshare-home/WaveshareHome/Services.cpp')
text = path.read_text()
old = '''      probe += "M-SEARCH * HTTP/1.1
";
      probe += "HOST: 239.255.255.250:";
      probe += String(port);
      probe += "
MAN: \\"ssdp:discover\\"
MX: 2
ST: ";
      probe += target;
      probe += "

";
'''
new = '''      probe += "M-SEARCH * HTTP/1.1\\r\\n";
      probe += "HOST: 239.255.255.250:";
      probe += String(port);
      probe += "\\r\\nMAN: \\\"ssdp:discover\\\"\\r\\nMX: 2\\r\\nST: ";
      probe += target;
      probe += "\\r\\n\\r\\n";
'''
count = text.count(old)
if count != 1:
    raise SystemExit(f'probe string compile fix: expected one match, found {count}')
path.write_text(text.replace(old, new, 1))
print('rc14 Bambu discovery probe string compile fix applied')
