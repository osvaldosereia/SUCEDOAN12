import fs from 'node:fs/promises';

const FILE = 'index.html';
const VERSION = '2026-07-17-home-sem-marcas-v10';
let html = await fs.readFile(FILE, 'utf8');
const before = html;

html = html.replace(/\$\{brandStripHtml\(\)\}/g, '');
html = html.replace(/<meta name="da-build-version" content="[^"]+">/, `<meta name="da-build-version" content="${VERSION}">`);
html = html.replace(/2026-07-17-home-cards-proporcionais-v9/g, VERSION);
html = html.replace(/2026-07-17-fast-home-oficial-v2/g, VERSION);

if (html === before) throw new Error('Nenhuma alteração foi aplicada ao index.html.');
if (html.includes('${brandStripHtml()}')) throw new Error('A seção de marcas ainda está presente na home.');

await fs.writeFile(FILE, html, 'utf8');
console.log(`Marcas removidas da home. Versão: ${VERSION}`);
