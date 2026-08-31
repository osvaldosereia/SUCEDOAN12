import { text, norm } from '../shared/mug-commerce-v1.js?v=20260828-1';
import { loadMugs, getMug } from './mug-store-v2.js?v=20260829-1';

const BUILD = '20260831-admin-canecas-li-registration-status-v1.1';
const REFRESH_MS = 20000;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
let refreshing = false;
let lastRefresh = 0;

function liMeta(product = {}) {
  return product.loja_integrada && typeof product.loja_integrada === 'object' ? product.loja_integrada : {};
}
function productKey(product = {}) {
  return text(product.__key || product.firebaseKey || product.id);
}
function formatDate(value) {
  const d = new Date(value || '');
  if (!Number.isFinite(d.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d);
}
function registrationState(product = {}) {
  const li = liMeta(product);
  const id = text(li.produto_id);
  const status = norm(li.sync_status);
  const confirmedAt = text(li.sync_at);
  const auditedAt = text(li.cadastro_confirmado_em);
  const audited = li.cadastro_confirmado === true;
  const auditRejected = li.cadastro_confirmado === false;
  const error = text(li.sync_error || li.verificacao_erro);
  const nextRetry = text(li.proxima_tentativa_em);

  if (id && audited) {
    const verified = formatDate(auditedAt) || auditedAt;
    return {
      code: 'confirmed',
      label: 'CADASTRADA ✓',
      short: `ID ${id}${verified ? ` · verificada ${verified}` : ''}`,
      detail: `Cadastro conferido diretamente na API da Loja Integrada${verified ? ` em ${verified}` : ''}.`,
      id,
      confirmedAt: auditedAt || confirmedAt,
    };
  }
  if (auditRejected && !['pendente', 'enviando', 'processando', 'erro_sistema'].includes(status)) {
    return {
      code: 'review',
      label: 'NÃO CONFIRMADA',
      short: id ? `ID ${id} · auditoria falhou` : 'cadastro remoto não confirmado',
      detail: error || 'A auditoria da Loja Integrada não confirmou este cadastro.',
      id,
    };
  }
  if (id && status === 'sincronizado' && confirmedAt) {
    return {
      code: 'confirmed',
      label: 'CADASTRADA ✓',
      short: `ID ${id} · confirmada ${formatDate(confirmedAt) || confirmedAt}`,
      detail: `Confirmada pela API ao final da sincronização em ${formatDate(confirmedAt) || confirmedAt}. A auditoria periódica reforçará esta confirmação.`,
      id,
      confirmedAt,
    };
  }
  if (['erro_sistema'].includes(status) || (status === 'pendente' && (error || nextRetry))) {
    return {
      code: 'retry',
      label: 'TENTANDO NOVAMENTE',
      short: nextRetry ? `nova tentativa ${formatDate(nextRetry)}` : 'retentativa automática',
      detail: error || 'O GitHub tentará novamente automaticamente.',
      id,
    };
  }
  if (['pendente', 'enviando', 'processando'].includes(status)) {
    return {
      code: 'sending',
      label: 'ENVIANDO',
      short: id ? `ID ${id} · confirmando` : 'aguardando confirmação',
      detail: 'Ainda não considere esta caneca cadastrada até a confirmação final da API.',
      id,
    };
  }
  if (['erro', 'erro_final', 'bloqueado'].includes(status)) {
    return {
      code: 'review',
      label: 'REVISAR',
      short: id ? `ID ${id} · não confirmado` : 'não confirmada',
      detail: error || 'O cadastro precisa de revisão antes de ser considerado publicado.',
      id,
    };
  }
  if (id) {
    return {
      code: 'unknown',
      label: 'ID SALVO · CONFIRMAR',
      short: `ID ${id}`,
      detail: 'Existe um ID salvo, mas falta a confirmação final de sincronização. Não é tratado como cadastro confirmado.',
      id,
    };
  }
  return {
    code: 'missing',
    label: 'NÃO CADASTRADA',
    short: 'sem confirmação da Loja Integrada',
    detail: 'Não há confirmação remota de cadastro desta caneca.',
    id: '',
  };
}

function installStyles() {
  if ($('#cfLiRegistrationStyles')) return;
  const style = document.createElement('style');
  style.id = 'cfLiRegistrationStyles';
  style.textContent = `
    .cf-li-registration{align-items:flex-start!important;min-height:48px}
    .cf-li-registration>span{display:grid;gap:2px;min-width:0}
    .cf-li-registration b{font-size:10px;line-height:1.1}
    .cf-li-registration small{font-size:9px;line-height:1.2;font-weight:800;opacity:.82;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:165px}
    .cf-li-registration i{margin-top:4px;flex:0 0 auto}
    .cf-li-registration.confirmed{background:#edf8f0!important;color:#176b36!important;box-shadow:inset 0 0 0 1px #bfe3c8}
    .cf-li-registration.confirmed i{background:#208742!important;box-shadow:0 0 0 3px rgba(32,135,66,.12)}
    .cf-li-registration.sending{background:#f3f6fb!important;color:#3b5d86!important;box-shadow:inset 0 0 0 1px #d4deeb}
    .cf-li-registration.sending i{background:#6687aa!important}
    .cf-li-registration.retry{background:#fff8e8!important;color:#7f5a14!important;box-shadow:inset 0 0 0 1px #ead7a5}
    .cf-li-registration.retry i{background:#b8851c!important}
    .cf-li-registration.review{background:#fff0ef!important;color:#9a302d!important;box-shadow:inset 0 0 0 1px #e7b9b6}
    .cf-li-registration.review i{background:#bb3f3a!important}
    .cf-li-registration.missing,.cf-li-registration.unknown{background:#f4f5f2!important;color:#666d65!important;box-shadow:inset 0 0 0 1px #dfe2dc}
    .cf-li-registration.missing i,.cf-li-registration.unknown i{background:#9da39b!important}
    #cfLiRegistrationSummary{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px;padding-top:9px;border-top:1px solid #eceee9}
    .cf-li-summary-chip{display:flex;align-items:center;gap:5px;padding:6px 8px;border-radius:9px;background:#f6f7f4;font-size:10px;font-weight:800}
    .cf-li-summary-chip strong{font-size:12px}
    #cfLiRegistrationDetail{margin:9px 0;padding:10px 12px;border-radius:11px;border:1px solid #dfe3dc;background:#f8f9f6;display:grid;gap:4px;font-size:11px}
    #cfLiRegistrationDetail strong{font-size:12px}
    #cfLiRegistrationDetail.confirmed{background:#edf8f0;border-color:#bfe3c8;color:#176b36}
    #cfLiRegistrationDetail.retry{background:#fff8e8;border-color:#ead7a5;color:#7f5a14}
    #cfLiRegistrationDetail.review{background:#fff0ef;border-color:#e7b9b6;color:#9a302d}
  `;
  document.head.appendChild(style);
}

function applyCardState(card, state) {
  const channels = $$('.cf-mug-card-meta .cf-mug-channel', card);
  const channel = channels[1];
  if (!channel) return;
  channel.className = `cf-mug-channel cf-li-registration ${state.code}`;
  channel.title = state.detail;
  channel.innerHTML = `<span><b>Caneca Fácil · ${state.label}</b><small>${state.short}</small></span><i></i>`;
}

function updateSummary(products = []) {
  const panel = $('#cfDualSyncPanel');
  if (!panel) return;
  let summary = $('#cfLiRegistrationSummary', panel);
  if (!summary) {
    summary = document.createElement('div');
    summary.id = 'cfLiRegistrationSummary';
    panel.appendChild(summary);
  }
  const counts = { confirmed: 0, sending: 0, retry: 0, review: 0, missing: 0, unknown: 0 };
  for (const product of products) counts[registrationState(product).code] += 1;
  const pending = counts.sending + counts.retry + counts.unknown;
  summary.innerHTML = [
    `<span class="cf-li-summary-chip"><strong>${counts.confirmed}</strong> cadastradas ✓</span>`,
    `<span class="cf-li-summary-chip"><strong>${pending}</strong> aguardando confirmação</span>`,
    `<span class="cf-li-summary-chip"><strong>${counts.review}</strong> revisar</span>`,
    `<span class="cf-li-summary-chip"><strong>${counts.missing}</strong> não cadastradas</span>`,
  ].join('');
}

async function updateDrawer() {
  const content = $('#drawerContent');
  const key = text(content?.dataset.productKey);
  if (!content || !key || $('#drawer')?.getAttribute('aria-hidden') === 'true') return;
  const product = await getMug(key).catch(() => null);
  if (!product) return;
  const state = registrationState(product);
  let box = $('#cfLiRegistrationDetail', content);
  if (!box) {
    box = document.createElement('div');
    box.id = 'cfLiRegistrationDetail';
    const actions = $('.drawer-actions', content);
    if (actions) actions.insertAdjacentElement('beforebegin', box);
    else content.prepend(box);
  }
  box.className = state.code;
  box.innerHTML = `<strong>Caneca Fácil: ${state.label}</strong><span>${state.short}</span><span>${state.detail}</span>`;
}

async function refresh({ force = false } = {}) {
  if (!location.hash.includes('mugs') || refreshing) return;
  if (!force && Date.now() - lastRefresh < 3000) return;
  refreshing = true;
  try {
    installStyles();
    const products = await loadMugs({ force });
    const byKey = new Map(products.map(p => [productKey(p), p]));
    $$('[data-grid-mug]', $('#mugs')).forEach(card => {
      const product = byKey.get(text(card.dataset.gridMug));
      if (product) applyCardState(card, registrationState(product));
    });
    updateSummary(products);
    await updateDrawer();
    lastRefresh = Date.now();
  } finally {
    refreshing = false;
  }
}

function schedule(force = false, delay = 80) {
  setTimeout(() => void refresh({ force }), delay);
}

window.addEventListener('hashchange', () => schedule(true, 180));
window.addEventListener('admin-canecas:route', event => { if (event.detail?.route === 'mugs') schedule(true, 180); });
window.addEventListener('admin-canecas:mugs-stable-rendered', () => schedule(false, 100));
window.addEventListener('admin-canecas:drawer', event => { if (event.detail?.kind === 'mug') schedule(false, 160); });
document.addEventListener('DOMContentLoaded', () => schedule(true, 500));

const observer = new MutationObserver(() => {
  if (location.hash.includes('mugs')) schedule(false, 120);
});
observer.observe(document.documentElement, { childList: true, subtree: true });
setInterval(() => {
  if (location.hash.includes('mugs') && !document.hidden) void refresh({ force: true });
}, REFRESH_MS);

document.documentElement.dataset.cfLiRegistrationStatus = BUILD;
window.__CANECAS_LI_REGISTRATION_STATUS__ = Object.freeze({ BUILD, registrationState, refresh: () => refresh({ force: true }) });

export { BUILD, registrationState, refresh };
