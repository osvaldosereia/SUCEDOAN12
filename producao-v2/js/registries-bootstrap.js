import './offer-store-bridge.js';
import './quick-read-bootstrap.js';
import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { RegistriesModule } from './modules/registries.js';
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
  if (document.querySelector('link[data-admin-v2-registries]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './assets/registries.css';
  link.dataset.adminV2Registries = '1';
  document.head.appendChild(link);
}

function panelMarkup() {
  return `<section class="panel registries-workspace" id="registriesWorkspace"><div class="panel-header"><div><span class="eyebrow">Cadastros derivados do Firebase</span><h2>Padronização de cadastros</h2><p>Categorias, marcas, fornecedores e tags sem listas paralelas ou duplicadas.</p></div><span class="badge info" id="registryDataStatus">Carregando…</span></div><div class="attention-grid registry-metrics" id="registryMetrics"></div><div class="registry-tabs" id="registryTabs"><button class="active" data-registry-tab="categories">Categorias</button><button data-registry-tab="brands">Marcas</button><button data-registry-tab="suppliers">Fornecedores</button><button data-registry-tab="tags">Tags</button></div><div class="registry-toolbar"><div class="search-field"><span>⌕</span><input id="registrySearch" type="search" placeholder="Buscar cadastro"></div><span><strong id="registryResultCount">0</strong> registros</span></div><div class="table-wrap"><table class="data-table registry-table"><thead><tr><th>Valor</th><th>Produtos</th><th>Variações</th><th>Qualidade</th><th></th></tr></thead><tbody id="registryRows"></tbody></table></div></section>`;
}

function editorMarkup() {
  return `<div class="registry-backdrop" id="registryBackdrop" hidden></div><aside class="editor-drawer registry-editor" id="registryEditor" aria-hidden="true"><div class="editor-header"><div><span class="eyebrow">Alteração em lote</span><h2 id="registryEditorTitle">Cadastro</h2><p id="registryScope"></p></div><button class="icon-button" id="registryClose" type="button" aria-label="Fechar">×</button></div><div class="editor-body"><div class="form-grid"><label>Valor atual<input id="registryOldValue" disabled></label><label>Novo valor<input id="registryNewValue"></label></div><div id="registryPlan" class="registry-plan"></div><label class="registry-confirm"><input id="registryConfirm" type="checkbox"><span><strong>Confirmo a alteração em todos os produtos listados</strong><small id="registrySafety"></small></span></label><p id="registryProgress" class="registry-progress"></p></div><div class="editor-footer"><button class="button secondary" id="registryCancel" type="button">Cancelar</button><button class="button primary" id="registrySave" type="button" disabled>Aplicar padronização</button></div></aside>`;
}

function installSettings() {
  const grid = document.querySelector('[data-view="settings"] .settings-grid');
  if (!grid || document.getElementById('registrySafetySettings')) return;
  const html = `<section class="panel span-all-settings" id="registrySafetySettings"><div class="panel-header"><div><h2>Segurança dos cadastros</h2><p>Renomeações e mesclagens alteram produtos em lote.</p></div><span class="badge success" id="registrySettingsStatus">Bloqueada</span></div><div class="form-stack"><label class="switch-row"><span><strong>Permitir padronização em lote</strong><small>Também exige o modo geral de gravação.</small></span><input id="registryWriteModeSetting" type="checkbox"></label></div></section>`;
  const danger = grid.querySelector('.danger-panel');
  if (danger) danger.insertAdjacentHTML('beforebegin', html);
  else grid.insertAdjacentHTML('beforeend', html);
  const input = document.getElementById('registryWriteModeSetting');
  const status = document.getElementById('registrySettingsStatus');
  const sync = () => {
    const config = loadConfig();
    input.checked = Boolean(config.registryWriteMode);
    status.className = `badge ${config.registryWriteMode ? 'warning' : 'success'}`;
    status.textContent = config.registryWriteMode ? 'Habilitada para teste' : 'Bloqueada';
  };
  input.addEventListener('change', () => {
    saveConfig({ registryWriteMode: input.checked });
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
  const view = document.querySelector('[data-view="registries"]');
  if (!view || document.getElementById('registriesWorkspace')) return;
  installCss();
  installSettings();
  view.insertAdjacentHTML('afterbegin', panelMarkup());
  document.body.insertAdjacentHTML('beforeend', editorMarkup());
  const store = { state: { products: [] } };
  let module;
  async function reload() {
    const status = document.getElementById('registryDataStatus');
    status.className = 'badge warning';
    status.textContent = 'Atualizando…';
    try {
      store.state.products = await loadProducts(loadConfig());
      status.className = 'badge success';
      status.textContent = `${store.state.products.length} produtos`;
      module?.refresh();
      return store.state.products;
    } catch (error) {
      status.className = 'badge danger';
      status.textContent = 'Falha no Firebase';
      throw error;
    }
  }
  const ids = ['registryDataStatus','registryMetrics','registryTabs','registrySearch','registryResultCount','registryRows','registryBackdrop','registryEditor','registryEditorTitle','registryScope','registryClose','registryCancel','registrySave','registryOldValue','registryNewValue','registryPlan','registryConfirm','registrySafety','registryProgress'];
  const elements = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  module = new RegistriesModule({ store, elements, onToast: toast, onReload: reload, reloadConfig: loadConfig });
  reload().catch(error => toast(error?.message || String(error), 'error'));
  elements.registryBackdrop.addEventListener('click', () => module.close());
  document.getElementById('reloadButton')?.addEventListener('click', () => reload().catch(() => {}));
  view.querySelectorAll('.module-card .badge').forEach(badge => {
    badge.className = 'badge success';
    badge.textContent = 'Gestão ativa';
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
