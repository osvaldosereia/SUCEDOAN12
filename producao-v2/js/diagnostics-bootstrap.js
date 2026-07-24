import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { DiagnosticsModule } from './modules/diagnostics.js';

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
  if (document.querySelector('link[data-admin-v2-diagnostics]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './assets/diagnostics.css';
  link.dataset.adminV2Diagnostics = '1';
  document.head.appendChild(link);
}

function panelMarkup() {
  return `<section class="panel diagnostics-workspace" id="diagnosticsWorkspace"><div class="panel-header"><div><span class="eyebrow">Integridade e contingência</span><h2>Diagnóstico e backup</h2><p>Consulta Firebase, catálogo público, cestas, kits e fila sem disparar cenários externos.</p></div><button class="button primary" id="diagnosticRun" type="button">Executar diagnóstico</button></div><div class="attention-grid diagnostic-metrics" id="diagnosticMetrics"></div><div class="diagnostic-grid"><section><h3>Fontes e integrações</h3><div id="diagnosticSources"></div></section><section><h3>Inconsistências</h3><div id="diagnosticIssues"></div></section></div><div class="diagnostic-footer"><span id="diagnosticStatus">Nenhuma consulta executada nesta sessão.</span><div><button class="button secondary" id="diagnosticCsv" type="button" disabled>Exportar CSV</button><button class="button secondary" id="diagnosticExport" type="button" disabled>Gerar backup JSON</button></div></div></section>`;
}

function installIntegrationSettings() {
  const grid = document.querySelector('[data-view="settings"] .settings-grid');
  if (!grid || document.getElementById('externalIntegrationSettings')) return;
  const html = `<section class="panel span-all-settings" id="externalIntegrationSettings"><div class="panel-header"><div><h2>Referências de Make e Bling</h2><p>As URLs ficam neste navegador e não são chamadas pelo diagnóstico.</p></div><span class="badge info">Sem disparos automáticos</span></div><div class="form-stack"><label>Webhook Make · pedidos<input id="makeOrderWebhookSetting" type="url" placeholder="https://hook...make.com/..."></label><label>Webhook Make · IA/cadastro<input id="makeAiWebhookSetting" type="url" placeholder="https://hook...make.com/..."></label><label>Conexão Bling<select id="blingConnectionModeSetting"><option value="via-make">Via Make</option><option value="disabled">Não configurada na V2</option></select></label><p class="muted">Nenhum pedido, contato, produto ou execução de cenário é criado por esta tela. Ela apenas documenta as conexões utilizadas.</p></div></section>`;
  const danger = grid.querySelector('.danger-panel');
  if (danger) danger.insertAdjacentHTML('beforebegin', html);
  else grid.insertAdjacentHTML('beforeend', html);
  const order = document.getElementById('makeOrderWebhookSetting');
  const ai = document.getElementById('makeAiWebhookSetting');
  const bling = document.getElementById('blingConnectionModeSetting');
  const sync = () => {
    const config = loadConfig();
    order.value = config.makeOrderWebhookUrl || '';
    ai.value = config.makeAiWebhookUrl || '';
    bling.value = config.blingConnectionMode || 'via-make';
  };
  [order, ai, bling].forEach(input => input.addEventListener('change', () => saveConfig({
    makeOrderWebhookUrl: order.value.trim(),
    makeAiWebhookUrl: ai.value.trim(),
    blingConnectionMode: bling.value,
  })));
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
  const settings = document.querySelector('[data-view="settings"] .settings-grid');
  if (!settings || document.getElementById('diagnosticsWorkspace')) return;
  installCss();
  installIntegrationSettings();
  const danger = settings.querySelector('.danger-panel');
  if (danger) danger.insertAdjacentHTML('beforebegin', panelMarkup());
  else settings.insertAdjacentHTML('beforeend', panelMarkup());
  const ids = ['diagnosticRun', 'diagnosticMetrics', 'diagnosticSources', 'diagnosticIssues', 'diagnosticStatus', 'diagnosticCsv', 'diagnosticExport'];
  const elements = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  new DiagnosticsModule({ elements, onToast: toast, reloadConfig: loadConfig });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
