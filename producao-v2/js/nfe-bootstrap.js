import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { productKey } from './core/utils.js';
import { NfeAdvancedModule } from './modules/nfe-advanced.js?admin_build=20260726-admin-v13-xml-editor-parity';
import './nfe-editor-parity.js?admin_build=20260726-admin-v13-xml-editor-parity';
import { loadProducts } from './services/firebase.js';

const BUILD = '20260726-admin-v13-xml-editor-parity';

function loadConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}') };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function persistConfig(patch) {
  const next = { ...loadConfig(), ...(patch || {}) };
  localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(next));
  return next;
}

function ensureStylesheet(selector, href, datasetName) {
  if (document.querySelector(selector)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset[datasetName] = '1';
  document.head.appendChild(link);
}

function installStylesheet() {
  ensureStylesheet('link[data-admin-v2-nfe]', `./assets/nfe.css?admin_build=${BUILD}`, 'adminV2Nfe');
  ensureStylesheet('link[data-admin-v2-nfe-editor-parity]', `./assets/nfe-editor-parity.css?admin_build=${BUILD}`, 'adminV2NfeEditorParity');
}

function panelMarkup() {
  return `<section class="panel nfe-workspace" id="nfeWorkspace">
    <div class="panel-header nfe-panel-header">
      <div><span class="eyebrow">Entrada real com cadastro completo</span><h2>Entrada de NF-e</h2><p>Leia o XML, edite o produto com os mesmos recursos do cadastro manual e importe diretamente no Firebase.</p></div>
      <div class="nfe-header-actions"><span class="badge info" id="nfeDataStatus">Catálogo ainda não carregado</span><label class="button primary nfe-file-button" id="nfeFileLabel">Selecionar XML<input id="nfeFile" type="file" accept=".xml,text/xml,application/xml" hidden></label></div>
    </div>
    <div class="nfe-input-area">
      <div class="nfe-input-grid">
        <label>Chave da NF-e — leitor ou digitação<input id="nfeAccessKey" inputmode="numeric" maxlength="44" placeholder="44 números"></label>
        <label>Margem sugerida para produtos novos<input id="nfeMargin" type="number" min="0" max="95" step="0.1" value="40"></label>
        <small class="field-help span-2" id="nfeKeyHelp">Opcional: escaneie a chave para conferir se ela corresponde ao XML.</small>
        <label>Validade global do lote<input id="nfeGlobalValidity" type="text" inputmode="numeric" maxlength="10" placeholder="DD/MM/AAAA"></label>
        <div class="nfe-global-validity-action"><button class="button secondary" id="nfeApplyGlobalValidityButton" type="button">Aplicar em todos</button></div>
        <label class="span-2">Ou cole o XML completo<textarea id="nfePaste" placeholder="Cole aqui o conteúdo completo da NF-e"></textarea></label>
      </div>
      <div class="nfe-input-actions"><button class="button secondary" id="nfeClearButton" type="button">Limpar</button><button class="button secondary" id="nfeExportButton" type="button" disabled>Exportar conferência</button><button class="button secondary" id="nfeRefreshSimulationButton" type="button" disabled>Recalcular conferência</button><button class="button primary" id="nfeReadPasteButton" type="button">Analisar XML colado</button></div>
      <div class="nfe-message neutral" id="nfeMessage">Selecione um XML para iniciar a conferência. Nenhuma gravação acontece antes do botão de importação.</div>
    </div>
    <div class="nfe-note" id="nfeNote"></div>
    <div class="attention-grid nfe-summary" id="nfeSummary"></div>
    <div class="nfe-items" id="nfeItems"></div>
    <div id="nfeSimulation"></div>
    <section class="panel nfe-import-panel">
      <div class="panel-header"><div><span class="eyebrow">Gravação real e transacional</span><h2>Importar a NF-e no estoque</h2><p>O XML é arquivado, cada produto é salvo no Firebase e o registro fiscal é atualizado após cada item.</p></div><span class="badge success" id="nfeImportModeStatus">Importação bloqueada</span></div>
      <div class="nfe-import-body">
        <div class="nfe-import-safety"><strong>Proteções ativas</strong><span>Reconsulta do produto remoto</span><span>Bloqueio de conflito de estoque</span><span>Registro parcial após cada item</span><span>Conciliação por chave e grupo</span></div>
        <label class="nfe-import-confirm"><input id="nfeConfirmImport" type="checkbox"><span><strong>Revisei os produtos e confirmo a importação real</strong><small id="nfeImportHelp">Leia uma NF-e para gerar a conferência.</small></span></label>
        <p class="nfe-progress" id="nfeProgress"></p>
      </div>
      <div class="nfe-import-footer"><button class="button primary" id="nfeExecuteImportButton" type="button" disabled>Importar NF-e no estoque</button></div>
    </section>
  </section>`;
}

function settingsMarkup() {
  return `<section class="panel" id="nfeSafetySettings">
    <div class="panel-header"><div><h2>Permissão da Entrada de NF-e</h2><p>Trava independente para impedir importações acidentais.</p></div><span class="badge success" id="nfeSettingsStatus">Bloqueada</span></div>
    <div class="form-stack">
      <label class="switch-row"><span><strong>Permitir importação de NF-e</strong><small>O modo geral “Permitir gravações” também precisa estar ativo.</small></span><input id="nfeImportModeSetting" type="checkbox"></label>
      <p class="muted nfe-settings-note">Ativar esta chave não importa nada sozinho. A nota ainda exige conferência sem erros, confirmação e clique no botão final.</p>
    </div>
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

function installSettings() {
  const settingsGrid = document.querySelector('[data-view="settings"] .settings-grid');
  if (!settingsGrid || document.getElementById('nfeSafetySettings')) return;
  const danger = settingsGrid.querySelector('.danger-panel');
  if (danger) danger.insertAdjacentHTML('beforebegin', settingsMarkup());
  else settingsGrid.insertAdjacentHTML('beforeend', settingsMarkup());
  const input = document.getElementById('nfeImportModeSetting');
  const status = document.getElementById('nfeSettingsStatus');
  const sync = () => {
    const config = loadConfig();
    input.checked = Boolean(config.nfeImportMode);
    status.className = `badge ${config.nfeImportMode ? 'warning' : 'success'}`;
    status.textContent = config.nfeImportMode ? 'Habilitada' : 'Bloqueada';
  };
  input.addEventListener('change', () => {
    persistConfig({ nfeImportMode: input.checked });
    sync();
    document.getElementById('nfeConfirmImport')?.dispatchEvent(new Event('change'));
    toast(input.checked ? 'Importação real de NF-e habilitada neste navegador.' : 'Importação de NF-e bloqueada.', input.checked ? 'error' : 'success');
  });
  sync();
}

function start() {
  const operations = document.querySelector('[data-view="operations"]');
  if (!operations || document.getElementById('nfeWorkspace')) return;
  installStylesheet();
  installSettings();
  operations.insertAdjacentHTML('afterbegin', panelMarkup());

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
    dataStatus.textContent = 'Carregando catálogo…';
    loadingPromise = loadProducts(simpleStore.state.config, { force })
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
        dataStatus.textContent = 'Falha no catálogo';
        throw error;
      })
      .finally(() => { loadingPromise = null; });
    return loadingPromise;
  }

  const ids = [
    'nfeFileLabel', 'nfeFile', 'nfeAccessKey', 'nfeMargin', 'nfeGlobalValidity', 'nfeApplyGlobalValidityButton',
    'nfeKeyHelp', 'nfePaste', 'nfeClearButton', 'nfeExportButton', 'nfeRefreshSimulationButton',
    'nfeReadPasteButton', 'nfeMessage', 'nfeNote', 'nfeSummary', 'nfeItems', 'nfeSimulation',
    'nfeImportModeStatus', 'nfeConfirmImport', 'nfeImportHelp', 'nfeProgress', 'nfeExecuteImportButton',
  ];
  const elements = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  nfeModule = new NfeAdvancedModule({
    store: simpleStore,
    elements,
    onToast: toast,
    onBeforeAnalyze: () => ensureProducts(false),
    onAfterImport: async () => {
      await ensureProducts(true);
      toast('Catálogo recarregado após a importação.', 'success');
    },
    reloadConfig: loadConfig,
  });

  window.addEventListener('admin-v2-route', event => {
    if (event.detail?.route === 'nfe') ensureProducts(false).catch(error => toast(error?.message || String(error), 'error'));
  });
  document.getElementById('reloadButton')?.addEventListener('click', () => {
    if (window.adminV2CurrentRoute?.() !== 'nfe') return;
    loadedAt = 0;
    ensureProducts(true).catch(error => toast(error?.message || String(error), 'error'));
  });
  if (window.adminV2CurrentRoute?.() === 'nfe') ensureProducts(false).catch(error => toast(error?.message || String(error), 'error'));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
