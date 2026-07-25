import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BUILD = '20260725-admin-v12-fix-abas2';
const failures = [];
const checked = [];

const ROUTES = [
  'dashboard', 'products', 'stock', 'quick-read', 'nfe', 'orders', 'order-tools',
  'baskets', 'kits', 'offers', 'coupons', 'quick-purchase', 'categories', 'brands',
  'suppliers', 'tags', 'integrations', 'maintenance',
];

const ROUTE_MODULES = {
  products: ['catalog-auto-sync.js', 'product-lifecycle-bootstrap.js'],
  'quick-read': ['quick-read-bootstrap.js'],
  nfe: ['nfe-bootstrap.js'],
  orders: ['orders-bootstrap.js'],
  'order-tools': ['order-tools-bootstrap.js'],
  baskets: ['collections-bootstrap.js'],
  kits: ['collections-bootstrap.js'],
  offers: ['offers-bootstrap.js'],
  coupons: ['coupons-bootstrap.js'],
  'quick-purchase': ['quick-purchase-bootstrap.js'],
  categories: ['registries-bootstrap.js'],
  brands: ['registries-bootstrap.js'],
  suppliers: ['registries-bootstrap.js'],
  tags: ['registries-bootstrap.js'],
  integrations: ['diagnostics-bootstrap.js'],
  maintenance: ['diagnostics-bootstrap.js', 'backup-bootstrap.js'],
};

function fail(message) {
  failures.push(message);
}

function read(relative) {
  const file = path.join(ROOT, relative);
  if (!existsSync(file)) {
    fail(`Arquivo ausente: ${relative}`);
    return '';
  }
  return readFileSync(file, 'utf8');
}

function walk(directory, extension = '.js') {
  const base = path.join(ROOT, directory);
  if (!existsSync(base)) return [];
  const output = [];
  for (const name of readdirSync(base)) {
    const full = path.join(base, name);
    const relative = path.relative(ROOT, full).replace(/\\/g, '/');
    if (statSync(full).isDirectory()) output.push(...walk(relative, extension));
    else if (name.endsWith(extension)) output.push(relative);
  }
  return output;
}

function checkSyntax(relative) {
  try {
    execFileSync(process.execPath, ['--check', relative], { cwd: ROOT, stdio: 'pipe' });
    checked.push(relative);
  } catch (error) {
    fail(`Erro de sintaxe em ${relative}: ${String(error.stderr || error.message).trim()}`);
  }
}

function checkStaticImports(relative) {
  const source = read(relative);
  const directory = path.dirname(relative);
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:import\s+(?:[^'";]+?\s+from\s+)?|export\s+[^'";]+?\s+from\s+)(['"])(\.\.?\/[^'"]+)\1/);
    if (!match) continue;
    const originalTarget = match[2];
    const target = originalTarget.split(/[?#]/, 1)[0];
    const resolved = path.normalize(path.join(ROOT, directory, target));
    const candidates = [resolved, `${resolved}.js`, `${resolved}.mjs`, path.join(resolved, 'index.js')];
    if (!candidates.some(existsSync)) fail(`Import não encontrado em ${relative}: ${originalTarget}`);
  }
}

const required = [
  'producao/index.html', 'admin/index.html', 'producao-v2/index.html',
  'producao-v2/assets/admin.css', 'producao-v2/assets/navigation.css',
  'producao-v2/js/app.js', 'producao-v2/js/navigation-v12.js', 'producao-v2/js/stock-bootstrap.js',
  'producao-v2/js/modules/stock.js', 'producao-v2/js/services/orders.js',
  'producao-v2/js/orders-bootstrap.js', 'producao-v2/js/order-tools-bootstrap.js',
  'producao-v2/js/quick-read-bootstrap.js', 'producao-v2/js/nfe-bootstrap.js',
  'producao-v2/js/collections-bootstrap.js', 'producao-v2/js/offers-bootstrap.js',
  'producao-v2/js/coupons-bootstrap.js', 'producao-v2/js/quick-purchase-bootstrap.js',
  'producao-v2/js/registries-bootstrap.js', 'producao-v2/js/diagnostics-bootstrap.js',
  'producao-v2/js/backup-bootstrap.js', 'producao-v2/js/catalog-auto-sync.js',
  'producao-v2/js/product-lifecycle-bootstrap.js', 'producao-v2/js/product-editor-enhancements.js',
  'site/produtos-admin.json', 'site/produtos-home.json', 'site/ofertas-historico.json',
  'site/cuponsativos.json', 'site/compra-rapida.json', 'scripts/check-admin-production.mjs',
  '.github/workflows/verificar-admin-producao.yml',
];
required.forEach(file => { if (!existsSync(path.join(ROOT, file))) fail(`Arquivo obrigatório ausente: ${file}`); });

for (const removed of [
  'producao/index-legado.html', 'admin-oficial-20260724/index.html',
  'producao-v2/js/professional-route-loader.js', 'producao-v2/js/professional-shell.js',
  'producao-v2/js/visual-stability.js', 'producao-v2/assets/boot.css',
  'producao-v2/js/admin-suite-bootstrap.js',
]) {
  if (existsSync(path.join(ROOT, removed))) fail(`Arquivo legado ainda presente: ${removed}`);
}

const adminJavascript = walk('producao-v2/js', '.js');
adminJavascript.forEach(checkSyntax);
adminJavascript.forEach(checkStaticImports);
checkSyntax('scripts/test-admin-v2-definitivo.mjs');
checkSyntax('scripts/check-admin-production.mjs');

for (const jsonFile of [
  'site/produtos-admin.json', 'site/produtos-home.json', 'site/banners/banners.json',
  'site/ofertas-historico.json', 'site/cuponsativos.json', 'site/compra-rapida.json',
]) {
  try { JSON.parse(read(jsonFile)); }
  catch (error) { fail(`JSON inválido em ${jsonFile}: ${error.message}`); }
}

try {
  const adminProducts = JSON.parse(read('site/produtos-admin.json'));
  const entries = Object.entries(adminProducts || {});
  if (!entries.length) fail('O índice administrativo de produtos está vazio.');
  const first = entries[0]?.[1] || {};
  for (const field of ['firebaseKey', 'codigo', 'nome', 'estoque', 'situacao']) {
    if (!Object.prototype.hasOwnProperty.call(first, field)) fail(`O índice administrativo não contém o campo ${field}.`);
  }
} catch {}

for (const [name, source] of [['/producao', read('producao/index.html')], ['/admin', read('admin/index.html')]]) {
  if (!source.includes('../producao-v2/')) fail(`${name} não aponta para o Admin oficial.`);
  if (!source.includes(BUILD)) fail(`${name} não aponta para a build ${BUILD}.`);
  if (!source.includes('no-store') || !source.includes('window.location.replace')) fail(`${name} precisa redirecionar sem cache.`);
}

const adminIndex = read('producao-v2/index.html');
if (!adminIndex.includes(BUILD)) fail(`O HTML oficial não está na build ${BUILD}.`);
for (const entry of ['js/app.js', 'js/navigation-v12.js', 'js/stock-bootstrap.js', 'assets/navigation.css']) {
  if (!adminIndex.includes(entry)) fail(`Entrada do Admin ausente: ${entry}`);
}
if (adminIndex.includes('<script type="module" src="./js/nfe-bootstrap.js')) fail('A NF-e ainda carrega durante a abertura inicial.');
if (!adminIndex.includes('makeOrderWebhookSetting')) fail('O campo do webhook de pedidos não está no HTML oficial.');

const routeButtons = [...adminIndex.matchAll(/data-route="([^"]+)"/g)].map(match => match[1]);
const routeViews = [...adminIndex.matchAll(/data-view="([^"]+)"/g)].map(match => match[1]);
for (const route of ROUTES) {
  if (!routeButtons.includes(route)) fail(`A barra lateral não contém a função ${route}.`);
  if (!routeViews.includes(route)) fail(`A tela dedicada não existe para ${route}.`);
}
if (routeButtons.length !== ROUTES.length || new Set(routeButtons).size !== ROUTES.length) {
  fail(`A barra lateral deve ter exatamente ${ROUTES.length} rotas únicas; encontrou ${routeButtons.length}.`);
}

const ids = [...adminIndex.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
if (duplicateIds.length) fail(`IDs duplicados no HTML: ${duplicateIds.join(', ')}`);

const navigation = read('producao-v2/js/navigation-v12.js');
for (const feature of ['ROUTE_STORAGE_KEY', 'aria-current', 'admin-v2-route', 'adminV2Navigate', 'hashchange', "'order-tools'"]) {
  if (!navigation.includes(feature)) fail(`Navegação v12 incompleta: ${feature}`);
}
for (const route of ROUTES) {
  if (!navigation.includes(`${route}:`) && !navigation.includes(`'${route}':`)) fail(`Metadados de navegação ausentes para ${route}.`);
}

const app = read('producao-v2/js/app.js');
if (!app.includes('function quickAudit')) fail('A auditoria leve de abertura não foi encontrada.');
if (!app.includes('requestAnimationFrame(renderDashboard)')) fail('O dashboard não foi desacoplado da primeira pintura.');

const stockBootstrap = read('producao-v2/js/stock-bootstrap.js');
if (!stockBootstrap.includes(BUILD)) fail('O carregador das abas está com uma build diferente do HTML.');
for (const [route, modules] of Object.entries(ROUTE_MODULES)) {
  for (const moduleFile of modules) {
    if (!stockBootstrap.includes(`./${moduleFile}`)) fail(`A rota ${route} não carrega ${moduleFile}.`);
  }
}
if (!stockBootstrap.includes("if (route === 'orders') task = importOnce('orders', ['./orders-bootstrap.js']);")) fail('Pedidos ainda carrega a contingência junto.');
if (!stockBootstrap.includes('module?.refresh()')) fail('O bootstrap de Estoque não atualiza o módulo após carregar os produtos.');

const stockModule = read('producao-v2/js/modules/stock.js');
if (!/\brefresh\s*\(\)\s*\{\s*this\.render\(\);/s.test(stockModule)) fail('StockModule não implementa refresh() usando render().');

const ordersService = read('producao-v2/js/services/orders.js');
for (const marker of ['limitToLast', 'loadRecentOrders', 'loadOlderOrders', 'recentCacheLimit']) {
  if (!ordersService.includes(marker)) fail(`Serviço leve de pedidos incompleto: ${marker}.`);
}
if (ordersService.includes('/pedidos.json?_=')) fail('O serviço de pedidos ainda consulta o nó inteiro sem limite.');

const ordersBootstrap = read('producao-v2/js/orders-bootstrap.js');
for (const marker of ['const PAGE_SIZE = 30', 'loadRecentOrders', 'loadOlderOrders', 'Carregar mais antigos']) {
  if (!ordersBootstrap.includes(marker)) fail(`Paginação de Pedidos incompleta: ${marker}.`);
}

const orderTools = read('producao-v2/js/order-tools-bootstrap.js');
for (const marker of ['const CONTINGENCY_LIMIT = 60', 'const VISIBLE_LIMIT = 30', 'loadRecentOrders', 'setTimeout(() => reload(), 40)']) {
  if (!orderTools.includes(marker)) fail(`Contingência leve incompleta: ${marker}.`);
}
if (orderTools.includes('MutationObserver')) fail('A contingência contém MutationObserver e pode entrar em ciclo.');
if (orderTools.includes('loadOrders(')) fail('A contingência ainda usa a leitura completa antiga.');

for (const [file, workspace] of [
  ['producao-v2/js/quick-read-bootstrap.js', 'quickReadWorkspace'],
  ['producao-v2/js/nfe-bootstrap.js', 'nfeWorkspace'],
  ['producao-v2/js/collections-bootstrap.js', 'collectionsWorkspace'],
  ['producao-v2/js/offers-bootstrap.js', 'offersWorkspace'],
  ['producao-v2/js/registries-bootstrap.js', 'registriesWorkspace'],
  ['producao-v2/js/diagnostics-bootstrap.js', 'diagnosticsWorkspace'],
]) {
  if (!read(file).includes(workspace)) fail(`${file} não cria o workspace ${workspace}.`);
}

if (failures.length) {
  console.error(`\nAdmin V2 v12.2: ${failures.length} falha(s).`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Admin V2 v12.2 validado: ${ROUTES.length} abas, ${checked.length} arquivos JavaScript, imports e workspaces confirmados.`);
}
