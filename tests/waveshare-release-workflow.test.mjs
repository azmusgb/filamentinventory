import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const workflowsDir = path.join(root, '.github', 'workflows');
const releaseWorkflow = fs.readFileSync(path.join(workflowsDir, 'waveshare-release.yml'), 'utf8');

test('Actions surface contains only durable validation, smoke, build and release workflows', () => {
  const workflows = fs.readdirSync(workflowsDir)
    .filter((name) => /\.ya?ml$/i.test(name))
    .sort();

  assert.deepEqual(workflows, [
    'ci.yml',
    'production-smoke.yml',
    'waveshare-home.yml',
    'waveshare-release.yml',
  ]);
});

test('automatic firmware publishing accepts only successful main push builds', () => {
  assert.match(releaseWorkflow, /workflow_run\.conclusion == 'success'/);
  assert.match(releaseWorkflow, /workflow_run\.event == 'push'/);
  assert.match(releaseWorkflow, /workflow_run\.head_branch == 'main'/);
  assert.match(releaseWorkflow, /run_id:\s*\n\s+description: Optional successful main-branch firmware build run ID to publish/);
  assert.match(releaseWorkflow, /--branch main/);
  assert.doesNotMatch(releaseWorkflow, /--status success/);
  assert.match(releaseWorkflow, /test "\$HEAD_BRANCH" = 'main'/);
  assert.match(releaseWorkflow, /push\|workflow_dispatch/);
});

test('release source, artifact and tag remain bound to the validated build SHA', () => {
  assert.match(releaseWorkflow, /echo "source_sha=\$SOURCE_SHA" >> "\$GITHUB_OUTPUT"/);
  assert.match(releaseWorkflow, /ref: \$\{\{ steps\.src\.outputs\.source_sha \}\}/);
  assert.match(releaseWorkflow, /git merge-base --is-ancestor "\$SOURCE_SHA" origin\/main/);
  assert.match(releaseWorkflow, /artifact=WaveshareHome-ESP32S3-\$VERSION-fullflash/);
  assert.match(releaseWorkflow, /--name "\$ARTIFACT"/);
  assert.match(releaseWorkflow, /test "\$COUNT" -eq 1/);
  assert.match(releaseWorkflow, /TAG_SHA=\$\(git rev-list -n 1 "\$TAG"\)/);
  assert.match(releaseWorkflow, /test "\$TAG_SHA" = "\$SOURCE_SHA"/);
  assert.match(releaseWorkflow, /--target "\$SOURCE_SHA"/);
});
