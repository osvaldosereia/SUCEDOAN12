import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { OffersModule } from './modules/offers.js';
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
  if (document.querySelector('link[data-admin-v2-offers]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './assets/offers.css';
  link.dataset.adminV2Offers = '1';
  document.head.appendChild(link);
}

function panelMarkup() {
  return `<section class="panel offers-workspace" id="offersWorkspace"><div class="panel-header"><div><span class="eyebrow">Regras por validade</span><h2>Ofertas automáticas</h2><p>Simule descontos, preserve ofertas manuais e bloqueie vendas inseguras de forma reversível.</p></div><button class="button secondary" id="offerRecalculate" type="button">Recalcular</button></div><div class="attention-grid offer-metrics" id="offerMetrics"></div><div class="offer-toolbar"><label>Mostrar<select id="offerFilter"><option value="actionable">Ações necessárias</option><option value="apply">Aplicar oferta</option><option value="block-sale">Bloquear venda</option><option value="clear">Limpar oferta</option><option value="manual">Ofertas manuais</option><option value="errors">Com erros</option><option value="all">Todos</option></select></label><span><strong id="offerResultCount">0</strong> produtos</span></div><div class="table-wrap"><table class="data-table offer-table"><thead><tr><th><input id="offerSelectAll" type="checkbox"></th><th>Produto</th><th>Validade</th><th>Preço</th><th>Ação</th><th>Validação</th></tr></thead><tbody id="offerRows"></tbody></table></div><div class="offer-apply-area"><label><input id="offerConfirm" type="checkbox"><span><strong>Revisei as ações selecionadas</strong><small id="offerSafety">Selecione ao menos uma ação simulada.</small></span></label><p id="offerProgress"></p><button class="button primary" id="offerApply" type="button" disabled>Aplicar selecionadas</button></div></section>`;
}

function installSettings() {
  const grid = document.querySelector('[data-view="settings"] .settings-grid');
  if (!grid || document.getElementById('offerSafetySettings')) return;
  const html = `<section class="panel span-all-settings" id="offerSafetySettings"><div class="panel-header"><div><h2>Segurança das ofertas automáticas</h2><p>Trava independente para aplicar ou remover ofertas por validade.</p></div><span class="badge success" id="offerSettingsStatus">Bloqueada</span></div><div class="form-stack"><label class="switch-row"><span><strong>Permitir aplicar ofertas automáticas</strong><small>Também exige o modo geral de gravação.</small></span><input id="offerWriteModeSetting" type="checkbox"></label></div></section>`;
  const danger = grid.querySelector('.danger-panel');
  if (danger) danger.insertAdjacentHTML('beforebegin', html);
  else grid.insertAdjacentHTML('beforeend', html);
  const input = document.getElementById('offerWriteModeSetting');
  const status = document.getElementById('offerSettingsStatus');
  const sync = () => {
    const config = loadConfig();
    input.checked = Boolean(config.offerWriteMode);
    status.className = `badge ${config.offerWriteMode ? 'warning' : 'success'}`;
    status.textContent = config.offerWriteMode ? 'Habilitada para teste' : 'Bloqueada';
  };
  input.addEventListener('change', () => {
    saveConfig({ offerWriteMode: input.checked });
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
  const view = document.querySelector('[data-view="promotions"]');
  if (!view || document.getElementById('offersWorkspace')) return;
  installCss();
  installSettings();
  view.insertAdjacentHTML('beforeend', panelMarkup());
  const store = { state: { products: [] } };
  let module;
  async function reload() {
    store.state.products = await loadProducts(loadConfig());
    module?.recalculate();
    return store.state.products;
  }
  const ids = [
    'offerRecalculate', 'offerMetrics', 'offerFilter', 'offerResultCount', 'offerSelectAll',
    'offerRows', 'offerConfirm', 'offerSafety', 'offerProgress', 'offerApply',
  ];
  const elements = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  module = new OffersModule({ store, elements, onToast: toast, onReload: reload, reloadConfig: loadConfig });
  reload().catch(error => toast(error?.message || String(error), 'error'));
  document.getElementById('reloadButton')?.addEventListener('click', () => reload().catch(() => {}));
  const card = [...view.querySelectorAll('.module-card')].find(row => row.textContent.includes('Ofertas automáticas'));
  if (card) {
    const badge = card.querySelector('.badge');
    if (badge) {
      badge.className = 'badge success';
      badge.textContent = 'Simulação ativa';
    }
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
