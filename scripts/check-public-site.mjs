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
  'app-next/index.html', 'app-next/styles/home-parity.css', 'app-next/styles/live-polish.css',
  'app-next/src/ui.js', 'app-next/src/main.js', 'app-next/src/offer-engine.js', 'app-next/src/live-polish.js',
  'app-next/src/seo-combos.js', 'app-next/src/delivery-only.js', 'app-next/src/config.js',
  'site-public/assets/institutional.css', 'site-public/assets/seo-combos.css', 'site-public/README.md',
  'scripts/catalogos-combos-lib.js', 'scripts/gerar-merchant.js', 'scripts/gerar-meta-combos.js',
  'scripts/gerar-paginas-seo-combos.js', 'scripts/gerar-sitemap.js', 'scripts/injetar-seo-combos.js',
  'scripts/normalizar-seo-delivery.js', 'producao-v2/js/services/collections.js'
];
required.forEach(file => assert(exists(file), `Arquivo público ausente: ${file}`));

const production = read('index.html');
for (const marker of [
  '2026-07-26-combos-seo-delivery-v2',
  'app-next/styles/home-parity.css?v=20260724-7',
  'app-next/styles/live-polish.css?v=20260724-8',
  'app-next/src/main.js?v=20260724-8',
  'app-next/src/seo-combos.js?v=20260726-2',
  'app-next/src/delivery-only.js?v=20260726-1',
  'da_v8_cache_migrated_20260724',
  "params.get('cesta')", "params.get('kit')", "params.get('p')",
  "params.get('categoria')", "params.get('secao')",
  'Cestas Básicas e Kits com Delivery em Cuiabá e Várzea Grande',
  'window.__DA_PRODUCTION__ = true',
  '"@type":"OnlineStore"'
]) assert(production.includes(marker), `Index público incompleto: ${marker}`);
assert(!production.includes('noindex, nofollow'), 'Index de produção bloqueia indexação');
assert(!production.includes('visual-parity.js'), 'Index ainda carrega o módulo visual redundante');
assert(!production.includes('"@type":"GroceryStore"'), 'Index trata delivery como loja física');
assert(!production.includes('https://www.donaantonia.com.br'), 'Index usa domínio duplicado com www');
assert(!production.includes('R. Trinta, 105'), 'Index publica endereço como loja física');

const preview = read('app-next/index.html');
assert(preview.includes('noindex, nofollow'), 'Prévia modular precisa permanecer noindex');
assert(preview.includes('styles/live-polish.css?v=20260724-8'), 'Prévia sem CSS v8');
assert(preview.includes('src/main.js?v=20260724-8'), 'Prévia sem main v8');
assert(!preview.includes('visual-parity.js'), 'Prévia ainda carrega o módulo visual redundante');

const institutionalFiles = [
  'sobre-nos.html', 'contato.html', 'politica-de-entrega.html',
  'politica-de-troca.html', 'politica-de-privacidade.html', 'termos-de-uso.html'
];
for (const file of institutionalFiles) {
  const html = read(file);
  assert(html.includes('site-public/assets/institutional.css?v=20260724-1'), `${file} ainda duplica o estilo institucional`);
  assert(html.includes('51.385.335/0001-06'), `${file} não possui o CNPJ real`);
  assert(html.includes('contato.html'), `${file} não aponta para o contato público`);
  assert(!html.includes('00.000.000/0000-00'), `${file} possui CNPJ fictício`);
  assert(!/substitua os dados fictícios/i.test(html), `${file} possui aviso interno publicado`);
  assert(!html.includes('https://www.donaantonia.com.br'), `${file} usa domínio com www`);
}
assert(!read('sobre-nos.html').includes('R. Trinta, 105'), 'Sobre nós publica endereço como ponto de atendimento');
assert(!read('contato.html').includes('R. Trinta, 105'), 'Contato publica endereço como ponto de atendimento');
assert(/somente delivery|exclusivamente por delivery/i.test(read('sobre-nos.html')), 'Sobre nós não esclarece operação somente delivery');
assert(/somente delivery|exclusivamente por delivery/i.test(read('contato.html')), 'Contato não esclarece operação somente delivery');

const delivery = read('politica-de-entrega.html');
assert(delivery.includes('R$ 75,00') && /entrega é grátis/i.test(delivery), 'Política de entrega não informa mínimo e gratuidade');
const returns = read('politica-de-troca.html');
for (const marker of ['Como solicitar', '7 dias corridos', 'Formas de solução', 'reembolso']) {
  assert(returns.includes(marker), `Política de troca incompleta: ${marker}`);
}
const privacy = read('politica-de-privacidade.html');
assert(privacy.includes('Seus direitos') && privacy.includes('Não vendemos dados pessoais'), 'Política de privacidade incompleta');

const ui = read('app-next/src/ui.js');
for (const marker of [
  'paymentNoticesHtml', 'offersBannerHtml', 'companySummaryHtml', 'publicFooterHtml',
  'home-company-info', 'public-site-footer', 'politica-de-troca.html',
  'CNPJ 51.385.335/0001-06', 'canonicalUrl', 'data-bundle-product'
]) assert(ui.includes(marker), `Renderizador público incompleto: ${marker}`);
for (const removed of ['class="home-hero"', 'class="quick-links"', "section('Ofertas de hoje'", 'visualParityApplied']) {
  assert(!ui.includes(removed), `Renderizador ainda cria estrutura removida: ${removed}`);
}

const main = read('app-next/src/main.js');
for (const marker of [
  'window.__DA_CATALOG_STATE__', "new CustomEvent('da:catalog-ready')", 'personalization-settings',
  "import { prepareProductOffer } from './offer-engine.js'", 'applyProductOffer(prepareProductOffer(product))'
]) assert(main.includes(marker), `Inicialização limpa incompleta: ${marker}`);
for (const removed of ['showConsentIfNeeded', 'personalization-consent', 'personalization-accept', 'personalization-decline']) {
  assert(!main.includes(removed), `Código morto do alerta de personalização ainda presente: ${removed}`);
}

const offerEngine = read('app-next/src/offer-engine.js');
for (const marker of [
  'VALIDITY_DISCOUNT_BANDS', '{ min: 3, max: 7, discount: 50 }',
  '{ min: 92, max: 105, discount: 5 }', 'explicitOfferIsActive',
  "copy.offerSource = 'manual'", "copy.offerSource = 'validade'"
]) assert(offerEngine.includes(marker), `Motor de ofertas incompleto: ${marker}`);

const livePolish = read('app-next/src/live-polish.js');
for (const marker of ['window.__DA_CATALOG_STATE__', 'da:catalog-ready', '.slice(0, 30)', 'appendCarouselBatch', 'restoreBasketPosition']) {
  assert(livePolish.includes(marker), `Otimização progressiva incompleta: ${marker}`);
}
assert(!exists('app-next/src/visual-parity.js'), 'Módulo visual redundante ainda existe');
assert(!livePolish.includes('observe(document.documentElement'), 'live-polish observa o documento inteiro');

const seoCombos = read('app-next/src/seo-combos.js');
for (const marker of [
  "'@type': 'Product'", "'@type': 'Offer'", 'Cestas Básicas com Delivery em Cuiabá e Várzea Grande',
  "params.get('cesta')", "params.get('kit')", 'combo-product-jsonld',
  "return `/${type === 'kit' ? 'kits' : 'cestas'}/"
]) assert(seoCombos.includes(marker), `SEO de cestas e kits incompleto: ${marker}`);
assert(!seoCombos.includes('/?cesta='), 'SEO dinâmico ainda usa canonical por parâmetro');

const deliveryOnly = read('app-next/src/delivery-only.js');
for (const marker of ['Somente delivery, sem loja física', 'delivery em Cuiabá e Várzea Grande', 'MutationObserver']) {
  assert(deliveryOnly.includes(marker), `Ajuste delivery incompleto: ${marker}`);
}

const config = read('app-next/src/config.js');
assert(config.includes("SITE_BASE_URL: 'https://donaantonia.com.br'"), 'Configuração usa domínio incorreto');
assert(!config.includes('https://www.donaantonia.com.br'), 'Configuração ainda usa www');

const liveCss = read('app-next/styles/live-polish.css');
for (const marker of [
  '--product-card-gap:22px', '--product-card-body-height:158px',
  'grid-template-columns:repeat(2,minmax(0,1fr))!important',
  'grid-template-rows:auto var(--product-card-body-height)',
  'aspect-ratio:1/1!important', 'object-fit:contain!important', 'object-position:center!important',
  '.product-card::before', '.product-card::after',
  'grid-template-columns:repeat(3,minmax(0,1fr))!important',
  'grid-template-columns:repeat(4,minmax(0,1fr))!important',
  'grid-template-columns:repeat(5,minmax(0,1fr))!important'
]) assert(liveCss.includes(marker), `Padronização dos cards incompleta: ${marker}`);
for (const removed of ['--product-card-row', 'grid-auto-rows:var(--product-card-row)', 'height:154px!important', 'box-shadow:0 3px 12px']) {
  assert(!liveCss.includes(removed), `CSS antigo ainda presente: ${removed}`);
}

const basketLanding = read('cestas/index.html');
const kitLanding = read('kits/index.html');
for (const [name, html] of [['cestas', basketLanding], ['kits', kitLanding]]) {
  assert(html.includes('<h1>'), `Landing de ${name} sem H1 visível`);
  assert(html.includes('"@type":"ItemList"'), `Landing de ${name} sem ItemList`);
  assert(html.includes('"@type":"FAQPage"'), `Landing de ${name} sem FAQPage`);
  assert(/Somente delivery/i.test(html), `Landing de ${name} não informa delivery`);
  assert(!html.includes('https://www.donaantonia.com.br'), `Landing de ${name} usa www`);
}

const manifest = JSON.parse(read('site/seo-combos-manifest.json'));
assert(Array.isArray(manifest.files) && manifest.files.length >= 4, 'Manifesto SEO não lista páginas geradas');
const sampleProductPage = manifest.files.find(file => /^(cestas|kits)\/[^/]+\/index\.html$/.test(file));
assert(sampleProductPage && exists(sampleProductPage), 'Nenhuma página individual de cesta ou kit foi gerada');
const sampleProductHtml = read(sampleProductPage);
for (const marker of ['"@type":"Product"', '"@type":"Offer"', '"@type":"BreadcrumbList"', '<h1>', 'Somente delivery']) {
  assert(sampleProductHtml.includes(marker), `Página individual incompleta: ${marker}`);
}

const legacyFiles = [
  '.github/workflows/test-fast-home-v7.yml', '.github/workflows/remove-home-brands.yml',
  '.github/workflows/patch-home-month-cards.yml', '.github/workflows/pagespeed-test-pr.yml',
  '.github/workflows/build-pagespeed-test.yml', 'scripts/build-fast-home-test.mjs',
  'scripts/promote-fast-home-v8.mjs', 'scripts/remove-home-brands.mjs',
  'scripts/patch-home-month-cards.mjs', 'scripts/build-pagespeed-test.mjs',
  'scripts/patch-pagespeed-mobile-buttons.mjs', 'scripts/patch-pagespeed-navigation-final.mjs',
  'scripts/audit-index-dead-code.mjs', 'index-pagespeed-test.html', 'pagespeed-code-audit.md',
  'app-next/src/visual-parity.js'
];
legacyFiles.forEach(file => assert(!exists(file), `Arquivo legado ainda presente: ${file}`));

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
  now: new Date('2026-07-26T12:00:00-04:00'),
});
assert(catalog.active.length === 2, 'Catálogo de teste deveria ter cesta e kit ativos');
assert(catalog.baskets[0].link === 'https://donaantonia.com.br/cestas/economica-teste-cesta-economica-teste/', 'URL limpa da cesta incorreta');
assert(catalog.kits[0].link === 'https://donaantonia.com.br/kits/kit-limpeza-teste-kit-limpeza-teste/', 'URL limpa do kit incorreta');

const merchant = require('./gerar-merchant.js');
const merchantXml = merchant.buildFeed(catalog);
for (const marker of [
  '<g:id>cesta-cesta-economica-teste</g:id>', '<g:id>kit-kit-limpeza-teste</g:id>',
  '<g:sale_price>25.00 BRL</g:sale_price>',
  'https://donaantonia.com.br/cestas/economica-teste-cesta-economica-teste/',
  'https://donaantonia.com.br/kits/kit-limpeza-teste-kit-limpeza-teste/',
  '<g:canonical_link>', '<g:identifier_exists>yes</g:identifier_exists>',
  '<g:shipping_label>delivery-local-minimo-75</g:shipping_label>',
  '<g:product_type>Cestas básicas</g:product_type>', '<g:product_type>Kits promocionais</g:product_type>'
]) assert(merchantXml.includes(marker), `Feed Merchant de combos incompleto: ${marker}`);
assert(!merchantXml.includes('?p='), 'Merchant ainda anuncia produto avulso');
assert(!merchantXml.includes('?cesta='), 'Merchant ainda usa link de cesta por parâmetro');

const meta = require('./gerar-meta-combos.js');
const metaCsv = meta.buildCsv(catalog);
for (const marker of [
  'availability,condition', 'cesta-cesta-economica-teste', 'kit-kit-limpeza-teste',
  'Cesta básica', 'Kit promocional', 'Somente delivery',
  'https://donaantonia.com.br/cestas/economica-teste-cesta-economica-teste/'
]) assert(metaCsv.includes(marker), `Feed Meta de combos incompleto: ${marker}`);

const sitemap = require('./gerar-sitemap.js');
const sitemapXml = sitemap.buildSitemap(catalog, '2026-07-26');
for (const marker of [
  'https://donaantonia.com.br/sobre-nos.html',
  'https://donaantonia.com.br/contato.html',
  'https://donaantonia.com.br/cestas/',
  'https://donaantonia.com.br/kits/',
  'https://donaantonia.com.br/cestas/economica-teste-cesta-economica-teste/',
  'https://donaantonia.com.br/kits/kit-limpeza-teste-kit-limpeza-teste/',
  '<image:image>'
]) assert(sitemapXml.includes(marker), `Sitemap de combos incompleto: ${marker}`);
assert(!sitemapXml.includes('?p='), 'Sitemap ainda prioriza produtos avulsos');
assert(!sitemapXml.includes('?cesta='), 'Sitemap ainda usa parâmetros de cesta');
assert(!sitemapXml.includes('<priority>'), 'Sitemap ainda usa priority sem efeito');
assert(!sitemapXml.includes('<changefreq>'), 'Sitemap ainda usa changefreq sem efeito');
assert(!sitemapXml.includes('?cidade='), 'Sitemap contém páginas locais artificiais');

const robots = read('robots.txt');
for (const marker of [
  'Sitemap: https://donaantonia.com.br/sitemap.xml',
  'Disallow: /producao/',
  'Disallow: /producao-v2/'
]) assert(robots.includes(marker), `robots.txt incompleto: ${marker}`);

const collectionsService = read('producao-v2/js/services/collections.js');
for (const marker of ["catalogVersionPayload", "'merchant'", "'meta'", "'sitemap'"]) {
  assert(collectionsService.includes(marker), `Admin não integra cestas e kits aos canais: ${marker}`);
}

console.log(`Site público validado: ${required.length} arquivos essenciais, ${institutionalFiles.length} páginas institucionais e páginas SEO de cestas/kits.`);
