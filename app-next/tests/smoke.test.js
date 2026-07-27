import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productionRoot = path.resolve(root, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const required = [
  'index.html', 'styles/app.css', 'styles/home-parity.css', 'styles/checkout-flow.css',
  'styles/bundle-confirmation.css', 'styles/live-polish.css',
  'src/config.js', 'src/core.js', 'src/catalog.js', 'src/commerce.js', 'src/offer-engine.js', 'src/integrations.js',
  'src/personalization.js', 'src/ui.js', 'src/checkout.js', 'src/main.js',
  'src/live-polish.js', 'src/image-performance.js', 'src/seo-combos.js', 'src/bundle-routes.js'
];
required.forEach(file => {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Arquivo ausente: ${file}`);
});
if (fs.existsSync(path.join(root, 'src/visual-parity.js'))) throw new Error('Módulo visual redundante ainda existe');
if (fs.existsSync(path.join(root, 'src/detail-review.js'))) throw new Error('detail-review.js ainda existe');
if (fs.existsSync(path.join(root, 'styles/detail-review.css'))) throw new Error('detail-review.css ainda existe');

const preview = read('index.html');
for (const marker of [
  'styles/home-parity.css?v=20260727-4',
  'styles/live-polish.css?v=20260727-4',
  'src/main.js?v=20260727-4',
  'src/image-performance.js?v=20260727-4',
  'requestIdleCallback',
  'noindex, nofollow'
]) if (!preview.includes(marker)) throw new Error(`Prévia incompleta: ${marker}`);
if (preview.includes('visual-parity.js')) throw new Error('Prévia ainda carrega visual-parity.js');

const production = fs.readFileSync(path.join(productionRoot, 'index.html'), 'utf8');
for (const marker of [
  '2026-07-27-cestas-imagens-cache-v1', 'content="index,follow,max-image-preview:large,max-snippet:-1"',
  'app-next/styles/home-parity.css?v=20260727-4',
  'app-next/styles/live-polish.css?v=20260727-4',
  'app-next/src/main.js?v=20260727-4',
  'app-next/src/image-performance.js?v=20260727-4',
  'app-next/src/seo-combos.js?v=20260727-4',
  'da_v9_cache_migrated_20260727', "params.get('p')", "params.get('categoria')",
  "params.get('secao')", 'window.__DA_PRODUCTION__ = true',
  'previewModular = false', 'preview_modular = false',
  'https://donaantonia.com.br/', '"@type":"OnlineStore"', 'Somente delivery'
]) if (!production.includes(marker)) throw new Error(`Produção incompleta: ${marker}`);
if (production.includes('noindex, nofollow')) throw new Error('Index da raiz bloqueia indexação');
if (production.includes('visual-parity.js')) throw new Error('Produção ainda carrega visual-parity.js');
if (production.includes('raw.githubusercontent.com')) throw new Error('Index abre conexão externa para imagens');
if (production.includes('https://www.donaantonia.com.br')) throw new Error('Index ainda usa domínio com www');
if (production.includes('"@type":"GroceryStore"')) throw new Error('Index ainda declara loja física');
if (production.includes('R. Trinta, 105')) throw new Error('Index ainda publica endereço como ponto de atendimento');

const config = read('src/config.js');
for (const marker of [
  'IS_PRODUCTION', "PREFIX: IS_PRODUCTION ? 'da_v2_' : 'da_next_'", '2026-07-27-cestas-imagens-cache-v1',
  "SITE_BASE_URL: 'https://donaantonia.com.br'"
]) {
  if (!config.includes(marker)) throw new Error(`Separação de ambientes incompleta: ${marker}`);
}
if (config.includes('https://www.donaantonia.com.br')) throw new Error('Configuração ainda usa www');

const core = read('src/core.js');
if (!core.includes('return `../${clean}`')) throw new Error('Imagens internas não usam a mesma origem');
if (core.includes('return `${CONFIG.GITHUB_RAW_BASE}/${clean}`')) throw new Error('Imagens ainda dependem do raw.githubusercontent.com');

const main = read('src/main.js');
for (const marker of [
  'bundle-confirm-checkout', 'bundle-confirm-continue', 'bundle-confirm-undo',
  'window.__DA_CATALOG_STATE__', "new CustomEvent('da:catalog-ready')", 'personalization-settings',
  "import { prepareProductOffer } from './offer-engine.js?v=20260727-4'", 'applyProductOffer(prepareProductOffer(product))'
]) if (!main.includes(marker)) throw new Error(`Inicialização incompleta: ${marker}`);
for (const removed of ['showConsentIfNeeded', 'personalization-consent', 'personalization-accept', 'personalization-decline']) {
  if (main.includes(removed)) throw new Error(`Código morto do consentimento: ${removed}`);
}

const offerEngine = read('src/offer-engine.js');
for (const marker of [
  'VALIDITY_DISCOUNT_BANDS', '{ min: 3, max: 7, discount: 50 }',
  '{ min: 92, max: 105, discount: 5 }', 'explicitOfferIsActive',
  "copy.offerSource = 'manual'", "copy.offerSource = 'validade'"
]) if (!offerEngine.includes(marker)) throw new Error(`Motor de ofertas incompleto: ${marker}`);

const ui = read('src/ui.js');
for (const marker of [
  'paymentNoticesHtml', 'offersBannerHtml', 'companySummaryHtml', 'publicFooterHtml',
  'home-company-info', 'public-site-footer', 'DESCONTOS DE ATÉ 50%',
  'politica-de-entrega.html', 'politica-de-troca.html', 'politica-de-privacidade.html',
  'CNPJ 51.385.335/0001-06', 'canonicalUrl', 'data-bundle-product'
]) if (!ui.includes(marker)) throw new Error(`Renderizador público incompleto: ${marker}`);
for (const removed of ['class="home-hero"', 'class="quick-links"', "section('Ofertas de hoje'", 'visualParityApplied']) {
  if (ui.includes(removed)) throw new Error(`Renderizador ainda cria conteúdo removido: ${removed}`);
}

const bundleRoutes = read('src/bundle-routes.js');
for (const marker of ['comboSeoPath', 'findBasketByReference', 'findKitByReference', 'cleanComboRouteFromLocation']) {
  if (!bundleRoutes.includes(marker)) throw new Error(`Rotas limpas incompletas: ${marker}`);
}

const seoCombos = read('src/seo-combos.js');
for (const marker of [
  "'/cestas/'", "'/kits/'", "'@type': 'Product'", "'@type': 'Offer'",
  "'@type': 'BreadcrumbList'", "params.get('cesta')", "params.get('kit')",
  'kitStockCapacity', 'resolveBundleRows', "seller: { '@id':"
]) if (!seoCombos.includes(marker)) throw new Error(`SEO de combos incompleto: ${marker}`);
if (seoCombos.includes('/?cesta=') || seoCombos.includes('/?kit=')) throw new Error('Canonical dinâmico ainda usa parâmetros');

if (ui.includes('#/cesta/') || ui.includes('#/kit/')) throw new Error('UI ainda gera links antigos de cesta ou kit');

const checkout = read('src/checkout.js');
for (const marker of ['Valor normal', 'Desconto do kit', 'Desconto por validade', 'Desconto de atacado', 'Total final', 'Tem cupom de desconto?', 'Identifique seu cadastro']) {
  if (!checkout.includes(marker)) throw new Error(`Checkout incompleto: ${marker}`);
}
if (checkout.includes('checkoutOffersHtml') || checkout.includes('Ofertas para completar')) throw new Error('Ofertas ocultas ainda existem no checkout');

const homeCss = read('styles/home-parity.css');
for (const marker of [
  'grid-template-columns:repeat(3', '.payment-notice', '.home-offers-banner',
  '.home-company-info', '.home-company-links', '.public-site-footer',
  'grid-template-columns:1fr', 'font-size:31px'
]) if (!homeCss.includes(marker)) throw new Error(`Visual institucional incompleto: ${marker}`);
for (const removed of ['home-deal-grid', 'home-deal-shortcut', 'home-deal-badge', 'purchase-journey']) {
  if (homeCss.includes(removed)) throw new Error(`CSS morto na home: ${removed}`);
}

const livePolish = read('src/live-polish.js');
if (livePolish.includes('#/cesta/') || livePolish.includes('#/kit/')) throw new Error('Carrossel ainda gera links antigos de cesta ou kit');
for (const marker of [
  'window.__DA_CATALOG_STATE__', 'da:catalog-ready', '.slice(0, 30)',
  'IntersectionObserver', 'appendCarouselBatch', 'cardsPerBatch',
  'fetchpriority="low"', "location.hash = '#/ofertas'", 'basket-inc', 'basket-dec', 'restoreBasketPosition'
]) if (!livePolish.includes(marker)) throw new Error(`Ajuste funcional ausente: ${marker}`);
if (livePolish.includes('observe(document.documentElement')) throw new Error('live-polish observa o documento inteiro');

const liveCss = read('styles/live-polish.css');
for (const marker of [
  '.home-page .home-bundle-carousel', 'flex:0 0 58.8%',
  '--product-card-gap:22px', '--product-card-body-height:158px',
  'grid-template-columns:repeat(2,minmax(0,1fr))!important',
  'grid-template-rows:auto var(--product-card-body-height)',
  'aspect-ratio:1/1!important', 'object-fit:contain!important', 'object-position:center!important',
  '.product-card::before', '.product-card::after',
  'grid-template-columns:repeat(3,minmax(0,1fr))!important',
  'grid-template-columns:repeat(4,minmax(0,1fr))!important',
  'grid-template-columns:repeat(5,minmax(0,1fr))!important',
  '[data-favorite-count][hidden]', '.header-cart-icon', 'data-performance-profile="economy"'
]) if (!liveCss.includes(marker)) throw new Error(`Ajuste visual ausente: ${marker}`);
for (const removed of [
  'quick-links.home-deal-grid', 'home-deal-copy', 'home-deal-badge', 'gap:1px!important',
  'box-shadow:0 3px 12px', '--product-card-row', 'grid-auto-rows:var(--product-card-row)',
  'height:154px!important'
]) if (liveCss.includes(removed)) throw new Error(`CSS antigo ainda presente: ${removed}`);

const imagePerformance = read('src/image-performance.js');
for (const marker of [
  'navigator.connection', 'navigator.deviceMemory', 'localRepositoryAsset',
  'raw\\.githubusercontent\\.com', 'managedLazyLoading', 'IntersectionObserver',
  "image.loading = 'eager'", "image.loading = 'lazy'", "image.fetchPriority = 'low'", 'imageSourceMode'
]) if (!imagePerformance.includes(marker)) throw new Error(`Controle de imagens incompleto: ${marker}`);
if (!imagePerformance.includes('const managedLazyLoading = lowEndDevice || !supportsNativeLazy')) throw new Error('Tablets econômicos confiam no lazy nativo');
if (!imagePerformance.includes('return path ? `/${path}` : raw')) throw new Error('URLs do repositório não são convertidas para mesma origem');

const jsFiles = fs.readdirSync(path.join(root, 'src')).filter(file => file.endsWith('.js'));
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, 'src', file)], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Falha de sintaxe em ${file}:\n${result.stderr}`);
}
await import('../src/ui.js');
await import('../src/checkout.js');
await import('../src/offer-engine.js');
console.log(`Smoke test concluído: ${required.length} arquivos e ${jsFiles.length} módulos validados.`);
