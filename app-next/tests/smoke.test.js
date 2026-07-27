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
  'styles/storefront-responsive.css', 'src/main.js', 'src/ui.js', 'src/catalog.js',
  'src/core.js', 'src/image-performance.js', 'src/home-carousels.js',
  'src/bundle-navigation.js', 'src/bundle-routes.js'
];
required.forEach(file => assert(fs.existsSync(path.join(root, file)), `Arquivo ausente: ${file}`));

const preview = read('index.html');
assert(preview.includes('location.replace'), '/app-next não redireciona para a raiz');
assert(preview.includes('noindex,nofollow'), '/app-next precisa permanecer noindex');
assert(!preview.includes('src/main.js'), '/app-next ainda carrega uma segunda aplicação');

const production = fs.readFileSync(path.join(productionRoot, 'index.html'), 'utf8');
for (const marker of [
  '2026-07-27-storefront-carousel-v7',
  '/app-next/styles/storefront-base.css?v=20260727-7',
  '/app-next/styles/storefront-components.css?v=20260727-7',
  '/app-next/styles/storefront-responsive.css?v=20260727-7',
  '/app-next/src/image-performance.js?v=20260727-7',
  '/app-next/src/home-carousels.js?v=20260727-7',
  '/app-next/src/main.js?v=20260727-6',
  'da_v12_storefront_carousel_20260727',
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
assert(css.includes('.product-packaging{display:inline-flex'), 'Etiqueta de embalagem não possui estilo consistente');
assert(css.includes('.category-grid{width:100%;min-width:0'), 'Grid de categorias ainda pode extrapolar a tela');
assert(css.includes('.bundle-total{bottom:calc(var(--bottom-h) + var(--safe-bottom))'), 'Resumo da cesta não encosta na barra inferior');
assert(!css.includes('repeat(5,minmax'), 'Layout ainda cria cinco colunas de cards');
assert(css.includes('[inert]'), 'Elementos inertes não possuem proteção visual');

const ui = read('src/ui.js');
for (const marker of [
  'HOME_BUNDLE_LIMIT = 100', 'editable: true', 'editable: false',
  'bundle-fixed-qty', 'setDrawerHidden', 'setAttribute(\'inert\'',
  'Cestas básicas em Cuiabá e Várzea Grande'
]) assert(ui.includes(marker), `UI incompleta: ${marker}`);

const main = read('src/main.js');
for (const marker of [
  'internalAppNavigation', 'da:catalog-refreshed', 'applyCatalog',
  'overlay.setAttribute(\'inert\'', 'router.navigate(target)'
]) assert(main.includes(marker), `Entrada principal incompleta: ${marker}`);

const imagePerformance = read('src/image-performance.js');
for (const marker of ['root: app', 'PRELOAD_MARGIN', 'HORIZONTAL_PRELOAD_MARGIN', "app?.addEventListener('scroll'", 'loadDeferredImage']) {
  assert(imagePerformance.includes(marker), `Carregamento de imagens incompleto: ${marker}`);
}

const carousel = read('src/home-carousels.js');
for (const marker of ['scrollBy', 'ResizeObserver', 'da:route-rendered', 'bundle-carousel-control', 'bundle-navigation.js']) {
  assert(carousel.includes(marker), `Carrossel incompleto: ${marker}`);
}

const bundleNavigation = read('src/bundle-navigation.js');
for (const marker of ['bundle-confirm-continue', 'offersLink.click()', 'app.scrollTop = 0']) {
  assert(bundleNavigation.includes(marker), `Navegação após adicionar cesta incompleta: ${marker}`);
}

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
console.log(`Smoke test concluído: carrosséis responsivos, imagens ligadas à rolagem interna e ${jsFiles.length} módulos válidos.`);
