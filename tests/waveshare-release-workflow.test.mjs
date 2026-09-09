import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const workflowsDir = path.join(root, '.github', 'workflows');
const ciWorkflow = fs.readFileSync(path.join(workflowsDir, 'ci.yml'), 'utf8');
const firmwareWorkflow = fs.readFileSync(path.join(workflowsDir, 'firmware-validate.yml'), 'utf8');

test('root Actions surface contains only unified web, production and Workshop OS validation workflows', () => {
  const workflows = fs.readdirSync(workflowsDir)
    .filter((name) => /\.ya?ml$/i.test(name))
    .sort();

  assert.deepEqual(workflows, [
    'ci.yml',
    'firmware-validate.yml',
    'production-smoke.yml',
    'workshop-release.yml',
    'workshop-ui13.yml',
  ]);

  assert.equal(fs.existsSync(path.join(workflowsDir, 'waveshare-home.yml')), false);
  assert.equal(fs.existsSync(path.join(workflowsDir, 'waveshare-release.yml')), false);
});

test('web CI excludes Workshop OS-only changes while retaining normal main validation', () => {
  assert.match(ciWorkflow, /pull_request:\s*\n\s+paths-ignore:\s*\n\s+- 'firmware\/workshop-os\/\*\*'/);
  assert.match(ciWorkflow, /push:\s*\n\s+branches:\s*\n\s+- main\s*\n\s+paths-ignore:\s*\n\s+- 'firmware\/workshop-os\/\*\*'/);
  assert.match(ciWorkflow, /permissions:\s*\n\s+contents:\s+read/);
});

test('Workshop OS validation is rooted at firmware/workshop-os and path-scoped in the monorepo', () => {
  assert.match(firmwareWorkflow, /name: Workshop OS Firmware Validate/);
  assert.match(firmwareWorkflow, /pull_request:\s*\n\s+paths:\s*\n\s+- 'firmware\/workshop-os\/\*\*'/);
  assert.match(firmwareWorkflow, /push:\s*\n\s+branches:\s*\n\s+- main\s*\n\s+paths:/);
  assert.match(firmwareWorkflow, /working-directory: firmware\/workshop-os/);
  assert.match(firmwareWorkflow, /scripts\/materialize_pinned_upstream\.py --dest upstream/);
  assert.match(firmwareWorkflow, /group: workshop-os-monorepo-\$\{\{ github\.ref \}\}/);
  assert.match(firmwareWorkflow, /cancel-in-progress: true/);
});

test('Workshop OS validation uses immutable upstream provenance rather than a dead detached checkout', () => {
  const materializerPath = path.join(root, 'firmware', 'workshop-os', 'scripts', 'materialize_pinned_upstream.py');
  assert.equal(fs.existsSync(materializerPath), true);
  const materializer = fs.readFileSync(materializerPath, 'utf8');
  assert.match(materializer, /PINNED_TREE = "754c5506bdac08033f0cdc3439e4814acd2b4294"/);
  assert.match(materializer, /git_blob_sha\(data\)/);
  assert.match(materializer, /blob SHA verification failed/);
  assert.match(firmwareWorkflow, /upstream_tree=754c5506bdac08033f0cdc3439e4814acd2b4294/);
});

test('Workshop OS validation preserves security, native builds and Full plus OTA evidence', () => {
  assert.match(firmwareWorkflow, /return cookieMatches\(server\);/);
  assert.match(firmwareWorkflow, /if \(mutating && !sameOrigin\(server\)\)/);
  assert.match(firmwareWorkflow, /pio run -e ws_lcd_350/);
  assert.match(firmwareWorkflow, /pio run -e jc3248w535/);
  assert.match(firmwareWorkflow, /python merge_bins\.py --board ws_lcd_350 --full/);
  assert.match(firmwareWorkflow, /Workshop-OS-Monorepo-Candidate-Full\.bin/);
  assert.match(firmwareWorkflow, /Workshop-OS-Monorepo-Candidate-OTA\.bin/);
  assert.match(firmwareWorkflow, /physical_acceptance=NOT_GRANTED_BY_CI/);
});

test('legacy Waveshare recovery material remains retained but is no longer an active root release authority', () => {
  const legacyRecovery = path.join(root, 'WaveshareHome-ESP32S3-1.6.0-fullflash');
  assert.equal(fs.existsSync(legacyRecovery), true);
  assert.equal(fs.existsSync(path.join(legacyRecovery, 'WaveshareHome-firmware.bin')), true);
  assert.equal(fs.existsSync(path.join(root, 'firmware', 'workshop-os')), true);

  const nestedWorkflowDir = path.join(root, 'firmware', 'workshop-os', '.github', 'workflows');
  assert.equal(fs.existsSync(nestedWorkflowDir), true);
});
