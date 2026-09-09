#!/usr/bin/env python3
"""Verify original import identity and retained acceptance/recovery evidence."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'docs/migration/2026-09-09'
manifest = json.loads((EVIDENCE / 'manifest.json').read_text())

def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args])

for name, expected in manifest['files'].items():
    assert hashlib.sha256((EVIDENCE / name).read_bytes()).hexdigest() == expected, name
source = manifest['workshopMain']
imported = manifest['mainImport']
git('merge-base', '--is-ancestor', source, imported)
# The original import must preserve every source blob; migration overlays are later commits.
for row in git('ls-tree', '-r', source).decode().splitlines():
    metadata, path = row.split('\t', 1)
    actual = git('ls-tree', imported, '--', 'firmware/workshop-os/' + path).decode().strip()
    assert actual.split('\t', 1)[0] == metadata, path
for run_id in [34366597032,34366597047,34366597044,34366597025,34366597023]:
    run = json.loads((EVIDENCE / f'run-{run_id}.json').read_text())
    assert run['head_sha'] == manifest['ui13Source'] and run['conclusion'] == 'success'
assert manifest['ui13PhysicalAcceptance'] == 'pending'
# Snapshot hashes are checked independently of deploy/build output.
for rel, expected in manifest['recoveryFiles'].items():
    assert hashlib.sha256((ROOT / rel).read_bytes()).hexdigest() == expected, rel
print('Migration provenance, original source tree, UI13 evidence and recovery hashes: PASS')
