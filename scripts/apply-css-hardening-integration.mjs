import { readFile, writeFile } from 'node:fs/promises';

async function replaceExact(path, from, to, label) {
  const text = await readFile(path, 'utf8');
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${path}: expected exactly one ${label} match, found ${count}`);
  await writeFile(path, text.replace(from, to));
}

await replaceExact(
  'index.html',
  '<link href="/ui-polish.css" rel="stylesheet"/>',
  '<link href="/ui-polish.css" rel="stylesheet"/>\n<link href="/ui-hardening.css" rel="stylesheet"/>',
  'hardening stylesheet anchor',
);

await replaceExact(
  'scripts/public-assets.mjs',
  "  'ui-polish.css',\n",
  "  'ui-polish.css',\n  'ui-hardening.css',\n",
  'public stylesheet asset anchor',
);

await replaceExact(
  'sw.js',
  "const CACHE = 'filament-inventory-v20';",
  "const CACHE = 'filament-inventory-v21';",
  'service worker cache generation',
);

await replaceExact(
  'sw.js',
  "'/ui-polish.css', '/app-version.js'",
  "'/ui-polish.css', '/ui-hardening.css', '/app-version.js'",
  'service worker stylesheet list',
);

await replaceExact(
  'netlify.toml',
  '[[headers]]\n  for = "/sw.js"',
  '[[headers]]\n  for = "/ui-hardening.css"\n  [headers.values]\n    Cache-Control = "public, max-age=0, must-revalidate"\n\n[[headers]]\n  for = "/sw.js"',
  'Netlify hardening stylesheet cache rule',
);

await replaceExact(
  'tests/scan-integration.test.mjs',
  'assert.match(sw, /filament-inventory-v20/);',
  'assert.match(sw, /filament-inventory-v21/);',
  'scanner PWA cache assertion',
);

console.log('CSS hardening wired into browser, PWA, deploy, and regression contracts.');
