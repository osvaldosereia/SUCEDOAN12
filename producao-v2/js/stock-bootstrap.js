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
  link.href = './assets/stock.css';
  link.dataset.adminV2Stock = '1';
  document.head.appendChild(link);
}

function workspaceMarkup() {
  const windows = [5, 10, 15, 20, 25, 30]
    .map(value => `<option value="${value}">Próximos ${value} dias</option>`).join('');
  return `<section class="panel stock-workspace" id="stockWorkspace">
    <div class="panel-header"><div><span class="eyebrow">Fila operacional</span><h2>Estoque e validade</h2><p>Vencidos, próximos do vencimento, sem validade e estoque baixo em uma única lista.</p></div><span class="badge info" id="stockDataStatus">Carregando…</span></div>
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
  const html = `<section class="panel span-all-settings" id="stockSafetySettings"><div class="panel-header"><div><h2>Segurança de estoque e validade</h2><p>Trava independente para ajustes manuais.</p></div><span class="badge success" id="stockSettingsStatus">Bloqueada</span></div><div class="form-stack"><label class="switch-row"><span><strong>Permitir ajustes manuais</strong><small>Também exige o modo geral de gravação. Cada ajuste exige motivo e reconsulta o estoque remoto.</small></span><input id="stockWriteModeSetting" type="checkbox"></label></div></section>`;
  const danger = grid.querySelector('.danger-panel');
  if (danger) danger.insertAdjacentHTML('beforebegin', html);
  else grid.insertAdjacentHTML('beforeend', html);
  const input = document.getElementById('stockWriteModeSetting');
  const status = document.getElementById('stockSettingsStatus');
  const sync = () => {
    const config = loadConfig();
    input.checked = Boolean(config.stockWriteMode);
    status.className = `badge ${config.stockWriteMode ? 'warning' : 'success'}`;
    status.textContent = config.stockWriteMode ? 'Habilitada para teste' : 'Bloqueada';
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

function start() {
  const operations = document.querySelector('[data-view="operations"]');
  if (!operations || document.getElementById('stockWorkspace')) return;
  installCss();
  installSettings();
  operations.insertAdjacentHTML('beforeend', workspaceMarkup());
  document.body.insertAdjacentHTML('beforeend', editorMarkup());

  const cards = operations.querySelectorAll('.module-card');
  const stockCard = [...cards].find(card => card.textContent.includes('Estoque e validade'));
  if (stockCard) {
    stockCard.querySelector('p').textContent = 'A fila abaixo já reúne vencidos, janelas de 5 a 30 dias, sem validade e estoque baixo.';
    const badge = stockCard.querySelector('.badge');
    if (badge) {
      badge.className = 'badge success';
      badge.textContent = 'Fila ativa';
    }
  }

  const store = {
    state: { products: [] },
    getProduct(key) {
      return this.state.products.find(product => productKey(product) === String(key)) || null;
    },
  };
  let module;
  async function reload() {
    const status = document.getElementById('stockDataStatus');
    status.className = 'badge warning';
    status.textContent = 'Atualizando…';
    try {
      store.state.products = await loadProducts(loadConfig());
      status.className = 'badge success';
      status.textContent = `${store.state.products.length} produtos`;
      module?.render();
      return store.state.products;
    } catch (error) {
      status.className = 'badge danger';
      status.textContent = 'Falha no Firebase';
      throw error;
    }
  }

  const ids = [
    'stockMetrics', 'stockSearch', 'stockStatusFilter', 'stockWindowFilter', 'stockSort', 'stockResultCount',
    'stockTableBody', 'stockBackdrop', 'stockEditor', 'stockEditorTitle', 'stockEditorSubtitle', 'stockCloseEditor',
    'stockCancelEditor', 'stockSaveEditor', 'stockValue', 'stockValidity', 'stockNoExpiry', 'stockReason',
    'stockEditorPlan', 'stockEditorSafety',
  ];
  const elements = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  module = new StockModule({ store, elements, onToast: toast, onReload: reload, reloadConfig: loadConfig });
  reload().catch(error => toast(error?.message || String(error), 'error'));
  document.getElementById('reloadButton')?.addEventListener('click', () => reload().catch(() => {}));
  elements.stockBackdrop.addEventListener('click', () => module.closeEditor());
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
