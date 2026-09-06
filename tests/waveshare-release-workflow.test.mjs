import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const workflowsDir = path.join(root, '.github', 'workflows');
const buildWorkflow = fs.readFileSync(path.join(workflowsDir, 'waveshare-home.yml'), 'utf8');
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

test('firmware builder validates PRs but auto-builds pushed firmware only from main', () => {
  const pullStart = buildWorkflow.indexOf('  pull_request:');
  const pushStart = buildWorkflow.indexOf('  push:');
  const permissionsStart = buildWorkflow.indexOf('\npermissions:', pushStart);

  assert.notEqual(pullStart, -1, 'pull_request firmware validation trigger should exist');
  assert.notEqual(pushStart, -1, 'push firmware build trigger should exist');
  assert.notEqual(permissionsStart, -1, 'workflow permissions block should follow triggers');

  const pullBlock = buildWorkflow.slice(pullStart, pushStart);
  const pushBlock = buildWorkflow.slice(pushStart, permissionsStart);

  assert.match(pullBlock, /firmware\/waveshare-home\/\*\*/);
  assert.match(pullBlock, /\.github\/workflows\/waveshare-home\.yml/);
  assert.match(pushBlock, /branches:\s*\[main\]/);
  assert.match(pushBlock, /firmware\/waveshare-home\/\*\*/);
  assert.doesNotMatch(pushBlock, /\.github\/workflows\/waveshare-home\.yml/);
  assert.match(buildWorkflow, /permissions:\s*\n\s+contents:\s+read/);
  assert.match(buildWorkflow, /group: waveshare-home-\$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}/);
  assert.match(buildWorkflow, /cancel-in-progress: true/);
});

test('legacy firmware publishing is manual-only and frozen at v1.7.0', () => {
  const triggerStart = releaseWorkflow.indexOf('on:');
  const permissionsStart = releaseWorkflow.indexOf('\npermissions:', triggerStart);
  const triggerBlock = releaseWorkflow.slice(triggerStart, permissionsStart);

  assert.match(triggerBlock, /workflow_dispatch:/);
  assert.doesNotMatch(triggerBlock, /workflow_run:/);
  assert.match(releaseWorkflow, /description: Optional successful main-branch firmware build run ID to republish v1\.7\.0/);
  assert.match(releaseWorkflow, /--branch main/);
  assert.match(releaseWorkflow, /test "\$CONCLUSION" = 'success'/);
  assert.match(releaseWorkflow, /test "\$HEAD_BRANCH" = 'main'/);
  assert.match(releaseWorkflow, /push\|workflow_dispatch/);
  assert.match(releaseWorkflow, /if \[ "\$VERSION" != '1\.7\.0' \]; then/);
  assert.match(releaseWorkflow, /Waveshare Home is frozen at v1\.7\.0/);
  assert.doesNotMatch(releaseWorkflow, /workflow_run\.conclusion|workflow_run\.event|workflow_run\.head_branch/);
});

test('manual republish remains bound to a validated main build and the existing frozen tag', () => {
  assert.match(releaseWorkflow, /echo "source_sha=\$SOURCE_SHA" >> "\$GITHUB_OUTPUT"/);
  assert.match(releaseWorkflow, /ref: \$\{\{ steps\.src\.outputs\.source_sha \}\}/);
  assert.match(releaseWorkflow, /git merge-base --is-ancestor "\$SOURCE_SHA" origin\/main/);
  assert.match(releaseWorkflow, /artifact=WaveshareHome-ESP32S3-\$VERSION-fullflash/);
  assert.match(releaseWorkflow, /--name "\$ARTIFACT"/);
  assert.match(releaseWorkflow, /test "\$COUNT" -eq 1/);
  assert.match(releaseWorkflow, /TAG_SHA=\$\(git rev-list -n 1 "\$TAG"\)/);
  assert.match(releaseWorkflow, /test "\$TAG_SHA" = "\$SOURCE_SHA"/);
  assert.doesNotMatch(releaseWorkflow, /--target "\$SOURCE_SHA"/);
  assert.match(releaseWorkflow, /refusing to create a new legacy release/);
});
