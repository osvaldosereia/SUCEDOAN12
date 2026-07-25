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

const LAZY_ROUTE_MODULES = {
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

function checkImports(relative) {
  const source = read(relative);
  const directory = path.dirname(relative);
  const expressions = [...source.matchAll(/(?:import\s+(?:[^'";]+?\s+from\s+)?|export\s+[^'";]+?\s+from\s+|import\s*\()(['"])(\.\.?\/[^'"]+)\1/g)];
  for (const match of expressions) {
    const originalTarget = match[2];
    if (originalTarget.includes('${')) continue;
    const target = originalTarget.split(/[?#]/, 1)[0];
    const resolved = path.normalize(path.join(ROOT, directory, target));
    const candidates = [resolved, `${resolved}.js`, path.join(resolved, 'index.js')];
    if (!candidates.some(existsSync)) fail(`Import não encontrado em ${relative}: ${originalTarget}`);
  }
}

const required = [
  'producao/index.html',
  'admin/index.html',
  'producao-v2/index.html',
  'producao-v2/assets/admin.css',
  'producao-v2/assets/navigation.css',
  'producao-v2/js/app.js',
  'producao-v2/js/navigation-v12.js',
  'producao-v2/js/stock-bootstrap.js',
  'producao-v2/js/modules/stock.js',
  'producao-v2/js/services/orders.js',
  'producao-v2/js/product-lifecycle-bootstrap.js',
  'producao-v2/js/product-editor-enhancements.js',
  'producao-v2/js/orders-bootstrap.js',
  'producao-v2/js/order-tools-bootstrap.js',
  'producao-v2/js/collections-bootstrap.js',
  'producao-v2/js/offers-bootstrap.js',
  'producao-v2/js/coupons-bootstrap.js',
  'producao-v2/js/quick-purchase-bootstrap.js',
  'producao-v2/js/registries-bootstrap.js',
  'producao-v2/js/diagnostics-bootstrap.js',
  'producao-v2/js/backup-bootstrap.js',
  'producao-v2/js/nfe-bootstrap.js',
  'producao-v2/js/quick-read-bootstrap.js',
  'producao-v2/js/catalog-auto-sync.js',
  'site/produtos-admin.json',
  'site/produtos-home.json',
  'site/ofertas-historico.json',
  'site/cuponsativos.json',
  'site/compra-rapida.json',
  'scripts/check-admin-production.mjs',
  'scripts/sincronizar-produtos-home-firebase.mjs',
  '.github/workflows/verificar-admin-producao.yml',
  '.github/workflows/sincronizar-produtos-home-firebase.yml',
];
required.forEach(file => { if (!existsSync(path.join(ROOT, file))) fail(`Arquivo obrigatório ausente: ${file}`); });

for (const removed of [
  'producao/index-legado.html',
  'admin-oficial-20260724/index.html',
  'producao-v2/js/professional-route-loader.js',
  'producao-v2/js/professional-shell.js',
  'producao-v2/js/visual-stability.js',
  'producao-v2/assets/boot.css',
  'producao-v2/js/admin-suite-bootstrap.js',
]) {
  if (existsSync(path.join(ROOT, removed))) fail(`Arquivo legado ainda presente: ${removed}`);
}

const javascript = [
  ...walk('producao-v2/js', '.js'),
  ...walk('app-next/src', '.js'),
  ...walk('scripts', '.mjs'),
].filter((value, index, list) => list.indexOf(value) === index && existsSync(path.join(ROOT, value)));

javascript.forEach(checkSyntax);
javascript.forEach(checkImports);

for (const jsonFile of ['site/produtos-admin.json', 'site/produtos-home.json', 'site/banners/banners.json', 'site/ofertas-historico.json', 'site/cuponsativos.json', 'site/compra-rapida.json']) {
  try { JSON.parse(read(jsonFile)); }
  catch (error) { fail(`JSON inválido em ${jsonFile}: ${error.message}`); }
}

try {
  const adminProducts = JSON.parse(read('site/produtos-admin.json'));
  const entries = Object.entries(adminProducts || {});
  if (entries.length < 1) fail('O índice administrativo de produtos está vazio.');
  const first = entries[0]?.[1] || {};
  for (const field of ['firebaseKey', 'codigo', 'nome', 'estoque', 'situacao']) {
    if (!Object.prototype.hasOwnProperty.call(first, field)) fail(`O índice administrativo não contém o campo ${field}.`);
  }
} catch {}

const productionEntry = read('producao/index.html');
const adminEntry = read('admin/index.html');
for (const [name, source] of [['/producao', productionEntry], ['/admin', adminEntry]]) {
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
if (adminIndex.includes('professional-route-loader') || adminIndex.includes('professional-shell')) fail('O HTML ainda referencia o shell profissional antigo.');
if (!adminIndex.includes('makeOrderWebhookSetting')) fail('O campo do webhook de pedidos não está no HTML oficial.');

const routeButtons = [...adminIndex.matchAll(/data-route="([^"]+)"/g)].map(match => match[1]);
const routeViews = [...adminIndex.matchAll(/data-view="([^"]+)"/g)].map(match => match[1]);
for (const route of ROUTES) {
  if (!routeButtons.includes(route)) fail(`A barra lateral não contém a função ${route}.`);
  if (!routeViews.includes(route)) fail(`A tela dedicada não existe para ${route}.`);
}
if (new Set(routeButtons).size !== ROUTES.length || routeButtons.length !== ROUTES.length) {
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
if (app.includes('return auditCatalog(store.state.products')) fail('A abertura ainda executa auditoria completa do catálogo.');
if (!app.includes('requestAnimationFrame(renderDashboard)')) fail('O dashboard não foi desacoplado da primeira pintura.');

const stockBootstrap = read('producao-v2/js/stock-bootstrap.js');
if (!stockBootstrap.includes(BUILD)) fail('O carregador das abas está com uma build diferente do HTML.');
for (const [route, modules] of Object.entries(LAZY_ROUTE_MODULES)) {
  for (const moduleFile of modules) {
    if (!stockBootstrap.includes(`./${moduleFile}`)) fail(`A rota ${route} não carrega ${moduleFile}.`);
  }
}
if (!stockBootstrap.includes("if (route === 'orders') task = importOnce('orders', ['./orders-bootstrap.js']);")) fail('Pedidos ainda carrega a contingência junto.');
if (/^import ['"].*nfe-bootstrap/m.test(stockBootstrap)) fail('A NF-e ainda possui import estático no bootstrap principal.');
if (/^import ['"].*product-lifecycle-bootstrap/m.test(stockBootstrap)) fail('O ciclo de produto ainda possui import estático no bootstrap principal.');
if (!stockBootstrap.includes('module?.refresh()')) fail('O bootstrap de Estoque não atualiza o módulo após carregar os produtos.');

const stockModule = read('producao-v2/js/modules/stock.js');
if (!/\brefresh\s*\(\)\s*\{\s*this\.render\(\);/s.test(stockModule)) fail('StockModule não implementa refresh() usando render().');
for (const id of ['stockMetrics', 'stockResultCount', 'stockTableBody', 'stockValue', 'stockValidity', 'stockSaveEditor']) {
  if (!stockBootstrap.includes(`id="${id}"`) && !stockBootstrap.includes(`'${id}'`)) fail(`Elemento obrigatório do Estoque ausente: ${id}.`);
}

const ordersService = read('producao-v2/js/services/orders.js');
for (const requiredText of ['limitToLast', 'orderBy', 'loadRecentOrders', 'loadOlderOrders', 'CACHE_MS']) {
  if (!ordersService.includes(requiredText)) fail(`Consulta leve de pedidos incompleta: ${requiredText}`);
}
if (ordersService.includes('/pedidos.json?_=')) fail('O serviço de pedidos ainda consulta o nó inteiro sem limite.');

const ordersBootstrap = read('producao-v2/js/orders-bootstrap.js');
for (const requiredText of ['const PAGE_SIZE = 30', 'loadRecentOrders', 'loadOlderOrders', 'Carregar mais antigos', 'slice(start, start + PAGE_SIZE)']) {
  if (!ordersBootstrap.includes(requiredText)) fail(`Paginação de Pedidos incompleta: ${requiredText}`);
}
if (ordersBootstrap.includes('loadOrders(loadConfig(), 300)')) fail('A aba Pedidos ainda usa a leitura completa antiga.');

const orderTools = read('producao-v2/js/order-tools-bootstrap.js');
for (const requiredText of [
  '[data-view="order-tools"]', 'const CONTINGENCY_LIMIT = 60', 'const VISIBLE_LIMIT = 30',
  'loadRecentOrders', 'setTimeout(() => reload(), 40)',
]) {
  if (!orderTools.includes(requiredText)) fail(`Contingência leve incompleta: ${requiredText}`);
}
if (orderTools.includes('MutationObserver')) fail('A contingência contém MutationObserver e pode entrar em ciclo de renderização.');
if (orderTools.includes('loadOrders(')) fail('A contingência ainda usa a leitura completa antiga.');

for (const [file, requiredText] of [
  ['producao-v2/js/quick-read-bootstrap.js', 'quickReadWorkspace'],
  ['producao-v2/js/nfe-bootstrap.js', 'nfeWorkspace'],
  ['producao-v2/js/collections-bootstrap.js', 'collectionsWorkspace'],
  ['producao-v2/js/offers-bootstrap.js', 'offersWorkspace'],
  ['producao-v2/js/registries-bootstrap.js', 'registriesWorkspace'],
  ['producao-v2/js/diagnostics-bootstrap.js', 'diagnosticsWorkspace'],
]) {
  if (!read(file).includes(requiredText)) fail(`${file} não cria o workspace ${requiredText}.`);
}

const firebaseService = read('producao-v2/js/services/firebase.js');
if (!firebaseService.includes('fetchAdminProducts') || !firebaseService.includes('adminCatalogUrl')) fail('O Admin não usa o índice administrativo leve.');
if (!firebaseService.includes('fetchProductsFromFirebase')) fail('O fallback direto do Firebase não foi preservado.');
if (!firebaseService.includes("method: 'PATCH'")) fail('O salvamento seguro por PATCH não foi encontrado.');
if (!firebaseService.includes('createProduct') || !firebaseService.includes('archiveProduct') || !firebaseService.includes('restoreProduct')) fail('Ciclo de vida de produtos incompleto.');

const catalogWorkflow = read('.github/workflows/sincronizar-produtos-home-firebase.yml');
for (const requiredText of ['catalog-version.json', 'site/produtos-admin.json', 'PRODUCTS_ADMIN_PATH', '*/5 * * * *']) {
  if (!catalogWorkflow.includes(requiredText)) fail(`Sincronização do catálogo incompleta: ${requiredText}`);
}

const healthScript = read('scripts/check-admin-production.mjs');
for (const endpoint of ['/producao/', '/producao-v2/', '/site/produtos-home.json', '/site/produtos-admin.json']) {
  if (!healthScript.includes(endpoint)) fail(`Healthcheck não valida ${endpoint}.`);
}

if (failures.length) {
  console.error(`\nAdmin V2 v12.2: ${failures.length} falha(s).`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Admin V2 v12.2 validado: ${ROUTES.length} abas, ${checked.length} arquivos JavaScript, imports, workspaces, Estoque e contingência confirmados.`);
}
