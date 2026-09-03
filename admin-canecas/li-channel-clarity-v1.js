const BUILD = '20260903-admin-canecas-li-channel-clarity-v1.1';
const $ = (selector, root = document) => root.querySelector(selector);

const GITHUB_BUTTONS = Object.freeze({
  cfGithubSelected: 'Publicar selecionadas · GITHUB',
  cfGithubAllActive: 'Publicar todas ativas · GITHUB',
  cfGithubRetry: 'Reenviar erros · GITHUB',
  cfGithubRefresh: 'Atualizar status · GITHUB',
});

const MAKE_BUTTONS = Object.freeze({
  cfBulkSync: 'RESERVA · Publicar selecionadas · MAKE',
  cfSaveSync: 'RESERVA · Salvar + publicar · MAKE',
});

function markButton(button, channel, label, title) {
  if (!button) return;
  button.dataset.cfLiChannel = channel;
  button.classList.toggle('cf-li-channel-github', channel === 'github');
  button.classList.toggle('cf-li-channel-make', channel === 'make');
  if (label && button.textContent !== label) button.textContent = label;
  if (title) button.title = title;
}

function installStyles() {
  if ($('#cfLiChannelClarityStyles')) return;
  const style = document.createElement('style');
  style.id = 'cfLiChannelClarityStyles';
  style.textContent = `
    .cf-li-route-banner{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0 0;font-size:11px;color:#596159}
    .cf-li-route-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:999px;font-weight:800;letter-spacing:.02em}
    .cf-li-route-chip.github{background:#eaf6ee;color:#176232;border:1px solid #bfe1c8}
    .cf-li-route-chip.make{background:#fff3df;color:#8a4b00;border:1px solid #f0cf9b}
    button.cf-li-channel-github{border-color:#1d6d38!important;box-shadow:inset 0 0 0 1px rgba(29,109,56,.08)}
    button.cf-li-channel-make{background:#fff7e8!important;color:#7b4300!important;border-color:#e3b86f!important}
    .cf-li-drawer-route{margin:8px 0 10px;padding:9px 11px;border-radius:10px;background:#f3faf5;border:1px solid #cce5d3;font-size:11px;color:#35523e}
    .cf-li-drawer-route b{color:#176232}
  `;
  document.head.appendChild(style);
}

function clarifyTopPanel() {
  const panel = $('#cfDualSyncPanel');
  if (!panel) return;
  const intro = panel.querySelector('.cf-dual-head p');
  if (intro) intro.innerHTML = '<strong>PADRÃO: GitHub Actions.</strong> O Make é somente reserva/contingência.';
  let banner = $('#cfLiRouteBanner', panel);
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'cfLiRouteBanner';
    banner.className = 'cf-li-route-banner';
    banner.innerHTML = '<span class="cf-li-route-chip github">✓ GITHUB · padrão</span><span class="cf-li-route-chip make">⚠ MAKE · reserva</span><span>Para atualizar produtos normalmente, escolha sempre os comandos GITHUB.</span>';
    panel.querySelector('.cf-dual-head')?.insertAdjacentElement('afterend', banner);
  }
}

function clarifyButtons() {
  for (const [id, label] of Object.entries(GITHUB_BUTTONS)) markButton($(`#${id}`), 'github', label, 'Canal: GitHub Actions — caminho padrão para publicar/atualizar produtos na Loja Integrada.');
  const saveGithub = $('#cfSaveGithub');
  if (saveGithub) {
    const updating = /atualizar/i.test(saveGithub.textContent || '');
    markButton(saveGithub, 'github', updating ? 'Salvar + atualizar · GITHUB' : 'Salvar + publicar · GITHUB', 'Canal: GitHub Actions — caminho padrão.');
  }
  for (const [id, label] of Object.entries(MAKE_BUTTONS)) markButton($(`#${id}`), 'make', label, 'Canal: Make — RESERVA. Use somente se o fluxo GitHub estiver indisponível.');
}

function clarifyDrawer() {
  const content = $('#drawerContent');
  const actions = content?.querySelector('.drawer-actions');
  if (!content || !actions) return;
  const oldInfo = $('#cfDualDrawerInfo', content);
  if (oldInfo) oldInfo.textContent = 'PADRÃO: GitHub Actions. MAKE = reserva/contingência.';
  let info = $('#cfLiDrawerRoute', content);
  if (!info) {
    info = document.createElement('div');
    info.id = 'cfLiDrawerRoute';
    info.className = 'cf-li-drawer-route';
    info.innerHTML = '<b>Atualização da Loja Integrada:</b> use o botão GITHUB. Botões MAKE estão marcados como RESERVA.';
    actions.insertAdjacentElement('beforebegin', info);
  }
}

function clarifyBulkStatus() {
  const status = $('#cfBulkStatus');
  if (!status) return;
  if (!status.textContent || /selecione|make = reserva|seleção limpa/i.test(status.textContent)) status.textContent = 'Padrão: GITHUB. MAKE = reserva e só deve ser usado em contingência.';
}

function apply() {
  if (!location.hash.includes('mugs')) return;
  installStyles();
  clarifyTopPanel();
  clarifyButtons();
  clarifyDrawer();
  clarifyBulkStatus();
}
function schedule(delays = [0, 80, 220]) { for (const delay of delays) setTimeout(apply, delay); }
window.addEventListener('hashchange', () => schedule());
window.addEventListener('admin-canecas:route', event => { if (event.detail?.route === 'mugs') schedule(); });
window.addEventListener('admin-canecas:mugs-stable-rendered', () => schedule([0, 100]));
window.addEventListener('admin-canecas:drawer', event => { if (event.detail?.kind === 'mug') schedule([40, 180, 400]); });
document.addEventListener('DOMContentLoaded', () => schedule());
setTimeout(apply, 500);

// O módulo de prontidão é carregado daqui para evitar depender de alteração adicional no index.html.
import('./github-cutover-readiness-v1.js?v=20260903-1').then(module => module.apply?.()).catch(error => console.warn('Prontidão GitHub indisponível:', error?.message || error));

document.documentElement.dataset.cfLiChannelClarity = BUILD;
export { BUILD, apply };
