from pathlib import Path

p = Path('firmware/waveshare-home/WaveshareHome/Services.cpp')
text = p.read_text()

start_marker = '      probe += "M-SEARCH * HTTP/1.1'
end_marker = '      transmit(BAMBU_DISCOVERY_GROUP, port, probe);'

start = text.find(start_marker)
end = text.find(end_marker, start + 1) if start >= 0 else -1
if start < 0 or end < 0:
    raise SystemExit(f'rc14 malformed SSDP probe block markers not found: start={start}, end={end}')

new = '''      probe += "M-SEARCH * HTTP/1.1\\r\\n";
      probe += "HOST: 239.255.255.250:";
      probe += String(port);
      probe += "\\r\\nMAN: \\\"ssdp:discover\\\"\\r\\nMX: 2\\r\\nST: ";
      probe += target;
      probe += "\\r\\n\\r\\n";

'''

text = text[:start] + new + text[end:]
p.write_text(text)
print('Fixed rc14 SSDP probe string escaping')
