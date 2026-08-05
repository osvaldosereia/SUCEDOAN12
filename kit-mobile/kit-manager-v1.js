import '../producao-v2/js/kit-lifecycle-admin.js?mobile_build=20260805-kit-manager-v1';
import '../producao-v2/js/collection-concurrency.js?mobile_build=20260805-kit-manager-v1';
import { installCollectionImageResolver } from '../producao-v2/js/collection-image-resolver.js';
import { CollectionsModule } from '../producao-v2/js/modules/collections.js';
import { loadProducts } from '../producao-v2/js/services/firebase.js';
import { loadCollections } from '../producao-v2/js/services/collections.js';

const STORAGE_KEY = 'da_admin_v2_config';
const BUILD = '2026-08-05-kit-manager-v1';
const DEFAULT_CONFIG = {
  firebaseUrl: 'https://cedar-chemist-310801-default-rtdb.firebaseio.com',
  productsNode: 'produtos',
  writeMode: true,
  collectionsWriteMode: true,
  githubToken: '',
  githubOwner: 'osvaldosereia',
  githubRepo: 'SUCEDOAN12',
  githubBranch: 'main',
  basketsPath: 'site/produtos-cesta-basica.json',
  kitsPath: 'site/kits.json',
  kitQueuePath: 'carrosseis-kits/fila.json',
  catalogVersionPath: 'catalog-version.json',
  githubKitImagesPath: 'site/img/kits',
  makeTextWebhookUrl: '',
  makeImageWebhookUrl: '',
  makeInstagramKitWebhookUrl: '',
  makeAiWebhookUrl: '',
};

const $ = selector => document.querySelector(selector);
let moduleInstance = null;
let loadedOnce = false;
let loadingPromise = null;

function loadConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function toast(message, type = '') {
  const node = $('#toast');
  if (!node) return;
  const normalized = String(message || '').trim();
  if (!normalized) return;
  node.textContent = normalized;
  node.className = `toast show ${type}`.trim();
  clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => {
    if (node.textContent === normalized) node.className = 'toast';
  }, type === 'error' ? 6500 : 3800);
}

function managerMarkup() {
  return `<section class="kit-manager-shell collections-workspace" data-build="${BUILD}">
    <header class="kit-manager-head">
      <div><span class="eyebrow">Gerenciamento completo</span><h2>Todos os kits promocionais</h2><p>Edite os mesmos campos, produtos, substitutos, preços, validade, estoque, IA e Instagram disponíveis no Admin Produção V2.</p></div>
      <span class="badge warning" id="collectionDataStatus">Carregando…</span>
    </header>
    <div class="collection-tabs" id="collectionTabs" aria-label="Tipo de coleção">
      <button class="active" type="button" data-collection-type="kit">Kits promocionais</button>
    </div>
    <div class="attention-grid collection-summary" id="collectionSummary"></div>
    <div class="kit-manager-tools">
      <div class="kit-manager-search"><span aria-hidden="true">⌕</span><input id="kitManagerSearch" type="search" placeholder="Buscar kit por nome, código ou status" autocomplete="off"></div>
      <button class="button secondary" id="kitManagerReload" type="button">Atualizar</button>
      <button class="button primary" id="collectionCreate" type="button">Novo kit completo</button>
    </div>
    <div class="collection-cards" id="collectionCards"></div>
  </section>`;
}

function editorMarkup() {
  return `<div class="collection-backdrop" id="collectionBackdrop" hidden></div>
    <aside class="editor-drawer collection-editor" id="collectionEditor" aria-hidden="true">
      <div class="editor-header"><div><span class="eyebrow" id="collectionEditorType">Kit promocional</span><h2 id="collectionEditorTitle">Cadastro</h2><p>O mesmo editor do Admin V2, adaptado para celular.</p></div><button class="icon-button" id="collectionClose" type="button" aria-label="Fechar">×</button></div>
      <div class="editor-body collection-editor-body">
        <section id="collectionForm"></section>
        <section class="collection-composition"><div class="collection-section-head"><div><h3>Composição do kit</h3><p>Adicione produtos, ajuste quantidades, produto principal e até dois substitutos.</p></div></div><div id="collectionItems"></div><div class="collection-product-search"><label>Adicionar ou substituir produto<input id="collectionProductSearch" type="search" placeholder="Nome, código ou EAN"></label><div id="collectionSearchResults"></div></div></section>
        <section class="collection-audit" id="collectionAudit"></section>
        <p class="muted" id="collectionSafety"></p>
      </div>
      <div class="editor-footer"><button class="button secondary" id="collectionCancel" type="button">Cancelar</button><button class="button primary" id="collectionSave" type="button" disabled>Salvar e publicar</button></div>
    </aside>`;
}

function applySearch() {
  const query = String($('#kitManagerSearch')?.value || '').trim().toLocaleLowerCase('pt-BR');
  document.querySelectorAll('#collectionCards .collection-card').forEach(card => {
    const visible = !query || card.textContent.toLocaleLowerCase('pt-BR').includes(query);
    card.hidden = !visible;
  });
}

async function reload() {
  if (loadingPromise) return loadingPromise;
  const status = $('#collectionDataStatus');
  if (status) {
    status.className = 'badge warning';
    status.textContent = 'Atualizando…';
  }

  loadingPromise = (async () => {
    try {
      const config = loadConfig();
      const [products, data] = await Promise.all([loadProducts(config), loadCollections(config)]);
      const store = moduleInstance.store;
      store.state.products = products;
      store.state.baskets = data.baskets || [];
      store.state.kits = data.kits || [];
      store.state.queue = data.queue || [];
      moduleInstance.type = 'kit';
      moduleInstance.render();
      loadedOnce = true;
      const count = store.state.kits.length;
      $('#managerKitsCount').textContent = String(count);
      $('#kitsChip').textContent = `${count} kits`;
      if (status) {
        status.className = 'badge success';
        status.textContent = `${count} kits carregados`;
      }
      applySearch();
      return data;
    } catch (error) {
      if (status) {
        status.className = 'badge danger';
        status.textContent = 'Falha ao carregar';
      }
      throw error;
    } finally {
      loadingPromise = null;
    }
  })();

  return loadingPromise;
}

function activateWorkspace(name) {
  const managerMode = name === 'manage';
  $('#kitCreateWorkspace').hidden = managerMode;
  $('#kitManageWorkspace').hidden = !managerMode;
  document.body.classList.toggle('kit-manager-mode', managerMode);
  document.querySelectorAll('[data-kit-workspace]').forEach(button => {
    const active = button.dataset.kitWorkspace === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  if (managerMode) {
    reload().catch(error => toast(error?.message || String(error), 'error'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

async function installEditorEnhancements() {
  await Promise.all([
    import('../producao-v2/js/kit-editor-flow-v2.js?mobile_build=20260805-kit-manager-v1'),
    import('../producao-v2/js/kit-editor-order-v3.js?mobile_build=20260805-kit-manager-v1'),
  ]).catch(error => console.error('Falha ao carregar os complementos do editor de kits.', error));
}

function bindWorkspaceTabs() {
  document.querySelectorAll('[data-kit-workspace]').forEach(button => {
    button.addEventListener('click', () => activateWorkspace(button.dataset.kitWorkspace));
  });
}

async function start() {
  const host = $('#kitManageWorkspace');
  if (!host || host.dataset.initialized === '1') return;
  host.dataset.initialized = '1';
  host.innerHTML = managerMarkup();
  document.body.insertAdjacentHTML('beforeend', editorMarkup());
  installCollectionImageResolver(document);

  const store = { state: { products: [], baskets: [], kits: [], queue: [] } };
  const ids = [
    'collectionDataStatus', 'collectionTabs', 'collectionSummary', 'collectionCreate', 'collectionCards',
    'collectionBackdrop', 'collectionEditor', 'collectionEditorType', 'collectionEditorTitle', 'collectionClose',
    'collectionCancel', 'collectionSave', 'collectionForm', 'collectionItems', 'collectionProductSearch',
    'collectionSearchResults', 'collectionAudit', 'collectionSafety',
  ];
  const elements = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  moduleInstance = new CollectionsModule({ store, elements, onToast: toast, onReload: reload, reloadConfig: loadConfig });
  moduleInstance.type = 'kit';
  window.__adminV2CollectionsModule = moduleInstance;

  elements.collectionProductSearch.closest('.collection-product-search')?.addEventListener('click', event => {
    const button = event.target.closest('[data-collection-cancel-replace]');
    if (!button) return;
    moduleInstance.replaceTarget = null;
    elements.collectionProductSearch.value = '';
    elements.collectionSearchResults.innerHTML = '';
    moduleInstance.renderSearchMode();
  });
  elements.collectionBackdrop.addEventListener('click', () => moduleInstance.closeEditor());
  $('#kitManagerReload').addEventListener('click', () => reload().catch(error => toast(error?.message || String(error), 'error')));
  $('#kitManagerSearch').addEventListener('input', applySearch);
  bindWorkspaceTabs();
  await installEditorEnhancements();

  moduleInstance.render();
  if (!$('#kitManageWorkspace').hidden) {
    await reload().catch(error => toast(error?.message || String(error), 'error'));
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();

export { activateWorkspace, reload };
