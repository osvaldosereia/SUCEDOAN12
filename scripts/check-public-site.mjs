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
  'app-next/index.html', 'app-next/styles/app.css', 'app-next/styles/visual-parity.css',
  'app-next/styles/home-parity.css', 'app-next/styles/live-polish.css',
  'app-next/src/ui.js', 'app-next/src/main.js', 'app-next/src/live-polish.js',
  'app-next/src/image-performance.js', 'app-next/src/seo-combos.js',
  'app-next/src/bundle-routes.js', 'app-next/src/config.js',
  'scripts/catalogos-combos-lib.js', 'scripts/gerar-merchant.js',
  'scripts/gerar-meta-combos.js', 'scripts/gerar-paginas-seo-combos.js',
  'scripts/gerar-sitemap.js', 'scripts/injetar-seo-combos.js',
  'scripts/normalizar-seo-delivery.js', 'producao-v2/js/services/collections.js'
];
required.forEach(file => assert(exists(file), `Arquivo público ausente: ${file}`));

const production = read('index.html');
for (const marker of [
  '2026-07-27-site-estavel-v1',
  '/app-next/styles/live-polish.css?v=20260727-5',
  '/app-next/src/live-polish.js?v=20260727-5',
  '/app-next/src/main.js?v=20260727-4',
  'da_v10_site_estavel_20260727',
  'href="/#/"', 'href="/#/categorias"', 'href="/#/ofertas"',
  'window.__DA_PRODUCTION__ = true', '"@type":"OnlineStore"'
]) assert(production.includes(marker), `Index público incompleto: ${marker}`);
assert(!production.includes('requestIdleCallback'), 'Index ainda atrasa o carregamento do acabamento');
assert(!production.includes('loadPolish'), 'Index ainda carrega reescrita dinâmica de layout');
assert(!production.includes('noindex, nofollow'), 'Index de produção bloqueia indexação');
assert(!production.includes('https://www.donaantonia.com.br'), 'Index usa domínio duplicado com www');
assert(!production.includes('raw.githubusercontent.com'), 'Index depende de imagens externas do GitHub');

const preview = read('app-next/index.html');
assert(preview.includes('location.replace'), 'A rota /app-next/ não redireciona para a entrada principal');
assert(preview.includes('noindex,nofollow'), 'A rota /app-next/ precisa permanecer noindex');
assert(!preview.includes('src/main.js'), 'A rota /app-next/ ainda mantém uma segunda aplicação pública');
assert(!preview.includes('styles/app.css'), 'A rota /app-next/ ainda mantém um segundo layout');

const livePolish = read('app-next/src/live-polish.js');
for (const marker of [
  'prepareLinks', 'prepareImages', 'closeTransientLayers',
  'da:route-rendered', 'da:catalog-ready', 'FALLBACK_IMAGE'
]) assert(livePolish.includes(marker), `Rotina estável incompleta: ${marker}`);
for (const removed of [
  'MutationObserver', 'IntersectionObserver', 'appendCarouselBatch',
  'initializeCarousel', 'restoreBasketPosition', 'cardsPerBatch',
  'window.__DA_CATALOG_STATE__', '.slice(0, 30)'
]) assert(!livePolish.includes(removed), `Reescrita dinâmica ainda presente: ${removed}`);

const liveCss = read('app-next/styles/live-polish.css');
for (const marker of [
  '.bottom-bar{pointer-events:auto}', '.bundle-detail-hero>img',
  'object-fit:contain!important', '.drawer-overlay:not(.show)',
  'grid-template-columns:1fr!important'
]) assert(liveCss.includes(marker), `CSS estável incompleto: ${marker}`);
for (const removed of [
  '.home-page .home-bundle-carousel', '--product-card-gap',
  '--product-card-body-height', '.product-card::before',
  '.product-card::after', 'grid-template-columns:repeat(5'
]) assert(!liveCss.includes(removed), `CSS de troca de layout ainda presente: ${removed}`);

const baskets = JSON.parse(read('site/produtos-cesta-basica.json'));
assert(Array.isArray(baskets) && baskets.length > 0, 'Catálogo de cestas vazio');
for (const basket of baskets) {
  const image = String(basket.imagem || '').replace(/^\/+/, '');
  assert(image, `Cesta sem imagem: ${basket.nome || basket.id}`);
  assert(exists(image), `Imagem da cesta não existe: ${image}`);
}

const basketLanding = read('cestas/index.html');
const kitLanding = read('kits/index.html');
for (const [name, html] of [['cestas', basketLanding], ['kits', kitLanding]]) {
  assert(html.includes('<h1>'), `Landing de ${name} sem H1`);
  assert(html.includes('seo-combos-critical'), `Landing de ${name} sem fallback SEO`);
  assert(html.includes('/app-next/styles/live-polish.css?v=20260727-5'), `Landing de ${name} usa CSS antigo`);
  assert(html.includes('/app-next/src/live-polish.js?v=20260727-5'), `Landing de ${name} usa JavaScript antigo`);
  assert(html.includes('href="/#/"'), `Landing de ${name} não usa navegação pela raiz`);
}

const manifest = JSON.parse(read('site/seo-combos-manifest.json'));
assert(manifest.shell === 'index.html', 'Páginas de cestas e kits não usam o shell principal');
assert(Array.isArray(manifest.files) && manifest.files.length >= 4, 'Manifesto SEO incompleto');
for (const relative of manifest.files) {
  assert(exists(relative), `Página gerada ausente: ${relative}`);
}
const sampleProductPage = manifest.files.find(file => /^(cestas|kits)\/[^/]+\/index\.html$/.test(file));
assert(sampleProductPage, 'Nenhuma página individual de cesta ou kit gerada');
const sampleProductHtml = read(sampleProductPage);
for (const marker of [
  '"@type":"Product"', '"@type":"Offer"', '"@type":"BreadcrumbList"',
  'seo-combos-critical', '/app-next/styles/live-polish.css?v=20260727-5',
  '/app-next/src/live-polish.js?v=20260727-5', 'href="/#/"'
]) assert(sampleProductHtml.includes(marker), `Página individual incompleta: ${marker}`);

const institutionalFiles = [
  'sobre-nos.html', 'contato.html', 'politica-de-entrega.html',
  'politica-de-troca.html', 'politica-de-privacidade.html', 'termos-de-uso.html'
];
for (const file of institutionalFiles) {
  const html = read(file);
  assert(html.includes('51.385.335/0001-06'), `${file} não possui o CNPJ real`);
  assert(!html.includes('00.000.000/0000-00'), `${file} possui CNPJ fictício`);
  assert(!html.includes('https://www.donaantonia.com.br'), `${file} usa domínio com www`);
}
assert(/somente delivery|exclusivamente por delivery/i.test(read('sobre-nos.html')), 'Sobre nós não informa operação por delivery');
assert(/somente delivery|exclusivamente por delivery/i.test(read('contato.html')), 'Contato não informa operação por delivery');

const { buildComboCatalog } = require('./catalogos-combos-lib.js');
const sampleProducts = {
  arroz: { codigo: 'ARROZ-1', nome: 'Arroz Teste 5kg', preco: 20, estoque: 10, situacao: 'A' },
  feijao: { codigo: 'FEIJAO-1', nome: 'Feijão Teste 1kg', preco: 10, estoque: 6, situacao: 'A' },
  sabao: { codigo: 'SABAO-1', nome: 'Sabão Teste', preco: 30, estoque: 3, situacao: 'A' }
};
const sampleBaskets = [{
  id: 'cesta-teste', codigo: 'cesta-economica-teste', nome: 'Econômica Teste', preco: 35,
  imagem: 'img/cesta-teste.webp', produtos: [{ codigo: 'ARROZ-1', qtd: 1 }, { codigo: 'FEIJAO-1', qtd: 1 }]
}];
const sampleKits = [{
  id: 'kit-teste', codigo: 'kit-limpeza-teste', nome: 'Kit Limpeza Teste', preco: 25, preco_anterior: 30,
  imagem: 'site/img/kits/kit-teste.webp', ativo: true, estoque_disponivel: 2,
  data_inicio: '2026-07-01', data_fim: '2026-12-31', produtos: [{ codigo: 'SABAO-1', qtd: 1 }]
}];
const catalog = buildComboCatalog({
  productsRaw: sampleProducts,
  basketsRaw: sampleBaskets,
  kitsRaw: sampleKits,
  now: new Date('2026-07-26T12:00:00-04:00')
});
assert(catalog.active.length === 2, 'Catálogo de teste deveria ter cesta e kit ativos');

const merchantXml = require('./gerar-merchant.js').buildFeed(catalog);
for (const marker of [
  '<g:id>cesta-cesta-economica-teste</g:id>',
  '<g:id>kit-kit-limpeza-teste</g:id>',
  '<g:shipping_label>delivery-local-minimo-75</g:shipping_label>'
]) assert(merchantXml.includes(marker), `Merchant incompleto: ${marker}`);

const metaCsv = require('./gerar-meta-combos.js').buildCsv(catalog);
assert(metaCsv.includes('cesta-cesta-economica-teste'), 'Feed Meta sem cesta de teste');
assert(metaCsv.includes('kit-kit-limpeza-teste'), 'Feed Meta sem kit de teste');

const sitemapXml = require('./gerar-sitemap.js').buildSitemap(catalog, '2026-07-26');
assert(sitemapXml.includes('https://donaantonia.com.br/cestas/'), 'Sitemap sem cestas');
assert(sitemapXml.includes('https://donaantonia.com.br/kits/'), 'Sitemap sem kits');
assert(!sitemapXml.includes('?cesta='), 'Sitemap ainda usa parâmetros de cesta');

const robots = read('robots.txt');
assert(robots.includes('Sitemap: https://donaantonia.com.br/sitemap.xml'), 'robots.txt sem sitemap');
assert(robots.includes('Disallow: /producao/'), 'robots.txt não protege produção');

console.log(`Site público estável validado: ${required.length} arquivos, ${baskets.length} cestas e ${manifest.files.length} páginas geradas.`);
