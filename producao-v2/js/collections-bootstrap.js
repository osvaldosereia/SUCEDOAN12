import './offers-bootstrap.js';
import './offer-manager.js';
import './commerce-enhancements.js';
import './instagram-queue-review.js';
import './basket-context.js';
import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { CollectionsModule } from './modules/collections.js';
import { loadProducts } from './services/firebase.js';
import { loadCollections } from './services/collections.js';

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
  if (document.querySelector('link[data-admin-v2-collections]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './assets/collections.css';
  link.dataset.adminV2Collections = '1';
  document.head.appendChild(link);
}

function panelMarkup() {
  return `<section class="panel collections-workspace" id="collectionsWorkspace"><div class="panel-header"><div><span class="eyebrow">Coleções comerciais</span><h2>Cestas e kits</h2><p>Composição visual com troca rápida, estoque, substitutos e automações protegidas.</p></div><span class="badge info" id="collectionDataStatus">Carregando…</span></div><div class="collection-tabs" id="collectionTabs"><button class="active" type="button" data-collection-type="basket">Cestas básicas</button><button type="button" data-collection-type="kit">Kits promocionais</button></div><div class="attention-grid collection-summary" id="collectionSummary"></div><div class="collection-toolbar"><button class="button primary" id="collectionCreate" type="button">Nova cesta</button></div><div class="collection-cards" id="collectionCards"></div></section>`;
}

function editorMarkup() {
  return `<div class="collection-backdrop" id="collectionBackdrop" hidden></div><aside class="editor-drawer collection-editor" id="collectionEditor" aria-hidden="true"><div class="editor-header"><div><span class="eyebrow" id="collectionEditorType">Coleção</span><h2 id="collectionEditorTitle">Cadastro</h2><p>Alterações são publicadas somente após auditoria sem erros.</p></div><button class="icon-button" id="collectionClose" type="button" aria-label="Fechar">×</button></div><div class="editor-body collection-editor-body"><section id="collectionForm"></section><section class="collection-composition"><div class="collection-section-head"><div><h3>Composição</h3><p>Veja fotos, estoque e troque cada item no próprio local sem perder a posição.</p></div></div><div id="collectionItems"></div><div class="collection-product-search"><label>Adicionar produto<input id="collectionProductSearch" type="search" placeholder="Nome, código ou EAN"></label><div id="collectionSearchResults"></div></div></section><section class="collection-audit" id="collectionAudit"></section><p class="muted" id="collectionSafety"></p></div><div class="editor-footer"><button class="button secondary" id="collectionCancel" type="button">Cancelar</button><button class="button primary" id="collectionSave" type="button" disabled>Salvar e publicar</button></div></aside>`;
}

function installSettings() {
  const grid = document.querySelector('[data-view="settings"] .settings-grid');
  if (!grid || document.getElementById('collectionsSafetySettings')) return;
  const html = `<section class="panel span-all-settings" id="collectionsSafetySettings"><div class="panel-header"><div><h2>Segurança de cestas e kits</h2><p>Publicação independente dos arquivos comerciais.</p></div><span class="badge success" id="collectionsSettingsStatus">Bloqueada</span></div><div class="form-stack"><label class="switch-row"><span><strong>Permitir publicação de cestas e kits</strong><small>Também exige o modo geral de gravação e token GitHub.</small></span><input id="collectionsWriteModeSetting" type="checkbox"></label></div></section>`;
  const danger = grid.querySelector('.danger-panel');
  if (danger) danger.insertAdjacentHTML('beforebegin', html);
  else grid.insertAdjacentHTML('beforeend', html);
  const input = document.getElementById('collectionsWriteModeSetting');
  const status = document.getElementById('collectionsSettingsStatus');
  const sync = () => {
    const config = loadConfig();
    input.checked = Boolean(config.collectionsWriteMode);
    status.className = `badge ${config.collectionsWriteMode ? 'warning' : 'success'}`;
    status.textContent = config.collectionsWriteMode ? 'Habilitada para teste' : 'Bloqueada';
  };
  input.addEventListener('change', () => {
    saveConfig({ collectionsWriteMode: input.checked });
    sync();
  });
  sync();
}

function toast(message, type = '') {
  const region = document.getElementById('toastRegion');
  if (!region) return;
  const normalized = String(message || '').trim();
  if (!normalized) return;
  const duplicate = [...region.querySelectorAll('.toast')].some(node => node.textContent === normalized);
  if (duplicate) return;
  const node = document.createElement('div');
  node.className = `toast ${type}`.trim();
  node.textContent = normalized;
  region.appendChild(node);
  setTimeout(() => node.remove(), type === 'error' ? 6500 : 3500);
}

function installErrorGuard() {
  if (window.__adminV2ErrorGuardInstalled) return;
  window.__adminV2ErrorGuardInstalled = true;
  window.addEventListener('unhandledrejection', event => {
    const message = event.reason?.message || String(event.reason || 'Falha inesperada na operação.');
    toast(message, 'error');
    event.preventDefault();
  });
  window.addEventListener('error', event => {
    if (!event.error) return;
    toast(event.error?.message || event.message, 'error');
  });
}

function start() {
  const view = document.querySelector('[data-view="promotions"]');
  if (!view || document.getElementById('collectionsWorkspace')) return;
  installCss();
  installSettings();
  installErrorGuard();
  view.insertAdjacentHTML('afterbegin', panelMarkup());
  document.body.insertAdjacentHTML('beforeend', editorMarkup());

  const store = { state: { products: [], baskets: [], kits: [], queue: [] } };
  let module;
  async function reload() {
    const status = document.getElementById('collectionDataStatus');
    status.className = 'badge warning';
    status.textContent = 'Atualizando…';
    try {
      const config = loadConfig();
      const [products, data] = await Promise.all([loadProducts(config), loadCollections(config)]);
      store.state.products = products;
      store.state.baskets = data.baskets;
      store.state.kits = data.kits;
      store.state.queue = data.queue;
      status.className = 'badge success';
      status.textContent = `${data.baskets.length} cestas · ${data.kits.length} kits`;
      module?.render();
      return data;
    } catch (error) {
      status.className = 'badge danger';
      status.textContent = 'Falha ao carregar';
      throw error;
    }
  }

  const ids = [
    'collectionDataStatus', 'collectionTabs', 'collectionSummary', 'collectionCreate', 'collectionCards',
    'collectionBackdrop', 'collectionEditor', 'collectionEditorType', 'collectionEditorTitle', 'collectionClose',
    'collectionCancel', 'collectionSave', 'collectionForm', 'collectionItems', 'collectionProductSearch',
    'collectionSearchResults', 'collectionAudit', 'collectionSafety',
  ];
  const elements = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  module = new CollectionsModule({ store, elements, onToast: toast, onReload: reload, reloadConfig: loadConfig });
  window.__adminV2CollectionsModule = module;
  elements.collectionProductSearch.closest('.collection-product-search')?.addEventListener('click', event => {
    const button = event.target.closest('[data-collection-cancel-replace]');
    if (!button) return;
    module.replaceTarget = null;
    elements.collectionProductSearch.value = '';
    elements.collectionSearchResults.innerHTML = '';
    module.renderSearchMode();
  });
  reload().catch(error => toast(error?.message || String(error), 'error'));
  elements.collectionBackdrop.addEventListener('click', () => module.closeEditor());
  document.getElementById('reloadButton')?.addEventListener('click', () => reload().catch(() => {}));
  const cards = view.querySelectorAll('.module-card');
  cards.forEach(card => {
    if (card.textContent.includes('Cestas básicas') || card.textContent.includes('Kits promocionais')) {
      const badge = card.querySelector('.badge');
      if (badge) {
        badge.className = 'badge success';
        badge.textContent = 'Editor ativo';
      }
    }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
