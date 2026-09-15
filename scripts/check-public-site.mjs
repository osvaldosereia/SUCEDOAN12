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
  'cestas/index.html', 'kits/index.html', 'site/seo-combos-manifest.json',
  'site/produtos-cesta-basica.json', 'site/kits.json', 'site/app-version.json',
  'comprar/config.js', 'comprar/app.js', 'comprar/baskets.js',
  'comprar/products.js', 'comprar/checkout.js', 'comprar/help.js',
  'comprar/admin-test-bridge.js', 'comprar/styles.css',
  'app-next/index.html', 'app-next/styles/storefront-base.css',
  'app-next/styles/storefront-components.css', 'app-next/styles/storefront-responsive.css',
  'app-next/styles/checkout-flow.css', 'app-next/styles/bundle-confirmation.css',
  'app-next/src/checkout.js', 'app-next/src/ui.js', 'app-next/src/main.js',
  'app-next/src/home-carousels.js', 'app-next/src/image-performance.js',
  'app-next/src/catalog.js', 'app-next/src/mug-public-runtime-v6.js',
  'app-next/src/mug-public-personalization-v7.js', 'app-next/src/mug-public-personalization-contract-v25.js',
  'app-next/src/mug-public-ux-v1.js', 'app-next/src/mug-public-thumbnails-v2.js',
  'scripts/catalogos-combos-lib.js', 'scripts/estabilizar-catalogo-publico.mjs'
];
required.forEach(file => assert(exists(file), `Arquivo público ausente: ${file}`));

// A raiz pública é o Comprar limpo. O app-next continua no repositório para módulos auxiliares,
// mas não pode voltar a ser injetado como shell da home.
const production = read('index.html');
for (const marker of [
  '/comprar/config.js?v=20260915-05',
  '/comprar/app.js?v=20260915-05',
  '/comprar/baskets.js?v=20260915-05',
  '/comprar/products.js?v=20260915-05',
  '/comprar/checkout.js?v=20260915-05',
  '/comprar/help.js?v=20260915-05',
  '/comprar/styles.css?v=20260915-05',
  '"@type":"OnlineStore"', '"@type":"WebSite"',
  'Cestas Básicas em Cuiabá e Várzea Grande',
  'Somente delivery', 'id="timeline"', 'id="checkoutButton"'
]) assert(production.includes(marker), `Index Comprar incompleto: ${marker}`);

for (const removed of [
  '/comprar/chat-light-v2.js', '/comprar/chat-checkout-quantity-v1.js',
  '/comprar/checkout-final-v2.js', '/comprar/chat-helper-menu.js',
  '/comprar/phone-retry-v1.js', '/comprar/product-detail-v1.js',
  '/comprar/storefront-visual-v2.js', '/comprar/admin-test-after-checkout.js',
  '/app-next/src/main.js', '/app-next/src/image-performance.js', '/app-next/src/home-carousels.js',
  '/app-next/styles/storefront-base.css', '/app-next/styles/storefront-components.css',
  '/app-next/styles/storefront-responsive.css', '/app-next/styles/checkout-flow.css',
  '/app-next/styles/bundle-confirmation.css', '/app-next/styles/visual-parity.css',
  '/app-next/styles/home-parity.css', '/app-next/styles/live-polish.css',
  '/app-next/src/live-polish.js', '/app-next/src/seo-combos.js',
  'mug-printable-arc-v3', 'window.__DA_PRODUCTION__ = true',
  'html.booting #app{opacity:0', 'raw.githubusercontent.com'
]) assert(!production.includes(removed), `Index ainda carrega camada ou marcador legado: ${removed}`);

const comprarConfig = read('comprar/config.js');
assert(comprarConfig.includes("whatsappFallback:'https://wa.me/5565998150975'"), 'Comprar não usa o WhatsApp oficial');
assert(!comprarConfig.includes('556584491018'), 'Comprar ainda contém o WhatsApp antigo');

const comprarModules = ['comprar/app.js','comprar/baskets.js','comprar/products.js','comprar/checkout.js','comprar/help.js'].map(read).join('\n');
assert(!/window\.fetch\s*=/.test(comprarModules), 'Comprar comercial ainda sobrescreve window.fetch');
assert(!/new\s+MutationObserver/.test(comprarModules), 'Comprar comercial ainda usa MutationObserver global');

// Os módulos app-next/canecas continuam sendo validados no próprio código, sem serem exigidos na raiz.
const css = [
  read('app-next/styles/storefront-base.css'),
  read('app-next/styles/storefront-components.css'),
  read('app-next/styles/storefront-responsive.css')
].join('\n');
for (const marker of [
  '.product-grid{grid-template-columns:repeat(4',
  '.home-page .bundle-grid{display:flex',
  'calc(58.8235% - 7px)',
  '.product-card-media{position:relative;width:100%;height:auto;aspect-ratio:1/1',
  '.product-packaging{display:inline-flex',
  '.bundle-detail-hero>img{width:100%;max-width:360px',
  '.bundle-total{position:static',
  '[inert]'
]) assert(css.includes(marker), `CSS app-next incompleto: ${marker}`);
assert(!css.includes('.bundle-total{position:sticky'), 'Resumo da cesta app-next ainda está flutuante');
assert(!css.includes('repeat(5,minmax'), 'CSS app-next ainda força cinco colunas de cards');

const main = read('app-next/src/main.js');
for (const marker of ['internalAppNavigation', 'da:catalog-refreshed', 'applyCatalog', 'load-more-offers', "router.navigate('#/ofertas')", 'warmOfferImages']) {
  assert(main.includes(marker), `Main app-next incompleto: ${marker}`);
}

const checkout = read('app-next/src/checkout.js');
for (const marker of ['Pedir no WhatsApp', 'Buscar o cadastro é opcional', 'checkout-whatsapp-note', 'openWhatsApp(message)']) {
  assert(checkout.includes(marker), `Checkout app-next incompleto: ${marker}`);
}
assert(!checkout.includes('lookupReady ?'), 'Checkout app-next ainda oculta a finalização antes da consulta do CPF');

const catalog = read('app-next/src/catalog.js');
for (const marker of ['cachedCatalog', 'refreshInBackground', 'da:catalog-refreshed', 'thumbnail', 'preview_esquerda', 'preview_direita']) {
  assert(catalog.includes(marker), `Catálogo app-next incompleto: ${marker}`);
}

const mugRuntime = read('app-next/src/mug-public-runtime-v6.js');
const mugThumbs = read('app-next/src/mug-public-thumbnails-v2.js');
for (const marker of [
  'mug-public-personalization-v7.js',
  'mug-public-personalization-contract-v25.js',
  'mug-public-thumbnails-v2.js',
  'mug-public-ux-v1.js'
]) {
  assert(mugRuntime.includes(marker), `Runtime público de canecas incompleto: ${marker}`);
}
assert(!mugRuntime.includes('mug-public-3d-v2.js'), 'Runtime público de canecas voltou a carregar 3D legado');
assert(mugThumbs.includes('IntersectionObserver'), 'Miniaturas de caneca não usam carregamento lazy');
assert(!mugThumbs.includes('THREE_URL'), 'Grade pública não deve carregar Three.js');

const stabilizer = read('scripts/estabilizar-catalogo-publico.mjs');
for (const marker of ['contentHash', 'versão ${version.version} preservada', 'thumbnail', 'preview_esquerda', 'preview_direita']) {
  assert(stabilizer.includes(marker), `Estabilizador público incompleto: ${marker}`);
}
assert(!stabilizer.includes('catalog-${Date.now()}'), 'Estabilizador ainda invalida cache por horário');

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
for (const marker of ['<h1>Cestas básicas em Cuiabá e Várzea Grande</h1>', '"@type":"CollectionPage"', '"@type":"ItemList"', '"@type":"FAQPage"', 'index,follow,max-image-preview:large']) {
  assert(basketLanding.includes(marker), `Landing de cestas incompleta: ${marker}`);
}
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

console.log(`Site validado: ${baskets.length} cestas, raiz Comprar limpa e módulos auxiliares íntegros.`);
