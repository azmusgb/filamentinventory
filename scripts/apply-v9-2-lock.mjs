import { readFile, writeFile } from 'node:fs/promises';

const path = 'package-lock.json';
const from = '"version": "9.1.0"';
const to = '"version": "9.2.0"';
const text = await readFile(path, 'utf8');
const count = text.split(from).length - 1;
if (count !== 2) throw new Error(`${path}: expected exactly 2 root version matches, found ${count}`);
await writeFile(path, text.replaceAll(from, to));
console.log('Updated package-lock root versions to 9.2.0.');
