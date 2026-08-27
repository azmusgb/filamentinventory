import { readFile, writeFile } from 'node:fs/promises';

const path = 'package-lock.json';
const lock = JSON.parse(await readFile(path, 'utf8'));

if (lock.version !== '10.0.0' || lock.packages?.['']?.version !== '10.0.0') {
  throw new Error(`Unexpected lock release metadata: top=${lock.version}, root=${lock.packages?.['']?.version}`);
}

lock.version = '10.1.0';
lock.packages[''].version = '10.1.0';
await writeFile(path, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
console.log('Aligned package-lock.json release metadata to 10.1.0.');
