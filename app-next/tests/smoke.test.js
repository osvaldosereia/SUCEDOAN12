import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productionRoot = path.resolve(root, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (ok, message) => { if (!ok) throw new Error(message); };

const required = [
  'index.html', 'styles/app.css', 'styles/visual-parity.css', 'styles/home-parity.css',
  'styles/live-polish.css', 'src/main.js', 'src/ui.js', 'src/catalog.js',
  'src/core.js', 'src/live-polish.js', 'src/image-performance.js', 'src/bundle-routes.js'
];
required.forEach(file => assert(fs.existsSync(path.join(root, file)), `Arquivo ausente: ${file}`));

const preview = read('index.html');
assert(preview.includes('location.replace'), '/app-next não redireciona para a raiz');
assert(preview.includes('noindex,nofollow'), '/app-next precisa permanecer noindex');
assert(!preview.includes('src/main.js'), '/app-next ainda carrega uma segunda aplicação');

const production = fs.readFileSync(path.join(productionRoot, 'index.html'), 'utf8');
for (const marker of [
  '2026-07-27-site-estavel-v1',
  '/app-next/styles/live-polish.css?v=20260727-5',
  '/app-next/src/live-polish.js?v=20260727-5',
  'da_v10_site_estavel_20260727',
  'href="/#/"', 'href="/#/categorias"', 'href="/#/ofertas"'
]) assert(production.includes(marker), `Produção incompleta: ${marker}`);
assert(!production.includes('requestIdleCallback'), 'Acabamento ainda é carregado com atraso');
assert(!production.includes('loadPolish'), 'Layout ainda é reescrito depois de abrir');

const polish = read('src/live-polish.js');
for (const marker of ['prepareLinks', 'prepareImages', 'closeTransientLayers', 'da:route-rendered']) {
  assert(polish.includes(marker), `Rotina estável incompleta: ${marker}`);
}
for (const removed of ['MutationObserver', 'IntersectionObserver', 'appendCarouselBatch', 'restoreBasketPosition']) {
  assert(!polish.includes(removed), `Rotina dinâmica ainda presente: ${removed}`);
}

const polishCss = read('styles/live-polish.css');
assert(polishCss.includes('.bundle-detail-hero>img'), 'Imagem principal de cesta sem ajuste');
assert(polishCss.includes('.bottom-bar{pointer-events:auto}'), 'Menu inferior sem proteção de clique');
assert(!polishCss.includes('.home-page .home-bundle-carousel'), 'Carrossel dinâmico ainda presente');
assert(!polishCss.includes('--product-card-gap'), 'CSS ainda redefine todos os cards');

const jsFiles = fs.readdirSync(path.join(root, 'src')).filter(file => file.endsWith('.js'));
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, 'src', file)], { encoding: 'utf8' });
  assert(result.status === 0, `Falha de sintaxe em ${file}:\n${result.stderr}`);
}

await import('../src/ui.js');
await import('../src/checkout.js');
await import('../src/offer-engine.js');
console.log(`Smoke test concluído: entrada única, navegação estável e ${jsFiles.length} módulos válidos.`);
