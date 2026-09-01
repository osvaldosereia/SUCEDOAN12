import { FIREBASE_BASE, text } from '../shared/mug-commerce-v1.js?v=20260828-1';

const BUILD = '20260831-admin-canecas-cleanup-v1';
const QUEUE_NODE = 'canecas/integracoes/loja_integrada/fila';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function toast(message, error = false, duration = 5200) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast${error ? ' error' : ''}`;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, duration);
}

function queueKey(key) {
  const bytes = new TextEncoder().encode(text(key));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function fbGet(path) {
  const response = await fetch(`${FIREBASE_BASE}/${path}.json?_=${Date.now()}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Firebase ${response.status}`);
  return response.json();
}

function injectStyles() {
  if ($('#cfAdminCleanupStyles')) return;
  const style = document.createElement('style');
  style.id = 'cfAdminCleanupStyles';
  style.textContent = `
    [data-cf-cleanup-hidden="1"]{display:none!important}
    .cf-save-feedback{margin:10px 0 0;padding:11px 12px;border:1px solid #dde1da;border-radius:11px;background:#f7f8f5;font-size:12px;line-height:1.45}
    .cf-save-feedback[hidden]{display:none!important}.cf-save-feedback.busy{background:#f3f6fb;border-color:#d8e1ec;color:#385a82}.cf-save-feedback.good{background:#edf8f0;border-color:#bfe3c8;color:#176b36}.cf-save-feedback.bad{background:#fff0ef;border-color:#e7b9b6;color:#9a302d}
    .cf-save-feedback strong{display:block;margin-bottom:3px}.cf-save-feedback small{display:block;opacity:.85}
    .cf-cleanup-fixed-note{margin-top:8px;padding:10px 12px;border-radius:10px;background:#f6f7f4;border:1px solid #e2e5df;font-size:12px;line-height:1.45}
    .cf-cleanup-fixed-note b{display:block;margin-bottom:3px}
  `;
  document.head.appendChild(style);
}

function hideElement(element) {
  if (!element) return;
  element.dataset.cfCleanupHidden = '1';
  element.hidden = true;
}

function hideField(id, root = document) {
  const field = $(`#${id}`, root);
  if (!field) return;
  hideElement(field.closest('label') || field);
}

function hideBlockByHeading(root, pattern) {
  for (const heading of $$('h3', root)) {
    if (!pattern.test(text(heading.textContent))) continue;
    const block = heading.parentElement;
    if (block) hideElement(block);
  }
}

function ensureFixedPolicyNote(root) {
  const stock = $('#cfStock', root);
  const section = stock?.closest('.form-section');
  if (!section || $('.cf-cleanup-fixed-note', section)) return;
  const note = document.createElement('div');
  note.className = 'cf-cleanup-fixed-note';
  note.innerHTML = '<b>Padrão operacional automático</b>Estoque 100 · preparação em 1 dia · venda continua ao zerar · 0,3 kg · embalagem 11 × 11 × 11 cm.';
  section.appendChild(note);
}

function ensureFeedback(root) {
  const actions = $('.drawer-actions', root);
  if (!actions) return null;
  let feedback = $('#cfGithubSaveFeedback', root);
  if (!feedback) {
    feedback = document.createElement('div');
    feedback.id = 'cfGithubSaveFeedback';
    feedback.className = 'cf-save-feedback';
    feedback.hidden = true;
    actions.insertAdjacentElement('beforebegin', feedback);
  }
  return feedback;
}

function feedbackState(kind, title, detail = '') {
  const root = $('#drawerContent');
  const box = root ? ensureFeedback(root) : null;
  if (!box) return;
  box.hidden = false;
  box.className = `cf-save-feedback ${kind}`;
  box.innerHTML = `<strong>${title}</strong>${detail ? `<small>${detail}</small>` : ''}`;
}

function cleanDrawer() {
  const root = $('#drawerContent');
  if (!root || !root.dataset.productKey) return;

  ['cfUsed', 'cfPriceConsult', 'cfBrandName', 'cfCategoryName', 'cfLiCategory', 'cfLiBrand', 'cfMpn', 'cfManufacturer', 'cfPersonalTitle', 'cfPersonalText'].forEach(id => hideField(id, root));
  ['cfStockManaged', 'cfStock', 'cfAvailability', 'cfOutMode', 'cfOutDays', 'cfWeight', 'cfHeight', 'cfWidth', 'cfLength'].forEach(id => hideField(id, root));
  ensureFixedPolicyNote(root);

  hideBlockByHeading(root, /^Perguntas padrão$/i);
  hideBlockByHeading(root, /^Perguntas exclusivas$/i);
  const manualReview = $$('h3', root).find(h => /^Revisão manual Loja Integrada$/i.test(text(h.textContent)))?.closest('.form-section');
  hideElement(manualReview);

  hideElement($('#cfSaveSync', root));
  hideElement($('#cfSyncNow', root));

  const info = $('#cfDualDrawerInfo', root);
  if (info) info.textContent = 'Publicação e atualização são feitas pelo GitHub Actions. O Admin acompanha o resultado e avisa quando a Loja Integrada confirmar.';

  const github = $('#cfSaveGithub', root);
  if (github) {
    github.title = 'Salva no Firebase e envia a atualização para o GitHub Actions.';
    if (!github.dataset.cfCleanupBound) {
      github.dataset.cfCleanupBound = '1';
      github.addEventListener('click', () => beginGithubFeedback(root.dataset.productKey, github), true);
    }
  }
  ensureFeedback(root);
}

function cleanMugsPage() {
  const root = $('#mugs');
  if (!root) return;
  hideElement($('#cfBulkSync', root));
  hideElement($('#cfRefs', root));
  for (const id of ['cfBulkActivateDa', 'cfBulkActivateCf', 'cfBulkActivateBoth']) hideElement($(`#${id}`, root));

  const panel = $('#cfDualSyncPanel', root);
  if (panel) {
    const textEl = $('.cf-dual-head p', panel);
    if (textEl) textEl.textContent = 'Publicação e atualização feitas pelo GitHub Actions, com confirmação da Loja Integrada.';
    const progress = $('#cfDualSyncProgress', panel);
    if (progress && /Make/i.test(progress.textContent || '')) progress.textContent = '';
  }
}

function cleanSettings() {
  const root = $('#settings');
  if (!root) return;

  hideElement($('#cfGlobalSettings', root));

  const quote = $('[data-setting="quoteWebhook"]', root);
  if (quote) hideElement(quote.closest('label'));

  const make = $('#cfMakeWebhookSettings', root);
  if (make) {
    const title = $('h2', make);
    const desc = $('.panel-head p', make);
    const notice = $('.notice', make);
    if (title) title.textContent = 'Make · automações auxiliares';
    if (desc) desc.textContent = 'Usado somente pelas rotinas que ainda dependem do Make. Publicação da Loja Integrada usa GitHub Actions.';
    if (notice) notice.innerHTML = '<b>Este webhook não é usado para publicar canecas na Loja Integrada.</b><br>Mantenha-o somente para IA/personalização ou outras automações ainda ligadas ao Make.';
    hideElement($('#cfMakeWebhookOld', make));
  }
}

async function pollQueue(productKey, button, startedAt) {
  const qKey = queueKey(productKey);
  const deadline = Date.now() + 150000;
  let seen = false;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, seen ? 2500 : 900));
    let item;
    try { item = await fbGet(`${QUEUE_NODE}/${qKey}`); }
    catch { continue; }
    if (!item) {
      if (!seen && Date.now() - startedAt > 15000) {
        feedbackState('bad', 'Envio não confirmado', 'O cadastro não apareceu na fila do GitHub. Tente novamente; se houver erro, o Admin mostrará a mensagem.');
        return;
      }
      continue;
    }
    seen = true;
    const status = text(item.status).toLowerCase();
    const updated = Date.parse(item.atualizado_em || item.concluido_em || item.solicitado_em || '') || 0;
    if (updated && updated + 3000 < startedAt) continue;

    if (status === 'aguardando_imagens') {
      feedbackState('busy', 'Preparando as imagens da vitrine…', text(item.erro) || 'O GitHub concluirá os recortes e tentará a publicação automaticamente.');
    } else if (status === 'pendente' && text(item.erro)) {
      const next = text(item.proxima_tentativa_em);
      feedbackState('busy', 'GitHub vai tentar novamente automaticamente', `${text(item.erro)}${next ? ` · próxima tentativa: ${new Date(next).toLocaleString('pt-BR')}` : ''}`);
    } else if (status === 'pendente') {
      feedbackState('busy', 'Salvo. Aguardando o GitHub iniciar…', 'A confirmação aparecerá aqui assim que o processamento começar.');
    } else if (status === 'processando') {
      const step = text(item.etapa).replace(/_/g, ' ');
      feedbackState('busy', 'Atualizando a Loja Integrada…', step ? `Etapa atual: ${step}.` : 'O GitHub está processando esta caneca agora.');
    } else if (status === 'concluido') {
      const productId = text(item.produto_id || item.loja_integrada_product_id || item.product_id);
      feedbackState('good', 'Atualização concluída ✓', productId ? `Loja Integrada confirmou o produto ${productId}.` : 'A Loja Integrada confirmou a atualização.');
      toast('Caneca salva e confirmada na Loja Integrada.', false, 6500);
      window.__CANECAS_LI_REGISTRATION_STATUS__?.refresh?.();
      return;
    } else if (['erro', 'erro_final', 'bloqueado'].includes(status)) {
      const error = text(item.erro || item.error || item.mensagem || item.detalhe || item.ultimo_erro) || 'A publicação precisa de revisão.';
      feedbackState('bad', 'Não foi possível concluir a atualização', error);
      toast(`Loja Integrada: ${error}`, true, 8000);
      window.__CANECAS_LI_REGISTRATION_STATUS__?.refresh?.();
      return;
    }
  }

  feedbackState('busy', 'Atualização enviada ao GitHub', 'A confirmação ainda não chegou. O processamento continuará e o status da caneca será atualizado automaticamente.');
  toast('Atualização enviada. A confirmação da Loja Integrada ainda está em processamento.', false, 6500);
}

function beginGithubFeedback(productKey, button) {
  if (!productKey || button.dataset.cfFeedbackBusy === '1') return;
  button.dataset.cfFeedbackBusy = '1';
  const original = button.textContent;
  const startedAt = Date.now();
  button.textContent = 'Salvando e enviando…';
  feedbackState('busy', 'Salvando cadastro…', 'Em seguida o GitHub fará a atualização da Loja Integrada.');

  setTimeout(() => {
    if (button?.isConnected) button.textContent = original;
    button.dataset.cfFeedbackBusy = '';
    void pollQueue(productKey, button, startedAt);
  }, 1200);
}

function apply() {
  injectStyles();
  if (location.hash.includes('mugs')) {
    cleanMugsPage();
    cleanDrawer();
  }
  if (location.hash.includes('settings')) cleanSettings();
}

function schedule(delays = [0, 120, 320]) {
  for (const delay of delays) setTimeout(apply, delay);
}

window.addEventListener('admin-canecas:route', event => {
  if (['mugs', 'settings'].includes(event.detail?.route)) schedule();
});
window.addEventListener('admin-canecas:drawer', event => {
  if (event.detail?.kind === 'mug') schedule([20, 160, 360]);
});
window.addEventListener('admin-canecas:mugs-stable-rendered', () => schedule([0, 100]));
window.addEventListener('admin-canecas:settings-rendered', () => schedule([20, 160, 360]));
window.addEventListener('hashchange', () => schedule());
document.addEventListener('DOMContentLoaded', () => schedule([120, 420]));
setTimeout(apply, 700);

document.documentElement.dataset.cfAdminCleanup = BUILD;
export { BUILD, apply, cleanDrawer, cleanSettings, cleanMugsPage };
