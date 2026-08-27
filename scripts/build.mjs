import { copyFile, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_ASSETS } from './public-assets.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const distDir = path.join(rootDir, 'dist');

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

for (const asset of PUBLIC_ASSETS) {
  const source = path.join(rootDir, asset);
  const destination = path.join(distDir, asset);
  const sourceStat = await stat(source).catch(() => null);

  if (!sourceStat?.isFile()) {
    throw new Error(`Required public asset is missing or is not a file: ${asset}`);
  }

  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

const rawCommitRef = String(
  process.env.COMMIT_REF ||
  process.env.GITHUB_SHA ||
  process.env.CI_COMMIT_SHA ||
  '',
).trim();
const commitRef = /^[0-9a-f]{40}$/i.test(rawCommitRef)
  ? rawCommitRef.toLowerCase()
  : null;

const buildMeta = Object.freeze({
  schema: 1,
  commitRef,
  provider: process.env.NETLIFY === 'true'
    ? 'netlify'
    : process.env.GITHUB_ACTIONS === 'true'
      ? 'github-actions'
      : 'local',
});

await writeFile(
  path.join(distDir, 'build-meta.json'),
  `${JSON.stringify(buildMeta, null, 2)}\n`,
  'utf8',
);

console.log(
  `Built ${PUBLIC_ASSETS.length} public assets plus build-meta.json into ${path.relative(rootDir, distDir)}/` +
  `${commitRef ? ` for ${commitRef}` : ' without CI commit identity'}.`,
);
