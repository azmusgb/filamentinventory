#!/usr/bin/env bash
set -euo pipefail

UPSTREAM="${1:-upstream}"
FINAL_PATCHER="${2:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -d "$UPSTREAM/src" || ! -f "$UPSTREAM/platformio.ini" ]]; then
  echo "ERROR: upstream BambuHelper checkout not found at: $UPSTREAM" >&2
  exit 2
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Historical v1-v7.2 patch payloads predate this dedicated evolution repo.
# Rehydrate them from immutable commits/refs, then execute every version in
# order. Later patchers live in this repository and are kept human-readable.
v1="https://raw.githubusercontent.com/azmusgb/filamentinventory/741a6f0651fb4e20d8e2674f2c0ce726b0d7bdf9/.bambuhelper-validation"
v3="https://raw.githubusercontent.com/azmusgb/filamentinventory/07ce909fa7dd485abfc556eaf9addfbbd82e3cb3/.bambuhelper-validation"
v6="https://raw.githubusercontent.com/azmusgb/filamentinventory/c1a6cdf389be14b18f26eecefd5c5a62b5d1e7dc/.bambuhelper-validation"
v72="https://raw.githubusercontent.com/azmusgb/bambuhelper-smart-display/smart-home-v7-2-display-stability"

curl -fsSL "$v1/installer.zlib.b64" -o "$TMP/installer.b64"
for n in 0 1 2 3; do
  curl -fsSL "$v1/device.part$n" -o "$TMP/device.part$n"
done
cat "$TMP"/device.part{0,1,2,3} > "$TMP/device.b64"
curl -fsSL "$v3/v2.zlib.b64" -o "$TMP/v2.b64"
curl -fsSL "$v3/v3.zlib.b64" -o "$TMP/v3.b64"
curl -fsSL "$v6/v4.zlib.b64" -o "$TMP/v4.b64"
curl -fsSL "$v6/v5.zlib.b64" -o "$TMP/v5.b64"
curl -fsSL "$v6/v6.zlib.b64" -o "$TMP/v6.b64"
curl -fsSL "$v72/.bambuhelper-validation/v7-home.zlib.b64" -o "$TMP/v7-home.b64"
curl -fsSL "$v72/apply_smart_home_ux_v7_1.py" -o "$TMP/apply_smart_home_ux_v7_1.py"
curl -fsSL "$v72/apply_smart_home_display_stability_v7_2.py" -o "$TMP/apply_smart_home_display_stability_v7_2.py"

python - "$TMP" <<'PY'
from pathlib import Path
import base64
import sys
import zlib

tmp = Path(sys.argv[1])
pairs = [
    ("installer.b64", "apply_installer_evolution.py"),
    ("device.b64", "apply_device_onboarding_evolution.py"),
    ("v2.b64", "apply_resilience_evolution_v2.py"),
    ("v3.b64", "apply_smart_profiles_evolution_v3.py"),
    ("v4.b64", "apply_ws350_remote_dashboard_v4.py"),
    ("v5.b64", "apply_commissioning_evolution_v5.py"),
    ("v6.b64", "apply_smart_display_platform_v6.py"),
    ("v7-home.b64", "apply_smart_home_navigation_v7.py"),
]
for src, dst in pairs:
    (tmp / dst).write_bytes(
        zlib.decompress(base64.b64decode((tmp / src).read_text().strip()))
    )
PY

# Historical v3 expected a v2 refresh anchor that became duplicated by later
# upstream changes. Keep the same deterministic repair used by the proven v10
# gate, but confine it to the temporary copy instead of mutating this repo.
python - "$TMP/apply_smart_profiles_evolution_v3.py" <<'PY'
from pathlib import Path
import sys

p = Path(sys.argv[1])
text = p.read_text()
needle = '"app/profile-account-selection",'
pos = text.find(needle)
if pos >= 0:
    start = text.rfind('    text = replace_once(', 0, pos)
    end = text.find('\n    )', pos)
    if min(start, end) < 0:
        raise SystemExit('v3 repair anchor malformed')
    end += len('\n    )')
    replacement = """    profile_refresh_anchor = '''  updatePrinterOnboarding();\n  refreshPrinterHealth(false);'''\n    profile_refresh_count = text.count(profile_refresh_anchor)\n    if profile_refresh_count < 1:\n        raise PatchError(\"app/profile-context-refresh: expected at least one v2 refresh anchor\")\n    text = text.replace(profile_refresh_anchor, '''  updatePrinterOnboarding();\n  refreshGaugeProfileUi();\n  refreshPrinterHealth(false);''')"""
    p.write_text(text[:start] + replacement + text[end:])
PY

patchers=(
  "$TMP/apply_installer_evolution.py"
  "$TMP/apply_device_onboarding_evolution.py"
  "$TMP/apply_resilience_evolution_v2.py"
  "$TMP/apply_smart_profiles_evolution_v3.py"
  "$TMP/apply_ws350_remote_dashboard_v4.py"
  "$TMP/apply_commissioning_evolution_v5.py"
  "$TMP/apply_smart_display_platform_v6.py"
  "$TMP/apply_smart_home_navigation_v7.py"
  "$TMP/apply_smart_home_ux_v7_1.py"
  "$TMP/apply_smart_home_display_stability_v7_2.py"
  "$ROOT/apply_smart_home_hardening_v8.py"
  "$ROOT/apply_smart_home_hardening_v8_1.py"
  "$ROOT/apply_smart_home_visual_v9.py"
  "$ROOT/apply_smart_home_print_ui_v9.py"
  "$ROOT/apply_smart_home_reliability_v9_1.py"
  "$ROOT/apply_smart_home_evolution_v9_2.py"
  "$ROOT/apply_smart_home_dev_unlock_v9_3.py"
  "$ROOT/apply_smart_home_recovery_v9_4.py"
  "$ROOT/apply_smart_home_recovery_hardening_v9_4_1.py"
  "$ROOT/apply_smart_home_recovery_entry_v9_4_2.py"
  "$ROOT/apply_smart_home_experience_v9_5.py"
  "$ROOT/apply_smart_home_portal_v9_6.py"
  "$ROOT/apply_smart_home_zero_blip_v9_6_1.py"
  "$ROOT/apply_smart_home_interaction_v9_7.py"
  "$ROOT/apply_smart_home_interaction_v9_7_fixup.py"
  "$ROOT/apply_smart_home_touch_reliability_v9_7_1.py"
  "$ROOT/apply_smart_home_recovery_safari_v9_7_2.py"
  "$ROOT/apply_smart_home_unified_display_v9_8.py"
  "$ROOT/apply_smart_home_display_experience_v9_9.py"
  "$ROOT/apply_smart_home_boot_persistence_v9_9_1.py"
  "$ROOT/apply_smart_home_workshop_os_theme_v10.py"
)

if [[ -n "$FINAL_PATCHER" ]]; then
  if [[ "$FINAL_PATCHER" != /* ]]; then FINAL_PATCHER="$ROOT/$FINAL_PATCHER"; fi
  [[ -f "$FINAL_PATCHER" ]] || { echo "ERROR: final patcher missing: $FINAL_PATCHER" >&2; exit 3; }
  patchers+=("$FINAL_PATCHER")
fi

for patcher in "${patchers[@]}"; do
  echo "==> $(basename "$patcher")"
  python "$patcher" --repo "$UPSTREAM" --apply
done

echo "Smart Home patch stack applied successfully: ${#patchers[@]} patchers"
