import fs from 'node:fs/promises';
import path from 'node:path';

const SOURCE = 'index.html';
const OUTPUT = 'index-modular-test.html';
const ASSET_DIR = path.join('assets', 'modular');
const VERSION = '2026-07-17-modular-test-v1';

const cssGroups = [
  { file: 'base.css', indexes: [0] },
  { file: 'components.css', indexes: [1, 2, 3] },
  { file: 'experience.css', indexes: [4, 5, 6, 7, 8] }
];

const jsFiles = [
  'app.js',
  'home-cleanup.js',
  'mobile-actions.js',
  'navigation.js',
  'image-runtime.js'
];

function collectBlocks(source, pattern) {
  return [...source.matchAll(pattern)].map(match => ({
    full: match[0],
    attrs: match[1] || '',
    content: match[2] || '',
    index: match.index
  }));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function replaceOnce(source, target, replacement, label) {
  const first = source.indexOf(target);
  assert(first >= 0, `Bloco não encontrado: ${label}`);
  assert(source.indexOf(target, first + target.length) < 0, `Bloco duplicado inesperadamente: ${label}`);
  return `${source.slice(0, first)}${replacement}${source.slice(first + target.length)}`;
}

const source = await fs.readFile(SOURCE, 'utf8');
const headEnd = source.indexOf('</head>');
assert(headEnd > 0, 'Fechamento de <head> não encontrado.');

const styles = collectBlocks(source, /<style\b([^>]*)>([\s\S]*?)<\/style>/gi);
assert(styles.length === 9, `Esperados 9 blocos de estilo; encontrados ${styles.length}.`);
assert(styles.every(block => block.index < headEnd), 'Todos os estilos esperados devem estar no <head>.');

const scripts = collectBlocks(source, /<script\b([^>]*)>([\s\S]*?)<\/script>/gi);
const bodyScripts = scripts.filter(block => block.index > headEnd && !/\bsrc\s*=/i.test(block.attrs));
assert(bodyScripts.length === jsFiles.length, `Esperados ${jsFiles.length} scripts inline no corpo; encontrados ${bodyScripts.length}.`);

await fs.mkdir(ASSET_DIR, { recursive: true });

for (const group of cssGroups) {
  const content = group.indexes.map(index => styles[index].content).join('\n');
  await fs.writeFile(path.join(ASSET_DIR, group.file), content, 'utf8');
}

for (const [index, file] of jsFiles.entries()) {
  await fs.writeFile(path.join(ASSET_DIR, file), bodyScripts[index].content, 'utf8');
}

const stylesheetLinks = cssGroups
  .map(group => `  <link rel="stylesheet" href="assets/modular/${group.file}?v=${VERSION}">`)
  .join('\n');

let html = source;
for (const [index, block] of styles.entries()) {
  html = replaceOnce(html, block.full, index === 0 ? stylesheetLinks : '', `style ${index + 1}`);
}

for (const [index, block] of bodyScripts.entries()) {
  const attrs = block.attrs.trim();
  const scriptTag = `<script${attrs ? ` ${attrs}` : ''} src="assets/modular/${jsFiles[index]}?v=${VERSION}"></script>`;
  html = replaceOnce(html, block.full, scriptTag, `script do corpo ${index + 1}`);
}

html = html.replace(
  /<meta name="robots" content="[^"]+">/,
  '<meta name="robots" content="noindex, nofollow">'
);
html = html.replace(
  /<title>([\s\S]*?)<\/title>/,
  '<title>$1 · Teste modular</title>'
);
html = html.replace(
  /(<meta name="da-build-version"[^>]*>)/,
  `$1\n  <meta name="da-modular-test-version" content="${VERSION}">`
);
html = html.replace(
  '</body>',
  `<!-- DA_MODULAR_TEST: arquivos externos, sem alteração do index de produção. -->\n</body>`
);

await fs.writeFile(OUTPUT, html, 'utf8');

const sizes = await Promise.all([
  fs.stat(OUTPUT),
  ...cssGroups.map(group => fs.stat(path.join(ASSET_DIR, group.file))),
  ...jsFiles.map(file => fs.stat(path.join(ASSET_DIR, file)))
]);

console.log(`Gerado ${OUTPUT}: ${sizes[0].size} bytes`);
console.log(`CSS externo: ${sizes.slice(1, 1 + cssGroups.length).reduce((sum, item) => sum + item.size, 0)} bytes`);
console.log(`JavaScript externo: ${sizes.slice(1 + cssGroups.length).reduce((sum, item) => sum + item.size, 0)} bytes`);
