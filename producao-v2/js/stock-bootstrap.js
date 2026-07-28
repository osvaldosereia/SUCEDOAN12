import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { productKey } from './core/utils.js';
import { StockModule } from './modules/stock.js';
import { loadProducts } from './services/firebase.js';

const BUILD = '20260728-orders-customers-v1';
const imports = new Map();

function loadConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}') };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(patch) {
  const next = { ...loadConfig(), ...(patch || {}) };
  localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(next));
  return next;
}

function installCss() {
  if (document.querySelector('link[data-admin-v2-stock]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `./assets/stock.css?admin_build=${BUILD}`;
  link.dataset.adminV2Stock = '1';
  document.head.appendChild(link);
}

function workspaceMarkup() {
  const windows = [5, 10, 15, 20, 25, 30]
    .map(value => `<option value="${value}">Próximos ${value} dias</option>`).join('');
  return `<section class="panel stock-workspace" id="stockWorkspace">
    <div class="panel-header"><div><span class="eyebrow">Fila operacional</span><h2>Estoque e validade</h2><p>Vencidos, próximos do vencimento, sem validade e estoque baixo em uma única lista.</p></div><span class="badge info" id="stockDataStatus">Abra esta aba para carregar</span></div>
    <div class="attention-grid stock-metrics" id="stockMetrics"></div>
    <div class="stock-toolbar"><div class="search-field"><span>⌕</span><input id="stockSearch" type="search" placeholder="Produto, código, EAN ou localização"></div><select id="stockStatusFilter"><option value="">Todos os status</option><option value="expired">Vencidos</option><option value="critical">Até 5 dias</option><option value="upcoming">Até 30 dias</option><option value="no-stock">Sem estoque</option><option value="low-stock">Estoque baixo</option><option value="no-validity">Sem validade</option></select><select id="stockWindowFilter"><option value="">Qualquer validade</option>${windows}</select><select id="stockSort"><option value="expiry">Vencimento mais próximo</option><option value="stock">Menor estoque</option><option value="name">Nome</option></select></div>
    <div class="table-summary"><div><strong id="stockResultCount">0</strong><span> produtos</span></div></div>
    <div class="table-wrap"><table class="data-table stock-table"><thead><tr><th>Produto</th><th>Estoque</th><th>Validade</th><th>Status</th><th>Lotes</th><th>Localização</th><th></th></tr></thead><tbody id="stockTableBody"></tbody></table></div>
  </section>`;
}

function editorMarkup() {
  return `<div class="stock-backdrop" id="stockBackdrop" hidden></div><aside class="editor-drawer stock-editor" id="stockEditor" aria-hidden="true">
    <div class="editor-header"><div><span class="eyebrow">Ajuste protegido</span><h2 id="stockEditorTitle">Produto</h2><p id="stockEditorSubtitle"></p></div><button class="icon-button" id="stockCloseEditor" type="button" aria-label="Fechar">×</button></div>
    <div class="editor-body"><div class="form-grid"><label>Estoque<input id="stockValue" type="number" min="0" step="1"></label><label>Validade<input id="stockValidity" type="text" inputmode="numeric" maxlength="10" placeholder="DD/MM/AAAA"></label><label class="span-2 switch-row"><span><strong>Produto sem validade</strong><small>Remove a validade principal do cadastro.</small></span><input id="stockNoExpiry" type="checkbox"></label><label class="span-2">Motivo do ajuste<textarea id="stockReason" placeholder="Ex.: contagem física, perda, correção de validade"></textarea></label></div><div class="stock-plan" id="stockEditorPlan"></div><p class="muted" id="stockEditorSafety"></p></div>
    <div class="editor-footer"><button class="button secondary" id="stockCancelEditor" type="button">Cancelar</button><button class="button primary" id="stockSaveEditor" type="button" disabled>Salvar ajuste</button></div>
  </aside>`;
}

function installSettings(host) {
  if (!host || document.getElementById('stockSafetySettings')) return;
  const html = `<section class="panel" id="stockSafetySettings"><div class="panel-header"><div><h2>Segurança dos ajustes</h2><p>Controle independente para estoque e validade.</p></div><span class="badge success" id="stockSettingsStatus">Ativo</span></div><div class="form-stack"><label class="switch-row"><span><strong>Permitir ajustes manuais</strong><small>Desative para bloquear temporariamente alterações nesta função.</small></span><input id="stockWriteModeSetting" type="checkbox"></label></div></section>`;
  host.insertAdjacentHTML('beforeend', html);
  const input = document.getElementById('stockWriteModeSetting');
  const status = document.getElementById('stockSettingsStatus');
  const sync = () => {
    const config = loadConfig();
    input.checked = config.stockWriteMode !== false;
    status.className = `badge ${input.checked ? 'success' : 'warning'}`;
    status.textContent = input.checked ? 'Ativo' : 'Bloqueado';
  };
  input.addEventListener('change', () => {
    saveConfig({ stockWriteMode: input.checked });
    sync();
  });
  sync();
}

function toast(message, type = '') {
  const region = document.getElementById('toastRegion');
  if (!region) return;
  const node = document.createElement('div');
  node.className = `toast ${type}`.trim();
  node.textContent = message;
  region.appendChild(node);
  setTimeout(() => node.remove(), type === 'error' ? 6500 : 3500);
}

function importOnce(key, paths) {
  if (imports.has(key)) return imports.get(key);
  const task = Promise.all(paths.map(path => import(`${path}?admin_build=${BUILD}`))).catch(error => {
    imports.delete(key);
    throw error;
  });
  imports.set(key, task);
  return task;
}

function moveToRoute(id, route) {
  const node = document.getElementById(id);
  const target = document.querySelector(`.view[data-view="${CSS.escape(route)}"]`);
  if (!node || !target || node.parentElement === target) return false;
  target.appendChild(node);
  return true;
}

function selectCollectionRoute(route) {
  const type = route === 'kits' ? 'kit' : 'basket';
  const button = document.querySelector(`#collectionTabs [data-collection-type="${type}"]`);
  if (button && !button.classList.contains('active')) button.click();
}

function selectRegistryRoute(route) {
  const names = { categories: 'categories', brands: 'brands', suppliers: 'suppliers', tags: 'tags' };
  const button = document.querySelector(`#registryTabs [data-registry-tab="${names[route]}"]`);
  if (button && !button.classList.contains('active')) button.click();
}

function placeRouteContent(route) {
  if (route === 'stock') {
    moveToRoute('stockWorkspace', route);
    moveToRoute('stockSafetySettings', route);
  }
  if (route === 'nfe') {
    moveToRoute('nfeWorkspace', route);
    moveToRoute('nfeSafetySettings', route);
  }
  if (route === 'baskets' || route === 'kits') {
    moveToRoute('collectionsWorkspace', route);
    moveToRoute('collectionsSafetySettings', route);
    selectCollectionRoute(route);
  }
  if (route === 'offers') {
    moveToRoute('offersWorkspace', route);
    moveToRoute('offerSafetySettings', route);
  }
  if (route === 'offers-rules') {
    moveToRoute('campaignOffersPanel', route);
    const panel = document.getElementById('campaignOffersPanel');
    if (panel) panel.hidden = false;
    window.__adminV2CampaignOffersLoad?.();
  }
  if (['categories', 'brands', 'suppliers', 'tags'].includes(route)) {
    moveToRoute('registriesWorkspace', route);
    moveToRoute('registrySafetySettings', route);
    selectRegistryRoute(route);
  }
  if (route === 'integrations') moveToRoute('externalIntegrationSettings', route);
  if (route === 'maintenance') moveToRoute('diagnosticsWorkspace', route);
  window.dispatchEvent(new CustomEvent('admin-v2-route-ready', { detail: { route } }));
}

async function loadRouteModules(route) {
  let task = Promise.resolve();
  if (route === 'products') task = importOnce('product-enhancements', ['./catalog-auto-sync.js', './product-lifecycle-bootstrap.js']);
  if (route === 'nfe') task = importOnce('nfe', ['./nfe-bootstrap.js']);
  if (route === 'orders') task = importOnce('orders', ['./orders-bootstrap.js']);
  if (route === 'customers') task = importOnce('customers', ['./customers-bootstrap.js']);
  if (route === 'order-tools') task = importOnce('order-tools', ['./order-tools-bootstrap.js']);
  if (route === 'baskets' || route === 'kits') task = importOnce('collections', ['./collections-bootstrap.js']);
  if (route === 'offers' || route === 'offers-rules') task = importOnce('offers', ['./offers-bootstrap.js']);
  if (route === 'coupons') task = importOnce('coupons', ['./coupons-bootstrap.js']);
  if (route === 'quick-purchase') task = importOnce('quick-purchase', ['./quick-purchase-bootstrap.js']);
  if (['categories', 'brands', 'suppliers', 'tags'].includes(route)) task = importOnce('registries', ['./registries-bootstrap.js']);
  if (route === 'integrations') task = importOnce('diagnostics', ['./diagnostics-bootstrap.js']);
  if (route === 'maintenance') task = Promise.all([
    importOnce('diagnostics', ['./diagnostics-bootstrap.js']),
    importOnce('backup', ['./backup-bootstrap.js']),
  ]);
  try {
    await task;
    placeRouteContent(route);
    if (route === 'offers-rules') setTimeout(() => placeRouteContent(route), 160);
  } catch (error) {
    toast(`Não foi possível abrir esta função: ${error?.message || error}`, 'error');
  }
}

function activeRoute() {
  return window.adminV2CurrentRoute?.() || document.querySelector('.view.active')?.dataset.view || 'dashboard';
}

function start() {
  const stockView = document.querySelector('.view[data-view="stock"]');
  if (!stockView || document.getElementById('stockWorkspace')) return;
  installCss();
  stockView.insertAdjacentHTML('beforeend', workspaceMarkup());
  installSettings(stockView);
  document.body.insertAdjacentHTML('beforeend', editorMarkup());

  const store = {
    state: { config: loadConfig(), products: [] },
    getProduct(key) {
      return this.state.products.find(product => productKey(product) === String(key)) || null;
    },
  };
  let module;
  let loaded = false;
  let loadingPromise = null;

  async function reload({ force = false } = {}) {
    if (loadingPromise) return loadingPromise;
    const status = document.getElementById('stockDataStatus');
    status.className = 'badge warning';
    status.textContent = 'Atualizando…';
    loadingPromise = (async () => {
      store.state.config = loadConfig();
      store.state.products = await loadProducts(store.state.config, { force });
      loaded = true;
      module?.refresh();
      status.className = 'badge success';
      status.textContent = `${store.state.products.length} produtos`;
      return store.state.products;
    })().catch(error => {
      status.className = 'badge danger';
      status.textContent = 'Falha ao carregar';
      throw error;
    }).finally(() => { loadingPromise = null; });
    return loadingPromise;
  }

  const ids = [
    'stockMetrics', 'stockSearch', 'stockStatusFilter', 'stockWindowFilter', 'stockSort', 'stockResultCount',
    'stockTableBody', 'stockBackdrop', 'stockEditor', 'stockEditorTitle', 'stockEditorSubtitle', 'stockCloseEditor',
    'stockValue', 'stockValidity', 'stockNoExpiry', 'stockReason', 'stockEditorPlan', 'stockEditorSafety',
    'stockCancelEditor', 'stockSaveEditor',
  ];
  const elements = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  module = new StockModule({ store, elements, onToast: toast, onReload: () => reload({ force: true }), reloadConfig: loadConfig });

  const activateRoute = route => {
    loadRouteModules(route);
    if (route === 'stock' && !loaded) reload().catch(error => toast(error?.message || String(error), 'error'));
  };

  window.addEventListener('admin-v2-route', event => activateRoute(event.detail?.route || ''));
  document.getElementById('reloadButton')?.addEventListener('click', () => {
    if (activeRoute() === 'stock') reload({ force: true }).catch(() => {});
  });

  placeRouteContent('stock');
  setTimeout(() => activateRoute(activeRoute()), 0);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
