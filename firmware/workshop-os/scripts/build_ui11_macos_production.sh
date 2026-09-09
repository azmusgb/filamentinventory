#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="${ROOT:-$(git rev-parse --show-toplevel)}";BUILD="${BUILD:-/tmp/ws350-ui11-build}";VENV="${VENV:-$HOME/.venvs/workshop-os-pio313}";CORE="${PLATFORMIO_CORE_DIR:-/tmp/workshop-os-pio313-core}";OUT="${OUT:-$ROOT/dist/ui11-cupertino}"
export PLATFORMIO_CORE_DIR="$CORE"
fail(){ echo "FAIL: $*" >&2; exit 1; }; step(){ echo; echo "=== $* ==="; }
trap 'r=$?; echo "FAILED line $LINENO (exit $r); build preserved: $BUILD" >&2; exit $r' ERR
cd "$ROOT"
step "Reconstruct validated RC10 baseline"
BUILD="$BUILD" bash "$ROOT/scripts/run_rc10_local.sh"
step "Apply finished UI11"
python3 "$ROOT/apply_workshop_os_cupertino_ui_v11_26_ui11.py" --repo "$BUILD" --apply
HDR="$BUILD/include/smart_home_build.h";HUB="$BUILD/src/smart_hub.cpp";APP="$BUILD/web/app.js";SEC="$BUILD/src/security_manager.cpp"
grep -Fq 'Workshop OS v11.26 UI11 Cupertino' "$HDR";grep -Fq 'SMART_HOME_PROFILE "cupertino-ui11"' "$HDR";grep -Fq 'WORKSHOP_OS_UI_SCHEMA "UI11"' "$HDR";grep -Fq 'WORKSHOP_OS_V11_26_UI11 1' "$HDR"
for x in UI11-H UI11-P UI11-W UI11-M UI11-S;do grep -Fq "$x" "$HUB";done
grep -Fq 'static int16_t hubHeaderH() { return 36; }' "$HUB";grep -Fq 'static int16_t hubNavH() { return 54; }' "$HUB";grep -Fq 'static const uint8_t HUB_NETWORK_PAGE_COUNT = 7;' "$HUB";grep -Fq 'securityPortalCode()' "$HUB";grep -Fq 'return cookieMatches(server);' "$SEC";grep -Fq 'if (mutating && !sameOrigin(server))' "$SEC";! grep -Fq 'TEST / NO CODE' "$HUB"
for x in matchSpoolByColor matchSpoolByMaterial resolveSpool;do ! grep -Fq "$x" "$HUB";done
if command -v node >/dev/null 2>&1;then node --check "$APP";fi
step "Resolve isolated PlatformIO"
[[ -x "$VENV/bin/pio" ]] || fail "missing $VENV/bin/pio; RC10 production environment is required"
PY="$VENV/bin/python";PIO="$VENV/bin/pio";"$PY" -m pip --disable-pip-version-check install -q 'cryptography~=45.0.3' 'ecdsa~=0.19.1' 'bitstring~=4.3.1' 'reedsolo~=1.7.0' 'intelhex~=2.3.0'
step "Build Waveshare WS350"
(cd "$BUILD" && "$PIO" run -e ws_lcd_350)
WS="$BUILD/.pio/build/ws_lcd_350/firmware.bin";[[ -s "$WS" ]]||fail "WS350 firmware missing"
step "Cross-board regression"
JCLOG="$BUILD/jc3248w535-build.log";set +e;(cd "$BUILD" && "$PIO" run -e jc3248w535) >"$JCLOG" 2>&1;JCRC=$?;set -e
JC="$BUILD/.pio/build/jc3248w535/firmware.bin"
if ((JCRC!=0));then
  ELF="$BUILD/.pio/build/jc3248w535/firmware.elf"
  if grep -Fq "unsupported operand type(s) for +: '_Null' and 'str'" "$JCLOG" && [[ -s "$ELF" ]];then
    echo "Known PlatformIO/SCons final-image defect detected; using verified esptool fallback."
    "$PY" "$CORE/packages/tool-esptoolpy/esptool.py" --chip esp32s3 elf2image --flash_mode qio --flash_freq 80m --flash_size 16MB --elf-sha256-offset 0xb0 -o "$JC" "$ELF"
  else tail -120 "$JCLOG" >&2;fail "jc3248w535 regression failed";fi
fi
[[ -s "$JC" ]]||fail "jc3248w535 image missing"
step "Merge and package final WS350 images"
(cd "$BUILD" && "$PY" merge_bins.py --board ws_lcd_350 --full)
FULL="$(find "$BUILD/firmware" -type f -name 'BambuHelper-ws_lcd_350-*-Full.bin'|sort|tail -1)";[[ -s "$FULL" ]]||fail "Full image missing"
rm -rf "$OUT";mkdir -p "$OUT";FO="$OUT/BambuHelper-ws_lcd_350-v3.8.1-Workshop-OS-v11.26-UI11-Cupertino-Full.bin";OO="$OUT/BambuHelper-ws_lcd_350-v3.8.1-Workshop-OS-v11.26-UI11-Cupertino-OTA.bin";cp "$FULL" "$FO";cp "$WS" "$OO"
(cd "$OUT" && shasum -a 256 *.bin > SHA256SUMS.txt)
cat > "$OUT/BUILD-REPORT.txt" <<EOF
Workshop OS v11.26 UI11 Cupertino
Result: BUILD PASS
Target: Waveshare ESP32-S3-Touch-LCD-3.5
UI: contextual native TFT Cupertino appliance experience
Preserved: 36/54 geometry, 7-page network workflow, hold guards, portal auth, same-origin mutations, explicit AMS inventory identity
Cross-board regression: PASS (known SCons final-image fallback permitted only for exact _Null signature)
Physical 480x320 acceptance: REQUIRED BEFORE MERGE/PROMOTION
Source branch: $(git branch --show-current)
Source commit: $(git rev-parse HEAD)
EOF
step "UI11 PRODUCTION CANDIDATE READY"
echo "Full: $FO";echo "OTA: $OO";echo "Checksums: $OUT/SHA256SUMS.txt";echo "Only remaining gate: flash WS350 and physically accept touch/display behavior."
