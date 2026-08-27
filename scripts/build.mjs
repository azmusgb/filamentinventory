import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
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

  await copyFile(source, destination);
}

console.log(`Built ${PUBLIC_ASSETS.length} public assets into ${path.relative(rootDir, distDir)}/.`);
