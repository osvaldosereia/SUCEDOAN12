import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { productKey } from './core/utils.js';
import { NfeAdvancedModule } from './modules/nfe-advanced.js';
import { loadProducts } from './services/firebase.js';

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
      <div><span class="eyebrow">Migração segura · simulação e transação protegida</span><h2>Entrada de NF-e</h2><p>Leia, compare e simule a nota. A importação permanece bloqueada por padrão e exige confirmação explícita.</p></div>
      <div class="nfe-header-actions"><span class="badge info" id="nfeDataStatus">Catálogo ainda não carregado</span><label class="button primary nfe-file-button" id="nfeFileLabel">Selecionar XML<input id="nfeFile" type="file" accept=".xml,text/xml,application/xml" hidden></label></div>
    </div>
    <div class="nfe-input-area">
      <div class="nfe-input-grid">
        <label>Chave da NF-e — leitor ou digitação<input id="nfeAccessKey" inputmode="numeric" maxlength="44" placeholder="44 números"></label>
        <label>Margem para simulação<input id="nfeMargin" type="number" min="0" max="95" step="0.1" value="40"></label>
        <small class="field-help span-2" id="nfeKeyHelp">Opcional: escaneie a chave para conferir se ela corresponde ao XML.</small>
        <label>Validade global do lote<input id="nfeGlobalValidity" type="text" inputmode="numeric" maxlength="10" placeholder="DD/MM/AAAA"></label>
        <div class="nfe-global-validity-action"><button class="button secondary" id="nfeApplyGlobalValidityButton" type="button">Aplicar em todos</button></div>
        <label class="span-2">Ou cole o XML completo<textarea id="nfePaste" placeholder="Cole aqui o conteúdo completo da NF-e"></textarea></label>
      </div>
      <div class="nfe-input-actions"><button class="button secondary" id="nfeClearButton" type="button">Limpar</button><button class="button secondary" id="nfeExportButton" type="button" disabled>Exportar simulação</button><button class="button secondary" id="nfeRefreshSimulationButton" type="button" disabled>Recalcular</button><button class="button primary" id="nfeReadPasteButton" type="button">Analisar XML colado</button></div>
      <div class="nfe-message neutral" id="nfeMessage">Selecione um XML para iniciar a conferência. Nenhuma gravação será realizada.</div>
    </div>
    <div class="nfe-note" id="nfeNote"></div>
    <div class="attention-grid nfe-summary" id="nfeSummary"></div>
    <div class="nfe-items" id="nfeItems"></div>
    <div id="nfeSimulation"></div>
    <section class="panel nfe-import-panel">
      <div class="panel-header"><div><span class="eyebrow">Importação transacional</span><h2>Aplicar a NF-e simulada</h2><p>O XML é arquivado, cada produto é salvo individualmente e o registro fiscal é atualizado após cada item.</p></div><span class="badge success" id="nfeImportModeStatus">Importação bloqueada</span></div>
      <div class="nfe-import-body">
        <div class="nfe-import-safety"><strong>Proteções ativas</strong><span>Reconsulta do produto remoto</span><span>Bloqueio de conflito de estoque</span><span>Registro parcial após cada item</span><span>Conciliação por chave e grupo</span></div>
        <label class="nfe-import-confirm"><input id="nfeConfirmImport" type="checkbox"><span><strong>Revisei a simulação e confirmo este teste</strong><small id="nfeImportHelp">Leia uma NF-e para gerar a simulação.</small></span></label>
        <p class="nfe-progress" id="nfeProgress"></p>
      </div>
      <div class="nfe-import-footer"><button class="button primary" id="nfeExecuteImportButton" type="button" disabled>Importar NF-e simulada</button></div>
    </section>
  </section>`;
}

function settingsMarkup() {
  return `<section class="panel span-all-settings" id="nfeSafetySettings">
    <div class="panel-header"><div><h2>Segurança da Entrada de NF-e</h2><p>Uma segunda trava, independente do modo geral de gravação.</p></div><span class="badge success" id="nfeSettingsStatus">Bloqueada</span></div>
    <div class="form-stack">
      <label class="switch-row"><span><strong>Permitir importação de NF-e</strong><small>Ative somente durante um teste controlado. O modo geral “Permitir gravações” também precisa estar ativo.</small></span><input id="nfeImportModeSetting" type="checkbox"></label>
      <p class="muted nfe-settings-note">A ativação não executa nada automaticamente. Cada nota ainda exige simulação sem erros e confirmação dentro da bancada de NF-e.</p>
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
    status.textContent = config.nfeImportMode ? 'Habilitada para teste' : 'Bloqueada';
  };
  input.addEventListener('change', () => {
    persistConfig({ nfeImportMode: input.checked });
    sync();
    document.getElementById('nfeConfirmImport')?.dispatchEvent(new Event('change'));
    toast(input.checked ? 'Importação de NF-e habilitada para teste neste navegador.' : 'Importação de NF-e bloqueada.', input.checked ? 'error' : 'success');
  });
  sync();
}

function start() {
  const operations = document.querySelector('[data-view="operations"]');
  if (!operations || document.getElementById('nfeWorkspace')) return;
  installStylesheet();
  installSettings();
  operations.insertAdjacentHTML('afterbegin', panelMarkup());

  const oldCard = operations.querySelector('.module-card');
  if (oldCard) {
    oldCard.querySelector('p').textContent = 'A bancada acima já simula validade, lotes, produtos e estoque; a importação possui duas travas independentes.';
    const badge = oldCard.querySelector('.badge');
    if (badge) {
      badge.className = 'badge success';
      badge.textContent = 'Simulação completa';
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
