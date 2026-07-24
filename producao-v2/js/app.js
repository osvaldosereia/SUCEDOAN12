import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { Store } from './core/store.js';
import { isActive, number, productImage, productMissing, text } from './core/utils.js';
import { loadProducts, saveProduct } from './services/firebase.js';
import { ProductsModule } from './modules/products.js';

function loadConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}') };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

const store = new Store(loadConfig());
const element = id => document.getElementById(id);
const elements = {
  appShell: element('appShell'), sidebar: element('sidebar'), mainNav: element('mainNav'), mainContent: element('mainContent'),
  mobileMenuButton: element('mobileMenuButton'), mobileOverlay: element('mobileOverlay'), pageTitle: element('pageTitle'), pageSubtitle: element('pageSubtitle'),
  reloadButton: element('reloadButton'), publishButton: element('publishButton'), sidebarStatusDot: element('sidebarStatusDot'),
  sidebarStatusTitle: element('sidebarStatusTitle'), sidebarStatusText: element('sidebarStatusText'), dashboardMetrics: element('dashboardMetrics'),
  priorityList: element('priorityList'), systemList: element('systemList'), productSearch: element('productSearch'), openFiltersButton: element('openFiltersButton'),
  newProductButton: element('newProductButton'), filterBar: element('filterBar'), categoryFilter: element('categoryFilter'), statusFilter: element('statusFilter'),
  qualityFilter: element('qualityFilter'), sortFilter: element('sortFilter'), clearFiltersButton: element('clearFiltersButton'),
  productResultCount: element('productResultCount'), dirtyIndicator: element('dirtyIndicator'), productsTableBody: element('productsTableBody'),
  productsPagination: element('productsPagination'), productEditor: element('productEditor'), editorTitle: element('editorTitle'), editorSubtitle: element('editorSubtitle'),
  closeEditorButton: element('closeEditorButton'), editorTabs: element('editorTabs'), productForm: element('productForm'),
  discardProductButton: element('discardProductButton'), saveProductButton: element('saveProductButton'), toastRegion: element('toastRegion'),
  firebaseUrlSetting: element('firebaseUrlSetting'), productsNodeSetting: element('productsNodeSetting'), writeModeSetting: element('writeModeSetting'),
};

const routeMeta = {
  dashboard: ['Visão geral', 'O que precisa da sua atenção agora.'],
  products: ['Produtos', 'Consulta, revisão e edição em uma única lista.'],
  operations: ['Operações', 'Entrada, estoque, validade e conferência.'],
  promotions: ['Vendas e promoções', 'Cestas, kits, ofertas e campanhas.'],
  registries: ['Cadastros', 'Categorias, marcas, fornecedores e tags.'],
  settings: ['Configurações', 'Integrações e ferramentas avançadas.'],
};

function toast(message, type = '') {
  const node = document.createElement('div');
  node.className = `toast ${type}`.trim();
  node.textContent = message;
  elements.toastRegion.appendChild(node);
  setTimeout(() => node.remove(), type === 'error' ? 6500 : 3500);
}

function setRoute(route) {
  if (!routeMeta[route]) route = 'dashboard';
  store.state.route = route;
  elements.mainNav.querySelectorAll('[data-route]').forEach(button => button.classList.toggle('active', button.dataset.route === route));
  document.querySelectorAll('[data-view]').forEach(view => view.classList.toggle('active', view.dataset.view === route));
  const [title, subtitle] = routeMeta[route];
  elements.pageTitle.textContent = title;
  elements.pageSubtitle.textContent = subtitle;
  elements.sidebar.classList.remove('open');
  if (!elements.productEditor.classList.contains('open')) elements.mobileOverlay.hidden = true;
  elements.mainContent.focus({ preventScroll: true });
}

function renderStatus() {
  const { loading, error, products, dirtyProducts, config } = store.state;
  elements.sidebarStatusDot.className = `status-dot${error ? ' error' : !loading && products.length ? ' ok' : ''}`;
  if (error) {
    elements.sidebarStatusTitle.textContent = 'Falha na atualização';
    elements.sidebarStatusText.textContent = error;
  } else if (loading) {
    elements.sidebarStatusTitle.textContent = 'Atualizando';
    elements.sidebarStatusText.textContent = 'Carregando dados do Firebase…';
  } else {
    elements.sidebarStatusTitle.textContent = products.length ? 'Dados carregados' : 'Sem produtos';
    elements.sidebarStatusText.textContent = `${products.length} produtos · gravação ${config.writeMode ? 'ativada' : 'bloqueada'}`;
  }
  elements.publishButton.disabled = dirtyProducts.size === 0 || !config.writeMode;
  elements.publishButton.textContent = dirtyProducts.size ? `Publicar ${dirtyProducts.size} alteração${dirtyProducts.size > 1 ? 'ões' : ''}` : 'Publicar alterações';
}

function dashboardData() {
  const products = store.state.products;
  const incomplete = products.filter(product => productMissing(product).length > 0);
  const noStock = products.filter(product => number(product.estoque) <= 0);
  const lowStock = products.filter(product => number(product.estoque) > 0 && number(product.estoque) <= 5);
  const noImage = products.filter(product => !productImage(product));
  return { products, active: products.filter(isActive), incomplete, noStock, lowStock, noImage };
}

function renderDashboard() {
  const data = dashboardData();
  elements.dashboardMetrics.innerHTML = [
    ['info', data.products.length, 'Produtos', `${data.active.length} ativos`],
    ['danger', data.noStock.length, 'Sem estoque', 'Podem sair do site'],
    ['warning', data.lowStock.length, 'Estoque de 1 a 5', 'Revisar reposição'],
    ['warning', data.incomplete.length, 'Cadastro incompleto', `${data.noImage.length} sem imagem`],
  ].map(([kind, value, label, help]) => `<article class="metric-card ${kind}"><strong>${value}</strong><span>${label}</span><small>${help}</small></article>`).join('');

  const priorities = [
    ['Produtos sem estoque', data.noStock.length, 'danger', 'Afetam disponibilidade no catálogo'],
    ['Produtos com estoque baixo', data.lowStock.length, 'warning', 'Estoque entre 1 e 5 unidades'],
    ['Cadastros incompletos', data.incomplete.length, 'warning', 'Campos essenciais ausentes'],
    ['Produtos sem imagem', data.noImage.length, 'warning', 'Precisam de imagem pública'],
  ];
  elements.priorityList.innerHTML = priorities.map(([label, count, kind, help]) => `<div class="priority-row"><div><strong>${label}</strong><small>${help}</small></div><span class="badge ${kind}">${count}</span></div>`).join('');

  elements.systemList.innerHTML = [
    ['Firebase produtos', `${data.products.length} registros carregados`, data.products.length ? 'success' : 'warning'],
    ['Gravações da V2', store.state.config.writeMode ? 'Ativadas para teste controlado' : 'Bloqueadas por segurança', store.state.config.writeMode ? 'warning' : 'success'],
    ['Alterações locais', `${store.state.dirtyProducts.size} produto(s) pendente(s)`, store.state.dirtyProducts.size ? 'warning' : 'success'],
    ['Admin atual', 'producao/index.html preservado', 'success'],
  ].map(([label, help, kind]) => `<div class="system-row"><div><strong>${label}</strong><small>${help}</small></div><span class="badge ${kind}">${kind === 'success' ? 'OK' : 'Atenção'}</span></div>`).join('');
}

async function refreshData() {
  if (store.state.loading) return;
  store.setError('');
  store.setLoading(true);
  elements.reloadButton.disabled = true;
  elements.reloadButton.textContent = 'Atualizando…';
  try {
    const products = await loadProducts(store.state.config);
    store.setProducts(products);
    productsModule.render();
    renderDashboard();
    toast(`${products.length} produtos carregados do Firebase.`, 'success');
  } catch (error) {
    console.error(error);
    store.setError(error?.message || String(error));
    toast(`Não foi possível carregar os produtos: ${error?.message || error}`, 'error');
  } finally {
    store.setLoading(false);
    elements.reloadButton.disabled = false;
    elements.reloadButton.textContent = 'Atualizar dados';
    renderStatus();
  }
}

async function saveOne(product) {
  const key = product.firebaseKey || product.id || product.codigo;
  const snapshot = store.state.remoteSnapshots.get(String(key));
  elements.saveProductButton.disabled = true;
  elements.saveProductButton.textContent = 'Salvando…';
  try {
    const saved = await saveProduct(store.state.config, product, snapshot);
    store.markProductSaved(key, saved);
    productsModule.renderDirty();
    renderDashboard();
    renderStatus();
    toast(`${saved.nome || saved.codigo} salvo com segurança.`, 'success');
  } catch (error) {
    console.error(error);
    toast(error?.message || String(error), 'error');
    throw error;
  } finally {
    elements.saveProductButton.disabled = false;
    elements.saveProductButton.textContent = 'Salvar produto';
  }
}

async function publishAll() {
  if (!store.state.config.writeMode) {
    toast('As gravações estão bloqueadas nesta etapa.', 'error');
    return;
  }
  const pending = [...store.state.dirtyProducts.values()];
  if (!pending.length) return;
  elements.publishButton.disabled = true;
  let saved = 0;
  try {
    for (const product of pending) {
      await saveOne(product);
      saved += 1;
    }
    toast(`${saved} produto(s) publicado(s).`, 'success');
  } catch {
    toast(`Processo interrompido após ${saved} salvamento(s).`, 'error');
  } finally {
    productsModule.render();
    renderStatus();
  }
}

const productsModule = new ProductsModule({ store, elements, onSave: saveOne, onToast: toast });

elements.mainNav.addEventListener('click', event => {
  const button = event.target.closest('[data-route]');
  if (button) setRoute(button.dataset.route);
});
elements.reloadButton.addEventListener('click', refreshData);
elements.publishButton.addEventListener('click', publishAll);
elements.mobileMenuButton.addEventListener('click', () => {
  elements.sidebar.classList.add('open');
  elements.mobileOverlay.hidden = false;
});
elements.mobileOverlay.addEventListener('click', () => {
  if (elements.productEditor.classList.contains('open')) productsModule.closeEditor();
  elements.sidebar.classList.remove('open');
  elements.mobileOverlay.hidden = true;
});

function syncSettingsUi() {
  elements.firebaseUrlSetting.value = store.state.config.firebaseUrl;
  elements.productsNodeSetting.value = store.state.config.productsNode;
  elements.writeModeSetting.checked = Boolean(store.state.config.writeMode);
}

function saveConfigFromUi() {
  store.state.config.firebaseUrl = text(elements.firebaseUrlSetting.value) || DEFAULT_CONFIG.firebaseUrl;
  store.state.config.productsNode = text(elements.productsNodeSetting.value) || DEFAULT_CONFIG.productsNode;
  store.state.config.writeMode = elements.writeModeSetting.checked;
  localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(store.state.config));
  renderStatus();
  renderDashboard();
  toast('Configurações da V2 salvas neste navegador.', 'success');
}
[elements.firebaseUrlSetting, elements.productsNodeSetting, elements.writeModeSetting].forEach(input => input.addEventListener('change', saveConfigFromUi));

store.addEventListener('status', renderStatus);
store.addEventListener('dirty', () => {
  productsModule.renderDirty();
  renderStatus();
  renderDashboard();
});
window.addEventListener('beforeunload', event => {
  if (!store.state.dirtyProducts.size) return;
  event.preventDefault();
  event.returnValue = 'Existem alterações não publicadas na versão V2.';
});

syncSettingsUi();
setRoute('dashboard');
renderStatus();
refreshData();
