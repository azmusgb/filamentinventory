#!/usr/bin/env bash
set -euo pipefail

UPSTREAM="${1:-upstream}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bash "$ROOT/scripts/apply_smart_home_stack.sh" "$UPSTREAM" apply_smart_home_hardware_v10_1.py

patchers=(
  apply_smart_home_ui_v10_2.py
  apply_smart_home_browser_v10_3.py
  apply_smart_home_screen_retention_v10_3_1.py
  apply_smart_home_portal_v10_4.py
  apply_smart_home_home_v10_4_1.py
  apply_smart_home_physical_v10_5.py
  apply_smart_home_audio_home_v10_6.py
  apply_smart_home_signature_v11.py
  apply_smart_home_calm_v11_1.py
  apply_smart_home_workshop_tools_v11_2.py
  apply_smart_home_printer_control_v11_3.py
  apply_smart_home_printer_control_v11_3_fixup.py
  apply_smart_home_control_polish_v11_4.py
  apply_smart_home_printer_power_v11_5.py
  apply_smart_home_workshop_command_v11_6.py
  apply_smart_home_live_state_v11_7.py
  apply_smart_home_display_experience_v11_8.py
  apply_smart_home_display_schedule_v11_9.py
  apply_smart_home_display_behavior_v11_10.py
  apply_smart_home_display_visual_v11_11.py
  apply_smart_home_clock_experience_v11_12.py
  apply_smart_home_alerts_hms_v11_13.py
  apply_smart_home_network_essentials_v11_14.py
  apply_smart_home_audio_essentials_v11_15.py
  apply_smart_home_led_essentials_v11_16.py
  apply_smart_home_led_essentials_v11_16_fixup.py
  apply_smart_home_power_automation_v11_17.py
  apply_smart_home_visual_capture_v11_18.py
)

for patcher in "${patchers[@]}"; do
  echo "==> $patcher"
  python "$ROOT/$patcher" --repo "$UPSTREAM" --apply
done

echo "Workshop OS stack applied through v11.18 Visual Capture RC1"
