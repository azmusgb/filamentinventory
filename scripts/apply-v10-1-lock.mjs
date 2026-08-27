import { readFile, writeFile } from 'node:fs/promises';

const path = 'package-lock.json';
const lock = JSON.parse(await readFile(path, 'utf8'));
const top = String(lock.version || '');
const root = String(lock.packages?.['']?.version || '');

if (top === '10.1.0' && root === '10.1.0') {
  console.log('package-lock.json release metadata is already 10.1.0.');
  process.exit(0);
}
if (top !== '10.0.0' || root !== '10.0.0') {
  throw new Error(`Unexpected lock release metadata: top=${top}, root=${root}`);
}

lock.version = '10.1.0';
lock.packages[''].version = '10.1.0';
await writeFile(path, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
console.log('Aligned package-lock.json release metadata to 10.1.0.');
