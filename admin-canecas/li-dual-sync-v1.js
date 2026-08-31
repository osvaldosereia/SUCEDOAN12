import { FIREBASE_BASE, text, norm, nowIso } from '../shared/mug-commerce-v1.js?v=20260828-1';
import { loadMugs, getMug, patchMug, invalidateMugs } from './mug-store-v2.js?v=20260829-1';

const BUILD = '20260831-admin-canecas-li-dual-sync-v1';
const QUEUE_NODE = 'canecas/integracoes/loja_integrada/fila';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let busy = false;
let scheduled = false;

function toast(message, error = false) {
  const el = $('#toast');
  if (!el) return alert(message);
  el.textContent = message;
  el.className = `toast${error ? ' error' : ''}`;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, error ? 7500 : 4200);
}
function keyOf(p = {}) { return text(p.__key || p.firebaseKey || p.id); }
function skuOf(p = {}) { return text(p.codigo || p.sku); }
function liOf(p = {}) { return p.loja_integrada && typeof p.loja_integrada === 'object' ? p.loja_integrada : {}; }
function liActive(p = {}) {
  if (p.loja_integrada_ativo === true) return true;
  if (p.loja_integrada_ativo === false) return false;
  return p.canecafacil_ativo === true;
}
function queueKey(key) {
  const bytes = new TextEncoder().encode(text(key));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
async function fbGet(path) {
  const r = await fetch(`${FIREBASE_BASE}/${path}.json?_=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Firebase ${r.status}`);
  return r.json();
}
async function fbPut(path, value) {
  const r = await fetch(`${FIREBASE_BASE}/${path}.json`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(value) });
  if (!r.ok) throw new Error(`Firebase ${r.status}`);
  return r.json().catch(() => null);
}
async function readQueue() { return (await fbGet(QUEUE_NODE).catch(() => ({}))) || {}; }
function duplicateSkus(products = []) {
  const groups = new Map();
  for (const p of products) {
    const sku = norm(skuOf(p));
    if (!sku) continue;
    if (!groups.has(sku)) groups.set(sku, []);
    groups.get(sku).push(p);
  }
  return new Map([...groups].filter(([, list]) => list.length > 1));
}
async function enqueueProduct(product, source = 'admin_github') {
  const key = keyOf(product), sku = skuOf(product);
  if (!key) throw new Error('Caneca sem chave do Firebase.');
  if (!sku) throw new Error(`${product.nome || key}: SKU não preenchido.`);
  const at = nowIso(), qKey = queueKey(key), oldLi = liOf(product);
  const item = {
    product_key: key,
    sku,
    nome: text(product.nome),
    acao: 'sincronizar',
    status: 'pendente',
    solicitado_em: at,
    atualizado_em: at,
    solicitado_por: source,
    tentativas: 0,
  };
  await Promise.all([
    fbPut(`${QUEUE_NODE}/${qKey}`, item),
    patchMug(key, {
      loja_integrada: {
        ...oldLi,
        sync_status: 'pendente',
        sync_error: '',
        sync_solicitado_em: at,
        sync_via: 'github_actions',
      },
      updated_at: at,
      last_update: Date.now(),
    }),
  ]);
  return item;
}
async function enqueueKeys(keys, source = 'admin_github_lote') {
  const unique = [...new Set((keys || []).map(text).filter(Boolean))];
  if (!unique.length) throw new Error('Selecione ao menos uma caneca.');
  const products = await loadMugs({ force: true });
  const byKey = new Map(products.map(p => [keyOf(p), p]));
  const dup = duplicateSkus(products);
  const blocked = [], targets = [];
  for (const key of unique) {
    const p = byKey.get(key);
    if (!p) { blocked.push(`${key}: não encontrada`); continue; }
    if (dup.has(norm(skuOf(p)))) { blocked.push(`${skuOf(p)}: SKU repetido no Firebase`); continue; }
    targets.push(p);
  }
  if (!targets.length) throw new Error(blocked[0] || 'Nenhuma caneca válida para enviar.');
  let ok = 0; const errors = [];
  for (let i = 0; i < targets.length; i += 1) {
    const p = targets[i];
    setProgress(`GitHub · colocando ${i + 1}/${targets.length}: ${p.nome || skuOf(p)}`);
    try { await enqueueProduct(p, source); ok += 1; }
    catch (error) { errors.push(`${p.nome || skuOf(p)}: ${error?.message || error}`); }
  }
  invalidateMugs('fila github actions');
  await refreshQueuePanel();
  const failures = [...blocked, ...errors];
  if (failures.length) toast(`${ok} enviada(s) ao GitHub · ${failures.length} bloqueada(s). ${failures[0]}`, true);
  else toast(`${ok} caneca(s) enviadas à fila do GitHub. Processamento automático em até alguns minutos.`);
  return { ok, blocked, errors };
}
function selectedKeys() { return $$('input[data-select-mug]:checked', $('#mugs')).map(x => text(x.dataset.selectMug)).filter(Boolean); }
function currentDrawerKey() { return text($('#drawerContent')?.dataset.productKey); }
function setProgress(value) { const el = $('#cfDualSyncProgress'); if (el) el.textContent = value || ''; }
async function withBusy(fn) {
  if (busy) return;
  busy = true; updateUi();
  try { await fn(); }
  catch (error) { toast(error?.message || error, true); }
  finally { busy = false; setProgress(''); updateUi(); }
}
async function saveDrawerThenQueue() {
  const key = currentDrawerKey();
  if (!key) throw new Error('Abra uma caneca para salvar e enviar.');
  const before = await getMug(key).catch(() => null);
  const beforeStamp = Number(before?.last_update || 0);
  const save = $('#cfSaveOnly');
  if (!save) throw new Error('Botão Salvar cadastro não encontrado.');
  save.click();
  const deadline = Date.now() + 10000;
  let saved = null;
  while (Date.now() < deadline) {
    await sleep(180);
    saved = await getMug(key).catch(() => null);
    const changed = Number(saved?.last_update || 0) !== beforeStamp;
    const drawerClosed = $('#drawer')?.getAttribute('aria-hidden') === 'true' || !$('#drawer')?.classList.contains('open');
    if (saved && (changed || drawerClosed)) break;
  }
  if (!saved) throw new Error('Não foi possível confirmar o salvamento no Firebase.');
  await enqueueProduct({ ...saved, __key: key }, 'admin_github_individual');
  toast('Cadastro salvo. Enviado para o GitHub Actions.');
}
async function queueSelected() { await enqueueKeys(selectedKeys(), 'admin_github_selecionadas'); }
async function queueAllActive() {
  const products = await loadMugs({ force: true });
  const keys = products.filter(liActive).map(keyOf);
  if (!keys.length) throw new Error('Não há canecas ativas no CanecaFácil.');
  if (!confirm(`Enviar ${keys.length} caneca(s) ativas para o GitHub?`)) return;
  await enqueueKeys(keys, 'admin_github_todas_ativas');
}
async function retryErrors() {
  const products = await loadMugs({ force: true });
  const keys = products.filter(p => ['erro', 'erro_final'].includes(text(liOf(p).sync_status))).map(keyOf);
  if (!keys.length) throw new Error('Nenhuma caneca está com erro de sincronização.');
  if (!confirm(`Reenviar ${keys.length} caneca(s) com erro pelo GitHub?`)) return;
  await enqueueKeys(keys, 'admin_github_reenviar_erros');
}
function statsOf(queue = {}) {
  const rows = Object.values(queue || {}).filter(Boolean);
  const count = status => rows.filter(x => text(x.status) === status).length;
  return { pendente: count('pendente'), processando: count('processando'), waiting: count('aguardando_imagens'), error: count('erro') + count('erro_final'), done: count('concluido') };
}
function metric(value, label) { return `<div class="cf-dual-metric"><b>${value}</b><span>${label}</span></div>`; }
async function refreshQueuePanel() {
  const panel = $('#cfDualSyncPanel'); if (!panel) return;
  const s = statsOf(await readQueue());
  const stats = $('#cfDualSyncStats', panel);
  if (stats) stats.innerHTML = [metric(s.pendente, 'aguardando'), metric(s.processando, 'processando'), metric(s.waiting, 'aguarda imagens'), metric(s.error, 'erro'), metric(s.done, 'concluídas')].join('');
}
function installStyles() {
  if ($('#cfDualSyncStyles')) return;
  const style = document.createElement('style');
  style.id = 'cfDualSyncStyles';
  style.textContent = `
    #cfDualSyncPanel{margin:14px 0;padding:14px;border:1px solid #dfe3dc;border-radius:14px;background:#fff}
    .cf-dual-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}
    .cf-dual-head h3{margin:0}.cf-dual-head p{margin:5px 0 0;color:#697068;max-width:760px;font-size:12px}
    .cf-dual-actions{display:flex;gap:7px;flex-wrap:wrap}.cf-dual-actions button{white-space:nowrap}
    #cfDualSyncStats{display:flex;gap:7px;flex-wrap:wrap;margin-top:11px}.cf-dual-metric{padding:8px 10px;border:1px solid #e5e8e2;border-radius:10px;min-width:92px}.cf-dual-metric b{display:block;font-size:17px}.cf-dual-metric span{font-size:10px;color:#697068}
    .cf-dual-note{font-size:11px;color:#697068;margin-top:8px}.cf-dual-note b{color:#202420}
    .cf-dual-drawer{padding:10px 12px;margin:10px 0;border:1px solid #e3e6df;border-radius:11px;background:#f8f9f6;font-size:12px}
    .cf-dual-drawer strong{display:block;margin-bottom:3px}.cf-github-primary{background:#111!important;color:#fff!important}
    @media(max-width:760px){.cf-dual-actions{display:grid;grid-template-columns:1fr 1fr;width:100%}.cf-dual-actions button{width:100%}}
  `;
  document.head.appendChild(style);
}
function ensurePanel() {
  if (!location.hash.includes('mugs')) return;
  const root = $('#mugs');
  if (!root || $('#cfDualSyncPanel', root)) return;
  const panel = document.createElement('section');
  panel.id = 'cfDualSyncPanel';
  panel.innerHTML = `
    <div class="cf-dual-head">
      <div>
        <h3>CanecaFácil · sincronização</h3>
        <p><b>GitHub é o principal.</b> Ele processa a fila automaticamente e procura o SKU antes de criar. <b>Make é a reserva imediata</b> para quando você precisar publicar sem esperar.</p>
      </div>
      <div class="cf-dual-actions">
        <button type="button" class="primary cf-github-primary" id="cfGithubSelected">GitHub · selecionadas</button>
        <button type="button" class="secondary" id="cfGithubAllActive">GitHub · todas ativas</button>
        <button type="button" class="secondary" id="cfGithubRetry">GitHub · reenviar erros</button>
        <button type="button" class="secondary" id="cfGithubRefresh">Atualizar status</button>
      </div>
    </div>
    <div id="cfDualSyncStats"></div>
    <div class="cf-dual-note"><b>Make:</b> use os botões “via Make” nas ações em lote ou dentro da caneca.</div>
    <div id="cfDualSyncProgress" class="cf-dual-note"></div>`;
  root.prepend(panel);
  $('#cfGithubSelected', panel).onclick = () => withBusy(queueSelected);
  $('#cfGithubAllActive', panel).onclick = () => withBusy(queueAllActive);
  $('#cfGithubRetry', panel).onclick = () => withBusy(retryErrors);
  $('#cfGithubRefresh', panel).onclick = () => withBusy(async () => { await refreshQueuePanel(); toast('Status do GitHub atualizado.'); });
  void refreshQueuePanel();
}
function enhanceDrawer() {
  const content = $('#drawerContent');
  const actions = $('.drawer-actions', content);
  if (!content || !actions) return;
  const makeSave = $('#cfSaveSync', content);
  if (makeSave) {
    makeSave.textContent = 'Salvar + sincronizar via Make';
    makeSave.classList.remove('primary');
    makeSave.classList.add('secondary');
    makeSave.title = 'Reserva imediata: salva e sincroniza pela automação do Make.';
  }
  const makeNow = $('#cfSyncNow', content);
  if (makeNow) {
    makeNow.textContent = 'Sincronizar agora via Make';
    makeNow.title = 'Reserva imediata: envia este cadastro pelo Make.';
  }
  let github = $('#cfSaveGithub', content);
  if (!github) {
    github = document.createElement('button');
    github.id = 'cfSaveGithub';
    github.type = 'button';
    github.className = 'primary cf-github-primary';
    github.onclick = () => withBusy(saveDrawerThenQueue);
    actions.insertBefore(github, actions.firstChild?.nextSibling || actions.firstChild);
  }
  const key = currentDrawerKey();
  void getMug(key).then(p => {
    if (!p || !github) return;
    github.textContent = text(liOf(p).produto_id) ? 'Salvar + atualizar via GitHub' : 'Salvar + publicar via GitHub';
  }).catch(() => { github.textContent = 'Salvar + enviar via GitHub'; });
  let info = $('#cfDualDrawerInfo', content);
  if (!info) {
    info = document.createElement('div');
    info.id = 'cfDualDrawerInfo';
    info.className = 'cf-dual-drawer';
    info.innerHTML = '<strong>Escolha o canal de sincronização</strong>GitHub = principal e automático (pode levar alguns minutos). Make = reserva imediata.';
    actions.insertAdjacentElement('beforebegin', info);
  }
}
function renameBulkMakeButtons() {
  const map = [
    ['#cfBulkActivateCf', 'Ativar CanecaFácil + Make'],
    ['#cfBulkActivateBoth', 'Ativar nos dois + Make'],
    ['#cfBulkSync', 'Sincronizar selecionadas via Make'],
  ];
  for (const [selector, label] of map) {
    const b = $(selector);
    if (b) { b.textContent = label; b.title = 'Contingência: sincronização imediata pelo Make.'; }
  }
}
function updateUi() {
  installStyles();
  ensurePanel();
  renameBulkMakeButtons();
  if ($('#drawer')?.getAttribute('aria-hidden') !== 'true') enhanceDrawer();
  for (const id of ['cfGithubSelected','cfGithubAllActive','cfGithubRetry','cfGithubRefresh','cfSaveGithub']) {
    const b = $(`#${id}`); if (b) b.disabled = busy;
  }
}
function scheduleUi() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => { scheduled = false; updateUi(); }, 80);
}
const observer = new MutationObserver(scheduleUi);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('hashchange', scheduleUi);
window.addEventListener('admin-canecas:drawer', event => { if (event.detail?.kind === 'mug') setTimeout(enhanceDrawer, 50); });
document.addEventListener('DOMContentLoaded', scheduleUi);
setTimeout(scheduleUi, 250);
setInterval(() => { if (location.hash.includes('mugs')) void refreshQueuePanel().catch(() => {}); }, 30000);

document.documentElement.dataset.cfLiDualSync = BUILD;
export { BUILD, enqueueProduct, enqueueKeys, readQueue, refreshQueuePanel };
