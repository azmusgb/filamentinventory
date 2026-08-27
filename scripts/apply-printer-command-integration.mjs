import { readFile, writeFile } from 'node:fs/promises';

async function replaceExact(path, from, to, label) {
  const text = await readFile(path, 'utf8');
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${path}: expected exactly one ${label} match, found ${count}`);
  await writeFile(path, text.replace(from, to));
}

await replaceExact(
  'index.html',
  '<script defer src="/scan-core.js"></script>\n<script defer src="/user-isolation.js"></script>',
  '<script defer src="/scan-core.js"></script>\n<script defer src="/printer-core.js"></script>\n<script defer src="/user-isolation.js"></script>',
  'printer core script anchor',
);

await replaceExact(
  'index.html',
  '<script defer src="/scan-client.js"></script>\n<script defer src="/app.js"></script>',
  '<script defer src="/scan-client.js"></script>\n<script defer src="/printer-dashboard.js"></script>\n<script defer src="/app.js"></script>',
  'printer dashboard script anchor',
);

await replaceExact(
  'household-client.js',
  "      btn.textContent = 'Household';",
  "      btn.textContent = 'Printer / AMS';",
  'legacy household tab label',
);

await replaceExact(
  'household-client.js',
  "      btn.textContent = 'Household / AMS';",
  "      btn.textContent = 'Printer / AMS';",
  'legacy household hero action label',
);

await replaceExact(
  'package-lock.json',
  '  "version": "9.4.0",\n  "lockfileVersion": 3,',
  '  "version": "9.5.0",\n  "lockfileVersion": 3,',
  'root package lock version',
);

await replaceExact(
  'package-lock.json',
  '    "": {\n      "name": "filamentinventory",\n      "version": "9.4.0",',
  '    "": {\n      "name": "filamentinventory",\n      "version": "9.5.0",',
  'root package entry version',
);

console.log('Printer/AMS command-center wiring and v9.5.0 lock metadata applied.');
