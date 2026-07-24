import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productionRoot = path.resolve(root, '..');
const required = [
  'index.html', 'styles/app.css', 'styles/home-parity.css', 'styles/checkout-flow.css', 'styles/bundle-confirmation.css', 'styles/live-polish.css',
  'src/config.js', 'src/core.js', 'src/catalog.js', 'src/commerce.js', 'src/integrations.js',
  'src/personalization.js', 'src/ui.js', 'src/checkout.js', 'src/main.js', 'src/visual-parity.js', 'src/live-polish.js', 'src/image-performance.js'
];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Arquivo ausente: ${file}`);
}

const previewIndex = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const fragment of [
  'src/main.js?v=20260724-3',
  'styles/bundle-confirmation.css?v=20260724-3',
  'styles/checkout-flow.css?v=20260724-3',
  'styles/live-polish.css?v=20260724-3',
  'src/live-polish.js?v=20260724-3',
  'src/image-performance.js?v=20260724-3',
  'requestIdleCallback',
  'noindex, nofollow'
]) {
  if (!previewIndex.includes(fragment)) throw new Error(`Prévia incompleta: ${fragment}`);
}

const productionIndex = fs.readFileSync(path.join(productionRoot, 'index.html'), 'utf8');
for (const fragment of [
  '2026-07-24-modular-production-v3',
  'content="index, follow"',
  'app-next/styles/app.css?v=20260724-3',
  'app-next/styles/live-polish.css?v=20260724-3',
  'app-next/src/main.js?v=20260724-3',
  'app-next/src/live-polish.js?v=20260724-3',
  'app-next/src/image-performance.js?v=20260724-3',
  'requestIdleCallback',
  'window.__DA_PRODUCTION__ = true',
  'previewModular = false',
  'preview_modular = false'
]) {
  if (!productionIndex.includes(fragment)) throw new Error(`Ativação de produção incompleta: ${fragment}`);
}
if (productionIndex.includes('noindex, nofollow')) throw new Error('index da raiz não pode bloquear indexação');
if (productionIndex.includes('raw.githubusercontent.com')) throw new Error('index não deve abrir conexão externa apenas para imagens');

const config = fs.readFileSync(path.join(root, 'src/config.js'), 'utf8');
for (const fragment of ['IS_PRODUCTION', "PREFIX: IS_PRODUCTION ? 'da_v2_' : 'da_next_'", 'modular-production-v3']) {
  if (!config.includes(fragment)) throw new Error(`Separação de ambientes incompleta: ${fragment}`);
}

const core = fs.readFileSync(path.join(root, 'src/core.js'), 'utf8');
if (!core.includes('return `../${clean}`')) throw new Error('Imagens internas não estão usando a mesma origem do site');
if (core.includes('return `${CONFIG.GITHUB_RAW_BASE}/${clean}`')) throw new Error('Imagens internas ainda dependem do raw.githubusercontent.com');

const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
for (const action of ['bundle-confirm-checkout', 'bundle-confirm-continue', 'bundle-confirm-undo']) {
  if (!main.includes(action)) throw new Error(`Ação ausente na confirmação: ${action}`);
}

const checkout = fs.readFileSync(path.join(root, 'src/checkout.js'), 'utf8');
for (const fragment of ['Valor normal', 'Desconto do kit', 'Desconto por validade', 'Desconto de atacado', 'Total final', 'Tem cupom de desconto?', 'Identifique seu cadastro']) {
  if (!checkout.includes(fragment)) throw new Error(`Resumo ou etapa ausente no checkout: ${fragment}`);
}
if (checkout.includes('checkoutOffersHtml') || checkout.includes('Ofertas para completar')) throw new Error('Ofertas para completar ainda fazem parte do checkout');

const detailReview = fs.readFileSync(path.join(root, 'src/detail-review.js'), 'utf8');
if (detailReview.includes('fillCheckoutOffers') || detailReview.includes('Ofertas para completar')) throw new Error('Carga oculta de ofertas ainda existe no checkout');
if (detailReview.includes('observe(document.documentElement')) throw new Error('detail-review ainda observa o documento inteiro');

const visualParity = fs.readFileSync(path.join(root, 'src/visual-parity.js'), 'utf8');
for (const fragment of ['50% OFF', '40% OFF', 'Todas as ofertas', 'ATÉ R$ 5', '<svg class="home-deal-icon"']) {
  if (!visualParity.includes(fragment)) throw new Error(`Atalho promocional incompleto: ${fragment}`);
}
if (visualParity.includes('loadCatalog') || visualParity.includes('home-deal-product-img') || visualParity.includes('Math.random()')) {
  throw new Error('Atalhos iniciais ainda dependem do catálogo ou de fotos de produtos');
}
if (visualParity.includes('Faça sua compra do mês') || visualParity.includes('journeyHtml(')) throw new Error('A seção Faça sua compra do mês ainda está sendo criada');

const homeCss = fs.readFileSync(path.join(root, 'styles/home-parity.css'), 'utf8');
if (!homeCss.includes('grid-template-columns:repeat(4')) throw new Error('Desktop precisa exibir quatro atalhos promocionais');
if (!homeCss.includes('grid-template-columns:repeat(2')) throw new Error('Mobile precisa exibir dois atalhos promocionais por linha');
if (!homeCss.includes('.home-deal-shortcut')) throw new Error('Atalhos sem cards não foram estilizados');

const livePolish = fs.readFileSync(path.join(root, 'src/live-polish.js'), 'utf8');
for (const fragment of [
  '.slice(0, 30)',
  'IntersectionObserver',
  'appendCarouselBatch',
  'cardsPerBatch',
  'fetchpriority="low"',
  "location.hash = '#/ofertas'",
  'basket-inc',
  'basket-dec',
  'restoreBasketPosition'
]) {
  if (!livePolish.includes(fragment)) throw new Error(`Ajuste funcional ausente: ${fragment}`);
}
if (livePolish.includes('observe(document.documentElement')) throw new Error('live-polish ainda observa o documento inteiro');

const liveCss = fs.readFileSync(path.join(root, 'styles/live-polish.css'), 'utf8');
for (const fragment of [
  '.quick-links.home-deal-grid>a:first-child',
  'grid-column:auto!important',
  '.home-page .home-bundle-carousel',
  'flex:0 0 58.8%',
  '[data-favorite-count][hidden]',
  '.header-cart-icon',
  'background:#fff!important',
  'data-performance-profile="economy"'
]) {
  if (!liveCss.includes(fragment)) throw new Error(`Ajuste visual ausente: ${fragment}`);
}

const imagePerformance = fs.readFileSync(path.join(root, 'src/image-performance.js'), 'utf8');
for (const fragment of ['navigator.connection', 'navigator.deviceMemory', 'IntersectionObserver', 'loading = \'lazy\'', 'fetchPriority = \'low\'', 'performanceProfile']) {
  if (!imagePerformance.includes(fragment)) throw new Error(`Controle de imagens incompleto: ${fragment}`);
}

const jsFiles = fs.readdirSync(path.join(root, 'src')).filter(file => file.endsWith('.js'));
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, 'src', file)], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Falha de sintaxe em ${file}:\n${result.stderr}`);
}
await import('../src/ui.js');
await import('../src/checkout.js');
console.log(`Smoke test concluído: produção, prévia, ${required.length} arquivos e ${jsFiles.length} módulos validados.`);