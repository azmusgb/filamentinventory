import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = new URL('../', import.meta.url);
const componentRoot = new URL('../css/components/', import.meta.url);
const architectureFiles = ['css/base.css', 'css/layout.css', 'css/foundation.css'];
const failures = [];

async function read(relative) { return readFile(new URL(`../${relative}`, import.meta.url), 'utf8'); }
function stripComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ''); }
function checkSelectors(file, css) {
  const selectors = [...stripComments(css).matchAll(/(^|})\s*([^@{}][^{}]*)\{/gm)].map(match => match[2].trim());
  for (const selectorList of selectors) for (const selector of selectorList.split(',')) {
    const value = selector.trim();
    if (/#[-_a-zA-Z][\w-]*/.test(value)) failures.push(`${file}: ID selector is not allowed: ${value}`);
    const combinators = (value.match(/[>+~]|\s+(?=[.#[:a-zA-Z])/g) || []).length;
    if (combinators > 4) failures.push(`${file}: selector nesting exceeds 4 combinators: ${value}`);
  }
}
function checkImportant(file, css) {
  if (/!important/.test(stripComments(css))) failures.push(`${file}: new architecture CSS must not use !important`);
}
function checkUndefinedVars(file, css, tokenText) {
  const declared = new Set([...tokenText.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
  const used = [...css.matchAll(/var\((--[\w-]+)/g)].map(m => m[1]);
  for (const variable of used) if (!declared.has(variable)) failures.push(`${file}: undefined token ${variable}`);
}

const tokens = await read('css/tokens.css');
for (const file of architectureFiles) {
  const css = await read(file);
  checkImportant(file, css);
  checkSelectors(file, css);
  checkUndefinedVars(file, css, tokens);
}
try {
  for (const name of await readdir(componentRoot)) if (name.endsWith('.css')) {
    const file = `css/components/${name}`;
    const css = await read(file);
    checkImportant(file, css);
    checkSelectors(file, css);
    checkUndefinedVars(file, css, tokens);
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

if (failures.length) {
  console.error(`CSS architecture audit failed:\n${failures.map(item => ` - ${item}`).join('\n')}`);
  process.exitCode = 1;
} else console.log('CSS architecture audit passed.');
