#!/usr/bin/env bash
set -euo pipefail

UPSTREAM="${1:-upstream}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bash "$ROOT/scripts/apply_workshop_os_v11_18.sh" "$UPSTREAM"

echo "==> apply_smart_home_visual_correctness_v11_19.py"
python "$ROOT/apply_smart_home_visual_correctness_v11_19.py" --repo "$UPSTREAM" --apply

echo "Workshop OS stack applied through v11.19 Visual Correctness RC1"
