#!/usr/bin/env bash
set -euo pipefail

UPSTREAM="${1:-upstream}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Reconstruct the accepted source line first.
bash "$ROOT/scripts/apply_workshop_os_v11_19_1.sh" "$UPSTREAM"

python3 "$ROOT/apply_smart_home_portal_auth_v11_20.py" \
  --repo "$UPSTREAM" \
  --apply

python3 "$ROOT/apply_smart_home_display_expert_v11_22.py" \
  --repo "$UPSTREAM" \
  --apply

echo "==> apply_workshop_inventory_summary_v11_22_1.py"
python3 "$ROOT/apply_workshop_inventory_summary_v11_22_1.py" \
  --repo "$UPSTREAM" \
  --apply

echo "Workshop OS stack applied through v11.22.1 Inventory Summary RC1"
