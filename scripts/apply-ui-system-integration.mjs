import { readFile, writeFile } from 'node:fs/promises';

async function replaceExact(path, from, to, label) {
  const text = await readFile(path, 'utf8');
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${path}: expected exactly one ${label} match, found ${count}`);
  await writeFile(path, text.replace(from, to));
}

await replaceExact(
  'index.html',
  '<html lang="en">',
  '<html class="fi-ui" lang="en">',
  'UI root scope',
);

await replaceExact(
  'index.html',
  '<link href="/styles.css" rel="stylesheet"/>\n<link href="/ui-polish.css" rel="stylesheet"/>\n<link href="/ui-hardening.css" rel="stylesheet"/>',
  '<link href="/styles.css" rel="stylesheet"/>\n<link href="/ui-system.css" rel="stylesheet"/>',
  'stylesheet consolidation',
);

await replaceExact(
  'scripts/public-assets.mjs',
  "  'styles.css',\n  'ui-polish.css',\n  'ui-hardening.css',\n",
  "  'styles.css',\n  'ui-system.css',\n",
  'public CSS manifest',
);

await replaceExact('sw.js', "const CACHE = 'filament-inventory-v21';", "const CACHE = 'filament-inventory-v22';", 'PWA cache generation');
await replaceExact(
  'sw.js',
  "'/styles.css', '/ui-polish.css', '/ui-hardening.css', '/app-version.js'",
  "'/styles.css', '/ui-system.css', '/app-version.js'",
  'PWA CSS core list',
);

await replaceExact(
  'netlify.toml',
  '[[headers]]\n  for = "/ui-polish.css"\n  [headers.values]\n    Cache-Control = "public, max-age=0, must-revalidate"\n\n[[headers]]\n  for = "/ui-hardening.css"\n  [headers.values]\n    Cache-Control = "public, max-age=0, must-revalidate"',
  '[[headers]]\n  for = "/ui-system.css"\n  [headers.values]\n    Cache-Control = "public, max-age=0, must-revalidate"',
  'Netlify UI CSS headers',
);

await replaceExact(
  '.github/workflows/ci.yml',
  '          test -f dist/ui-polish.css\n          test -f dist/ui-hardening.css',
  '          test -f dist/ui-system.css',
  'CI UI artifact assertions',
);

await replaceExact('app-version.js', "const APP_VERSION = '9.5.0';", "const APP_VERSION = '9.6.0';", 'app release version');
await replaceExact('package.json', '"version": "9.5.0"', '"version": "9.6.0"', 'package version');
await replaceExact(
  'package-lock.json',
  '"name": "filamentinventory",\n  "version": "9.5.0",',
  '"name": "filamentinventory",\n  "version": "9.6.0",',
  'lockfile package version',
);
await replaceExact(
  'package-lock.json',
  '"name": "filamentinventory",\n      "version": "9.5.0",',
  '"name": "filamentinventory",\n      "version": "9.6.0",',
  'lockfile root package version',
);

await replaceExact(
  'tests/scan-integration.test.mjs',
  'assert.match(sw, /filament-inventory-v21/);',
  'assert.match(sw, /filament-inventory-v22/);',
  'scanner PWA cache assertion',
);

await replaceExact('ux-client.js', "ownerScope:'all'", "ownerScope:'current'", 'private inventory default scope');
await replaceExact(
  'ux-client.js',
  'without changing shared inventory data.',
  'without changing private inventory data.',
  'private preference copy',
);
await replaceExact(
  'ux-client.js',
  '<option value="household">Household / AMS</option>',
  '<option value="household">Printer / AMS</option>',
  'Printer AMS preference label',
);

console.log('Consolidated UI system wired into browser, PWA, release, and deployment contracts.');
