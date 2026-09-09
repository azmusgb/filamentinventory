#!/usr/bin/env bash
set -Eeuo pipefail

# Filament Inventory + Workshop OS monorepo reconciliation / validation driver.
#
# Canonical surviving repository:
#   azmusgb/filamentinventory
# Migration source:
#   azmusgb/bambuhelper-smart-display
#
# Safety invariants:
# - Never claims physical WS350 acceptance from CI.
# - Never promotes UI13 to stable.
# - Never archives/deletes bambuhelper-smart-display.
# - Only merges PR #128 when explicitly enabled and GitHub reports all checks green.

OWNER="azmusgb"
CANONICAL_REPO="filamentinventory"
SOURCE_REPO="bambuhelper-smart-display"
PR_NUMBER="128"

DEV_ROOT="${DEV_ROOT:-$HOME/dev}"
CANONICAL_DIR="${CANONICAL_DIR:-$DEV_ROOT/$CANONICAL_REPO}"
SOURCE_DIR="${SOURCE_DIR:-$DEV_ROOT/$SOURCE_REPO}"
MERGE="${MERGE:-0}"
WATCH_CI="${WATCH_CI:-1}"

TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
REPORT_ROOT="${REPORT_ROOT:-$HOME/Desktop/FilamentInventory-Migration-$TIMESTAMP}"
LOG_DIR="$REPORT_ROOT/logs"
EVIDENCE_DIR="$REPORT_ROOT/evidence"
SUMMARY="$REPORT_ROOT/MIGRATION-EVIDENCE.md"

mkdir -p "$LOG_DIR" "$EVIDENCE_DIR"

info() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; }
die()  { fail "$*"; exit 1; }
section() { printf '\n## %s\n\n' "$*" >> "$SUMMARY"; }
record() { printf '%s\n' "$*" >> "$SUMMARY"; }

run_logged() {
  local name="$1"; shift
  local logfile="$LOG_DIR/${name}.log"
  info "$name"
  set +e
  "$@" > >(tee "$logfile") 2>&1
  local rc=$?
  set -e
  if [[ $rc -eq 0 ]]; then ok "$name"; else fail "$name failed with exit code $rc"; fi
  return "$rc"
}

CURRENT_STEP="startup"
on_error() {
  local rc=$?
  local line="$1"
  fail "Stopped during: $CURRENT_STEP (line $line, exit $rc)"
  {
    echo
    echo "## Script failure"
    echo
    echo "- Step: \`$CURRENT_STEP\`"
    echo "- Line: \`$line\`"
    echo "- Exit code: \`$rc\`"
  } >> "$SUMMARY"
  echo "Evidence collected at: $REPORT_ROOT"
  exit "$rc"
}
trap 'on_error $LINENO' ERR

cat > "$SUMMARY" <<EOF
# Filament Inventory + Workshop OS Monorepo Migration Evidence

Generated: $(date)

## Governing constraints

- Canonical surviving repository: \`$OWNER/$CANONICAL_REPO\`
- Migration source: \`$OWNER/$SOURCE_REPO\`
- Migration PR: #$PR_NUMBER
- Filament Inventory remains inventory/cloud/LLM/device-data authority.
- Workshop OS remains WS350 firmware/hardware/OTA/recovery authority.
- CI success is not physical WS350 acceptance.
- UI13 remains candidate-only unless separate physical acceptance evidence exists.
- Source repository is not archived or deleted by this procedure.
- Recovery and rollback artifacts must remain traceable.
EOF

CURRENT_STEP="dependency validation"
section "Environment"
for cmd in git gh python3 shasum find sed awk grep; do
  command -v "$cmd" >/dev/null 2>&1 || die "Required command not found: $cmd"
  record "- \`$cmd\`: \`$(command -v "$cmd")\`"
done

if command -v jq >/dev/null 2>&1; then JQ_AVAILABLE=1; else JQ_AVAILABLE=0; fi
command -v node >/dev/null 2>&1 && record "- Node: \`$(node --version)\`"
command -v npm >/dev/null 2>&1 && record "- npm: \`$(npm --version)\`"
command -v pnpm >/dev/null 2>&1 && record "- pnpm: \`$(pnpm --version)\`"
command -v pio >/dev/null 2>&1 && record "- PlatformIO: \`$(pio --version | head -1)\`"

CURRENT_STEP="GitHub authentication"
run_logged "github-auth-status" gh auth status
record "- GitHub authenticated user: \`$(gh api user --jq '.login')\`"

ensure_repo() {
  local repo="$1" dir="$2"
  if [[ -d "$dir/.git" ]]; then
    info "Updating $repo"
    git -C "$dir" fetch --all --tags --prune --force
  else
    info "Cloning $repo"
    mkdir -p "$(dirname "$dir")"
    gh repo clone "$OWNER/$repo" "$dir"
  fi
}

CURRENT_STEP="repository synchronization"
ensure_repo "$CANONICAL_REPO" "$CANONICAL_DIR"
ensure_repo "$SOURCE_REPO" "$SOURCE_DIR"

capture_repo_state() {
  local label="$1" dir="$2"
  section "$label repository"
  record "- Path: \`$dir\`"
  record "- Origin: \`$(git -C "$dir" remote get-url origin)\`"
  record "- Current branch: \`$(git -C "$dir" branch --show-current || true)\`"
  record "- Current HEAD: \`$(git -C "$dir" rev-parse HEAD)\`"
  git -C "$dir" status --short > "$EVIDENCE_DIR/${label}-status.txt"
  git -C "$dir" log --decorate --graph --oneline -40 > "$EVIDENCE_DIR/${label}-recent-history.txt"
  git -C "$dir" tag --sort=-creatordate > "$EVIDENCE_DIR/${label}-tags.txt"
  git -C "$dir" branch -a -vv > "$EVIDENCE_DIR/${label}-branches.txt"
}

CURRENT_STEP="repository evidence capture"
capture_repo_state canonical "$CANONICAL_DIR"
capture_repo_state source "$SOURCE_DIR"
SOURCE_HEAD_SHA="$(git -C "$SOURCE_DIR" rev-parse HEAD)"

CURRENT_STEP="GitHub repository metadata"
gh repo view "$OWNER/$CANONICAL_REPO" --json name,url,defaultBranchRef,isArchived,isPrivate,description > "$EVIDENCE_DIR/canonical-repository.json"
gh repo view "$OWNER/$SOURCE_REPO" --json name,url,defaultBranchRef,isArchived,isPrivate,description > "$EVIDENCE_DIR/source-repository.json"
gh release list --repo "$OWNER/$CANONICAL_REPO" --limit 100 > "$EVIDENCE_DIR/canonical-releases.txt" || true
gh release list --repo "$OWNER/$SOURCE_REPO" --limit 100 > "$EVIDENCE_DIR/source-releases.txt" || true

CURRENT_STEP="PR #128 inspection"
section "Migration PR #$PR_NUMBER"
gh pr view "$PR_NUMBER" --repo "$OWNER/$CANONICAL_REPO" \
  --json number,title,state,url,headRefName,headRefOid,baseRefName,baseRefOid,mergeable,mergeStateStatus,isDraft,commits,statusCheckRollup \
  > "$EVIDENCE_DIR/pr-$PR_NUMBER.json"

PR_HEAD_SHA="$(gh pr view "$PR_NUMBER" --repo "$OWNER/$CANONICAL_REPO" --json headRefOid --jq '.headRefOid')"
PR_BASE_SHA="$(gh pr view "$PR_NUMBER" --repo "$OWNER/$CANONICAL_REPO" --json baseRefOid --jq '.baseRefOid')"
PR_STATE="$(gh pr view "$PR_NUMBER" --repo "$OWNER/$CANONICAL_REPO" --json state --jq '.state')"
PR_HEAD_BRANCH="$(gh pr view "$PR_NUMBER" --repo "$OWNER/$CANONICAL_REPO" --json headRefName --jq '.headRefName')"
record "- State: \`$PR_STATE\`"
record "- Base SHA: \`$PR_BASE_SHA\`"
record "- Head SHA: \`$PR_HEAD_SHA\`"
record "- Head branch: \`$PR_HEAD_BRANCH\`"

CURRENT_STEP="PR worktree creation"
WORKTREE="$REPORT_ROOT/pr-$PR_NUMBER-worktree"
git -C "$CANONICAL_DIR" fetch origin "pull/$PR_NUMBER/head:refs/remotes/origin/pr-$PR_NUMBER"
git -C "$CANONICAL_DIR" worktree prune
[[ -d "$WORKTREE" ]] && rm -rf "$WORKTREE"
git -C "$CANONICAL_DIR" worktree add --detach "$WORKTREE" "origin/pr-$PR_NUMBER"
WORKTREE_SHA="$(git -C "$WORKTREE" rev-parse HEAD)"
[[ "$WORKTREE_SHA" == "$PR_HEAD_SHA" ]] || die "PR worktree SHA does not match GitHub PR SHA"

CURRENT_STEP="monorepo structure inspection"
section "Monorepo structure"
find "$WORKTREE" -maxdepth 4 \( -iname '*workshop*' -o -iname '*firmware*' -o -iname '*recovery*' -o -iname '*acceptance*' -o -iname '*device-contract*' -o -iname '*ota*' \) -print \
  | sed "s#$WORKTREE#.#" | sort > "$EVIDENCE_DIR/monorepo-relevant-paths.txt"
record '```'
head -100 "$EVIDENCE_DIR/monorepo-relevant-paths.txt" >> "$SUMMARY"
record '```'

grep -RInE 'bambuhelper-smart-display|v11\.22|UI13|3672a6f|recovery|rollback|provenance' "$WORKTREE" --exclude-dir=.git \
  > "$EVIDENCE_DIR/provenance-references.txt" || true

run_node_project() {
  local dir="$1" label="$2"
  [[ -f "$dir/package.json" ]] || return 0
  pushd "$dir" >/dev/null
  if [[ -f pnpm-lock.yaml ]] && command -v pnpm >/dev/null 2>&1; then
    run_logged "${label}-install" pnpm install --frozen-lockfile
    pnpm run 2>/dev/null | grep -qE '^test\b' && run_logged "${label}-test" pnpm test || true
    pnpm run 2>/dev/null | grep -qE '^build\b' && run_logged "${label}-build" pnpm build || true
  elif [[ -f package-lock.json ]]; then
    run_logged "${label}-npm-ci" npm ci
    npm run 2>/dev/null | grep -qE '^  test\b|^test\b' && run_logged "${label}-test" npm test || true
    npm run 2>/dev/null | grep -qE '^  build\b|^build\b' && run_logged "${label}-build" npm run build || true
  else
    warn "$label has package.json without a recognized frozen lockfile"
  fi
  popd >/dev/null
}

CURRENT_STEP="PWA and Node validation"
run_node_project "$WORKTREE" root
while IFS= read -r package_json; do
  dir="$(dirname "$package_json")"
  [[ "$dir" == "$WORKTREE" ]] && continue
  [[ "$dir" == *'/node_modules/'* ]] && continue
  rel="${dir#$WORKTREE/}"
  safe_label="$(printf '%s' "$rel" | tr '/ .' '---')"
  run_node_project "$dir" "$safe_label"
done < <(find "$WORKTREE" -mindepth 2 -maxdepth 5 -name package.json -not -path '*/node_modules/*' | sort)

CURRENT_STEP="Python validation"
if find "$WORKTREE" -maxdepth 3 \( -name pytest.ini -o -name pyproject.toml -o -name requirements.txt \) | grep -q .; then
  if python3 -c 'import pytest' >/dev/null 2>&1; then
    run_logged python-pytest python3 -m pytest "$WORKTREE"
  else
    warn "Python project detected but pytest is not installed"
  fi
fi

CURRENT_STEP="repository validation scripts"
section "Detected validation scripts"
while IFS= read -r script; do
  rel="${script#$WORKTREE/}"
  record "- \`$rel\`"
  label="$(printf '%s' "$rel" | tr '/ .' '---')"
  case "$script" in
    *.sh) run_logged "script-$label" bash "$script" || true ;;
    *.py) run_logged "script-$label" python3 "$script" || true ;;
    *.js|*.mjs) command -v node >/dev/null 2>&1 && run_logged "script-$label" node "$script" || true ;;
  esac
done < <(find "$WORKTREE" -type f \( -name '*.sh' -o -name '*.py' -o -name '*.js' -o -name '*.mjs' \) -not -path '*/node_modules/*' \
  | grep -Ei 'validate|verify|check.*release|release.*check|reconstruct|firmware.*build|build.*firmware' | sort | head -50)

CURRENT_STEP="WS350 firmware builds"
section "PlatformIO firmware builds"
if command -v pio >/dev/null 2>&1; then
  while IFS= read -r ini; do
    firmware_dir="$(dirname "$ini")"
    rel="${firmware_dir#$WORKTREE/}"
    record "- Building \`$rel\`"
    run_logged "platformio-$(printf '%s' "$rel" | tr '/ .' '---')" pio run --project-dir "$firmware_dir"
  done < <(find "$WORKTREE" -type f -name platformio.ini -not -path '*/node_modules/*' | sort)
else
  warn "PlatformIO CLI unavailable; GitHub Actions may still perform native firmware build"
fi

CURRENT_STEP="artifact hashing"
section "Firmware and recovery artifacts"
: > "$EVIDENCE_DIR/firmware-sha256.txt"
while IFS= read -r artifact; do
  rel="${artifact#$WORKTREE/}"
  hash="$(shasum -a 256 "$artifact" | awk '{print $1}')"
  printf '%s  %s\n' "$hash" "$rel" >> "$EVIDENCE_DIR/firmware-sha256.txt"
  record "- \`$hash\` — \`$rel\`"
done < <(find "$WORKTREE" -type f \( -iname '*.bin' -o -iname '*.uf2' -o -iname '*.hex' -o -iname '*.img' \) -not -path '*/node_modules/*' | sort)

CURRENT_STEP="GitHub Actions validation"
section "GitHub CI"
if [[ "$WATCH_CI" == "1" && "$PR_STATE" == "OPEN" ]]; then
  set +e
  gh pr checks "$PR_NUMBER" --repo "$OWNER/$CANONICAL_REPO" --watch --interval 15 | tee "$LOG_DIR/pr-$PR_NUMBER-checks-watch.log"
  set -e
fi
gh pr checks "$PR_NUMBER" --repo "$OWNER/$CANONICAL_REPO" > "$EVIDENCE_DIR/pr-$PR_NUMBER-checks.txt" || true
cat "$EVIDENCE_DIR/pr-$PR_NUMBER-checks.txt" >> "$SUMMARY"

gh run list --repo "$OWNER/$CANONICAL_REPO" --branch "$PR_HEAD_BRANCH" --limit 50 \
  --json databaseId,name,workflowName,status,conclusion,headSha,url,createdAt > "$EVIDENCE_DIR/pr-$PR_NUMBER-runs.json"

if [[ "$JQ_AVAILABLE" == "1" ]]; then
  while IFS= read -r run_id; do
    [[ -n "$run_id" ]] || continue
    gh run view "$run_id" --repo "$OWNER/$CANONICAL_REPO" --log-failed > "$LOG_DIR/github-run-$run_id-failed.log" 2>&1 || true
  done < <(jq -r '.[] | select(.conclusion == "failure" or .conclusion == "cancelled" or .conclusion == "timed_out") | .databaseId' "$EVIDENCE_DIR/pr-$PR_NUMBER-runs.json")
fi

CURRENT_STEP="merge readiness determination"
MERGEABLE="$(gh pr view "$PR_NUMBER" --repo "$OWNER/$CANONICAL_REPO" --json mergeable --jq '.mergeable')"
MERGE_STATE="$(gh pr view "$PR_NUMBER" --repo "$OWNER/$CANONICAL_REPO" --json mergeStateStatus --jq '.mergeStateStatus')"
FAILED_CHECK_COUNT="$(gh pr view "$PR_NUMBER" --repo "$OWNER/$CANONICAL_REPO" --json statusCheckRollup --jq '[.statusCheckRollup[] | select((.conclusion // "") != "SUCCESS" and (.conclusion // "") != "NEUTRAL" and (.conclusion // "") != "SKIPPED")] | length')"
record "- GitHub mergeable: \`$MERGEABLE\`"
record "- GitHub merge state: \`$MERGE_STATE\`"
record "- Non-success check count: \`$FAILED_CHECK_COUNT\`"

if [[ "$MERGE" == "1" ]]; then
  CURRENT_STEP="PR merge"
  [[ "$PR_STATE" == "OPEN" ]] || die "PR #$PR_NUMBER is not open"
  [[ "$FAILED_CHECK_COUNT" == "0" ]] || die "PR #$PR_NUMBER still has non-success checks"
  [[ "$MERGEABLE" == "MERGEABLE" ]] || die "GitHub does not report PR #$PR_NUMBER as mergeable"
  [[ "$MERGE_STATE" == "CLEAN" || "$MERGE_STATE" == "HAS_HOOKS" ]] || die "PR merge state is $MERGE_STATE"
  gh pr merge "$PR_NUMBER" --repo "$OWNER/$CANONICAL_REPO" --merge --match-head-commit "$PR_HEAD_SHA"
  sleep 3
  MERGE_COMMIT="$(gh pr view "$PR_NUMBER" --repo "$OWNER/$CANONICAL_REPO" --json mergeCommit --jq '.mergeCommit.oid')"
  section "Migration merge"
  record "- PR head before merge: \`$PR_HEAD_SHA\`"
  record "- Merge commit: \`$MERGE_COMMIT\`"
else
  section "Merge decision"
  record "Automatic merge disabled. Rerun with \`MERGE=1\` only after reviewing the evidence."
fi

CURRENT_STEP="source repository preservation"
section "Source repository disposition"
SOURCE_ARCHIVED="$(gh repo view "$OWNER/$SOURCE_REPO" --json isArchived --jq '.isArchived')"
record "- \`$OWNER/$SOURCE_REPO\` archived: \`$SOURCE_ARCHIVED\`"
record "- No archive or delete operation was performed."

section "Acceptance state"
record "| State | Result from this script |"
record "|---|---|"
record "| Implemented | May be evidenced by repository contents |"
record "| Built | May be evidenced by successful build jobs |"
record "| Tested | May be evidenced by successful automated tests |"
record "| Runtime validated | Only if an actual runtime test ran |"
record "| Production validated | Only if an actual deployment smoke test ran |"
record "| Physically validated | **Not established by this script** |"
record "| Accepted | **Not established by CI alone** |"
record "| Stable | Requires explicit acceptance/promotion policy |"
record ""
record "**v11.22 remains the accepted physical baseline unless newer physical acceptance evidence explicitly supersedes it.**"
record ""
record "**UI13 remains candidate-only unless explicit physical acceptance evidence promotes it.**"

section "Result"
record "- Canonical working-tree SHA: \`$(git -C "$CANONICAL_DIR" rev-parse HEAD)\`"
record "- Migration PR head SHA: \`$PR_HEAD_SHA\`"
record "- Migration source repository SHA observed locally: \`$SOURCE_HEAD_SHA\`"
record "- Non-success GitHub check count: \`$FAILED_CHECK_COUNT\`"
record "- Evidence directory: \`$REPORT_ROOT\`"

CURRENT_STEP="worktree cleanup"
git -C "$CANONICAL_DIR" worktree remove "$WORKTREE" --force || true
git -C "$CANONICAL_DIR" worktree prune

echo
echo "================================================================="
echo "Filament Inventory + Workshop OS migration validation complete"
echo "================================================================="
echo "Evidence: $REPORT_ROOT"
echo "Report:   $SUMMARY"
echo "PR head:  $PR_HEAD_SHA"
echo "Checks not successful: $FAILED_CHECK_COUNT"
if [[ "$MERGE" != "1" && "$FAILED_CHECK_COUNT" == "0" ]]; then
  echo
  echo "All GitHub checks appear successful. To permit merge on rerun:"
  echo "  MERGE=1 $0"
fi
ok "Done"
