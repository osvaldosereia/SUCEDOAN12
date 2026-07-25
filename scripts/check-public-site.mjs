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
  'app-next/index.html', 'app-next/styles/home-parity.css', 'app-next/styles/live-polish.css',
  'app-next/src/ui.js', 'app-next/src/main.js', 'app-next/src/live-polish.js',
  'site-public/assets/institutional.css', 'site-public/README.md',
  'scripts/gerar-merchant.js', 'scripts/gerar-sitemap.js'
];
required.forEach(file => assert(exists(file), `Arquivo público ausente: ${file}`));

const production = read('index.html');
for (const marker of [
  '2026-07-24-modular-production-v7',
  'app-next/styles/home-parity.css?v=20260724-7',
  'app-next/styles/live-polish.css?v=20260724-7',
  'da_v7_cache_migrated_20260724',
  "params.get('p')",
  "params.get('categoria')",
  "params.get('secao')",
  'window.__DA_PRODUCTION__ = true'
]) assert(production.includes(marker), `Index público incompleto: ${marker}`);
assert(!production.includes('noindex, nofollow'), 'Index de produção bloqueia indexação');
assert(!production.includes('visual-parity.js'), 'Index ainda carrega o módulo visual redundante');

const preview = read('app-next/index.html');
assert(preview.includes('noindex, nofollow'), 'Prévia modular precisa permanecer noindex');
assert(preview.includes('styles/live-polish.css?v=20260724-7'), 'Prévia sem CSS v7');
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
}

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
for (const marker of ['window.__DA_CATALOG_STATE__', "new CustomEvent('da:catalog-ready')", 'personalization-settings']) {
  assert(main.includes(marker), `Inicialização limpa incompleta: ${marker}`);
}
for (const removed of ['showConsentIfNeeded', 'personalization-consent', 'personalization-accept', 'personalization-decline']) {
  assert(!main.includes(removed), `Código morto do alerta de personalização ainda presente: ${removed}`);
}

const livePolish = read('app-next/src/live-polish.js');
for (const marker of ['window.__DA_CATALOG_STATE__', 'da:catalog-ready', '.slice(0, 30)', 'appendCarouselBatch', 'restoreBasketPosition']) {
  assert(livePolish.includes(marker), `Otimização progressiva incompleta: ${marker}`);
}
assert(!exists('app-next/src/visual-parity.js'), 'Módulo visual redundante ainda existe');
assert(!livePolish.includes('observe(document.documentElement'), 'live-polish observa o documento inteiro');

const liveCss = read('app-next/styles/live-polish.css');
for (const marker of [
  '--product-card-row:304px', '--product-card-gap:22px', 'grid-auto-rows:var(--product-card-row)',
  'grid-template-rows:138px minmax(0,1fr)', 'background:#f3f5f3!important',
  'repeating-linear-gradient(to bottom', '@media(min-width:720px)', '--product-card-gap:24px'
]) assert(liveCss.includes(marker), `Padronização dos cards incompleta: ${marker}`);
assert(!liveCss.includes('box-shadow:0 3px 12px'), 'Sombra antiga dos cards ainda existe');

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

const merchant = require('./gerar-merchant.js');
const sample = {
  nome: 'Arroz Teste 5kg', codigo: 'TESTE-1', preco: 20, preco_oferta: 16,
  estoque: 5, marca: 'Marca Teste', categoria: 'Mercearia', subcategoria: 'Arroz',
  ean: '7891234567890', url_imagem: 'https://raw.githubusercontent.com/osvaldosereia/SUCEDOAN12/main/site/img/produtos/teste.webp'
};
const item = merchant.itemXml('firebase-teste', sample);
for (const marker of [
  '<g:price>20.00 BRL</g:price>', '<g:sale_price>16.00 BRL</g:sale_price>',
  '<g:minimum_order_value>', '<g:price>75.00 BRL</g:price>',
  'https://www.donaantonia.com.br/site/img/produtos/teste.webp', '?p=TESTE-1'
]) assert(item.includes(marker), `Feed Merchant de teste incompleto: ${marker}`);
assert(!item.includes('<g:shipping>'), 'Feed informa frete gratuito para todo o Brasil');
assert(!item.includes('<g:unit_pricing_measure>'), 'Feed ainda envia embalagem livre como medida unitária');

const sitemap = require('./gerar-sitemap.js');
const sitemapXml = sitemap.buildSitemap([{ ...sample, firebaseKey: 'firebase-teste' }], '2026-07-24');
for (const marker of [
  'https://www.donaantonia.com.br/sobre-nos.html',
  'https://www.donaantonia.com.br/contato.html',
  '?secao=ofertas', '?categoria=Mercearia', '?p=firebase-teste'
]) assert(sitemapXml.includes(marker), `Sitemap de teste incompleto: ${marker}`);
assert(!sitemapXml.includes('?cidade='), 'Sitemap ainda contém páginas locais artificiais');

console.log(`Site público validado: ${required.length} arquivos essenciais, ${institutionalFiles.length} páginas institucionais e feed/sitemap testados.`);
