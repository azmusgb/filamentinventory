import { readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JAVASCRIPT_ASSETS, PUBLIC_ASSETS } from './public-assets.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const failures = [];

function fail(message) {
  failures.push(message);
}

async function readText(relativePath) {
  return readFile(path.join(rootDir, relativePath), 'utf8');
}

for (const asset of PUBLIC_ASSETS) {
  const fileStat = await stat(path.join(rootDir, asset)).catch(() => null);
  if (!fileStat?.isFile() || fileStat.size === 0) {
    fail(`Required public asset is missing or empty: ${asset}`);
  }
}

for (const asset of JAVASCRIPT_ASSETS) {
  const result = spawnSync(process.execPath, ['--check', path.join(rootDir, asset)], {
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    fail(`JavaScript syntax validation failed for ${asset}:\n${result.stderr || result.stdout}`);
  }
}

let manifest;
try {
  manifest = JSON.parse(await readText('manifest.webmanifest'));
} catch (error) {
  fail(`manifest.webmanifest is not valid JSON: ${error.message}`);
}

if (manifest) {
  for (const field of ['name', 'short_name', 'start_url', 'display']) {
    if (!String(manifest[field] || '').trim()) {
      fail(`manifest.webmanifest is missing required field: ${field}`);
    }
  }
}

const html = await readText('index.html');
const ids = [...html.matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => match[1]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
if (duplicateIds.length > 0) {
  fail(`index.html contains duplicate id values: ${duplicateIds.join(', ')}`);
}

for (const match of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
  const reference = match[1];
  if (!reference.startsWith('/') || reference.startsWith('//') || reference.startsWith('/api/')) continue;

  const relativePath = reference.slice(1).split(/[?#]/, 1)[0];
  if (relativePath && !PUBLIC_ASSETS.includes(relativePath)) {
    fail(`index.html references a local asset not included in the public build: ${reference}`);
  }
}

for (const match of html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
  if (match[1].trim()) {
    fail('index.html contains inline JavaScript, which is blocked by the configured Content-Security-Policy.');
  }
}

const netlify = await readText('netlify.toml');
if (!/\bpublish\s*=\s*["']dist["']/.test(netlify)) {
  fail('netlify.toml must publish the generated dist directory.');
}
if (!/\bcommand\s*=\s*["']npm run build["']/.test(netlify)) {
  fail('netlify.toml must run npm run build before deployment.');
}
if (!/X-Content-Type-Options\s*=\s*["']nosniff["']/.test(netlify)) {
  fail('netlify.toml must retain the X-Content-Type-Options security header.');
}
if (!/Content-Security-Policy\s*=/.test(netlify)) {
  fail('netlify.toml must retain a Content-Security-Policy header.');
}

let packageJson;
try {
  packageJson = JSON.parse(await readText('package.json'));
} catch (error) {
  fail(`package.json is not valid JSON: ${error.message}`);
}

if (packageJson) {
  for (const scriptName of ['lint', 'test', 'build']) {
    if (!String(packageJson.scripts?.[scriptName] || '').trim()) {
      fail(`package.json is missing the ${scriptName} script required by CI.`);
    }
  }
}

if (failures.length > 0) {
  console.error(`Validation failed with ${failures.length} problem${failures.length === 1 ? '' : 's'}:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Validation passed: ${PUBLIC_ASSETS.length} public assets, ${JAVASCRIPT_ASSETS.length} JavaScript files, manifest, HTML references, and Netlify deployment contract.`);
