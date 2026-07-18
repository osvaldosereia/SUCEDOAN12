import fs from 'node:fs/promises';
import path from 'node:path';

const SOURCE = 'index.html';
const OUTPUT = 'index-modular-test.html';
const ASSET_DIR = path.join('assets', 'modular');
const cssGroups = [
  { file: 'base.css', indexes: [0] },
  { file: 'components.css', indexes: [1, 2, 3] },
  { file: 'experience.css', indexes: [4, 5, 6, 7, 8] }
];
const jsFiles = ['app.js', 'home-cleanup.js', 'mobile-actions.js', 'navigation.js', 'image-runtime.js'];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function collect(source, pattern) {
  return [...source.matchAll(pattern)].map(match => ({
    attrs: match[1] || '',
    content: match[2] || '',
    index: match.index
  }));
}

const [source, output] = await Promise.all([
  fs.readFile(SOURCE, 'utf8'),
  fs.readFile(OUTPUT, 'utf8')
]);

const sourceHeadEnd = source.indexOf('</head>');
const outputHeadEnd = output.indexOf('</head>');
const sourceStyles = collect(source, /<style\b([^>]*)>([\s\S]*?)<\/style>/gi);
const sourceBodyScripts = collect(source, /<script\b([^>]*)>([\s\S]*?)<\/script>/gi)
  .filter(block => block.index > sourceHeadEnd && !/\bsrc\s*=/i.test(block.attrs));
const outputStyles = collect(output, /<style\b([^>]*)>([\s\S]*?)<\/style>/gi);
const outputBodyInlineScripts = collect(output, /<script\b([^>]*)>([\s\S]*?)<\/script>/gi)
  .filter(block => block.index > outputHeadEnd && !/\bsrc\s*=/i.test(block.attrs));

assert(sourceStyles.length === 9, 'O index de origem mudou: quantidade inesperada de estilos.');
assert(sourceBodyScripts.length === 5, 'O index de origem mudou: quantidade inesperada de scripts do corpo.');
assert(outputStyles.length === 0, 'A página modular ainda contém estilos inline.');
assert(outputBodyInlineScripts.length === 0, 'A página modular ainda contém scripts inline no corpo.');
assert(/<meta name="robots" content="noindex, nofollow">/.test(output), 'A página de teste deve permanecer noindex.');
assert(/DA_MODULAR_TEST/.test(output), 'Marcador de homologação ausente.');

for (const group of cssGroups) {
  const expected = group.indexes.map(index => sourceStyles[index].content).join('\n');
  const actual = await fs.readFile(path.join(ASSET_DIR, group.file), 'utf8');
  assert(actual === expected, `Conteúdo CSS divergente em ${group.file}.`);
  assert(output.includes(`assets/modular/${group.file}?v=`), `Referência ausente para ${group.file}.`);
}

for (const [index, file] of jsFiles.entries()) {
  const actual = await fs.readFile(path.join(ASSET_DIR, file), 'utf8');
  assert(actual === sourceBodyScripts[index].content, `Conteúdo JavaScript divergente em ${file}.`);
  assert(output.includes(`assets/modular/${file}?v=`), `Referência ausente para ${file}.`);
}

const jsPositions = jsFiles.map(file => output.indexOf(`assets/modular/${file}?v=`));
assert(jsPositions.every(position => position >= 0), 'Um ou mais scripts externos não foram encontrados.');
assert(jsPositions.every((position, index) => index === 0 || position > jsPositions[index - 1]), 'A ordem dos scripts mudou.');

console.log('Verificação modular concluída: conteúdo e ordem preservados.');
