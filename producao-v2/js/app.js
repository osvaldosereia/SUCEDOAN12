import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { auditCatalog, validateProduct } from './core/catalog.js';
import { Store } from './core/store.js';
import { isActive, number, productCode, productImage, productName, text } from './core/utils.js';
import { loadProducts, saveProduct } from './services/firebase.js';
import { testGithubConnection } from './services/github.js';
import { upsertBase64File } from './services/github-binary.js';
import { MakeModule } from './modules/make.js';
import { ProductsModule } from './modules/products.js';
import { PublishModule } from './modules/publish.js';

function loadConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}') };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function loadLastPublication() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.lastPublication) || 'null');
  } catch {
    return null;
  }
}

function slug(value = '') {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'produto';
}

const store = new Store(loadConfig());
store.state.lastPublication = loadLastPublication();

const element = id => document.getElementById(id);
const elements = {
  appShell: element('appShell'), sidebar: element('sidebar'), mainNav: element('mainNav'), mainContent: element('mainContent'),
  mobileMenuButton: element('mobileMenuButton'), mobileOverlay: element('mobileOverlay'), pageTitle: element('pageTitle'), pageSubtitle: element('pageSubtitle'),
  reloadButton: element('reloadButton'), publishButton: element('publishButton'), openPublishReviewButton: element('openPublishReviewButton'),
  openPublishReviewSettingsButton: element('openPublishReviewSettingsButton'), sidebarStatusDot: element('sidebarStatusDot'),
  sidebarStatusTitle: element('sidebarStatusTitle'), sidebarStatusText: element('sidebarStatusText'), dashboardMetrics: element('dashboardMetrics'),
  priorityList: element('priorityList'), systemList: element('systemList'), diagnosticList: element('diagnosticList'), productSearch: element('productSearch'),
  openFiltersButton: element('openFiltersButton'), newProductButton: element('newProductButton'), filterBar: element('filterBar'),
  categoryFilter: element('categoryFilter'), statusFilter: element('statusFilter'), qualityFilter: element('qualityFilter'), sortFilter: element('sortFilter'),
  clearFiltersButton: element('clearFiltersButton'), productResultCount: element('productResultCount'), dirtyIndicator: element('dirtyIndicator'),
  productsTableBody: element('productsTableBody'), productsPagination: element('productsPagination'), productEditor: element('productEditor'),
  editorTitle: element('editorTitle'), editorSubtitle: element('editorSubtitle'), closeEditorButton: element('closeEditorButton'), editorTabs: element('editorTabs'),
  editorValidation: element('editorValidation'), productForm: element('productForm'), discardProductButton: element('discardProductButton'),
  saveProductButton: element('saveProductButton'), toastRegion: element('toastRegion'), firebaseUrlSetting: element('firebaseUrlSetting'),
  productsNodeSetting: element('productsNodeSetting'), writeModeSetting: element('writeModeSetting'), githubTokenSetting: element('githubTokenSetting'),
  githubOwnerSetting: element('githubOwnerSetting'), githubRepoSetting: element('githubRepoSetting'), githubBranchSetting: element('githubBranchSetting'),
  productsHomePathSetting: element('productsHomePathSetting'), catalogVersionPathSetting: element('catalogVersionPathSetting'),
  githubImagesPathSetting: element('githubImagesPathSetting'), githubKitImagesPathSetting: element('githubKitImagesPathSetting'),
  makeTextWebhookSetting: element('makeTextWebhookSetting'), makeImageWebhookSetting: element('makeImageWebhookSetting'),
  makeInstagramKitWebhookSetting: element('makeInstagramKitWebhookSetting'), testGithubButton: element('testGithubButton'),
  publishBackdrop: element('publishBackdrop'), publishDialog: element('publishDialog'), closePublishReviewButton: element('closePublishReviewButton'),
  closePublishReviewFooterButton: element('closePublishReviewFooterButton'), publishReviewMetrics: element('publishReviewMetrics'), publishBlockers: element('publishBlockers'),
  publishIssues: element('publishIssues'), confirmPublishCheckbox: element('confirmPublishCheckbox'), publishProgress: element('publishProgress'),
  executePublishButton: element('executePublishButton'),
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
  if (route === 'settings') renderDiagnostics();
}

function currentAudit() {
  return auditCatalog(store.state.products, store.state.config);
}

function renderStatus() {
  const { loading, error, products, dirtyProducts, config, firebaseVerified } = store.state;
  elements.sidebarStatusDot.className = `status-dot${error ? ' error' : !loading && products.length && firebaseVerified ? ' ok' : ''}`;
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
  elements.publishButton.disabled = products.length === 0 || loading;
  elements.publishButton.textContent = dirtyProducts.size
    ? `Revisar ${dirtyProducts.size} alteração${dirtyProducts.size > 1 ? 'ões' : ''}`
    : 'Revisar publicação';
}

function dashboardData() {
  const products = store.state.products;
  const audit = currentAudit();
  const noStock = products.filter(product => number(product.estoque) <= 0);
  const lowStock = products.filter(product => number(product.estoque) > 0 && number(product.estoque) <= 5);
  const noImage = products.filter(product => !productImage(product));
  return {
    products,
    audit,
    active: products.filter(isActive),
    noStock,
    lowStock,
    noImage,
  };
}

function formatDateTime(value) {
  if (!value) return 'Nunca';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('pt-BR');
}

function renderDashboard() {
  const data = dashboardData();
  const metrics = [
    ['info', data.products.length, 'Produtos', `${data.active.length} ativos`, 'all'],
    ['danger', data.noStock.length, 'Sem estoque', 'Clique para corrigir', 'no-stock'],
    ['danger', data.audit.errors.length, 'Erros de publicação', 'Clique para abrir os produtos', 'errors'],
    ['warning', data.audit.warnings.length, 'Produtos com avisos', `${data.noImage.length} sem imagem`, 'warnings'],
  ];
  elements.dashboardMetrics.innerHTML = metrics.map(([kind, value, label, help, action]) => `<button type="button" class="metric-card metric-action ${kind}" data-priority="${action}"><strong>${value}</strong><span>${label}</span><small>${help}</small></button>`).join('');

  const priorities = [
    ['Produtos com erros obrigatórios', data.audit.errors.length, 'danger', 'Precisam ser corrigidos antes da publicação', 'errors'],
    ['Produtos sem estoque', data.noStock.length, 'danger', 'Afetam disponibilidade no catálogo', 'no-stock'],
    ['Produtos com estoque baixo', data.lowStock.length, 'warning', 'Estoque entre 1 e 5 unidades', 'low-stock'],
    ['Produtos com avisos', data.audit.warnings.length, 'warning', 'Cadastro pode ser melhorado sem bloquear', 'warnings'],
  ];
  elements.priorityList.innerHTML = priorities.map(([label, count, kind, help, action]) => `<button type="button" class="priority-row priority-action" data-priority="${action}"><div><strong>${label}</strong><small>${help}</small></div><span class="badge ${kind}">${count}</span></button>`).join('');

  const lastPublication = store.state.lastPublication;
  elements.systemList.innerHTML = [
    ['Firebase produtos', `${data.products.length} registros confirmados`, store.state.firebaseVerified ? 'success' : 'warning'],
    ['Gravações da V2', store.state.config.writeMode ? 'Ativadas para teste controlado' : 'Bloqueadas por segurança', store.state.config.writeMode ? 'warning' : 'success'],
    ['Alterações locais', `${store.state.dirtyProducts.size} produto(s) pendente(s)`, store.state.dirtyProducts.size ? 'warning' : 'success'],
    ['Última publicação V2', lastPublication ? formatDateTime(lastPublication.publishedAt) : 'Nenhuma publicação feita', lastPublication ? 'success' : 'neutral'],
    ['Admin atual', 'producao/index.html preservado', 'success'],
  ].map(([label, help, kind]) => `<div class="system-row"><div><strong>${label}</strong><small>${help}</small></div><span class="badge ${kind}">${kind === 'success' ? 'OK' : kind === 'neutral' ? '—' : 'Atenção'}</span></div>`).join('');
  renderDiagnostics();
}

function renderDiagnostics() {
  if (!elements.diagnosticList) return;
  const audit = currentAudit();
  const config = store.state.config;
  const githubReady = Boolean(config.githubToken && config.githubOwner && config.githubRepo && config.githubBranch && config.productsHomePath && config.catalogVersionPath);
  const makeChannels = [config.makeTextWebhookUrl || config.makeAiWebhookUrl, config.makeImageWebhookUrl || config.makeAiWebhookUrl, config.makeInstagramKitWebhookUrl].filter(Boolean).length;
  elements.diagnosticList.innerHTML = [
    ['Fonte oficial', store.state.firebaseVerified ? `${store.state.products.length} produtos confirmados pelo Firebase` : 'Firebase ainda não confirmado', store.state.firebaseVerified ? 'success' : 'warning'],
    ['Auditoria obrigatória', audit.errors.length ? `${audit.errors.length} produto(s) com erro` : 'Nenhum erro obrigatório', audit.errors.length ? 'danger' : 'success'],
    ['Qualidade do cadastro', audit.warnings.length ? `${audit.warnings.length} produto(s) com avisos` : 'Nenhum aviso', audit.warnings.length ? 'warning' : 'success'],
    ['GitHub', githubReady ? `${config.githubOwner}/${config.githubRepo} · ${config.githubBranch}` : 'Configuração incompleta', githubReady ? 'success' : 'warning'],
    ['Automações Make', makeChannels ? `${makeChannels} de 3 canais configurados` : 'Nenhum webhook configurado', makeChannels === 3 ? 'success' : 'warning'],
    ['Modo de gravação', config.writeMode ? 'Ativado neste navegador' : 'Bloqueado', config.writeMode ? 'warning' : 'success'],
  ].map(([label, help, kind]) => `<div class="system-row"><div><strong>${label}</strong><small>${help}</small></div><span class="badge ${kind}">${kind === 'success' ? 'OK' : kind === 'danger' ? 'Erro' : 'Atenção'}</span></div>`).join('');
}

async function refreshData() {
  if (store.state.loading) return;
  if (store.state.dirtyProducts.size && !confirm('Existem alterações locais na V2. Atualizar os dados irá descartá-las. Continuar?')) return;
  store.setError('');
  store.setLoading(true);
  store.state.firebaseVerified = false;
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

async function saveOne(product, { silent = false } = {}) {
  const key = product.firebaseKey || product.id || product.codigo;
  const snapshot = store.state.remoteSnapshots.get(String(key));
  const validation = validateProduct(product, store.state.config);
  if (validation.errors.length) throw new Error(`${product.nome || product.codigo}: ${validation.errors.join(', ')}.`);
  if (!silent) {
    elements.saveProductButton.disabled = true;
    elements.saveProductButton.textContent = 'Salvando…';
  }
  try {
    const saved = await saveProduct(store.state.config, validation.product, snapshot);
    store.markProductSaved(key, saved, { emit: !silent });
    if (!silent) {
      productsModule.renderDirty();
      renderDashboard();
      renderStatus();
    }
    if (!silent) toast(`${saved.nome || saved.codigo} salvo com segurança.`, 'success');
    return saved;
  } catch (error) {
    console.error(error);
    if (!silent) toast(error?.message || String(error), 'error');
    throw error;
  } finally {
    if (!silent) {
      elements.saveProductButton.disabled = false;
      elements.saveProductButton.textContent = 'Salvar produto';
      const current = store.getProduct(key);
      if (current) productsModule.renderValidation(current);
    }
  }
}

async function uploadProductImage(product, dataUrl) {
  const config = store.state.config;
  const folder = text(config.githubImagesPath || DEFAULT_CONFIG.githubImagesPath).replace(/^\/+|\/+$/g, '');
  const name = `${slug(productCode(product) || productName(product))}-editada-${Date.now()}.webp`;
  return upsertBase64File(config, `${folder}/${name}`, dataUrl, `Atualiza imagem editada de ${productName(product)} pelo Admin V2`);
}

function persistPublication(publication) {
  localStorage.setItem(STORAGE_KEYS.lastPublication, JSON.stringify(publication));
  renderDashboard();
  productsModule.render();
}

let makeModule;
const productsModule = new ProductsModule({
  store,
  elements,
  onSave: saveOne,
  onToast: toast,
  onMakeAction: (action, key) => makeModule?.runProductAction(action, key),
  onUploadImage: uploadProductImage,
});
makeModule = new MakeModule({ store, productsModule, onToast: toast });
const publishModule = new PublishModule({ store, elements, onSaveProduct: saveOne, onToast: toast, onPublished: persistPublication });
publishModule.bindIssueNavigation(key => {
  setRoute('products');
  productsModule.openEditor(key);
});
elements.closePublishReviewFooterButton.addEventListener('click', () => publishModule.close());

function openPriority(action) {
  setRoute('products');
  const presets = {
    all: {},
    errors: { quality: 'errors' },
    warnings: { quality: 'warnings' },
    'no-stock': { status: 'no-stock', sort: 'stock-asc' },
    'low-stock': { status: 'low-stock', sort: 'stock-asc' },
  };
  productsModule.applyPreset(presets[action] || {});
  document.querySelector('[data-view="products"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function syncSettingsUi() {
  const config = store.state.config;
  elements.firebaseUrlSetting.value = config.firebaseUrl;
  elements.productsNodeSetting.value = config.productsNode;
  elements.writeModeSetting.checked = Boolean(config.writeMode);
  elements.githubTokenSetting.value = config.githubToken || '';
  elements.githubOwnerSetting.value = config.githubOwner || '';
  elements.githubRepoSetting.value = config.githubRepo || '';
  elements.githubBranchSetting.value = config.githubBranch || '';
  elements.productsHomePathSetting.value = config.productsHomePath || '';
  elements.catalogVersionPathSetting.value = config.catalogVersionPath || '';
  elements.githubImagesPathSetting.value = config.githubImagesPath || DEFAULT_CONFIG.githubImagesPath;
  elements.githubKitImagesPathSetting.value = config.githubKitImagesPath || DEFAULT_CONFIG.githubKitImagesPath;
  elements.makeTextWebhookSetting.value = config.makeTextWebhookUrl || config.makeAiWebhookUrl || '';
  elements.makeImageWebhookSetting.value = config.makeImageWebhookUrl || config.makeAiWebhookUrl || '';
  elements.makeInstagramKitWebhookSetting.value = config.makeInstagramKitWebhookUrl || '';
}

function saveConfigFromUi() {
  const config = store.state.config;
  config.firebaseUrl = text(elements.firebaseUrlSetting.value) || DEFAULT_CONFIG.firebaseUrl;
  config.productsNode = text(elements.productsNodeSetting.value) || DEFAULT_CONFIG.productsNode;
  config.writeMode = elements.writeModeSetting.checked;
  config.githubToken = text(elements.githubTokenSetting.value);
  config.githubOwner = text(elements.githubOwnerSetting.value) || DEFAULT_CONFIG.githubOwner;
  config.githubRepo = text(elements.githubRepoSetting.value) || DEFAULT_CONFIG.githubRepo;
  config.githubBranch = text(elements.githubBranchSetting.value) || DEFAULT_CONFIG.githubBranch;
  config.productsHomePath = text(elements.productsHomePathSetting.value) || DEFAULT_CONFIG.productsHomePath;
  config.catalogVersionPath = text(elements.catalogVersionPathSetting.value) || DEFAULT_CONFIG.catalogVersionPath;
  config.githubImagesPath = text(elements.githubImagesPathSetting.value) || DEFAULT_CONFIG.githubImagesPath;
  config.githubKitImagesPath = text(elements.githubKitImagesPathSetting.value) || DEFAULT_CONFIG.githubKitImagesPath;
  config.makeTextWebhookUrl = text(elements.makeTextWebhookSetting.value);
  config.makeImageWebhookUrl = text(elements.makeImageWebhookSetting.value);
  config.makeInstagramKitWebhookUrl = text(elements.makeInstagramKitWebhookSetting.value);
  localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(config));
  renderStatus();
  renderDashboard();
  const selected = store.getProduct(store.state.selectedProductKey);
  if (selected) productsModule.renderValidation(selected);
  toast('Configurações da V2 salvas neste navegador.', 'success');
}

async function testGithub() {
  elements.testGithubButton.disabled = true;
  elements.testGithubButton.textContent = 'Testando…';
  try {
    saveConfigFromUi();
    const result = await testGithubConnection(store.state.config);
    toast(`GitHub conectado: ${result.repository}.`, 'success');
  } catch (error) {
    console.error(error);
    toast(error?.message || String(error), 'error');
  } finally {
    elements.testGithubButton.disabled = false;
    elements.testGithubButton.textContent = 'Testar';
  }
}

elements.mainNav.addEventListener('click', event => {
  const button = event.target.closest('[data-route]');
  if (button) setRoute(button.dataset.route);
});
elements.dashboardMetrics.addEventListener('click', event => {
  const button = event.target.closest('[data-priority]');
  if (button) openPriority(button.dataset.priority);
});
elements.priorityList.addEventListener('click', event => {
  const button = event.target.closest('[data-priority]');
  if (button) openPriority(button.dataset.priority);
});
elements.reloadButton.addEventListener('click', refreshData);
elements.mobileMenuButton.addEventListener('click', () => {
  elements.sidebar.classList.add('open');
  elements.mobileOverlay.hidden = false;
});
elements.mobileOverlay.addEventListener('click', () => {
  if (elements.productEditor.classList.contains('open')) productsModule.closeEditor();
  elements.sidebar.classList.remove('open');
  elements.mobileOverlay.hidden = true;
});

[
  elements.firebaseUrlSetting, elements.productsNodeSetting, elements.writeModeSetting, elements.githubTokenSetting,
  elements.githubOwnerSetting, elements.githubRepoSetting, elements.githubBranchSetting, elements.productsHomePathSetting,
  elements.catalogVersionPathSetting, elements.githubImagesPathSetting, elements.githubKitImagesPathSetting,
  elements.makeTextWebhookSetting, elements.makeImageWebhookSetting, elements.makeInstagramKitWebhookSetting,
].forEach(input => input.addEventListener('change', saveConfigFromUi));
elements.testGithubButton.addEventListener('click', testGithub);

store.addEventListener('status', renderStatus);
store.addEventListener('dirty', () => {
  productsModule.renderDirty();
  renderStatus();
  renderDashboard();
});
store.addEventListener('publication', renderDashboard);
window.addEventListener('admin-v2-open-product', event => {
  const key = text(event.detail?.key);
  if (!key) return;
  setRoute('products');
  productsModule.openEditor(key);
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
