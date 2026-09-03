import { FIREBASE_BASE, text, norm } from '../shared/mug-commerce-v1.js?v=20260828-1';

const BUILD = '20260903-admin-canecas-dashboard-operations-v2';
const CACHE_MS = 45_000;
const PATHS = Object.freeze({
  orders: 'canecas/pedidos',
  creations: 'canecas/personalizadas',
  printJobs: 'canecas/print_jobs',
  liQueue: 'canecas/integracoes/loja_integrada/fila',
  mediaQueue: 'canecas/integracoes/loja_integrada/midia_fila',
  readiness: 'canecas/integracoes/github_ops/prontidao_corte_make',
});

const $ = (selector, root = document) => root.querySelector(selector);
let cached = null;
let cachedAt = 0;
let loading = null;
let applying = false;
let mugCount = 0;
let observer = null;

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
function routeIsDashboard() {
  return location.hash === '#dashboard' || !location.hash || document.querySelector('.view.active')?.dataset.view === 'dashboard';
}
function toRows(raw = {}) {
  return Object.entries(raw || {}).map(([__key, value]) => ({ __key, ...(value || {}) }));
}
async function get(path) {
  const response = await fetch(`${FIREBASE_BASE}/${path}.json?_=${Date.now()}`, {
    cache: 'no-store', headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Firebase ${response.status} em ${path}`);
  return response.json();
}
function statusOf(value) { return norm(value); }
function orderStatus(order = {}) { return statusOf(order.status || order.status_comercial || 'novo'); }
function paymentStatus(order = {}) { return statusOf(order?.pagamento?.status || order.pagamento_status || 'pendente'); }
function activeOrder(order = {}) { return !['cancelado', 'entregue'].includes(orderStatus(order)); }
function paidOrder(order = {}) { return paymentStatus(order) === 'pago'; }
function releasedOrder(order = {}) { return activeOrder(order) && paidOrder(order) && order.liberado_producao === true; }
function creationStatus(creation = {}) {
  return statusOf(creation?.encomenda?.status || creation.atendimento_status || creation.status || 'arte_pronta');
}
function creationPayment(creation = {}) {
  return statusOf(creation.pagamento_status || creation?.encomenda?.pagamento_status || '');
}
function creationCancelled(creation = {}) { return /cancel/.test(creationStatus(creation)); }
function creationInCart(creation = {}) { return /carrinho|aguardando_pedido|encomendando/.test(creationStatus(creation)); }
function creationOrdered(creation = {}) {
  return Boolean(text(creation.pedido_id || creation.pedido_loja_integrada_id || creation?.encomenda?.pedido_id))
    || (/pedido_criado|vinculad|encomend/.test(creationStatus(creation)) && !/encomendando/.test(creationStatus(creation)));
}
function creationPaid(creation = {}) { return creationPayment(creation) === 'pago' || creation.liberado_producao === true; }
function createdAt(item = {}) {
  const value = item.criado_em || item.created_at || item.createdAt || item.atualizado_em || item.updated_at;
  const ms = Date.parse(text(value));
  return Number.isFinite(ms) ? ms : 0;
}
function cuiabaDay(ms = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Cuiaba', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(ms));
  const part = type => parts.find(item => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function today(item = {}) { const at = createdAt(item); return Boolean(at && cuiabaDay(at) === cuiabaDay()); }
function lastDays(item = {}, days = 7) {
  const at = createdAt(item);
  return Boolean(at && at >= Date.now() - days * 86_400_000);
}
function printOrderId(job = {}) { return text(job.pedido_id || job.order_id || job.pedido || job.pedido_loja_integrada_id); }
function queueStats(rows = []) {
  const statuses = rows.map(item => statusOf(item.status));
  const count = wanted => statuses.filter(status => wanted.includes(status)).length;
  return {
    waiting: count(['', 'pendente', 'aguardando_imagens']),
    processing: count(['processando']),
    error: count(['erro', 'erro_final', 'bloqueado']),
    done: count(['concluido']),
  };
}
function percent(part, total) { return total ? Math.round((part / total) * 100) : 0; }
function readinessSummary(status = {}) {
  const total = Number(status?.nucleo?.total || 0);
  const ready = Number(status?.nucleo?.prontas || 0);
  const blocked = Number(status?.nucleo?.bloqueadas || 0);
  const updatedMs = Date.parse(text(status.atualizado_em));
  const stale = !Number.isFinite(updatedMs) || Date.now() - updatedMs > 2 * 60 * 60 * 1000;
  return { total, ready, blocked, stale, ok: total > 0 && ready === total && blocked === 0 && !stale, updatedMs };
}
function ageLabel(ms) {
  if (!Number.isFinite(ms)) return 'sem verificação recente';
  const min = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (min < 2) return 'agora';
  if (min < 60) return `há ${min} min`;
  return `há ${Math.round(min / 60)} h`;
}

function buildSnapshot(raw) {
  const orders = toRows(raw.orders);
  const creations = toRows(raw.creations);
  const printJobs = toRows(raw.printJobs);
  const liQueue = toRows(raw.liQueue);
  const mediaQueue = toRows(raw.mediaQueue);
  const active = orders.filter(activeOrder);
  const waitingPayment = active.filter(order => !paidOrder(order));
  const paidAwaitingRelease = active.filter(order => paidOrder(order) && order.liberado_producao !== true);
  const released = active.filter(releasedOrder);
  const waitingPrintJobs = printJobs.filter(job => ['aguardando', 'reimpressao'].includes(statusOf(job.status)));
  const printOrderIds = new Set(printJobs.map(printOrderId).filter(Boolean));
  const releasedNoPrint = released.filter(order => !printOrderIds.has(text(order.id || order.__key)));
  const orderIntegrationErrors = active.filter(order =>
    order?.bling?.status === 'erro' || order?.nfe?.status === 'erro' || order?.melhor_envio?.status === 'erro');
  const validCreations = creations.filter(creation => !creationCancelled(creation));
  const creationsToday = validCreations.filter(today);
  const creations7 = validCreations.filter(creation => lastDays(creation, 7));
  const cart7 = creations7.filter(creationInCart);
  const ordered7 = creations7.filter(creationOrdered);
  const paid7 = creations7.filter(creationPaid);
  const li = queueStats(liQueue);
  const media = queueStats(mediaQueue);
  const readiness = readinessSummary(raw.readiness || {});
  return {
    build: BUILD,
    loadedAt: Date.now(),
    orders, creations, printJobs,
    activeOrders: active.length,
    ordersToday: active.filter(today).length,
    waitingPayment, paidAwaitingRelease, released, waitingPrintJobs, releasedNoPrint, orderIntegrationErrors,
    creationsToday, creations7, cart7, ordered7, paid7,
    li, media, readiness,
    criticalErrors: orderIntegrationErrors.length + li.error + media.error,
  };
}
async function loadSnapshot(force = false) {
  if (!force && cached && Date.now() - cachedAt < CACHE_MS) return cached;
  if (loading) return loading;
  loading = (async () => {
    const [orders, creations, printJobs, liQueue, mediaQueue, readiness] = await Promise.all([
      get(PATHS.orders), get(PATHS.creations), get(PATHS.printJobs),
      get(PATHS.liQueue).catch(() => ({})), get(PATHS.mediaQueue).catch(() => ({})), get(PATHS.readiness).catch(() => ({})),
    ]);
    cached = buildSnapshot({ orders, creations, printJobs, liQueue, mediaQueue, readiness });
    cachedAt = Date.now();
    window.__CF_ADMIN_OPS_SNAPSHOT__ = cached;
    window.dispatchEvent(new CustomEvent('admin-canecas:ops-snapshot', { detail: cached }));
    return cached;
  })();
  try { return await loading; }
  finally { loading = null; }
}

function captureMugCount(root) {
  const panel = [...root.querySelectorAll('.panel')].find(item => /base de canecas/i.test(item.querySelector('h2')?.textContent || ''));
  const match = panel?.textContent?.match(/(\d+)\s+caneca\(s\)/i);
  if (match) mugCount = Number(match[1]) || mugCount;
}
function attentionButton(label, count, route, tone = 'warn', help = '') {
  if (!count) return '';
  return `<button class="cf-attention-item ${tone}" data-go="${route}"><span><b>${esc(label)}</b>${help ? `<small>${esc(help)}</small>` : ''}</span><strong>${count}</strong></button>`;
}
function stat(value, label, tone = '') {
  return `<div class="metric ${tone}"><strong>${value}</strong><span>${esc(label)}</span></div>`;
}
function flow(value, label, detail = '') {
  return `<div class="cf-flow-item"><strong>${value}</strong><span>${esc(label)}</span>${detail ? `<small>${esc(detail)}</small>` : ''}</div>`;
}
function queueLine(name, stats, route = 'mugs') {
  const alert = stats.error > 0 ? ' bad' : '';
  return `<button class="cf-system-row${alert}" data-go="${route}"><span><b>${esc(name)}</b><small>${stats.waiting} aguardando · ${stats.processing} processando</small></span><strong>${stats.error ? `${stats.error} erro(s)` : 'OK'}</strong></button>`;
}
function installStyles() {
  if ($('#cfDashboardOpsStyles')) return;
  const style = document.createElement('style');
  style.id = 'cfDashboardOpsStyles';
  style.textContent = `
    #dashboard[data-cf-dashboard-ops]{display:grid;gap:14px}
    #dashboard .cf-dashboard-kicker{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
    #dashboard .cf-dashboard-kicker small{color:#737a73;font-size:11px}#dashboard .cf-dashboard-kicker button{font-size:11px}
    #dashboard .cf-attention-list{display:grid;gap:7px}.cf-attention-item{width:100%;border:1px solid #e2e4df;background:#fff;border-radius:11px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;text-align:left;cursor:pointer;color:#252a26}
    .cf-attention-item span{display:grid;gap:2px}.cf-attention-item small{font-size:10px;color:#747a74}.cf-attention-item strong{font-size:16px}.cf-attention-item.bad{border-color:#efc5c2;background:#fff8f7}.cf-attention-item.warn{border-color:#ead7b6;background:#fffaf2}
    #dashboard .cf-no-attention{padding:14px;border:1px solid #cfe2d3;background:#f5fbf6;border-radius:11px;color:#285b34;font-size:12px}
    #dashboard .cf-flow{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.cf-flow-item{padding:12px;border:1px solid #e4e6e1;border-radius:11px;background:#fff;display:grid;gap:3px}.cf-flow-item strong{font-size:22px}.cf-flow-item span{font-size:11px;font-weight:800}.cf-flow-item small{font-size:9px;color:#777e77}
    #dashboard .cf-conversion{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.cf-conversion span{padding:5px 8px;border-radius:999px;background:#f1f3ef;font-size:10px;color:#586058}.cf-conversion b{color:#1f4328}
    #dashboard .cf-system-list{display:grid;gap:7px}.cf-system-row{width:100%;border:1px solid #e3e5e0;background:#fff;border-radius:10px;padding:9px 11px;display:flex;align-items:center;justify-content:space-between;text-align:left;cursor:pointer;color:#292d29}.cf-system-row span{display:grid;gap:2px}.cf-system-row small{font-size:9px;color:#747a74}.cf-system-row strong{font-size:11px;color:#24713c}.cf-system-row.bad strong{color:#a3322d}
    #dashboard .cf-health-line{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.cf-health-chip{padding:5px 8px;border-radius:999px;background:#edf7ef;color:#276039;font-size:10px;font-weight:800}.cf-health-chip.warn{background:#fff1d9;color:#865300}.cf-health-chip.neutral{background:#f1f2ef;color:#636963}
    #dashboard .cf-catalog-mini{margin-top:9px;color:#747a74;font-size:10px}
    @media(max-width:760px){#dashboard .cf-flow{grid-template-columns:1fr 1fr}#dashboard .metrics{grid-template-columns:1fr 1fr}}
  `;
  document.head.appendChild(style);
}
function bind(root) {
  root.querySelectorAll('[data-go]').forEach(button => {
    button.onclick = () => document.querySelector(`#nav [data-route="${CSS.escape(button.dataset.go)}"]`)?.click();
  });
  root.querySelector('[data-cf-dashboard-refresh]')?.addEventListener('click', () => void apply(true));
}
function render(snapshot) {
  const root = $('#dashboard');
  if (!root || !routeIsDashboard()) return;
  captureMugCount(root);
  installStyles();
  const attention = [
    attentionButton('Liberados sem fila de impressão', snapshot.releasedNoPrint.length, 'orders', 'bad', 'Pedido pago e liberado, mas sem job de impressão.'),
    attentionButton('Pagos aguardando liberação técnica', snapshot.paidAwaitingRelease.length, 'orders', 'warn', 'Pagamento confirmado; produção ainda bloqueada.'),
    attentionButton('Erros na publicação da Loja Integrada', snapshot.li.error, 'mugs', 'bad', 'Produto bloqueado/erro na fila GitHub.'),
    attentionButton('Erros de mídia da vitrine', snapshot.media.error, 'mugs', 'bad', 'Arte quadrada/galeria precisa de reprocessamento.'),
    attentionButton('Erros de pedido/integração', snapshot.orderIntegrationErrors.length, 'orders', 'bad', 'Bling, NF-e ou Melhor Envio.'),
  ].filter(Boolean).join('');
  const core = snapshot.readiness;
  root.dataset.cfDashboardOps = BUILD;
  root.innerHTML = `
    <div class="cf-dashboard-kicker"><small>Visão operacional · atualizado ${new Date(snapshot.loadedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</small><button class="secondary" type="button" data-cf-dashboard-refresh>Atualizar agora</button></div>
    <div class="metrics">
      ${stat(snapshot.waitingPayment.length, 'Aguardando pagamento')}
      ${stat(snapshot.paidAwaitingRelease.length, 'Pago · aguardando liberação', snapshot.paidAwaitingRelease.length ? 'attn' : '')}
      ${stat(snapshot.released.length, 'Liberados para produção')}
      ${stat(snapshot.waitingPrintJobs.length, 'Fila de impressão', snapshot.releasedNoPrint.length ? 'attn' : '')}
    </div>
    <div class="grid2">
      <section class="panel"><div class="panel-head"><div><h2>Atenção necessária</h2><p>Somente situações que pedem alguma ação.</p></div></div><div class="panel-body"><div class="cf-attention-list">${attention || '<div class="cf-no-attention"><b>✓ Nenhuma pendência crítica agora.</b><br>As filas operacionais não indicam erro que exija ação.</div>'}</div></div></section>
      <section class="panel"><div class="panel-head"><div><h2>Produção</h2><p>Do pagamento à impressão.</p></div></div><div class="panel-body priority">
        <button data-go="orders"><div><b>Pedidos em andamento</b><span>${snapshot.ordersToday} iniciado(s) hoje</span></div><strong>${snapshot.activeOrders}</strong></button>
        <button data-go="orders"><div><b>Aguardando pagamento</b><span>Compra ainda não liberada</span></div><strong>${snapshot.waitingPayment.length}</strong></button>
        <button data-go="orders"><div><b>Liberados para produzir</b><span>Pagamento + liberação técnica</span></div><strong>${snapshot.released.length}</strong></button>
        <button data-go="print"><div><b>Impressão / reimpressão</b><span>Jobs aguardando execução</span></div><strong>${snapshot.waitingPrintJobs.length}</strong></button>
      </div></section>
    </div>
    <div class="grid2">
      <section class="panel"><div class="panel-head"><div><h2>Criações e conversão</h2><p>Últimos 7 dias, sem contar canceladas.</p></div><button class="secondary" data-go="creations">Ver artes</button></div><div class="panel-body">
        <div class="cf-flow">
          ${flow(snapshot.creations7.length, 'Artes criadas', `${snapshot.creationsToday.length} hoje`)}
          ${flow(snapshot.cart7.length, 'No carrinho', 'Ainda sem pedido confirmado')}
          ${flow(snapshot.ordered7.length, 'Viraram pedido', 'Pedido identificado')}
          ${flow(snapshot.paid7.length, 'Pagas', 'Pagamento confirmado')}
        </div>
        <div class="cf-conversion"><span>Arte → pedido <b>${percent(snapshot.ordered7.length, snapshot.creations7.length)}%</b></span><span>Arte → pagamento <b>${percent(snapshot.paid7.length, snapshot.creations7.length)}%</b></span></div>
      </div></section>
      <section class="panel"><div class="panel-head"><div><h2>Loja e sistema</h2><p>GitHub é o motor operacional; Make fica para IA/contingência.</p></div></div><div class="panel-body">
        <div class="cf-system-list">${queueLine('Produtos · Loja Integrada', snapshot.li)}${queueLine('Mídia da vitrine', snapshot.media)}</div>
        <div class="cf-health-line">
          <span class="cf-health-chip">Firebase ✓</span>
          <span class="cf-health-chip ${core.ok ? '' : 'warn'}">GitHub ${core.total ? `${core.ready}/${core.total}` : 'sem leitura'}${core.stale ? ' · desatualizado' : ''}</span>
          <span class="cf-health-chip ${core.ok ? '' : 'warn'}">Loja Integrada ${core.ok ? '✓' : 'verificar'}</span>
          <span class="cf-health-chip neutral">Make/OpenAI · IA + reserva</span>
        </div>
        <div class="cf-catalog-mini">${mugCount ? `<b>${mugCount} caneca(s)</b> no escopo do Admin · ` : ''}prontidão GitHub ${core.total ? ageLabel(core.updatedMs) : 'ainda não publicada'}.</div>
      </div></section>
    </div>`;
  bind(root);
}
async function apply(force = false) {
  if (!routeIsDashboard() || applying) return;
  applying = true;
  try { render(await loadSnapshot(force)); }
  catch (error) {
    console.error('[Admin Canecas] Dashboard operacional:', error);
    const root = $('#dashboard');
    if (root && routeIsDashboard()) {
      root.insertAdjacentHTML('afterbegin', `<div class="notice warn"><b>Dashboard operacional não pôde ser atualizado.</b> ${esc(error?.message || error)}</div>`);
    }
  } finally { applying = false; }
}
function schedule(force = false, delay = 180) { setTimeout(() => void apply(force), delay); }
function observeDashboard() {
  const root = $('#dashboard');
  if (!root || observer) return;
  observer = new MutationObserver(() => {
    if (routeIsDashboard() && !root.dataset.cfDashboardOps) schedule(false, 80);
  });
  observer.observe(root, { childList: true });
}
window.addEventListener('admin-canecas:route', event => {
  if (event.detail?.route === 'dashboard') schedule(Boolean(event.detail?.force), 220);
});
window.addEventListener('hashchange', () => { if (routeIsDashboard()) schedule(false, 180); });
document.addEventListener('DOMContentLoaded', () => { observeDashboard(); if (routeIsDashboard()) schedule(false, 250); });
setTimeout(() => { observeDashboard(); if (routeIsDashboard()) void apply(false); }, 500);
setInterval(() => { if (routeIsDashboard() && document.visibilityState === 'visible') void apply(true); }, 60_000);

document.documentElement.dataset.cfDashboardOperations = BUILD;
export { BUILD, loadSnapshot, buildSnapshot, apply };
