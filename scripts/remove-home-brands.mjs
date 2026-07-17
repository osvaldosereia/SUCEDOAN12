import fs from 'node:fs/promises';

const FILE = 'index.html';
const COMPATIBILITY_VERSION = '2026-07-17-home-sem-marcas-v10';
let html = await fs.readFile(FILE, 'utf8');
const before = html;

html = html.replace(/\$\{brandStripHtml\(\)\}/g, '');
html = html.replace(/\s*<!-- DA_HOME_SEM_MARCAS: [^>]+ -->/g, '');
const marker = `  <!-- DA_HOME_SEM_MARCAS: ${COMPATIBILITY_VERSION} -->`;
html = html.replace('</head>', `${marker}\n</head>`);

if (html.includes('${brandStripHtml()}')) throw new Error('A seção de marcas ainda está presente na home.');

await fs.writeFile(FILE, html, 'utf8');
console.log(html === before ? 'Home sem marcas já estava atualizada.' : 'Marcas removidas da home sem alterar a versão do site.');
