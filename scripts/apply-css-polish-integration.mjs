import { readFile, writeFile } from 'node:fs/promises';

async function replaceExact(path, from, to) {
  let text = await readFile(path, 'utf8');
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${path}: expected exactly one match, found ${count}: ${from}`);
  text = text.replace(from, to);
  await writeFile(path, text);
}

await replaceExact(
  'index.html',
  '<link href="/styles.css" rel="stylesheet"/>',
  '<link href="/styles.css" rel="stylesheet"/>\n<link href="/ui-polish.css" rel="stylesheet"/>',
);

await replaceExact(
  'scripts/public-assets.mjs',
  "  'styles.css',\n",
  "  'styles.css',\n  'ui-polish.css',\n",
);

await replaceExact(
  'sw.js',
  "const CACHE = 'filament-inventory-v14';",
  "const CACHE = 'filament-inventory-v15';",
);
await replaceExact(
  'sw.js',
  "'/styles.css', '/app-version.js'",
  "'/styles.css', '/ui-polish.css', '/app-version.js'",
);

await replaceExact(
  'netlify.toml',
  `[[headers]]\n  for = "/styles.css"\n  [headers.values]\n    Cache-Control = "public, max-age=0, must-revalidate"\n`,
  `[[headers]]\n  for = "/styles.css"\n  [headers.values]\n    Cache-Control = "public, max-age=0, must-revalidate"\n\n[[headers]]\n  for = "/ui-polish.css"\n  [headers.values]\n    Cache-Control = "public, max-age=0, must-revalidate"\n`,
);

console.log('Applied CSS polish integration.');
