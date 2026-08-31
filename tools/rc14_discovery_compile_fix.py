from pathlib import Path

p = Path('firmware/waveshare-home/WaveshareHome/Services.cpp')
text = p.read_text()

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
    raise SystemExit(f'rc14 malformed SSDP probe block: expected 1 match, found {count}')

p.write_text(text.replace(old, new, 1))
print('Fixed rc14 SSDP probe string escaping')
