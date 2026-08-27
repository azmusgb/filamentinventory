import { readFile, writeFile } from 'node:fs/promises';

const path = 'scripts/apply-inventory-command-integration.mjs';
let text = await readFile(path, 'utf8');
text = text.replace("import { readFile, writeFile, unlink } from 'node:fs/promises';", "import { readFile, writeFile } from 'node:fs/promises';");
const start = text.indexOf("\nawait replaceExact(\n  '.github/workflows/ci.yml',");
const endMarker = "\nawait unlink('scripts/apply-inventory-command-integration.mjs');\nconsole.log('Inventory command surface wired; helper removed and CI restored to read-only.');\n";
const end = text.indexOf(endMarker);
if (start < 0 || end < 0 || end <= start) throw new Error('Could not isolate temporary workflow-mutation block.');
text = `${text.slice(0, start)}\nconsole.log('Inventory command surface wired into app/PWA contracts.');\n`;
await writeFile(path, text);
console.log('Prepared one-time integrator without workflow mutations.');
