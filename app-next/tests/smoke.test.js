import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productionRoot = path.resolve(root, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (ok, message) => { if (!ok) throw new Error(message); };

const required = [
  'index.html', 'styles/storefront-base.css', 'styles/storefront-components.css',
  'styles/storefront-responsive.css', 'styles/checkout-flow.css', 'styles/bundle-confirmation.css',
  'src/main.js', 'src/ui.js', 'src/catalog.js', 'src/checkout.js',
  'src/core.js', 'src/image-performance.js', 'src/home-carousels.js',
  'src/bundle-routes.js'
];
required.forEach(file => assert(fs.existsSync(path.join(root, file)), `Arquivo ausente: ${file}`));

const preview = read('index.html');
assert(preview.includes('location.replace'), '/app-next não redireciona para a raiz');
assert(preview.includes('noindex,nofollow'), '/app-next precisa permanecer noindex');
assert(!preview.includes('src/main.js'), '/app-next ainda carrega uma segunda aplicação');

const production = fs.readFileSync(path.join(productionRoot, 'index.html'), 'utf8');
for (const marker of [
  'window.__DA_PRODUCTION__ = true',
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
  'id="menu-drawer"', 'inert'
]) assert(production.includes(marker), `Produção incompleta: ${marker}`);

for (const removed of [
  'styles/visual-parity.css', 'styles/home-parity.css', 'styles/live-polish.css',
  'src/live-polish.js', 'src/seo-combos.js', 'html.booting #app{opacity:0}'
]) assert(!production.includes(removed), `Camada antiga ainda carregada: ${removed}`);

const css = [
  read('styles/storefront-base.css'),
  read('styles/storefront-components.css'),
  read('styles/storefront-responsive.css')
].join('\n');
assert(css.includes('@media(min-width:1040px)'), 'Breakpoint desktop ausente');
assert(css.includes('.product-grid{grid-template-columns:repeat(4'), 'Grid de produtos não usa quatro colunas');
assert(css.includes('.home-page .bundle-grid{display:flex'), 'Cestas e kits da home não usam carrossel horizontal');
assert(css.includes('calc(58.8235% - 7px)'), 'Carrossel mobile não mostra aproximadamente 1,7 card');
assert(css.includes('.product-card{position:relative;min-width:0;min-height:100%;overflow:hidden;display:flex;flex-direction:column'), 'Card de produto não usa estrutura vertical flexível');
assert(css.includes('.product-card-media{position:relative;width:100%;height:auto;aspect-ratio:1/1'), 'Imagem do card não permanece quadrada');
assert(css.includes('.product-card-body{position:relative;min-width:0;min-height:168px'), 'Área de conteúdo do card não possui altura e respiro mínimos');
assert(css.includes('.product-packaging{display:inline-flex'), 'Etiqueta de embalagem não possui estilo consistente');
assert(css.includes('.product-packaging{position:absolute;z-index:3;left:11px;top:-40px'), 'Etiqueta mobile não está posicionada sobre a imagem');
assert(css.includes('.product-card-body{min-height:194px;padding:17px 15px 15px;gap:11px}'), 'Card desktop não possui espaço suficiente para todas as informações');
assert(css.includes('.category-grid{width:100%;min-width:0'), 'Grid de categorias ainda pode extrapolar a tela');
assert(css.includes('.bundle-detail-hero>img{width:100%;max-width:360px'), 'Foto da cesta não foi ampliada');
assert(css.includes('.bundle-total{position:static'), 'Resumo da cesta não está no fluxo normal da página');
assert(!css.includes('.bundle-total{position:sticky'), 'Resumo da cesta ainda está flutuante');
assert(!css.includes('repeat(5,minmax'), 'Layout ainda cria cinco colunas de cards');
assert(css.includes('[inert]'), 'Elementos inertes não possuem proteção visual');

const bundleConfirmation = read('styles/bundle-confirmation.css');
assert(bundleConfirmation.includes('content:"VEJA AS OFERTAS DE HOJE"'), 'Chamada de ofertas não recebeu o novo texto destacado');
assert(bundleConfirmation.includes('background:#f28c28!important'), 'Chamada de ofertas não recebeu cor própria');

const ui = read('src/ui.js');
for (const marker of [
  'HOME_BUNDLE_LIMIT = 100', 'OFFER_BATCH_SIZE = 16', 'loadMoreOffers', 'scrollPositions', 'productDisplayPricing', 'editable: true', 'editable: false',
  'bundle-fixed-qty', 'setDrawerHidden', 'setAttribute(\'inert\'',
  'Cestas básicas em Cuiabá e Várzea Grande'
]) assert(ui.includes(marker), `UI incompleta: ${marker}`);

const main = read('src/main.js');
for (const marker of [
  'internalAppNavigation', 'da:catalog-refreshed', 'applyCatalog', 'load-more-offers',
  'applyLinkCoupon', "route?.query?.get('cupom')",
  'overlay.setAttribute(\'inert\'', 'router.navigate(target)',
  "router.navigate('#/ofertas')", 'warmOfferImages',
  "createCheckout } from './checkout.js?v=", 'query.length < 3'
]) assert(main.includes(marker), `Entrada principal incompleta: ${marker}`);

const checkout = read('src/checkout.js');
for (const marker of [
  'Pedir no WhatsApp', 'Buscar o cadastro é opcional',
  'checkout-whatsapp-note', 'openWhatsApp(message)', 'validateCheckoutData'
]) assert(checkout.includes(marker), `Checkout incompleto: ${marker}`);
assert(!checkout.includes('lookupReady ?'), 'Checkout ainda esconde a finalização antes da consulta do CPF');
assert(
  checkout.indexOf('dispatchQueuedOrderToMake(makePayload.pedido.id') < checkout.indexOf('openWhatsApp(message);'),
  'Checkout principal precisa iniciar o webhook protegido antes de trocar para o WhatsApp'
);

const complementCheckout = fs.readFileSync(path.join(productionRoot, 'complemente', 'app-secure.js'), 'utf8');
assert(
  complementCheckout.indexOf('await persistQueuedOrder(payload.pedido.id);')
    < complementCheckout.indexOf('openWhatsApp(buildComplementWhatsAppMessage(payload), pendingWhatsApp);'),
  'Pedido complementar precisa confirmar o Firebase antes de trocar para o WhatsApp'
);

const imagePerformance = read('src/image-performance.js');
for (const marker of ['root: app', 'PRELOAD_MARGIN', 'HORIZONTAL_PRELOAD_MARGIN', "app?.addEventListener('scroll'", 'loadDeferredImage', 'height=%221%22']) {
  assert(imagePerformance.includes(marker), `Carregamento de imagens incompleto: ${marker}`);
}

const carousel = read('src/home-carousels.js');
for (const marker of ['scrollBy', 'ResizeObserver', 'da:route-rendered', 'bundle-carousel-control']) {
  assert(carousel.includes(marker), `Carrossel incompleto: ${marker}`);
}
assert(!carousel.includes('bundle-navigation.js'), 'Carrossel ainda importa navegação paralela');

const catalog = read('src/catalog.js');
for (const marker of ['cachedCatalog', 'refreshInBackground', 'da:catalog-refreshed']) {
  assert(catalog.includes(marker), `Carregamento de catálogo incompleto: ${marker}`);
}

const jsFiles = fs.readdirSync(path.join(root, 'src')).filter(file => file.endsWith('.js'));
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, 'src', file)], { encoding: 'utf8' });
  assert(result.status === 0, `Falha de sintaxe em ${file}:\n${result.stderr}`);
}

await import('../src/ui.js');
await import('../src/checkout.js');
await import('../src/offer-engine.js');
console.log(`Smoke test concluído: cards verticais completos, resumo da cesta no fluxo e ${jsFiles.length} módulos válidos.`);
