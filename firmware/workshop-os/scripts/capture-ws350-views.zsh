#!/bin/zsh
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <device-host-or-ip>"
  exit 2
fi
HOST="$1"
BASE="http://$HOST"
STAMP="$(date '+%Y%m%d-%H%M%S')"
OUT="$HOME/Desktop/BambuHelper-Visual-Capture-$STAMP"
COOKIE="$(mktemp -t bambu-capture-cookie)"
LOGIN_BODY="$(mktemp -t bambu-capture-login)"
RAW_PPM="$(mktemp -t bambu-capture-frame)"
CATALOG="$OUT/views.json"
chmod 600 "$COOKIE" "$LOGIN_BODY" "$RAW_PPM"

cleanup() {
  stty echo 2>/dev/null || true
  unset CODE 2>/dev/null || true
  rm -f "$COOKIE" "$LOGIN_BODY" "$RAW_PPM"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -p "$OUT/png" "$OUT/ppm" "$OUT/state"

printf "Portal code: "
stty -echo
IFS= read -r CODE
stty echo
printf "\n"
CODE="$(printf '%s' "$CODE" | tr -cd '[:alnum:]' | tr '[:lower:]' '[:upper:]')"

if [ "${#CODE}" -ne 10 ]; then
  echo "ERROR: portal code must normalize to exactly 10 characters."
  exit 1
fi

# Feed the credential over stdin rather than a curl command-line argument so it
# is not exposed through process inspection while login is in flight.
HTTP="$({ printf '%s' "$CODE" | curl -sS -X POST -c "$COOKIE" -o "$LOGIN_BODY" -w '%{http_code}' \
  --data-urlencode 'code@-' "$BASE/login"; } || true)"
if [ "$HTTP" != "303" ]; then
  echo "LOGIN FAILED - HTTP $HTTP"
  cat "$LOGIN_BODY" 2>/dev/null || true
  exit 1
fi

# Do not retain the credential longer than needed. The authenticated cookie is
# sufficient for the rest of the capture run.
unset CODE

echo "LOGIN OK"

curl -fsS -b "$COOKIE" "$BASE/recovery/status" > "$OUT/state/recovery-status.json"
curl -fsS -b "$COOKIE" "$BASE/hardware/health?slot=0" > "$OUT/state/hardware-health.json"
curl -fsS -b "$COOKIE" "$BASE/status?slot=0" > "$OUT/state/printer-status-slot0.json"
# Deliberately do not capture /printer/config or settings exports: those data
# models can contain printer access codes and other configuration secrets.
curl -fsS -b "$COOKIE" "$BASE/power/stats" > "$OUT/state/power-stats.json"
curl -fsS -b "$COOKIE" "$BASE/hub/views" > "$CATALOG"

cat > "$OUT/ppm_to_png.py" <<'PY'
#!/usr/bin/env python3
from pathlib import Path
import binascii
import struct
import sys
import zlib

src = Path(sys.argv[1])
ppm_dst = Path(sys.argv[2])
png_dst = Path(sys.argv[3])
view_id = sys.argv[4] if len(sys.argv) > 4 else ''

with src.open('rb') as f:
    magic = f.readline().strip()
    if magic != b'P6':
        raise SystemExit(f'Not P6 PPM: {src}')
    dims = f.readline().strip().split()
    while dims and dims[0].startswith(b'#'):
        dims = f.readline().strip().split()
    w, h = map(int, dims)
    maxv = int(f.readline().strip())
    if maxv != 255:
        raise SystemExit(f'Unsupported max value {maxv}')
    rgb = bytearray(f.read())

expected = w * h * 3
if len(rgb) != expected:
    raise SystemExit(f'{src}: expected {expected} RGB bytes, got {len(rgb)}')

# The System page intentionally shows the rotating portal credential on the
# physical device. Acceptance artifacts must never preserve that credential.
# The validated WS350 capture surface is 480x320 landscape; redact only the
# credential line inside the Portal Access card while retaining the card,
# heading, IP and "changes after reboot" copy for layout/fit review.
if view_id == 'system':
    if (w, h) != (480, 320):
        raise SystemExit(f'Refusing unverified System redaction geometry: {w}x{h}')
    x0, y0, x1, y1 = 330, 196, 468, 230
    fill = (31, 35, 40)
    for y in range(y0, y1):
        row = y * w * 3
        for x in range(x0, x1):
            i = row + x * 3
            rgb[i:i+3] = bytes(fill)

# Only sanitized pixels are ever written into the retained capture directory.
# The raw framebuffer remains solely in a mode-0600 temporary file managed by
# the shell and is removed by the EXIT trap.
header = f'P6\n{w} {h}\n255\n'.encode('ascii')
ppm_dst.write_bytes(header + rgb)

def chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', binascii.crc32(kind + data) & 0xffffffff)

scan = bytearray()
row = w * 3
for y in range(h):
    scan.append(0)
    scan.extend(rgb[y * row:(y + 1) * row])

png = bytearray(b'\x89PNG\r\n\x1a\n')
png += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
png += chunk(b'IDAT', zlib.compress(bytes(scan), 9))
png += chunk(b'IEND', b'')
png_dst.write_bytes(png)
PY
chmod +x "$OUT/ppm_to_png.py"

printf 'index,id,label,group,png,ppm\n' > "$OUT/manifest.csv"

python3 - "$CATALOG" <<'PY' > "$OUT/view-list.tsv"
import json, sys
with open(sys.argv[1], encoding='utf-8') as f:
    data = json.load(f)
for i, v in enumerate(data['views'], 1):
    print(f"{i}\t{v['id']}\t{v['label']}\t{v['group']}")
PY

while IFS=$'\t' read -r IDX ID LABEL GROUP; do
  NUM="$(printf '%02d' "$IDX")"
  SAFE_ID="${ID//[^A-Za-z0-9_-]/_}"
  PPM="$OUT/ppm/$NUM-$SAFE_ID.ppm"
  PNG="$OUT/png/$NUM-$SAFE_ID.png"

  echo "[$NUM] $GROUP / $LABEL"

  SHOW_HTTP="$({ curl -sS -b "$COOKIE" \
    -H 'X-BambuHelper-Client: 1' \
    -X POST \
    --data-urlencode "page=$ID" \
    -o "$OUT/.show-response" \
    -w '%{http_code}' \
    "$BASE/hub/show"; } || true)"

  if [ "$SHOW_HTTP" != "200" ]; then
    echo "  SHOW FAILED - HTTP $SHOW_HTTP"
    cat "$OUT/.show-response" 2>/dev/null || true
    exit 1
  fi

  # Raw framebuffer bytes never enter the retained capture tree. The converter
  # reads the private temp file and writes only sanitized PPM/PNG outputs.
  curl -fsS -b "$COOKIE" "$BASE/hub/frame.ppm" -o "$RAW_PPM"
  python3 "$OUT/ppm_to_png.py" "$RAW_PPM" "$PPM" "$PNG" "$ID"
  : > "$RAW_PPM"

  QLABEL="${LABEL//\"/\"\"}"
  QGROUP="${GROUP//\"/\"\"}"
  printf '%s,%s,"%s","%s",png/%s.png,ppm/%s.ppm\n' \
    "$NUM" "$ID" "$QLABEL" "$QGROUP" "$NUM-$SAFE_ID" "$NUM-$SAFE_ID" >> "$OUT/manifest.csv"
done < "$OUT/view-list.tsv"

rm -f "$OUT/.show-response"

curl -sS -b "$COOKIE" -H 'X-BambuHelper-Client: 1' -X POST \
  --data-urlencode 'page=home' "$BASE/hub/show" >/dev/null || true

rm -f "$OUT/view-list.tsv"

cat > "$OUT/SECURITY-NOTE.txt" <<'EOF'
The System framebuffer's live portal-code line was redacted before any PPM or PNG
was written into this retained capture folder. Raw framebuffer bytes existed only
in a mode-0600 temporary file outside the bundle and were cleared after each view
and removed on exit. The login credential was passed to curl over stdin, not in
its command-line arguments. Printer configuration/settings exports are excluded
because they may contain access codes or other secrets. Do not manually add
unredacted System screenshots or configuration exports.
EOF

ZIP="$HOME/Desktop/BambuHelper-Visual-Capture-$STAMP.zip"
(
  cd "$HOME/Desktop"
  /usr/bin/zip -qr "$(basename "$ZIP")" "$(basename "$OUT")"
)

echo
echo "CAPTURE COMPLETE"
echo "Folder: $OUT"
echo "ZIP:    $ZIP"
echo "PNG frames: $(find "$OUT/png" -type f -name '*.png' | wc -l | tr -d ' ')"
echo "System portal-code line: REDACTED before retained PPM + PNG write"
echo "Raw framebuffer: TEMPORARY 0600 ONLY"
echo "Printer configuration/settings exports: EXCLUDED"
