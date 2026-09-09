#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="${ROOT:-$(git rev-parse --show-toplevel)}"
BUILD="${BUILD:-/tmp/ws350-rc10-build}"
UPSTREAM_REPO="${UPSTREAM_REPO:-https://github.com/Keralots/BambuHelper.git}"
UPSTREAM_SHA="8cb1cbbb6d3c175af91989e8ebe1bbdcbe848ac4"

cd "$ROOT"

echo "=== Workshop OS v11.25 RC10 clean local build ==="
echo "ROOT=$ROOT"
echo "BUILD=$BUILD"

# macOS compatibility for legacy scripts that invoke `python`.
SHIM="/tmp/workshop-python-shim"
mkdir -p "$SHIM"
ln -sf "$(command -v python3)" "$SHIM/python"
export PATH="$SHIM:$PATH"

required=(
  scripts/apply_workshop_os_v11_19.sh
  apply_smart_home_physical_fit_v11_19_1.py
  apply_smart_home_portal_auth_v11_20.py
  apply_smart_home_display_expert_v11_22.py
  apply_smart_home_network_locale_layout_v11_23.py
  apply_smart_home_touch_ux_v11_23_rc2_secure.py
  apply_smart_home_touch_ux_v11_23_rc2_finalize_secure.py
  apply_smart_home_touch_ux_v11_23_rc2_guard_feedback.py
  apply_smart_home_auth_restore_v11_23_rc2.py
  apply_workshop_os_ui_overhaul_v11_25.py
  apply_workshop_os_ui_overhaul_v11_25_rc2.py
  apply_workshop_os_temp_no_code_v11_25.py
  apply_workshop_os_ui_overhaul_v11_25_rc3.py
  apply_workshop_os_ui_overhaul_v11_25_rc4.py
  apply_workshop_os_ui_overhaul_v11_25_rc5.py
  apply_workshop_os_secure_acceptance_v11_25_rc6.py
  apply_workshop_os_ui_overhaul_v11_25_rc7.py
  apply_workshop_os_portal_runtime_hotfix_v11_25_rc7.py
  apply_workshop_os_physical_polish_v11_25_rc8.py
  apply_workshop_os_premium_appliance_ui_v11_25_rc9.py
  apply_workshop_os_cupertino_ui_v11_25_rc10.py
)
for f in "${required[@]}"; do
  test -f "$ROOT/$f" || { echo "FAIL: missing $f" >&2; exit 1; }
done
for d in firmware/ui-v11.25 firmware/ui-v11.25-rc9 firmware/ui-v11.25-rc10; do
  test -d "$ROOT/$d" || { echo "FAIL: missing $d" >&2; exit 1; }
done

echo "=== Recreate pinned upstream ==="
rm -rf "$BUILD"
git clone --quiet "$UPSTREAM_REPO" "$BUILD"
git -C "$BUILD" checkout --quiet "$UPSTREAM_SHA"

echo "=== Reconstruct through v11.23 RC2 ==="
bash "$ROOT/scripts/apply_workshop_os_v11_19.sh" "$BUILD"
python3 "$ROOT/apply_smart_home_physical_fit_v11_19_1.py" --repo "$BUILD" --apply
python3 "$ROOT/apply_smart_home_portal_auth_v11_20.py" --repo "$BUILD" --apply
python3 "$ROOT/apply_smart_home_display_expert_v11_22.py" --repo "$BUILD" --apply
python3 "$ROOT/apply_smart_home_network_locale_layout_v11_23.py" --repo "$BUILD" --apply
python3 "$ROOT/apply_smart_home_touch_ux_v11_23_rc2_secure.py" --repo "$BUILD" --apply
python3 "$ROOT/apply_smart_home_touch_ux_v11_23_rc2_finalize_secure.py" --repo "$BUILD" --apply
python3 "$ROOT/apply_smart_home_touch_ux_v11_23_rc2_guard_feedback.py" --repo "$BUILD" --apply
python3 "$ROOT/apply_smart_home_auth_restore_v11_23_rc2.py" --repo "$BUILD" --apply

echo "=== Apply v11.25 RC1-RC6 ==="
mkdir -p "$BUILD/firmware"
rm -rf "$BUILD/firmware/ui-v11.25"
cp -R "$ROOT/firmware/ui-v11.25" "$BUILD/firmware/"
python3 "$ROOT/apply_workshop_os_ui_overhaul_v11_25.py" --repo "$BUILD" --apply
python3 "$ROOT/apply_workshop_os_ui_overhaul_v11_25_rc2.py" --repo "$BUILD" --apply
python3 "$ROOT/apply_workshop_os_temp_no_code_v11_25.py" --repo "$BUILD" --apply
python3 "$ROOT/apply_workshop_os_ui_overhaul_v11_25_rc3.py" --repo "$BUILD" --apply
python3 "$ROOT/apply_workshop_os_ui_overhaul_v11_25_rc4.py" --repo "$BUILD" --apply
python3 "$ROOT/apply_workshop_os_ui_overhaul_v11_25_rc5.py" --repo "$BUILD" --apply
python3 "$ROOT/apply_workshop_os_secure_acceptance_v11_25_rc6.py" --repo "$BUILD" --apply

echo "=== Apply RC7 ==="
python3 "$ROOT/apply_workshop_os_ui_overhaul_v11_25_rc7.py" --repo "$BUILD" --apply
python3 "$ROOT/apply_workshop_os_portal_runtime_hotfix_v11_25_rc7.py" --repo "$BUILD" --apply

echo "=== Apply RC8 ==="
python3 "$ROOT/apply_workshop_os_physical_polish_v11_25_rc8.py" --repo "$BUILD" --apply

echo "=== Apply RC9 ==="
rm -rf "$BUILD/firmware/ui-v11.25-rc9"
cp -R "$ROOT/firmware/ui-v11.25-rc9" "$BUILD/firmware/"
python3 "$ROOT/apply_workshop_os_premium_appliance_ui_v11_25_rc9.py" --repo "$BUILD" --apply

echo "=== Apply RC10 ==="
rm -rf "$BUILD/firmware/ui-v11.25-rc10"
cp -R "$ROOT/firmware/ui-v11.25-rc10" "$BUILD/firmware/"
python3 "$ROOT/apply_workshop_os_cupertino_ui_v11_25_rc10.py" --repo "$BUILD" --apply

HDR="$BUILD/include/smart_home_build.h"
HUB="$BUILD/src/smart_hub.cpp"
APP="$BUILD/web/app.js"
SEC="$BUILD/src/security_manager.cpp"

for f in "$HDR" "$HUB" "$APP" "$SEC"; do
  test -s "$f" || { echo "FAIL: missing generated file $f" >&2; exit 1; }
done

grep -Fq 'Workshop OS v11.25 RC10 Cupertino UI' "$HDR"
grep -Fq 'SMART_HOME_PROFILE "cupertino-ui"' "$HDR"
grep -Fq 'WORKSHOP_OS_UI_SCHEMA "UI10"' "$HDR"
grep -Fq 'WORKSHOP_OS_V11_25_UI_RC10 1' "$HDR"
for fp in UI10-H UI10-P UI10-W UI10-M UI10-S; do grep -Fq "$fp" "$HUB"; done
grep -Fq 'static int16_t hubHeaderH() { return 36; }' "$HUB"
grep -Fq 'static int16_t hubNavH() { return 54; }' "$HUB"
grep -Fq 'static const uint8_t HUB_NETWORK_PAGE_COUNT = 7;' "$HUB"
grep -Fq 'Keep Holding' "$HUB"
grep -Fq 'Hold to Apply' "$HUB"
grep -Fq 'securityPortalCode()' "$HUB"
grep -Fq 'return cookieMatches(server);' "$SEC"
grep -Fq 'if (mutating && !sameOrigin(server))' "$SEC"
! grep -Fq 'TEST / NO CODE' "$HUB"
for bad in matchSpoolByColor matchSpoolByMaterial resolveSpool; do ! grep -Fq "$bad" "$HUB"; done
if command -v node >/dev/null 2>&1; then node --check "$APP"; fi

echo "=== RC10 source validation PASS ==="
grep -E 'SMART_HOME_BUILD_LABEL|SMART_HOME_PROFILE|WORKSHOP_OS_UI_SCHEMA|WORKSHOP_OS_V11_25_UI_RC10' "$HDR"

if [[ "${1:-}" == "--build" ]]; then
  if ! command -v pio >/dev/null 2>&1; then
    echo "PlatformIO not found; installing for current user..."
    python3 -m pip install --user --upgrade platformio
    export PATH="$HOME/.local/bin:$PATH"
  fi
  command -v pio >/dev/null 2>&1 || { echo 'FAIL: pio unavailable after install' >&2; exit 1; }
  echo "=== Build WS350 ==="
  (cd "$BUILD" && pio run -e ws_lcd_350)
  echo "=== Regression build jc3248w535 ==="
  (cd "$BUILD" && pio run -e jc3248w535)
  echo "=== Merge Full image ==="
  (cd "$BUILD" && python3 merge_bins.py --board ws_lcd_350 --full)
  FULL=$(find "$BUILD/firmware" -type f -name 'BambuHelper-ws_lcd_350-*-Full.bin' | sort | tail -1)
  APPBIN="$BUILD/.pio/build/ws_lcd_350/firmware.bin"
  test -n "$FULL" -a -f "$FULL" || { echo 'FAIL: Full WS350 image not found' >&2; exit 1; }
  test -f "$APPBIN" || { echo 'FAIL: OTA firmware image not found' >&2; exit 1; }
  echo "PASS: Full image: $FULL"
  echo "PASS: OTA image:  $APPBIN"
fi

echo "=== DONE ==="
