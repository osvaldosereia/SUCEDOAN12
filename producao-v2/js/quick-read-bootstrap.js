import './diagnostics-bootstrap.js';
import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { QuickReadModule } from './modules/quick-read.js';
import { loadProducts } from './services/firebase.js';

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
  link.href = './assets/quick-read.css';
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
  document.getElementById('reloadButton')?.addEventListener('click', () => reload().catch(() => {}));
  document.getElementById('mainNav')?.addEventListener('click', event => {
    if (event.target.closest('[data-route="operations"]')) setTimeout(() => module.focus(), 80);
  });
  window.addEventListener('admin-v2-open-product', event => {
    const key = String(event.detail?.key || '');
    const product = store.state.products.find(row => String(row.firebaseKey || row.id || row.codigo) === key);
    const query = product?.codigo || product?.gtin || product?.ean || key;
    document.querySelector('[data-route="products"]')?.click();
    const input = document.getElementById('productSearch');
    if (!input) return;
    input.value = query;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    setTimeout(() => {
      const exact = document.querySelector(`[data-product-key="${CSS.escape(key)}"]`);
      exact?.click();
    }, 320);
  });
  const card = [...view.querySelectorAll('.module-card')].find(row => row.textContent.includes('Leitura rápida'));
  if (card) {
    card.querySelector('p').textContent = 'A consulta abaixo está ativa para leitor de código, sem alterar dados.';
    const badge = card.querySelector('.badge');
    if (badge) {
      badge.className = 'badge success';
      badge.textContent = 'Consulta ativa';
    }
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
