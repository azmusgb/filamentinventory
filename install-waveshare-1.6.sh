#!/bin/bash
set -euo pipefail

REPO="azmusgb/filamentinventory"
RUN_ID="33446460562"
DEVICE="http://10.0.0.124"

echo "== Waveshare Home OTA Installer =="

echo "Checking device..."

curl -sf "$DEVICE/api/status" > /tmp/waveshare-status.json

python3 - <<'PY'
import json
with open("/tmp/waveshare-status.json") as f:
    d=json.load(f)

print("Current firmware:", d.get("firmware"))
print("Uptime:", d.get("system",{}).get("uptimeSec"))
print("Alerts:", d.get("alerts"))
PY

echo
echo "Downloading firmware artifact..."

gh run download "$RUN_ID" --repo "$REPO"

BIN=$(find . -name "WaveshareHome-firmware.bin" | head -1)

if [ -z "$BIN" ]; then
    echo "ERROR: Firmware file not found"
    exit 1
fi

echo
echo "Firmware found:"
echo "$BIN"

echo
echo "Size:"
ls -lh "$BIN"

echo
echo "Opening OTA page..."

open "$DEVICE/#recovery"

echo
echo "Upload this file:"
echo "$BIN"
