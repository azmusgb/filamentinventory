#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="${ROOT:-$(git rev-parse --show-toplevel)}"
BUILD="${BUILD:-/tmp/ws350-ui13-build}"

cd "$ROOT"
echo "=== Workshop OS v11.28 UI13 Appliance Settings reconstruction ==="
echo "ROOT=$ROOT"
echo "BUILD=$BUILD"

# Reconstruct the authoritative pre-UI11 source line, then prove the UI12
# baseline is still coherent before applying the UI13 settings architecture.
BUILD="$BUILD" bash "$ROOT/scripts/run_rc10_local.sh"
python3 "$ROOT/apply_workshop_os_cupertino_ui_v11_26_ui11.py" --repo "$BUILD" --apply
python3 "$ROOT/apply_workshop_os_control_center_v11_27_ui12.py" --repo "$BUILD" --apply
python3 "$ROOT/scripts/validate_ui12_control_center.py" --repo "$BUILD"

python3 "$ROOT/apply_workshop_os_appliance_settings_v11_28_ui13.py" --repo "$BUILD" --apply
python3 "$ROOT/apply_workshop_os_ui13_compile_order_fix.py" --repo "$BUILD" --apply
python3 "$ROOT/apply_workshop_os_ui13_product_finish.py" --repo "$BUILD" --apply
python3 "$ROOT/scripts/validate_ui13_appliance_settings.py" --repo "$BUILD"
python3 "$ROOT/scripts/validate_ui13_product_finish.py" --repo "$BUILD"

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

  echo "=== Build WS350 UI13 ==="
  (cd "$BUILD" && pio run -e ws_lcd_350)
  test -s "$BUILD/.pio/build/ws_lcd_350/firmware.bin" || { echo 'FAIL: WS350 UI13 OTA image missing' >&2; exit 1; }

  echo "=== Cross-board regression ==="
  (cd "$BUILD" && pio run -e jc3248w535)
  test -s "$BUILD/.pio/build/jc3248w535/firmware.bin" || { echo 'FAIL: jc3248w535 UI13 image missing' >&2; exit 1; }
fi

echo "=== UI13 reconstruction complete ==="
echo "Release state: implemented source only unless a CI build separately records exact artifact identity."
echo "Published candidate: unchanged v11.26 UI11."
echo "Physical acceptance: REQUIRED for any future UI13 candidate."
