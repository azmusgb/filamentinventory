import { readFile, writeFile } from 'node:fs/promises';

async function replaceExact(path, from, to, label) {
  const text = await readFile(path, 'utf8');
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${path}: expected exactly one ${label} match, found ${count}`);
  await writeFile(path, text.replace(from, to));
}

await replaceExact(
  'index.html',
  '<script defer src="/personal-core.js"></script>\n<script defer src="/user-isolation.js"></script>',
  '<script defer src="/personal-core.js"></script>\n<script defer src="/intake-core.js"></script>\n<script defer src="/user-isolation.js"></script>',
  'intake core script anchor',
);

await replaceExact(
  'index.html',
  '<script defer src="/personal-dashboard.js"></script>\n<script defer src="/app.js"></script>',
  '<script defer src="/personal-dashboard.js"></script>\n<script defer src="/intake-client.js"></script>\n<script defer src="/app.js"></script>',
  'intake client script anchor',
);

await replaceExact(
  'package-lock.json',
  '  "version": "9.2.0",\n  "lockfileVersion": 3,',
  '  "version": "9.3.0",\n  "lockfileVersion": 3,',
  'root package lock version',
);

await replaceExact(
  'package-lock.json',
  '    "": {\n      "name": "filamentinventory",\n      "version": "9.2.0",',
  '    "": {\n      "name": "filamentinventory",\n      "version": "9.3.0",',
  'root package entry version',
);

console.log('Smart intake wiring and v9.3.0 lock metadata applied.');
