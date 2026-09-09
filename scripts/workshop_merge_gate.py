#!/usr/bin/env python3
"""Fail closed until the current PR head's required workflows pass."""
import json
import os
from pathlib import Path
import subprocess
import time


def required_workflows(paths, ui13_present):
    required = []
    if any(not path.startswith('firmware/workshop-os/') for path in paths):
        required.append('CI')
    if any(path.startswith('firmware/workshop-os/') or path == '.github/workflows/firmware-validate.yml' for path in paths):
        required.append('Workshop OS Firmware Validate')
    if ui13_present:
        required.append('Workshop OS UI13 Monorepo Gate')
    return required


def main():
    base, head = os.environ['BASE_SHA'], os.environ['HEAD_SHA']
    paths = subprocess.check_output(['git', 'diff', '--name-only', base, head], text=True).splitlines()
    required = required_workflows(paths, Path('.github/workflows/workshop-ui13.yml').exists())
    print('Required exact-head workflows:', required, flush=True)
    deadline = time.monotonic() + 65 * 60
    while time.monotonic() < deadline:
        pages = json.loads(subprocess.check_output(['gh', 'api', '--paginate', '--slurp',
            f"repos/{os.environ['GITHUB_REPOSITORY']}/actions/runs?head_sha={head}&event=pull_request&per_page=100"], text=True))
        runs = [run for page in pages for run in page['workflow_runs'] if run['head_sha'] == head]
        passed = []
        for name in required:
            matches = [run for run in runs if run['name'] == name]
            if not matches:
                continue
            latest = max(matches, key=lambda run: (run['id'], run.get('run_attempt', 1)))
            if latest['status'] == 'completed':
                if latest['conclusion'] != 'success':
                    raise SystemExit(f"FAIL: {name}: {latest['conclusion']} {latest['html_url']}")
                passed.append(name)
        if passed == required:
            print('Workshop OS Merge Gate: PASS (CI evidence only; no physical acceptance)')
            return
        time.sleep(20)
    raise SystemExit('FAIL: required workflows missing or unfinished at timeout')

if __name__ == '__main__':
    main()
