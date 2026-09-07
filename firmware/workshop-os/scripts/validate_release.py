#!/usr/bin/env python3
"""Deterministic release/repository-state checks for Waveshare Workshop OS."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Static download channel intentionally remains one release behind accepted source.
PRODUCTION_FULL = Path("firmware/BambuHelper-ws_lcd_350-v3.8.1-Smart-Home-v11.19.1-Physical-Fit-RC2-Full.bin")
PRODUCTION_OTA = Path("firmware/BambuHelper-ws_lcd_350-v3.8.1-Smart-Home-v11.19.1-Physical-Fit-RC2-OTA.bin")
ROLLBACK_FULL = Path("firmware/BambuHelper-ws_lcd_350-v3.8.1-Full-smart-home-v7.2-validated.bin")
ROLLBACK_OTA = Path("firmware/BambuHelper-ws_lcd_350-v3.8.1-Smart-Home-v7.2-OTA.bin")
UPSTREAM_BASELINE = "8cb1cbbb6d3c175af91989e8ebe1bbdcbe848ac4"
ACCEPTED_SOURCE_VERSION = "11.22"
STATIC_VERSION = "11.19.1"
STATIC_ROLLBACK_VERSION = "7.2"

ALLOWED_FIRMWARE = {
    PRODUCTION_FULL.as_posix(),
    PRODUCTION_OTA.as_posix(),
    ROLLBACK_FULL.as_posix(),
    ROLLBACK_OTA.as_posix(),
}
ALLOWED_WORKFLOWS = {
    "firmware-candidate.yml",
    "release-gate.yml",
    "release-main.yml",
    "validate.yml",
}
REQUIRED = [
    Path("README.md"), Path("LICENSE"), Path("NOTICE.md"), Path("SECURITY.md"),
    Path("CONTRIBUTING.md"), Path("release.json"), Path("releases/current.json"),
    Path("docs/REPOSITORY_HYGIENE.md"), Path("docs/UPSTREAM_SYNC.md"),
    Path("docs/RELEASE_PROCESS.md"), Path("docs/CONTROL_SAFETY.md"),
    Path("scripts/capture-ws350-views.zsh"), Path(".github/pull_request_template.md"),
    Path(".github/workflows/firmware-candidate.yml"), Path(".github/workflows/validate.yml"),
    PRODUCTION_FULL, PRODUCTION_OTA, ROLLBACK_FULL, ROLLBACK_OTA,
]
FORBIDDEN_PREFIXES = ("firmware/build/", ".v95/", "waveshare-workshop-os/")
FORBIDDEN_PATHS = {"web/os.config.json"}
FORBIDDEN_SECRET_FILENAMES = {".env", "id_rsa", "id_ed25519"}
FORBIDDEN_SECRET_SUFFIXES = {".pem", ".p12", ".pfx", ".key"}
SHA40 = re.compile(r"^[0-9a-f]{40}$")


def fail(message: str) -> None:
    print(f"ERROR: {message}")
    raise SystemExit(1)


def require_nonempty_string(mapping: dict, key: str, label: str) -> str:
    value = mapping.get(key)
    if not isinstance(value, str) or not value.strip():
        fail(f"{label}.{key} must be a non-empty string")
    return value.strip()


def validate_candidate(candidate: object, readme_text: str) -> str:
    if candidate is None:
        if "| active candidate | **None** |" not in readme_text:
            fail("README must explicitly show active candidate None when candidate is null")
        return "none"
    if not isinstance(candidate, dict):
        fail("candidate must be null or an object")
    version = require_nonempty_string(candidate, "version", "candidate")
    branch = require_nonempty_string(candidate, "branch", "candidate")
    name = require_nonempty_string(candidate, "name", "candidate")
    require_nonempty_string(candidate, "purpose", "candidate")
    if branch == "main":
        fail("active candidate branch must not be main before promotion")
    pr_number = candidate.get("pullRequest")
    if not isinstance(pr_number, int) or isinstance(pr_number, bool) or pr_number <= 0:
        fail("candidate.pullRequest must be a positive integer")
    if candidate.get("status") != "physical-acceptance-required":
        fail("hardware-facing candidate.status must be physical-acceptance-required")
    if candidate.get("exactHeadCi") != "required":
        fail("candidate.exactHeadCi must be required before promotion")
    if candidate.get("physicalAcceptance") != "required":
        fail("candidate.physicalAcceptance must be required before promotion")
    if name not in readme_text or f"PR #{pr_number}" not in readme_text:
        fail("README must identify the active candidate and PR")
    return f"{version} / PR #{pr_number} / {branch}"


def validate_main_state(main_state: object, readme_text: str) -> str:
    if main_state is None:
        return "none"
    if not isinstance(main_state, dict):
        fail("mainState must be null or an object")
    version = require_nonempty_string(main_state, "version", "mainState")
    commit = require_nonempty_string(main_state, "commit", "mainState")
    name = require_nonempty_string(main_state, "name", "mainState")
    branch = require_nonempty_string(main_state, "originatingBranch", "mainState")
    if not SHA40.fullmatch(commit):
        fail("mainState.commit must be a 40-character lowercase SHA")
    if main_state.get("status") != "merged-unaccepted":
        fail("mainState.status must be merged-unaccepted")
    if main_state.get("exactHeadCi") != "passed" or main_state.get("physicalAcceptance") != "pending":
        fail("merged-unaccepted mainState must have CI passed and physical acceptance pending")
    if branch == "main":
        fail("mainState.originatingBranch must identify the source branch")
    if name not in readme_text or "merged, physical acceptance pending" not in readme_text:
        fail("README must explain merged-unaccepted main state")
    return f"{version} / physical acceptance pending"


def validate_capture_security() -> None:
    capture = (ROOT / "scripts" / "capture-ws350-views.zsh").read_text(encoding="utf-8")
    required = [
        'echo "Usage: $0 <device-host-or-ip>"', 'HOST="$1"',
        'RAW_PPM="$(mktemp -t bambu-capture-frame)"', "stty -echo",
        'chmod 600 "$COOKIE" "$LOGIN_BODY" "$RAW_PPM"',
        'rm -f "$COOKIE" "$LOGIN_BODY" "$RAW_PPM"', "trap cleanup EXIT",
        "--data-urlencode 'code@-'", "unset CODE",
        "Deliberately do not capture /printer/config or settings exports",
        "view_id == 'system'", "Refusing unverified System redaction geometry",
        "x0, y0, x1, y1 = 330, 196, 468, 230",
        'curl -fsS -b "$COOKIE" "$BASE/hub/frame.ppm" -o "$RAW_PPM"',
        "SECURITY-NOTE.txt", "Raw framebuffer: TEMPORARY 0600 ONLY",
        "Printer configuration/settings exports: EXCLUDED",
    ]
    for marker in required:
        if marker not in capture:
            fail(f"visual capture credential-safety contract missing: {marker}")
    forbidden = [
        "10.0.0.124", '--data-urlencode "code=$CODE"', 'echo "$CODE"',
        '"$BASE/printer/config?slot=0"', '"$BASE/settings/export"', "set -x",
    ]
    for marker in forbidden:
        if marker in capture:
            fail(f"capture helper may disclose sensitive/environment-specific configuration: {marker}")


def validate_stable_merge_gate(workflows_dir: Path) -> None:
    workflow = (workflows_dir / "firmware-candidate.yml").read_text(encoding="utf-8")
    required = [
        "pull_request:\n    branches: [main]",
        "scope:\n    name: Classify Firmware Scope",
        "validate:\n    name: Native Firmware Validation",
        "merge-gate:\n    name: Merge Gate",
        "needs: [scope, validate]", "if: always()",
        "Native firmware validation required:",
    ]
    for marker in required:
        if marker not in workflow:
            fail(f"stable Merge Gate contract missing: {marker}")
    pull_request_header = workflow.split("workflow_dispatch:", 1)[0]
    if "\n    paths:\n" in pull_request_header or "\n    paths-ignore:\n" in pull_request_header:
        fail("firmware-candidate pull_request trigger must run on every PR to main")


def main() -> int:
    for rel in REQUIRED:
        if not (ROOT / rel).is_file():
            fail(f"missing required repository asset: {rel}")

    if not (ROOT / "LICENSE").read_text(encoding="utf-8").startswith("MIT License\n"):
        fail("top-level LICENSE must contain MIT license text")
    notice_text = (ROOT / "NOTICE.md").read_text(encoding="utf-8")
    if "Keralots/BambuHelper" not in notice_text or UPSTREAM_BASELINE not in notice_text:
        fail("NOTICE.md must identify upstream BambuHelper and pinned baseline")
    if "does not invent" not in notice_text:
        fail("NOTICE.md must preserve upstream attribution boundary")

    tracked_firmware: set[str] = set()
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(ROOT).as_posix()
        if rel.startswith(FORBIDDEN_PREFIXES) or rel in FORBIDDEN_PATHS:
            fail(f"forbidden generated/superseded content is present: {rel}")
        if path.parent == ROOT and path.name.startswith("validation-report"):
            fail(f"ad-hoc validation report is present in repository root: {rel}")
        if path.name in FORBIDDEN_SECRET_FILENAMES or path.suffix.lower() in FORBIDDEN_SECRET_SUFFIXES:
            fail(f"secret/private-key style file must not be tracked: {rel}")
        if path.name.startswith(".env.") and path.name != ".env.example":
            fail(f"environment secret file must not be tracked: {rel}")
        if rel.startswith("firmware/") and rel.endswith(".bin"):
            tracked_firmware.add(rel)
            if rel not in ALLOWED_FIRMWARE:
                fail(f"unexpected tracked firmware binary: {rel}")
    if tracked_firmware != ALLOWED_FIRMWARE:
        fail(f"firmware retention mismatch: {sorted(tracked_firmware)}")

    workflows_dir = ROOT / ".github" / "workflows"
    workflows = {p.name for p in workflows_dir.glob("*.yml") if p.is_file()}
    if workflows != ALLOWED_WORKFLOWS:
        fail(f"workflow surface mismatch: {sorted(workflows)}")
    for name in sorted(ALLOWED_WORKFLOWS):
        text = (workflows_dir / name).read_text(encoding="utf-8")
        if "permissions:\n  contents: read" not in text:
            fail(f"workflow must declare contents: read: {name}")
    validate_stable_merge_gate(workflows_dir)
    validate_capture_security()

    release = json.loads((ROOT / "release.json").read_text(encoding="utf-8"))
    manifest = json.loads((ROOT / "releases/current.json").read_text(encoding="utf-8"))

    profiles = release.get("profiles", {})
    if set(profiles) != {"workshop-os-v11.19.1", "smart-home-v7.2"}:
        fail("static release.json must still expose v11.19.1 production + v7.2 rollback")
    expected_paths = {
        ("workshop-os-v11.19.1", "file"): PRODUCTION_FULL.as_posix(),
        ("workshop-os-v11.19.1", "otaFile"): PRODUCTION_OTA.as_posix(),
        ("smart-home-v7.2", "file"): ROLLBACK_FULL.as_posix(),
        ("smart-home-v7.2", "otaFile"): ROLLBACK_OTA.as_posix(),
    }
    for (profile, key), expected in expected_paths.items():
        if profiles.get(profile, {}).get(key) != expected:
            fail(f"release.json {profile}.{key} must be {expected}")

    if manifest.get("channel") != "accepted-source":
        fail("releases/current.json channel must be accepted-source")
    if manifest.get("version") != ACCEPTED_SOURCE_VERSION:
        fail(f"accepted source version must be {ACCEPTED_SOURCE_VERSION}")
    source = manifest.get("source") or {}
    if source.get("branch") != "main":
        fail("accepted source branch must be main")
    accepted_commit = source.get("acceptedFirmwareCommit", "")
    if not SHA40.fullmatch(accepted_commit):
        fail("acceptedFirmwareCommit must be a 40-character lowercase SHA")
    if source.get("physicalAcceptance") != "passed":
        fail("accepted source must record physicalAcceptance=passed")

    readme_text = (ROOT / "README.md").read_text(encoding="utf-8")
    if "Workshop OS v11.22" not in readme_text:
        fail("README must identify accepted Workshop OS v11.22")
    candidate_summary = validate_candidate(manifest.get("candidate"), readme_text)
    main_state_summary = validate_main_state(manifest.get("mainState"), readme_text)

    download = manifest.get("download") or {}
    if download.get("channel") != "production-workshop-os-v11.19.1":
        fail("static download channel must remain Workshop OS v11.19.1 until binary promotion")
    if str(download.get("rollbackVersion")) != STATIC_ROLLBACK_VERSION:
        fail("static rollbackVersion must remain Smart Home v7.2")

    archive = ROOT / "releases" / "archive"
    if not (archive / "README.md").is_file():
        fail("historical release provenance must live under releases/archive")

    print("Release gate: PASS")
    print(f"Accepted source: {manifest['version']} ({source.get('name', 'unnamed')})")
    print(f"Accepted firmware commit: {accepted_commit}")
    print(f"Active candidate: {candidate_summary}")
    print(f"Main state: {main_state_summary}")
    print("Static download channel: Workshop OS v11.19.1 Full + OTA")
    print("Immediate static rollback: Smart Home v7.2 Full + OTA")
    print("Visual capture credential redaction: REQUIRED BEFORE RETENTION")
    print("Firmware workflows: reusable path-aware firmware gate + repository/release gates")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
