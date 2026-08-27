import { readFile, writeFile } from 'node:fs/promises';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version || '')) {
  console.error('Usage: npm run release -- 10.3.0');
  process.exit(2);
}

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const write = (path, value) => writeFile(new URL(path, root), value, 'utf8');

const appVersion = await read('app-version.js');
const current = appVersion.match(/const APP_VERSION = '([^']+)'/)?.[1];
if (!current) throw new Error('Could not locate APP_VERSION in app-version.js');

const pkg = JSON.parse(await read('package.json'));
const lock = JSON.parse(await read('package-lock.json'));
const sw = await read('sw.js');
const cacheMatch = sw.match(/const CACHE = 'filament-inventory-v(\d+)'/);
if (!cacheMatch) throw new Error('Could not locate service-worker cache generation.');
const nextCache = Number(cacheMatch[1]) + 1;

pkg.version = version;
lock.version = version;
if (!lock.packages?.['']) throw new Error('package-lock root package metadata is missing.');
lock.packages[''].version = version;

await Promise.all([
  write('app-version.js', appVersion.replace(`const APP_VERSION = '${current}'`, `const APP_VERSION = '${version}'`)),
  write('package.json', `${JSON.stringify(pkg, null, 2)}\n`),
  write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`),
  write('sw.js', sw.replace(cacheMatch[0], `const CACHE = 'filament-inventory-v${nextCache}'`)),
]);

console.log(`Prepared Filament Inventory ${version}; schema unchanged; PWA cache v${nextCache}.`);
