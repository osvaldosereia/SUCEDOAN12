import fs from 'node:fs/promises';

const TEST_FILE = 'index-pagespeed-test.html';
const PROD_FILE = 'index.html';
const TEST_VERSION = '2026-07-17-fast-home-test-v8';
const PROD_VERSION = '2026-07-17-fast-home-oficial-v2';

let html = await fs.readFile(TEST_FILE, 'utf8');

html = html.replace(/<meta\s+name=["']robots["']\s+content=["'][^"']*["']\s*\/?\s*>/gi, '<meta name="robots" content="index, follow">');
html = html.replace(/<title>([\s\S]*?)<\/title>/i, (_, title) => `<title>${String(title).replace(/\s*·\s*Teste Home Rápida\s*/gi, '').trim()}</title>`);
html = html.replaceAll(TEST_VERSION, PROD_VERSION);
html = html.replace(/window\.__DA_PAGESPEED_TEST__\s*=\s*true\s*;/g, 'window.__DA_PAGESPEED_TEST__ = false;');
html = html.replace(/<!--\s*DA_FAST_HOME_TEST_V8\s*-->/g, '<!-- DA_PRODUCTION_FAST_HOME_V2 -->');

if (/noindex, nofollow/i.test(html)) throw new Error('Meta noindex ainda presente.');
if (/Teste Home Rápida/i.test(html)) throw new Error('Título de teste ainda presente.');
if (/window\.__DA_PAGESPEED_TEST__\s*=\s*true/.test(html)) throw new Error('Flag de teste ainda ativa.');
if (!html.includes(PROD_VERSION)) throw new Error('Versão oficial não aplicada.');
if (!html.includes('grid-template-columns:1fr!important')) throw new Error('Compra do mês em uma coluna no mobile não encontrada.');

await fs.writeFile(PROD_FILE, html, 'utf8');
console.log(`Produção gerada em ${PROD_FILE} com versão ${PROD_VERSION}.`);
