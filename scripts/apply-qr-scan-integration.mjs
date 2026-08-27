import { readFile, writeFile } from 'node:fs/promises';

async function replaceExact(path, from, to, label) {
  const text = await readFile(path, 'utf8');
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${path}: expected exactly one ${label} match, found ${count}`);
  await writeFile(path, text.replace(from, to));
}

await replaceExact(
  'index.html',
  '<script defer src="/intake-core.js"></script>\n<script defer src="/user-isolation.js"></script>',
  '<script defer src="/intake-core.js"></script>\n<script defer src="/scan-core.js"></script>\n<script defer src="/user-isolation.js"></script>',
  'scan core script anchor',
);

await replaceExact(
  'index.html',
  '<script defer src="/intake-client.js"></script>\n<script defer src="/app.js"></script>',
  '<script defer src="/intake-client.js"></script>\n<script defer src="/scan-client.js"></script>\n<script defer src="/app.js"></script>',
  'scan client script anchor',
);

await replaceExact(
  'labels-client.js',
  "  function linkFor(id) {\n    const url = new URL(location.origin + '/');\n    url.searchParams.set('spool', id);\n    url.searchParams.set('scan', '1');\n    return url.toString();\n  }",
  "  function linkFor(id) {\n    const url = new URL(location.origin + '/');\n    const profile = globalThis.FilamentInventoryUsers?.currentUser?.() || 'Bill';\n    url.searchParams.set('spool', id);\n    url.searchParams.set('scan', '1');\n    url.hash = new URLSearchParams({'filament-user':profile}).toString();\n    return url.toString();\n  }",
  'profile-aware spool link',
);

await replaceExact(
  'labels-client.js',
  '    const qr = `/qr?spool=${encodeURIComponent(spool.id)}`;',
  "    const qr = `/qr?spool=${encodeURIComponent(spool.id)}&profile=${encodeURIComponent(globalThis.FilamentInventoryUsers?.currentUser?.() || 'Bill')}`;",
  'profile-aware QR source',
);

await replaceExact(
  'labels-client.js',
  'Physical spool labels · v7',
  "Physical spool labels · ${esc(globalThis.FilamentInventoryVersion?.DISPLAY_VERSION || '')}",
  'stale physical-label version',
);

await replaceExact(
  'labels-client.js',
  'The QR contains only the public app URL and spool ID; it never contains your private sync key.',
  'The QR contains only the public app URL, spool ID, and private profile name; it never contains your private sync key.',
  'QR privacy copy',
);

await replaceExact(
  'labels-client.js',
  '<strong>iPhone workflow:</strong> point the Camera app at a label → open the link → choose <strong>Weigh now</strong> or <strong>Find in inventory</strong>.',
  '<strong>iPhone workflow:</strong> point Camera or Code Scanner at a label → open the link → choose <strong>Weigh now</strong>, <strong>Edit spool</strong>, or <strong>Printer / AMS</strong>.',
  'iPhone scan workflow copy',
);

await replaceExact(
  'package-lock.json',
  '  "version": "9.3.0",\n  "lockfileVersion": 3,',
  '  "version": "9.4.0",\n  "lockfileVersion": 3,',
  'root package lock version',
);

await replaceExact(
  'package-lock.json',
  '    "": {\n      "name": "filamentinventory",\n      "version": "9.3.0",',
  '    "": {\n      "name": "filamentinventory",\n      "version": "9.4.0",',
  'root package entry version',
);

console.log('QR scanner wiring, profile-aware labels, and v9.4.0 lock metadata applied.');
