import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { QuickReadModule } from './modules/quick-read.js';
import { loadProducts } from './services/firebase.js';

const BUILD = '20260725-admin-v12';

function loadConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}') };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function installCss() {
  if (document.querySelector('link[data-admin-v2-quick-read]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `./assets/quick-read.css?admin_build=${BUILD}`;
  link.dataset.adminV2QuickRead = '1';
  document.head.appendChild(link);
}

function panelMarkup() {
  return `<section class="panel quick-read-workspace" id="quickReadWorkspace"><div class="panel-header"><div><span class="eyebrow">Leitor/pistola · somente consulta</span><h2>Leitura rápida</h2><p>EAN, código ou nome com estoque, validade, lotes e localização em uma única tela.</p></div><span class="badge info" id="quickReadDataStatus">Carregando…</span></div><div class="quick-read-input"><div class="search-field"><span>▦</span><input id="quickReadInput" inputmode="numeric" autocomplete="off" placeholder="Leia o código ou digite para buscar"></div><button class="button secondary" id="quickReadClear" type="button">Limpar</button><button class="button primary" id="quickReadButton" type="button">Consultar</button></div><div id="quickReadResult"></div></section>`;
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

function start() {
  const view = document.querySelector('[data-view="operations"]');
  if (!view || document.getElementById('quickReadWorkspace')) return;
  installCss();
  view.querySelector('.module-cards')?.insertAdjacentHTML('afterend', panelMarkup());
  const store = { state: { products: [] } };
  let module;

  async function reload() {
    const status = document.getElementById('quickReadDataStatus');
    status.className = 'badge warning';
    status.textContent = 'Atualizando…';
    try {
      store.state.products = await loadProducts(loadConfig());
      status.className = 'badge success';
      status.textContent = `${store.state.products.length} produtos`;
      return store.state.products;
    } catch (error) {
      status.className = 'badge danger';
      status.textContent = 'Falha no Firebase';
      throw error;
    }
  }

  const ids = ['quickReadDataStatus', 'quickReadInput', 'quickReadClear', 'quickReadButton', 'quickReadResult'];
  const elements = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  module = new QuickReadModule({ store, elements, onToast: toast });
  reload().then(() => module.focus()).catch(error => toast(error?.message || String(error), 'error'));
  document.getElementById('reloadButton')?.addEventListener('click', () => {
    if (window.adminV2CurrentRoute?.() === 'quick-read') reload().catch(() => {});
  });
  window.addEventListener('admin-v2-route', event => {
    if (event.detail?.route === 'quick-read') setTimeout(() => module.focus(), 80);
  });
  window.addEventListener('admin-v2-open-product', event => {
    const key = String(event.detail?.key || '');
    const product = store.state.products.find(row => String(row.firebaseKey || row.id || row.codigo) === key);
    const query = product?.codigo || product?.gtin || product?.ean || key;
    window.adminV2Navigate?.('products');
    const input = document.getElementById('productSearch');
    if (!input) return;
    input.value = query;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    setTimeout(() => document.querySelector(`[data-product-key="${CSS.escape(key)}"]`)?.click(), 320);
  });
  window.addEventListener('admin-v2-open-stock', event => {
    const key = String(event.detail?.key || '');
    const product = store.state.products.find(row => String(row.firebaseKey || row.id || row.codigo) === key);
    const query = product?.codigo || product?.gtin || product?.ean || key;
    window.adminV2Navigate?.('stock');
    const statusFilter = document.getElementById('stockStatusFilter');
    const windowFilter = document.getElementById('stockWindowFilter');
    if (statusFilter) { statusFilter.value = ''; statusFilter.dispatchEvent(new Event('change', { bubbles: true })); }
    if (windowFilter) { windowFilter.value = ''; windowFilter.dispatchEvent(new Event('change', { bubbles: true })); }
    const input = document.getElementById('stockSearch');
    if (!input) return;
    input.value = query;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    setTimeout(() => document.querySelector(`[data-stock-edit="${CSS.escape(key)}"]`)?.click(), 340);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();