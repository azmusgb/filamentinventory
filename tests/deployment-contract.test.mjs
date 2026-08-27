import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { JAVASCRIPT_ASSETS, PUBLIC_ASSETS } from '../scripts/public-assets.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, '..');
const readText = (relativePath) => readFile(path.join(rootDir, relativePath), 'utf8');

test('public asset manifest is unique and contains only root files', () => {
  assert.equal(new Set(PUBLIC_ASSETS).size, PUBLIC_ASSETS.length, 'public assets must not contain duplicates');

  for (const asset of PUBLIC_ASSETS) {
    assert.equal(asset, path.basename(asset), `public asset must remain a root file: ${asset}`);
    assert.equal(asset.includes('..'), false, `public asset must not traverse directories: ${asset}`);
  }
});

test('server-side and repository-only files are excluded from the public build', () => {
  const forbidden = [
    'package.json',
    'netlify.toml',
    'README.md',
    'CHANGELOG.md',
    '.gitignore',
    '.github',
    'netlify',
    'scripts',
    'tests',
  ];

  for (const entry of forbidden) {
    assert.equal(PUBLIC_ASSETS.includes(entry), false, `${entry} must not be a public asset`);
  }
});

test('all browser JavaScript assets are part of the public asset manifest', () => {
  assert.ok(JAVASCRIPT_ASSETS.length > 0, 'at least one JavaScript asset is expected');
  for (const asset of JAVASCRIPT_ASSETS) {
    assert.ok(PUBLIC_ASSETS.includes(asset), `${asset} must be part of the public asset manifest`);
  }
});

test('PWA manifest retains installability basics', async () => {
  const manifest = JSON.parse(await readText('manifest.webmanifest'));
  assert.equal(manifest.start_url, '/');
  assert.ok(['standalone', 'fullscreen', 'minimal-ui'].includes(manifest.display));
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'manifest must define at least one icon');
});

test('Netlify deploys generated assets and retains security headers', async () => {
  const config = await readText('netlify.toml');
  assert.match(config, /\bcommand\s*=\s*["']npm run build["']/);
  assert.match(config, /\bpublish\s*=\s*["']dist["']/);
  assert.match(config, /Content-Security-Policy\s*=/);
  assert.match(config, /X-Content-Type-Options\s*=\s*["']nosniff["']/);
  assert.match(config, /Referrer-Policy\s*=/);
});
