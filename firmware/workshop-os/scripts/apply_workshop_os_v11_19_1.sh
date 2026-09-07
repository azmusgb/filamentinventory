#!/usr/bin/env bash
set -euo pipefail

UPSTREAM="${1:-upstream}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bash "$ROOT/scripts/apply_workshop_os_v11_19.sh" "$UPSTREAM"
echo "==> apply_smart_home_physical_fit_v11_19_1.py"
python "$ROOT/apply_smart_home_physical_fit_v11_19_1.py" --repo "$UPSTREAM" --apply

echo "Workshop OS stack applied through v11.19.1 Physical Fit RC2"
