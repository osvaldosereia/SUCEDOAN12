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
  'app-next/index.html', 'app-next/styles/storefront-base.css',
  'app-next/styles/storefront-components.css', 'app-next/styles/storefront-responsive.css',
  'app-next/styles/checkout-flow.css', 'app-next/styles/bundle-confirmation.css',
  'app-next/src/checkout.js', 'app-next/src/ui.js', 'app-next/src/main.js',
  'app-next/src/home-carousels.js', 'app-next/src/image-performance.js',
  'app-next/src/bundle-routes.js',
  'app-next/src/config.js', 'app-next/src/catalog.js', 'app-next/src/core.js',
  'scripts/catalogos-combos-lib.js', 'scripts/gerar-merchant.js',
  'scripts/gerar-meta-combos.js', 'scripts/gerar-paginas-seo-combos.js',
  'scripts/gerar-sitemap.js', 'scripts/injetar-seo-combos.js',
  'scripts/normalizar-seo-delivery.js', 'scripts/estabilizar-catalogo-publico.mjs'
];
required.forEach(file => assert(exists(file), `Arquivo público ausente: ${file}`));

const production = read('index.html');
for (const marker of [
  '2026-07-27-product-cards-spacing-v11',
  '/app-next/styles/storefront-base.css',
  '/app-next/styles/storefront-components.css',
  '/app-next/styles/storefront-responsive.css',
  '/app-next/styles/checkout-flow.css',
  '/app-next/styles/bundle-confirmation.css',
  '/app-next/src/image-performance.js',
  '/app-next/src/home-carousels.js',
  '/app-next/src/main.js',
  'da_v16_product_cards_20260727',
  'href="/#/"', 'href="/#/categorias"', 'href="/#/ofertas"',
  'window.__DA_PRODUCTION__ = true', '"@type":"OnlineStore"',
  '"@type":"WebSite"', 'Cestas Básicas em Cuiabá e Várzea Grande',
  'id="menu-drawer"', 'aria-hidden="true"', 'inert'
]) assert(production.includes(marker), `Index público incompleto: ${marker}`);

for (const removed of [
  '/app-next/styles/visual-parity.css', '/app-next/styles/home-parity.css',
  '/app-next/styles/live-polish.css', '/app-next/src/live-polish.js',
  '/app-next/src/seo-combos.js', 'html.booting #app{opacity:0',
  'requestIdleCallback', 'raw.githubusercontent.com'
]) assert(!production.includes(removed), `Index ainda carrega camada conflitante: ${removed}`);

const css = [
  read('app-next/styles/storefront-base.css'),
  read('app-next/styles/storefront-components.css'),
  read('app-next/styles/storefront-responsive.css')
].join('\n');
assert(css.includes('.product-grid{grid-template-columns:repeat(4'), 'Cards de produtos não usam quatro colunas no desktop');
assert(css.includes('.home-page .bundle-grid{display:flex'), 'Cestas e kits da home não usam carrossel');
assert(css.includes('calc(58.8235% - 7px)'), 'Carrossel mobile não exibe aproximadamente 1,7 card');
assert(css.includes('.home-page .bundle-card{flex:0 0'), 'Cards de cestas e kits da home não são verticais e roláveis');
assert(css.includes('.product-card{position:relative;min-width:0;min-height:100%;overflow:hidden;display:flex;flex-direction:column'), 'Card de produto não usa estrutura vertical completa');
assert(css.includes('.product-card-media{position:relative;width:100%;height:auto;aspect-ratio:1/1'), 'Imagem dos cards não permanece quadrada');
assert(css.includes('.product-card-body{position:relative;min-width:0;min-height:168px'), 'Conteúdo dos cards não possui altura mínima');
assert(css.includes('.product-packaging{display:inline-flex'), 'Etiqueta de embalagem sem estilo consistente');
assert(css.includes('.product-packaging{position:absolute;z-index:3;left:11px;top:-40px'), 'Etiqueta mobile não fica sobre a imagem com respiro inferior');
assert(css.includes('.product-card-body{min-height:194px;padding:17px 15px 15px;gap:11px}'), 'Card desktop não reserva espaço para nome, embalagem, validade e preço');
assert(css.includes('.category-grid{width:100%;min-width:0'), 'Categorias ainda podem ultrapassar a largura mobile');
assert(css.includes('.bundle-detail-hero>img{width:100%;max-width:360px'), 'Foto da cesta não foi ampliada');
assert(css.includes('.bundle-total{position:static'), 'Resumo da cesta não está no final natural da lista');
assert(!css.includes('.bundle-total{position:sticky'), 'Resumo da cesta ainda está flutuante');
assert(!css.includes('repeat(5,minmax'), 'CSS ainda força cinco colunas de cards');
assert(css.includes('.bundle-fixed-qty'), 'Quantidade fixa dos kits sem estilo');
assert(css.includes('[inert]'), 'CSS não protege elementos inertes');

const bundleConfirmation = read('app-next/styles/bundle-confirmation.css');
assert(bundleConfirmation.includes('content:"VEJA AS OFERTAS DE HOJE"'), 'Botão de ofertas sem o novo texto');
assert(bundleConfirmation.includes('background:#f28c28!important'), 'Botão de ofertas sem cor de destaque');

const main = read('app-next/src/main.js');
for (const marker of [
  'internalAppNavigation', 'da:catalog-refreshed', 'applyCatalog', 'load-more-offers',
  'setAttribute(\'inert\'', "router.navigate('#/ofertas')", 'warmOfferImages',
  "createCheckout } from './checkout.js?v=", 'query.length < 3'
]) assert(main.includes(marker), `Main incompleto: ${marker}`);

const checkout = read('app-next/src/checkout.js');
for (const marker of ['Pedir no WhatsApp', 'Buscar o cadastro é opcional', 'checkout-whatsapp-note', 'openWhatsApp(message)']) {
  assert(checkout.includes(marker), `Checkout incompleto: ${marker}`);
}
assert(!checkout.includes('lookupReady ?'), 'Checkout ainda oculta a finalização antes da consulta do CPF');

const ui = read('app-next/src/ui.js');
for (const marker of ['HOME_BUNDLE_LIMIT = 100', 'OFFER_BATCH_SIZE = 16', 'loadMoreOffers', 'scrollPositions', 'productDisplayPricing', 'editable: true', 'editable: false', 'setDrawerHidden']) {
  assert(ui.includes(marker), `UI incompleta: ${marker}`);
}
const catalog = read('app-next/src/catalog.js');
for (const marker of ['cachedCatalog', 'refreshInBackground', 'da:catalog-refreshed']) {
  assert(catalog.includes(marker), `Catálogo incompleto: ${marker}`);
}
const imagePerformance = read('app-next/src/image-performance.js');
for (const marker of ['root: app', 'PRELOAD_MARGIN', "app?.addEventListener('scroll'", 'loadDeferredImage', 'height=%221%22']) {
  assert(imagePerformance.includes(marker), `Carregamento de imagens incompleto: ${marker}`);
}
const carousel = read('app-next/src/home-carousels.js');
for (const marker of ['scrollBy', 'ResizeObserver', 'da:route-rendered', 'bundle-carousel-control']) {
  assert(carousel.includes(marker), `Carrossel incompleto: ${marker}`);
}
assert(!carousel.includes('bundle-navigation.js'), 'Carrossel ainda carrega navegação paralela');

const stabilizer = read('scripts/estabilizar-catalogo-publico.mjs');
assert(stabilizer.includes('contentHash'), 'Estabilizador não usa versão por conteúdo');
assert(stabilizer.includes('versão ${version.version} preservada'), 'Estabilizador não preserva versão sem mudança');
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
for (const marker of [
  '<h1>Cestas básicas em Cuiabá e Várzea Grande</h1>',
  '"@type":"CollectionPage"', '"@type":"ItemList"', '"@type":"FAQPage"',
  'seo-combos-critical', 'index,follow,max-image-preview:large'
]) assert(basketLanding.includes(marker), `Landing de cestas incompleta: ${marker}`);

const basketPagePath = manifest.files.find(file => /^cestas\/[^/]+\/index\.html$/.test(file));
assert(basketPagePath, 'Nenhuma página individual de cesta gerada');
const basketPage = read(basketPagePath);
for (const marker of [
  '"@type":"Product"', '"@type":"Offer"', '"@type":"WebPage"',
  '"@type":"BreadcrumbList"', 'Produtos desta cesta básica',
  'Posso conferir e ajustar a composição?'
]) assert(basketPage.includes(marker), `Página individual de cesta incompleta: ${marker}`);

const kitLanding = read('kits/index.html');
assert(kitLanding.includes('noindex,follow'), 'Landing de kits deve permanecer funcional sem foco de indexação');
const kitPagePath = manifest.files.find(file => /^kits\/[^/]+\/index\.html$/.test(file));
if (kitPagePath) assert(read(kitPagePath).includes('noindex,follow'), 'Página individual de kit deve usar noindex');

const sitemap = read('sitemap.xml');
assert(sitemap.includes('https://donaantonia.com.br/cestas/'), 'Sitemap sem cestas');
assert(!sitemap.includes('https://donaantonia.com.br/kits/'), 'Sitemap ainda prioriza kits');
assert(!sitemap.includes('?cesta='), 'Sitemap usa parâmetros antigos');

const institutionalFiles = [
  'sobre-nos.html', 'contato.html', 'politica-de-entrega.html',
  'politica-de-troca.html', 'politica-de-privacidade.html', 'termos-de-uso.html'
];
for (const file of institutionalFiles) {
  const html = read(file);
  assert(html.includes('51.385.335/0001-06'), `${file} não possui o CNPJ real`);
  assert(!html.includes('https://www.donaantonia.com.br'), `${file} usa domínio com www`);
}

const { buildComboCatalog } = require('./catalogos-combos-lib.js');
const sampleProducts = {
  arroz: { codigo: 'ARROZ-1', nome: 'Arroz Teste 5kg', preco: 20, estoque: 10, situacao: 'A' },
  feijao: { codigo: 'FEIJAO-1', nome: 'Feijão Teste 1kg', preco: 10, estoque: 6, situacao: 'A' },
  sabao: { codigo: 'SABAO-1', nome: 'Sabão Teste', preco: 30, estoque: 3, situacao: 'A' }
};
const sampleCatalog = buildComboCatalog({
  productsRaw: sampleProducts,
  basketsRaw: [{ id: 'cesta-teste', codigo: 'cesta-economica-teste', nome: 'Econômica Teste', preco: 35, imagem: 'img/cesta-teste.webp', produtos: [{ codigo: 'ARROZ-1', qtd: 1 }, { codigo: 'FEIJAO-1', qtd: 1 }] }],
  kitsRaw: [{ id: 'kit-teste', codigo: 'kit-limpeza-teste', nome: 'Kit Limpeza Teste', preco: 25, ativo: true, estoque_disponivel: 2, produtos: [{ codigo: 'SABAO-1', qtd: 1 }] }],
  now: new Date('2026-07-26T12:00:00-04:00')
});
assert(sampleCatalog.active.length === 2, 'Catálogo de teste deveria manter cesta e kit funcionais');

console.log(`Site validado: ${baskets.length} cestas, cards de produtos completos e layout responsivo consistente.`);
