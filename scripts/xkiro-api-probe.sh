#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${XKIRO_BASE_URL:-https://api.xkiro.com/v1}"
OUT_DIR="${XKIRO_PROBE_OUT_DIR:-${TMPDIR:-/tmp}/filamentinventory-xkiro-probe}"

usage() {
  cat <<'EOF'
Usage: scripts/xkiro-api-probe.sh [usage|models|free|coding|all]

Safely inspects the xKiro API without printing XKIRO_API_KEY.
The key must be supplied through the environment; never commit it.

Environment:
  XKIRO_API_KEY       Required for authenticated endpoints such as /usage.
  XKIRO_BASE_URL      Optional API base URL override.
  XKIRO_PROBE_OUT_DIR Optional output directory for saved JSON.

Examples:
  export XKIRO_API_KEY='...'
  ./scripts/xkiro-api-probe.sh all
  ./scripts/xkiro-api-probe.sh coding
EOF
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'ERROR: required command not found: %s\n' "$1" >&2
    exit 1
  }
}

require_key() {
  if [[ -z "${XKIRO_API_KEY:-}" ]]; then
    echo 'ERROR: XKIRO_API_KEY is not set.' >&2
    echo "Set it for this shell with: export XKIRO_API_KEY='YOUR_KEY'" >&2
    exit 2
  fi
}

request() {
  local url="$1"
  shift
  local body status
  body="$(mktemp)"
  trap 'rm -f "$body"' RETURN

  if ! status="$(curl --silent --show-error --location \
      --connect-timeout 10 --max-time 30 \
      --output "$body" --write-out '%{http_code}' \
      "$@" "$url")"; then
    echo "ERROR: request failed: $url" >&2
    return 1
  fi

  if [[ ! "$status" =~ ^2 ]]; then
    printf 'ERROR: xKiro returned HTTP %s for %s\n' "$status" "$url" >&2
    python3 - "$body" <<'PY' >&2 || true
import json, pathlib, sys
p = pathlib.Path(sys.argv[1])
try:
    obj = json.loads(p.read_text())
    # Avoid echoing arbitrary server data that could contain secrets.
    if isinstance(obj, dict):
        safe = {k: obj[k] for k in ('error', 'message', 'detail', 'code') if k in obj}
        print(json.dumps(safe or {'error': 'request rejected'}, indent=2))
except Exception:
    print('{"error":"non-JSON error response"}')
PY
    return 1
  fi

  cat "$body"
}

models_json() {
  request "$BASE_URL/models"
}

print_free_models() {
  python3 -c '
import json, sys
obj = json.load(sys.stdin)
rows = []
for m in obj.get("data", []):
    if m.get("access_tier") != "free":
        continue
    caps = m.get("capabilities") or {}
    rows.append((m.get("id", ""), m.get("context_length", "?"), bool(caps.get("reasoning")), bool(caps.get("tools")), bool(caps.get("vision"))))
for model_id, context, reasoning, tools, vision in sorted(rows):
    print(f"{model_id:48} context={str(context):>8} reasoning={str(reasoning):5} tools={str(tools):5} vision={str(vision):5}")
'
}

print_coding_models() {
  python3 -c '
import json, sys
obj = json.load(sys.stdin)
keywords = ("coder", "code", "devstral", "deepseek", "qwen", "glm", "mistral")
rows = []
for m in obj.get("data", []):
    model_id = str(m.get("id", ""))
    if m.get("access_tier") != "free" or not any(k in model_id.lower() for k in keywords):
        continue
    caps = m.get("capabilities") or {}
    context = m.get("context_length") or 0
    rows.append((bool(caps.get("reasoning")), bool(caps.get("tools")), context, model_id, bool(caps.get("vision"))))
rows.sort(reverse=True)
for reasoning, tools, context, model_id, vision in rows:
    print(f"{model_id:48} context={context:>8} reasoning={str(reasoning):5} tools={str(tools):5} vision={str(vision):5}")
'
}

save_models() {
  mkdir -p "$OUT_DIR"
  local target="$OUT_DIR/models.json"
  models_json | python3 -m json.tool > "$target"
  printf 'Saved model catalog: %s\n' "$target"
}

show_usage() {
  require_key
  request "$BASE_URL/usage" -H "Authorization: Bearer $XKIRO_API_KEY" | python3 -m json.tool
}

main() {
  require_command curl
  require_command python3

  case "${1:-all}" in
    usage)
      show_usage
      ;;
    models)
      models_json | python3 -m json.tool
      ;;
    free)
      models_json | print_free_models
      ;;
    coding)
      models_json | print_coding_models
      ;;
    all)
      echo '=== xKiro usage ==='
      show_usage
      echo
      echo '=== Free coding candidates ==='
      models_json | print_coding_models
      echo
      save_models
      ;;
    -h|--help|help)
      usage
      ;;
    *)
      printf 'ERROR: unknown command: %s\n\n' "$1" >&2
      usage >&2
      exit 64
      ;;
  esac
}

main "$@"
