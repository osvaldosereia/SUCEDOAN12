import './catalog-auto-sync.js?admin_build=20260725-admin-v6';
import './product-lifecycle-bootstrap.js';
import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { productKey } from './core/utils.js';
import { StockModule } from './modules/stock.js';
import { loadProducts } from './services/firebase.js';

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
  link.href = './assets/stock.css?admin_build=20260725-admin-v6';
  link.dataset.adminV2Stock = '1';
  document.head.appendChild(link);
}

function workspaceMarkup() {
  const windows = [5, 10, 15, 20, 25, 30]
    .map(value => `<option value="${value}">Próximos ${value} dias</option>`).join('');
  return `<section class="panel stock-workspace" id="stockWorkspace">
    <div class="panel-header"><div><span class="eyebrow">Fila operacional</span><h2>Estoque e validade</h2><p>Vencidos, próximos do vencimento, sem validade e estoque baixo em uma única lista.</p></div><span class="badge info" id="stockDataStatus">Abra Operações para carregar</span></div>
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

function installSettings() {
  const grid = document.querySelector('[data-view="settings"] .settings-grid');
  if (!grid || document.getElementById('stockSafetySettings')) return;
  const html = `<section class="panel span-all-settings" id="stockSafetySettings"><div class="panel-header"><div><h2>Estoque e validade</h2><p>Ajustes manuais com motivo obrigatório e reconsulta do estoque remoto.</p></div><span class="badge success" id="stockSettingsStatus">Ativo</span></div><div class="form-stack"><label class="switch-row"><span><strong>Permitir ajustes manuais</strong><small>Use esta chave para bloquear temporariamente os ajustes de estoque neste navegador.</small></span><input id="stockWriteModeSetting" type="checkbox"></label></div></section>`;
  const danger = grid.querySelector('.danger-panel');
  if (danger) danger.insertAdjacentHTML('beforebegin', html);
  else grid.insertAdjacentHTML('beforeend', html);
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

const routeImports = new Map();
let preloadStarted = false;

function loadRouteModules(route) {
  if (routeImports.has(route)) return routeImports.get(route);
  let task = Promise.resolve();
  if (route === 'operations') {
    task = Promise.all([
      import('./nfe-bootstrap.js?admin_build=20260725-admin-v6'),
      import('./quick-read-bootstrap.js?admin_build=20260725-admin-v6'),
      import('./order-tools-bootstrap.js?admin_build=20260725-admin-v6'),
    ]);
  } else if (route === 'promotions') {
    task = Promise.all([
      import('./collections-bootstrap.js?admin_build=20260725-admin-v6'),
      import('./offers-bootstrap.js?admin_build=20260725-admin-v6'),
      import('./admin-suite-bootstrap.js?admin_build=20260725-admin-v6'),
    ]);
  } else if (route === 'registries') {
    task = import('./registries-bootstrap.js?admin_build=20260725-admin-v6');
  } else if (route === 'settings') {
    task = import('./diagnostics-bootstrap.js?admin_build=20260725-admin-v6');
  }
  const guarded = Promise.resolve(task).catch(error => {
    routeImports.delete(route);
    toast(`Não foi possível abrir o módulo: ${error?.message || error}`, 'error');
    throw error;
  });
  routeImports.set(route, guarded);
  return guarded;
}

async function preloadRouteModules() {
  if (preloadStarted) return;
  preloadStarted = true;
  await Promise.allSettled(['operations', 'promotions', 'registries', 'settings'].map(loadRouteModules));
  window.dispatchEvent(new CustomEvent('admin-v2-modules-ready'));
}

function schedulePreload() {
  if (preloadStarted) return;
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => preloadRouteModules(), { timeout: 900 });
  } else {
    setTimeout(preloadRouteModules, 30);
  }
}

function start() {
  const operations = document.querySelector('[data-view="operations"]');
  if (!operations || document.getElementById('stockWorkspace')) return;
  installCss();
  installSettings();
  operations.insertAdjacentHTML('beforeend', workspaceMarkup());
  document.body.insertAdjacentHTML('beforeend', editorMarkup());

  const store = { state: { config: loadConfig(), products: [] }, getProduct(key) { return this.state.products.find(product => productKey(product) === String(key)) || null; } };
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
    loadRouteModules(route).catch(() => {});
    if (route === 'operations' && !loaded) reload().catch(error => toast(error?.message || String(error), 'error'));
  };

  document.getElementById('mainNav')?.addEventListener('click', event => {
    const button = event.target.closest('[data-route]');
    if (button) activateRoute(button.dataset.route);
  });
  document.getElementById('reloadButton')?.addEventListener('click', () => {
    const route = document.querySelector('[data-view].active')?.dataset.view;
    if (route === 'operations') reload({ force: true }).catch(() => {});
  });

  window.addEventListener('admin-v2-core-ready', schedulePreload, { once: true });
  if (document.documentElement.dataset.adminCoreReady === '1') schedulePreload();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
