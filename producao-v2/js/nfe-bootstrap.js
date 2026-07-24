import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { productKey } from './core/utils.js';
import { NfeModule } from './modules/nfe.js';
import { loadProducts } from './services/firebase.js';

function loadConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}') };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function installStylesheet() {
  if (document.querySelector('link[data-admin-v2-nfe]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './assets/nfe.css';
  link.dataset.adminV2Nfe = '1';
  document.head.appendChild(link);
}

function panelMarkup() {
  return `<section class="panel nfe-workspace" id="nfeWorkspace">
    <div class="panel-header nfe-panel-header">
      <div><span class="eyebrow">Migração segura · fase de conferência</span><h2>Entrada de NF-e</h2><p>Leia e compare o XML com o Firebase. Esta tela não salva produtos, estoque, lotes ou notas.</p></div>
      <div class="nfe-header-actions"><span class="badge info" id="nfeDataStatus">Catálogo ainda não carregado</span><label class="button primary nfe-file-button" id="nfeFileLabel">Selecionar XML<input id="nfeFile" type="file" accept=".xml,text/xml,application/xml" hidden></label></div>
    </div>
    <div class="nfe-input-area">
      <div class="nfe-input-grid">
        <label>Chave da NF-e — leitor ou digitação<input id="nfeAccessKey" inputmode="numeric" maxlength="44" placeholder="44 números"></label>
        <label>Margem para simulação<input id="nfeMargin" type="number" min="0" max="95" step="0.1" value="40"></label>
        <small class="field-help span-2" id="nfeKeyHelp">Opcional: escaneie a chave para conferir se ela corresponde ao XML.</small>
        <label class="span-2">Ou cole o XML completo<textarea id="nfePaste" placeholder="Cole aqui o conteúdo completo da NF-e"></textarea></label>
      </div>
      <div class="nfe-input-actions"><button class="button secondary" id="nfeClearButton" type="button">Limpar</button><button class="button secondary" id="nfeExportButton" type="button" disabled>Exportar análise</button><button class="button primary" id="nfeReadPasteButton" type="button">Analisar XML colado</button></div>
      <div class="nfe-message neutral" id="nfeMessage">Selecione um XML para iniciar a conferência. Nenhuma gravação será realizada.</div>
    </div>
    <div class="nfe-note" id="nfeNote"></div>
    <div class="attention-grid nfe-summary" id="nfeSummary"></div>
    <div class="nfe-items" id="nfeItems"></div>
  </section>`;
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
  const operations = document.querySelector('[data-view="operations"]');
  if (!operations || document.getElementById('nfeWorkspace')) return;
  installStylesheet();
  operations.insertAdjacentHTML('afterbegin', panelMarkup());

  const oldCard = operations.querySelector('.module-card');
  if (oldCard) {
    oldCard.querySelector('p').textContent = 'A bancada de conferência acima já lê XML, calcula custos e verifica duplicidades sem salvar.';
    const badge = oldCard.querySelector('.badge');
    if (badge) {
      badge.className = 'badge success';
      badge.textContent = 'Somente leitura ativa';
    }
  }

  const simpleStore = {
    state: { config: loadConfig(), products: [] },
    getProduct(key) {
      return this.state.products.find(product => productKey(product) === String(key)) || null;
    },
  };
  let loadedAt = 0;
  let loadingPromise = null;
  const dataStatus = document.getElementById('nfeDataStatus');
  let nfeModule = null;

  async function ensureProducts(force = false) {
    simpleStore.state.config = loadConfig();
    if (!force && simpleStore.state.products.length && Date.now() - loadedAt < 300000) return simpleStore.state.products;
    if (loadingPromise) return loadingPromise;
    dataStatus.className = 'badge warning';
    dataStatus.textContent = 'Carregando Firebase…';
    loadingPromise = loadProducts(simpleStore.state.config)
      .then(products => {
        simpleStore.state.products = products;
        loadedAt = Date.now();
        dataStatus.className = 'badge success';
        dataStatus.textContent = `${products.length} produtos confirmados`;
        nfeModule?.refreshMatches();
        return products;
      })
      .catch(error => {
        dataStatus.className = 'badge danger';
        dataStatus.textContent = 'Falha no Firebase';
        throw error;
      })
      .finally(() => { loadingPromise = null; });
    return loadingPromise;
  }

  const ids = [
    'nfeFileLabel', 'nfeFile', 'nfeAccessKey', 'nfeMargin', 'nfeKeyHelp', 'nfePaste', 'nfeClearButton',
    'nfeExportButton', 'nfeReadPasteButton', 'nfeMessage', 'nfeNote', 'nfeSummary', 'nfeItems',
  ];
  const elements = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  nfeModule = new NfeModule({
    store: simpleStore,
    elements,
    onToast: toast,
    onBeforeAnalyze: () => ensureProducts(false),
  });

  document.getElementById('mainNav')?.addEventListener('click', event => {
    if (event.target.closest('[data-route="operations"]')) ensureProducts(false).catch(error => toast(error?.message || String(error), 'error'));
  });
  document.getElementById('reloadButton')?.addEventListener('click', () => {
    loadedAt = 0;
    if (document.querySelector('[data-view="operations"].active')) ensureProducts(true).catch(error => toast(error?.message || String(error), 'error'));
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
