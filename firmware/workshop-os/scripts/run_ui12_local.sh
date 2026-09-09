#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="${ROOT:-$(git rev-parse --show-toplevel)}"
BUILD="${BUILD:-/tmp/ws350-ui12-build}"

cd "$ROOT"
echo "=== Workshop OS v11.27 UI12 Control Center reconstruction ==="
echo "ROOT=$ROOT"
echo "BUILD=$BUILD"

BUILD="$BUILD" bash "$ROOT/scripts/run_rc10_local.sh"

python3 "$ROOT/apply_workshop_os_cupertino_ui_v11_26_ui11.py" --repo "$BUILD" --apply
python3 "$ROOT/apply_workshop_os_control_center_v11_27_ui12.py" --repo "$BUILD" --apply
python3 "$ROOT/scripts/validate_ui12_control_center.py" --repo "$BUILD"

if command -v node >/dev/null 2>&1; then
  node --check "$BUILD/web/app.js"
fi

if [[ "${1:-}" == "--build" ]]; then
  if ! command -v pio >/dev/null 2>&1; then
    echo "PlatformIO not found; installing for current user..."
    python3 -m pip install --user --upgrade platformio
    export PATH="$HOME/.local/bin:$PATH"
  fi
  command -v pio >/dev/null 2>&1 || { echo 'FAIL: pio unavailable after install' >&2; exit 1; }

  echo "=== Build WS350 UI12 ==="
  (cd "$BUILD" && pio run -e ws_lcd_350)
  test -s "$BUILD/.pio/build/ws_lcd_350/firmware.bin" || { echo 'FAIL: WS350 OTA image missing' >&2; exit 1; }

  echo "=== Cross-board regression ==="
  (cd "$BUILD" && pio run -e jc3248w535)
  test -s "$BUILD/.pio/build/jc3248w535/firmware.bin" || { echo 'FAIL: jc3248w535 image missing' >&2; exit 1; }
fi

echo "=== UI12 reconstruction complete ==="
echo "Release state: source implementation only; no UI12 artifact is published by this script."
