import fs from 'node:fs/promises';

const TEST_FILE = 'index-pagespeed-test.html';
const PROD_FILE = 'index.html';
const PROD_VERSION = '2026-07-17-home-pagespeed-oficial-v1';

let html = await fs.readFile(TEST_FILE, 'utf8');

html = html.replace(/<meta\s+name=["']robots["']\s+content=["'][^"']*["']\s*\/?\s*>/gi, '<meta name="robots" content="index, follow">');
html = html.replace(/<title>([\s\S]*?)<\/title>/i, (_, title) => `<title>${String(title).replace(/\s*·\s*Teste PageSpeed\s*/gi, '').trim()}</title>`);
html = html.replace(/2026-07-17-pagespeed-test-v5/g, PROD_VERSION);
html = html.replace(/\d{4}-\d{2}-\d{2}-pagespeed-test-v\d+/g, PROD_VERSION);
html = html.replace(/window\.__DA_PAGESPEED_TEST__\s*=\s*true\s*;/g, 'window.__DA_PAGESPEED_TEST__ = false;');
html = html.replace(/<!--\s*DA_PAGESPEED_TEST:[\s\S]*?-->/g, '<!-- DA_PRODUCTION: home otimizada, banners verticais e navegação com rolagem preservada. -->');

if (!/<meta\s+name=["']robots["']\s+content=["']index, follow["']/i.test(html)) throw new Error('Meta robots de produção não encontrada.');
if (/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(html)) throw new Error('Meta noindex ainda presente.');
if (/<title>[\s\S]*Teste PageSpeed[\s\S]*<\/title>/i.test(html)) throw new Error('Título de teste ainda presente.');
if (/window\.__DA_PAGESPEED_TEST__\s*=\s*true/.test(html)) throw new Error('Flag de teste ainda ativa.');
if (!html.includes(PROD_VERSION)) throw new Error('Versão oficial não aplicada.');
if (!html.includes('da-pagespeed-scroll-v1:')) throw new Error('Restauração de rolagem não encontrada.');
if (!html.includes('Ver Todos os Produtos')) throw new Error('Botões mobile não encontrados.');
if (!html.includes('aspect-ratio:4/5')) throw new Error('Formato vertical dos banners não encontrado.');
if (html.includes('data-home-personalization-slot="buy-again"')) throw new Error('Slot Produtos em destaque voltou ao HTML.');

await fs.writeFile(PROD_FILE, html, 'utf8');
console.log(`Produção gerada em ${PROD_FILE} com versão ${PROD_VERSION}.`);
