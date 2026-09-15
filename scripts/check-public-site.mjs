import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = relative => fs.existsSync(path.join(root, relative));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const required = [
  'index.html', 'CNAME', 'robots.txt', 'sitemap.xml', 'merchant.xml',
  'sobre-nos.html', 'contato.html', 'politica-de-entrega.html',
  'politica-de-troca.html', 'politica-de-privacidade.html', 'termos-de-uso.html',
  'cestas/index.html', 'kits/index.html',
  'site/seo-combos-manifest.json', 'site/produtos-cesta-basica.json', 'site/kits.json',
  'site/produtos_meta.csv', 'site/produtos_admin_meta.json',
  'comprar/config.js', 'comprar/chat-light-v2.js',
  'comprar/chat-checkout-quantity-v1.js', 'comprar/checkout-final-v2.js',
  'comprar/storefront-visual-v2.js',
  'scripts/catalogos-combos-lib.js'
];
required.forEach(file => assert(exists(file), `Arquivo público ausente: ${file}`));

const production = read('index.html');
for (const marker of [
  '/comprar/config.js?v=20260915-02',
  '/comprar/chat-checkout-quantity-v1.js?v=20260915-03',
  '/comprar/checkout-final-v2.js',
  '/comprar/storefront-visual-v2.js',
  '"@type":"OnlineStore"', '"@type":"WebSite"',
  'Cestas Básicas em Cuiabá e Várzea Grande',
  'Somente delivery', 'id="timeline"', 'id="checkoutButton"'
]) assert(production.includes(marker), `Index Comprar incompleto: ${marker}`);

for (const legacy of [
  '/app-next/src/main.js', '/app-next/src/image-performance.js', '/app-next/src/home-carousels.js',
  '/app-next/styles/storefront-base.css', '/app-next/styles/storefront-components.css',
  '/app-next/styles/storefront-responsive.css', '/app-next/styles/checkout-flow.css',
  '/app-next/styles/bundle-confirmation.css', '/app-next/src/seo-combos.js',
  '/app-next/src/live-polish.js', 'mug-printable-arc-v3',
  'window.__DA_PRODUCTION__ = true', 'raw.githubusercontent.com'
]) assert(!production.includes(legacy), `Index ainda carrega camada legada: ${legacy}`);

const comprarConfig = read('comprar/config.js');
const comprarCheckout = read('comprar/chat-checkout-quantity-v1.js');
assert(comprarConfig.includes("whatsappFallback:'https://wa.me/5565998150975'"), 'Comprar não usa o WhatsApp oficial');
assert(comprarCheckout.includes('https://wa.me/5565998150975'), 'Checkout não possui fallback para o WhatsApp oficial');
assert(!comprarConfig.includes('556584491018'), 'Config do Comprar ainda contém o WhatsApp antigo');
assert(!comprarCheckout.includes('556584491018'), 'Checkout do Comprar ainda contém o WhatsApp antigo');

const baskets = JSON.parse(read('site/produtos-cesta-basica.json'));
assert(Array.isArray(baskets) && baskets.length > 0, 'Catálogo de cestas vazio');
for (const basket of baskets) {
  const image = String(basket.imagem || '').replace(/^\/+/, '');
  assert(image, `Cesta sem imagem: ${basket.nome || basket.id}`);
  assert(exists(image), `Imagem da cesta não existe: ${image}`);
}

const manifest = JSON.parse(read('site/seo-combos-manifest.json'));
assert(manifest.shell === 'index.html', 'Páginas de cestas e kits não usam o shell principal');
assert(manifest.seoFocus === 'cestas-basicas', 'Manifesto não declara foco em cestas básicas');
assert(Array.isArray(manifest.files) && manifest.files.length >= 4, 'Manifesto SEO incompleto');

const basketLanding = read('cestas/index.html');
for (const marker of [
  '<h1>Cestas básicas em Cuiabá e Várzea Grande</h1>',
  '"@type":"CollectionPage"', '"@type":"ItemList"', '"@type":"FAQPage"',
  'index,follow,max-image-preview:large'
]) assert(basketLanding.includes(marker), `Landing de cestas incompleta: ${marker}`);

const basketPagePath = manifest.files.find(file => /^cestas\/[^/]+\/index\.html$/.test(file));
assert(basketPagePath, 'Nenhuma página individual de cesta gerada');
const basketPage = read(basketPagePath);
for (const marker of ['"@type":"Product"', '"@type":"Offer"', '"@type":"BreadcrumbList"', 'Produtos desta cesta básica']) {
  assert(basketPage.includes(marker), `Página individual de cesta incompleta: ${marker}`);
}

const kitLanding = read('kits/index.html');
assert(kitLanding.includes('noindex,follow'), 'Landing de kits deve permanecer funcional sem foco de indexação');

const sitemap = read('sitemap.xml');
assert(sitemap.includes('https://donaantonia.com.br/cestas/'), 'Sitemap sem cestas');
assert(!sitemap.includes('https://donaantonia.com.br/kits/'), 'Sitemap ainda prioriza kits');

const merchant = read('merchant.xml');
assert(merchant.includes('<item>'), 'Merchant sem itens');
assert(!merchant.includes('https://www.donaantonia.com.br'), 'Merchant usa domínio com www');
assert(!read('robots.txt').includes('https://www.donaantonia.com.br'), 'robots.txt usa domínio com www');

for (const file of ['sobre-nos.html', 'contato.html', 'politica-de-entrega.html', 'politica-de-troca.html', 'politica-de-privacidade.html', 'termos-de-uso.html']) {
  const html = read(file);
  assert(html.includes('51.385.335/0001-06'), `${file} não possui o CNPJ real`);
  assert(!html.includes('https://www.donaantonia.com.br'), `${file} usa domínio com www`);
}

const { buildComboCatalog } = require('./catalogos-combos-lib.js');
const sampleCatalog = buildComboCatalog({
  productsRaw: {
    arroz: { codigo: 'ARROZ-1', nome: 'Arroz Teste 5kg', preco: 20, estoque: 10, situacao: 'A' },
    feijao: { codigo: 'FEIJAO-1', nome: 'Feijão Teste 1kg', preco: 10, estoque: 6, situacao: 'A' },
    sabao: { codigo: 'SABAO-1', nome: 'Sabão Teste', preco: 30, estoque: 3, situacao: 'A' }
  },
  basketsRaw: [{ id: 'cesta-teste', codigo: 'cesta-economica-teste', nome: 'Econômica Teste', preco: 35, imagem: 'img/cesta-teste.webp', produtos: [{ codigo: 'ARROZ-1', qtd: 1 }, { codigo: 'FEIJAO-1', qtd: 1 }] }],
  kitsRaw: [{ id: 'kit-teste', codigo: 'kit-limpeza-teste', nome: 'Kit Limpeza Teste', preco: 25, ativo: true, estoque_disponivel: 2, produtos: [{ codigo: 'SABAO-1', qtd: 1 }] }],
  now: new Date('2026-07-26T12:00:00-04:00')
});
assert(sampleCatalog.active.length === 2, 'Catálogo de teste deveria manter cesta e kit funcionais');

console.log(`Site validado: ${baskets.length} cestas, raiz Comprar atual e dados públicos consistentes.`);
