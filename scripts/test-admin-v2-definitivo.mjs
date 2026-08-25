import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const failures = [];
const checked = [];

const ROUTES = [
  'dashboard', 'products', 'stock', 'nfe', 'orders', 'customers', 'order-tools',
  'baskets', 'kits', 'offers', 'offers-rules', 'coupons', 'categories', 'brands',
  'suppliers', 'tags', 'integrations', 'maintenance',
];

const ROUTE_MODULES = {
  products: ['catalog-auto-sync.js', 'product-lifecycle-bootstrap.js'],
  nfe: ['nfe-bootstrap.js'],
  orders: ['orders-bootstrap.js'],
  customers: ['customers-bootstrap.js'],
  'order-tools': ['order-tools-bootstrap.js'],
  baskets: ['collections-bootstrap.js'],
  kits: ['collections-bootstrap.js'],
  offers: ['offers-bootstrap.js'],
  'offers-rules': ['offers-bootstrap.js'],
  coupons: ['coupons-bootstrap.js'],
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
  'producao-v2/assets/kit-lifecycle.css',
  'producao-v2/js/app.js', 'producao-v2/js/navigation-v12.js', 'producao-v2/js/stock-bootstrap.js',
  'producao-v2/js/product-delete-tools-v2.js',
  'producao-v2/js/modules/stock.js', 'producao-v2/js/services/orders.js',
  'producao-v2/js/orders-bootstrap.js', 'producao-v2/js/customers-bootstrap.js',
  'producao-v2/js/services/customers.js', 'producao-v2/js/order-tools-bootstrap.js',
  'producao-v2/js/nfe-bootstrap.js', 'producao-v2/js/collections-bootstrap.js',
  'producao-v2/js/kit-lifecycle-admin.js', 'producao-v2/js/core/collections.js',
  'producao-v2/js/services/collections.js', 'producao-v2/js/offers-bootstrap.js',
  'producao-v2/js/coupons-bootstrap.js',
  'producao-v2/js/registries-bootstrap.js', 'producao-v2/js/diagnostics-bootstrap.js',
  'producao-v2/js/backup-bootstrap.js', 'producao-v2/js/catalog-auto-sync.js',
  'producao-v2/js/product-lifecycle-bootstrap.js', 'producao-v2/js/product-editor-enhancements.js',
  'site/produtos-admin.json', 'site/produtos-home.json', 'site/ofertas-historico.json',
  'site/cuponsativos.json', 'site/compra-rapida.json', 'scripts/check-admin-production.mjs',
  'scripts/test-admin-v2-route-architecture.mjs', '.github/workflows/verificar-admin-producao.yml',
];
required.forEach(file => { if (!existsSync(path.join(ROOT, file))) fail(`Arquivo obrigatório ausente: ${file}`); });

for (const removed of [
  'producao/index-legado.html', 'admin-oficial-20260724/index.html',
  'producao-v2/js/professional-route-loader.js', 'producao-v2/js/professional-shell.js',
  'producao-v2/js/visual-stability.js', 'producao-v2/assets/boot.css',
  'producao-v2/js/admin-suite-bootstrap.js', 'producao-v2/js/quick-read-bootstrap.js',
  'producao-v2/js/modules/quick-read.js', 'producao-v2/js/core/quick-read.js',
  'producao-v2/assets/quick-read.css', 'producao-v2/js/quick-purchase-bootstrap.js',
  'producao-v2/js/product-delete-filter.js', 'producao-v2/js/product-delete-tools.js',
  'producao-v2/js/official-copy-fixes.js',
  'producao-v2/js/campaign-offers-fixes.js', 'producao-v2/js/modules/nfe.js',
  'producao-v2/js/manual-status-save.js', 'producao-v2/js/offer-store-bridge.js',
  'producao-v2/js/inline-sale-price-label.js',
]) {
  if (existsSync(path.join(ROOT, removed))) fail(`Arquivo legado ainda presente: ${removed}`);
}

const adminJavascript = walk('producao-v2/js', '.js');
adminJavascript.forEach(checkSyntax);
adminJavascript.forEach(checkStaticImports);
checkSyntax('scripts/test-admin-v2-definitivo.mjs');
checkSyntax('scripts/test-admin-v2-route-architecture.mjs');
checkSyntax('scripts/check-admin-production.mjs');

for (const jsonFile of [
  'site/produtos-admin.json', 'site/produtos-home.json', 'site/banners/banners.json',
  'site/ofertas-historico.json', 'site/cuponsativos.json', 'site/compra-rapida.json',
]) {
  try { JSON.parse(read(jsonFile)); }
  catch (error) { fail(`JSON inválido em ${jsonFile}: ${error.message}`); }
}

for (const [name, source] of [['/producao', read('producao/index.html')], ['/admin', read('admin/index.html')]]) {
  if (!source.includes('../producao-v2/')) fail(`${name} não aponta para o Admin oficial.`);
  if (!source.includes('var RELEASE = ')) fail(`${name} não declara uma release estável.`);
  if (!source.includes("destination.searchParams.set('admin_build', RELEASE)")) fail(`${name} não envia a release ao carregador.`);
  if (!source.includes("destination.searchParams.set('save_build', RELEASE)")) fail(`${name} não sincroniza save_build com admin_build.`);
  if (!source.includes('no-cache, must-revalidate') || !source.includes('window.location.replace')) fail(`${name} precisa revalidar somente a entrada do Admin.`);
  if (source.includes('var build = String(Date.now());') || source.includes('no-store')) fail(`${name} voltou a invalidar o cache em toda abertura.`);
}

const adminIndex = read('producao-v2/index.html');
for (const entry of ['js/app.js', 'js/navigation-v12.js', 'js/stock-bootstrap.js', 'assets/navigation.css']) {
  if (!adminIndex.includes(entry)) fail(`Entrada do Admin ausente: ${entry}`);
}
if (adminIndex.includes('data-route="quick-read"') || adminIndex.includes('data-view="quick-read"')) fail('A função Leitura rápida reapareceu no HTML oficial.');
if (!adminIndex.includes('makeOrderWebhookSetting')) fail('O campo do webhook de pedidos não está no HTML oficial.');
if (!adminIndex.includes('data-editor-section="baskets"')) fail('O editor individual não contém a área de Cestas básicas.');

const productsModule = read('producao-v2/js/modules/products.js');
for (const feature of ['saveProductBasketMemberships', 'data-product-basket=', 'cestas_basicas', "saveCollectionList("]) {
  if (!productsModule.includes(feature)) fail(`Integração Produto → Cestas incompleta: ${feature}`);
}

const directProductSave = read('producao-v2/js/direct-product-save.js');
if (!directProductSave.includes('saveProductBasketMemberships?.()')) fail('Salvar produto não publica as cestas selecionadas.');

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
if (navigation.includes('quick-read:') || navigation.includes("'quick-read':")) fail('Metadados antigos da Leitura rápida ainda estão presentes.');

const app = read('producao-v2/js/app.js');
if (!app.includes('function quickAudit')) fail('A auditoria leve de abertura não foi encontrada.');
if (!app.includes('requestAnimationFrame(renderDashboard)')) fail('O dashboard não foi desacoplado da primeira pintura.');

const adminUx = read('producao-v2/admin-ux.js');
if (adminUx.includes('new MutationObserver')) fail('admin-ux.js voltou a observar o DOM inteiro em vez de usar eventos do Admin.');
if (!adminUx.includes("addEventListener('admin-v2-route-ready'")) fail('admin-ux.js não reage ao evento determinístico de rota pronta.');
if (!adminUx.includes('data-ux-product-mode="baskets"')) fail('A aba Cestas básicas não foi instalada no editor individual.');

const stockBootstrap = read('producao-v2/js/stock-bootstrap.js');
if (!stockBootstrap.includes('meta[name="admin-save-build"]')) fail('O carregador das abas não herda a build produtiva atual.');
if (!stockBootstrap.includes('encodeURIComponent(BUILD)')) fail('O carregador das abas não aplica a build atual aos módulos sob demanda.');
for (const [route, modules] of Object.entries(ROUTE_MODULES)) {
  for (const moduleFile of modules) {
    if (!stockBootstrap.includes(`./${moduleFile}`)) fail(`A rota ${route} não carrega ${moduleFile}.`);
  }
}
if (!stockBootstrap.includes("'./product-delete-tools-v2.js'")) fail('Produtos não carrega o módulo otimizado de exclusão pela própria rota.');
if (stockBootstrap.includes("'./product-delete-tools.js'")) fail('Produtos voltou a carregar o módulo legado de exclusão.');
if (stockBootstrap.includes('quick-read-bootstrap.js')) fail('O carregador ainda referencia a Leitura rápida removida.');
if (!stockBootstrap.includes("if (route === 'orders') task = importOnce('orders', ['./orders-bootstrap.js']);")) fail('Pedidos ainda carrega a contingência junto.');
if (!stockBootstrap.includes('module?.refresh()')) fail('O bootstrap de Estoque não atualiza o módulo após carregar os produtos.');

const productDelete = read('producao-v2/js/product-delete-tools-v2.js');
for (const marker of ['function scheduleEnhance()', 'requestAnimationFrame(() => {', 'mutation.target === table', ".observe(table, { childList: true });", 'mapLimit(keys, 4', 'deleteGithubImage']) {
  if (!productDelete.includes(marker)) fail(`Exclusão otimizada de Produtos incompleta: ${marker}`);
}
if (productDelete.includes('subtree: true')) fail('Exclusão de Produtos voltou a observar toda a subárvore da tabela.');
if (productDelete.includes('new MutationObserver(enhanceRows)')) fail('Exclusão de Produtos voltou a criar loop direto entre observer e renderização.');

const collectionsBootstrap = read('producao-v2/js/collections-bootstrap.js');
if (!collectionsBootstrap.includes("import './kit-lifecycle-admin.js")) fail('O editor de ciclo de vida dos kits não é carregado.');
const kitLifecycle = read('producao-v2/js/kit-lifecycle-admin.js');
for (const marker of ['data-kit-quick-expiry', 'data-kit-quick-stock-mode', 'saveKitQuick', 'deleteCollectionFixed']) {
  if (!kitLifecycle.includes(marker)) fail(`Controle de kits incompleto: ${marker}.`);
}
const collectionCore = read('producao-v2/js/core/collections.js');
for (const marker of ['ativo_ate_estoque_zero', 'allowSubstitutes: !stockControlled', 'o kit ficar']) {
  if (!collectionCore.includes(marker)) fail(`Regra de estoque dos kits incompleta: ${marker}.`);
}

const collectionModule = read('producao-v2/js/modules/collections.js');
const basketGrid = read('producao-v2/js/basket-products-grid.js');
const basketContext = read('producao-v2/js/basket-context.js');
for (const [source, marker] of [
  [collectionCore, 'trocas_permitidas'],
  [collectionModule, 'Pesquisar e marcar trocas'],
  [basketGrid, 'data-collection-manage-swaps'],
  [basketGrid, 'basket-swap-chip'],
  [basketContext, "mode === 'allowed'"],
]) {
  if (!source.includes(marker)) fail(`Trocas permitidas das cestas incompletas: ${marker}.`);
}
for (const legacyMarker of ['data-collection-set-substitute', 'data-collection-clear-substitute', 'Subst. 1', 'Subst. 2']) {
  if (basketGrid.includes(legacyMarker)) fail(`O card produtivo das cestas ainda contém o controle automático antigo: ${legacyMarker}.`);
}
if (basketGrid.includes('setInterval(tryInstall')) fail('O editor de cestas voltou a usar polling para esperar o módulo.');
if (!basketGrid.includes("addEventListener('admin-v2-route-ready'")) fail('O editor de cestas não usa o evento determinístico de rota pronta.');

const campaignRules = read('producao-v2/js/campaign-rules-section.js');
if (campaignRules.includes('setInterval(refreshRulesSection')) fail('Ofertas por regra voltou a atualizar por polling permanente.');
if (campaignRules.includes('observe(document.documentElement')) fail('Ofertas por regra voltou a observar o documento inteiro.');
if (!campaignRules.includes("addEventListener('admin-v2-route-ready'")) fail('Ofertas por regra não usa o evento determinístico de rota pronta.');

try {
  const collectionsApi = await import(pathToFileURL(path.join(ROOT, 'producao-v2/js/core/collections.js')).href);
  const products = [
    { firebaseKey: 'principal', codigo: 'P1', nome: 'Principal', preco: 10, estoque: 0, situacao: 'A' },
    { firebaseKey: 'troca', codigo: 'T1', nome: 'Troca permitida', preco: 11, estoque: 10, situacao: 'A' },
  ];
  const basket = {
    id: 'teste-cesta', codigo: 'TESTE', nome: 'Cesta de teste', preco: 20, imagem: 'teste.webp',
    produtos: [{ codigo: 'P1', qtd: 1, substitutos: ['T1'], trocas_permitidas: ['T1'] }],
  };
  const audit = collectionsApi.auditCollection(basket, 'basket', products, []);
  const item = audit.items[0];
  if (item.resolved.usedSubstitute || item.resolved.selectedCode !== 'P1') {
    fail('A cesta ainda substitui automaticamente o produto principal sem estoque.');
  }
  if (audit.errors.some(message => /sem estoque/i.test(message))) {
    fail('A cesta com troca manual válida continua bloqueada para salvamento.');
  }
  const normalized = collectionsApi.normalizeCollectionForPublish(basket, 'basket', products, []).normalized.produtos[0];
  if (!Array.isArray(normalized.trocas_permitidas) || normalized.trocas_permitidas[0] !== 'T1') {
    fail('As trocas permitidas não foram preservadas na publicação.');
  }
  if ('substitutos' in normalized) fail('O campo automático antigo ainda é publicado nas cestas.');
} catch (error) {
  fail(`Não foi possível testar o fluxo de trocas permitidas: ${error.message}`);
}

const stockModule = read('producao-v2/js/modules/stock.js');
if (!/\brefresh\s*\(\)\s*\{\s*this\.render\(\);/s.test(stockModule)) fail('StockModule não implementa refresh() usando render().');

const ordersService = read('producao-v2/js/services/orders.js');
for (const marker of ['limitToLast', 'loadRecentOrders', 'loadOlderOrders', 'recentCacheLimit']) {
  if (!ordersService.includes(marker)) fail(`Serviço leve de pedidos incompleto: ${marker}.`);
}
if (ordersService.includes('/pedidos.json?_=')) fail('O serviço de pedidos ainda consulta o nó inteiro sem limite.');

for (const [file, workspace] of [
  ['producao-v2/js/nfe-bootstrap.js', 'nfeWorkspace'],
  ['producao-v2/js/collections-bootstrap.js', 'collectionsWorkspace'],
  ['producao-v2/js/offers-bootstrap.js', 'offersWorkspace'],
  ['producao-v2/js/registries-bootstrap.js', 'registriesWorkspace'],
  ['producao-v2/js/diagnostics-bootstrap.js', 'diagnosticsWorkspace'],
]) {
  if (!read(file).includes(workspace)) fail(`${file} não cria o workspace ${workspace}.`);
}

if (failures.length) {
  console.error(`\nAdmin V2 v13.1: ${failures.length} falha(s).`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Admin V2 v13.1 validado: ${ROUTES.length} abas, ${checked.length} arquivos JavaScript, imports, desempenho de Produtos e ciclo dos kits confirmados.`);
}
