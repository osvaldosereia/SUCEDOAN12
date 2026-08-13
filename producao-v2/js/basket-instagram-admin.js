import { text } from './core/utils.js';
import { readJsonFile } from './services/github.js';

const DEFAULT_QUEUE_PATH = 'carrosseis-cestas/fila.json';
const REFRESH_INTERVAL = 60000;
const state = { queue: [], loading: false, lastLoadedAt: 0 };

function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem('da_admin_v2_config') || '{}') || {};
  } catch {
    return {};
  }
}

function basketSignature(basket = {}) {
  const items = (Array.isArray(basket.produtos) ? basket.produtos : []).map(item => [
    text(item?.codigo),
    Number(item?.qtd || item?.quantidade || 0),
  ].join(':')).join('|');
  return [text(basket.codigo || basket.id), Number(basket.preco || 0), text(basket.imagem), items].join('||');
}

function hashSignature(value) {
  let hash = 2166136261;
  const source = String(value || '');
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `v${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function basketVersion(basket) {
  return hashSignature(basketSignature(basket));
}

function entryTime(entry = {}) {
  return text(entry.atualizado_em || entry.postado_em || entry.criado_em);
}

function latestEntryForBasket(basket) {
  const code = text(basket?.codigo || basket?.id);
  return [...state.queue]
    .filter(entry => text(entry?.cesta_codigo || entry?.basket_codigo) === code)
    .sort((a, b) => entryTime(b).localeCompare(entryTime(a)))[0] || null;
}

function statusInfo(basket) {
  const entry = latestEntryForBasket(basket);
  if (!entry) return { kind: 'neutral', label: 'Não postada', detail: 'Aguardando geração automática.' };
  const currentVersion = basketVersion(basket);
  const entryVersion = text(entry.cesta_versao || entry.basket_version);
  if (entryVersion && entryVersion !== currentVersion) {
    return { kind: 'warning', label: 'Alterada · pendente', detail: 'A cesta mudou desde o último carrossel e voltará a ficar elegível.' };
  }
  const status = text(entry.fila_status || entry.status).toLowerCase();
  if (status === 'postado') return { kind: 'success', label: 'Postada', detail: entry.postado_em ? `Postada em ${entry.postado_em}` : 'Publicação concluída.' };
  if (status === 'processando') return { kind: 'warning', label: 'Publicando', detail: 'O cenário de postagem está processando esta cesta.' };
  if (status === 'novo') return { kind: 'info', label: 'Na fila', detail: 'Carrossel pronto, aguardando postagem.' };
  if (['erro', 'falhou', 'failed'].includes(status)) return { kind: 'danger', label: 'Erro', detail: text(entry.erro || entry.mensagem || 'Revisar a execução no Make.') };
  if (status === 'gerando') return { kind: 'warning', label: 'Gerando', detail: 'O carrossel está sendo produzido.' };
  return { kind: 'neutral', label: status || 'Registrada', detail: 'Existe histórico desta cesta na fila.' };
}

function moduleInstance() {
  return window.__adminV2CollectionsModule || null;
}

function ensureStyles() {
  if (document.getElementById('basketInstagramAdminStyles')) return;
  const style = document.createElement('style');
  style.id = 'basketInstagramAdminStyles';
  style.textContent = `
    .basket-instagram-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:9px;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:#fafbf9}
    .basket-instagram-row>div{min-width:0;display:grid;gap:2px}.basket-instagram-row strong{font-size:10px}.basket-instagram-row small{overflow:hidden;color:var(--muted);font-size:8px;text-overflow:ellipsis;white-space:nowrap}
    .basket-instagram-summary{display:flex;align-items:center;gap:8px;margin-left:auto}.basket-instagram-summary small{color:var(--muted);font-size:9px;font-weight:800}
    .basket-instagram-editor{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;padding:10px 12px;border:1px solid var(--line);border-radius:11px;background:#fafbf9}
    .basket-instagram-editor div{display:grid;gap:2px}.basket-instagram-editor strong{font-size:11px}.basket-instagram-editor small{color:var(--muted);font-size:9px}
    @media(max-width:680px){.basket-instagram-summary small{display:none}.basket-instagram-row{align-items:flex-start;flex-direction:column}.basket-instagram-editor{align-items:flex-start;flex-direction:column}}
  `;
  document.head.appendChild(style);
}

function decorateCards() {
  const module = moduleInstance();
  if (!module || module.type !== 'basket') return;
  const rows = module.audits?.().baskets || [];
  const cards = [...document.querySelectorAll('#collectionCards .collection-card')];
  cards.forEach((card, index) => {
    card.querySelector('.basket-instagram-row')?.remove();
    const basket = rows[index]?.source;
    if (!basket) return;
    const info = statusInfo(basket);
    const target = card.querySelector('.collection-card-actions');
    if (!target) return;
    const row = document.createElement('div');
    row.className = 'basket-instagram-row';
    row.innerHTML = `<div><strong>Instagram da cesta</strong><small>${info.detail}</small></div><span class="badge ${info.kind}">${info.label}</span>`;
    target.before(row);
  });
}

function decorateSummary() {
  const module = moduleInstance();
  const toolbar = document.querySelector('#collectionsWorkspace .collection-toolbar');
  if (!toolbar) return;
  let host = toolbar.querySelector('.basket-instagram-summary');
  if (module?.type !== 'basket') {
    host?.remove();
    return;
  }
  if (!host) {
    host = document.createElement('div');
    host.className = 'basket-instagram-summary';
    host.innerHTML = '<small></small><button class="button secondary compact" type="button">Atualizar Instagram</button>';
    toolbar.appendChild(host);
    host.querySelector('button').addEventListener('click', () => refreshQueue(true));
  }
  const baskets = Array.isArray(module.store?.state?.baskets) ? module.store.state.baskets : [];
  let posted = 0;
  let queued = 0;
  let pending = 0;
  baskets.forEach(basket => {
    const info = statusInfo(basket);
    if (info.label === 'Postada') posted += 1;
    else if (['Na fila', 'Publicando', 'Gerando'].includes(info.label)) queued += 1;
    else pending += 1;
  });
  host.querySelector('small').textContent = `Instagram: ${posted} postadas · ${queued} em andamento · ${pending} pendentes`;
}

function decorateEditor() {
  const module = moduleInstance();
  const form = document.getElementById('collectionForm');
  if (!form) return;
  form.querySelector('.basket-instagram-editor')?.remove();
  if (!module || module.type !== 'basket' || !module.draft) return;
  const info = statusInfo(module.draft);
  const panel = document.createElement('section');
  panel.className = 'basket-instagram-editor';
  panel.innerHTML = `<div><strong>Instagram da cesta</strong><small>${info.detail}</small></div><span class="badge ${info.kind}">${info.label}</span>`;
  form.prepend(panel);
}

function renderStatus() {
  ensureStyles();
  decorateCards();
  decorateSummary();
  decorateEditor();
}

async function refreshQueue(force = false) {
  if (state.loading) return;
  if (!force && Date.now() - state.lastLoadedAt < 15000) return renderStatus();
  state.loading = true;
  try {
    const config = loadConfig();
    const path = text(config.basketQueuePath || DEFAULT_QUEUE_PATH).replace(/^\/+/, '') || DEFAULT_QUEUE_PATH;
    const file = await readJsonFile(config, path).catch(error => {
      if (/404|não contém|nao contem/i.test(String(error?.message || error))) return { data: [] };
      throw error;
    });
    state.queue = Array.isArray(file?.data) ? file.data : [];
    state.lastLoadedAt = Date.now();
    renderStatus();
  } catch (error) {
    console.error('Falha ao carregar a fila independente de cestas do Instagram.', error);
    renderStatus();
  } finally {
    state.loading = false;
  }
}

let scheduled = false;
function scheduleRender() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    renderStatus();
  });
}

function installObservers() {
  const cards = document.getElementById('collectionCards');
  const form = document.getElementById('collectionForm');
  [cards, form].filter(Boolean).forEach(node => {
    if (node.dataset.basketInstagramObserved === '1') return;
    node.dataset.basketInstagramObserved = '1';
    new MutationObserver(scheduleRender).observe(node, { childList: true, subtree: true });
  });
}

function start() {
  ensureStyles();
  installObservers();
  document.getElementById('collectionTabs')?.addEventListener('click', () => setTimeout(() => {
    renderStatus();
    if (moduleInstance()?.type === 'basket') refreshQueue();
  }, 0));
  window.addEventListener('admin-v2-route-ready', event => {
    if (event.detail?.route === 'baskets') refreshQueue(true);
  });
  renderStatus();
  if (moduleInstance()?.type === 'basket') refreshQueue(true);
  setInterval(() => {
    if (moduleInstance()?.type === 'basket') refreshQueue(true);
  }, REFRESH_INTERVAL);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
