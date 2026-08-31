import { FIREBASE_BASE, text, norm, nowIso } from '../shared/mug-commerce-v1.js?v=20260828-1';
import { loadMugs, getMug, patchMug, invalidateMugs } from './mug-store-v2.js?v=20260829-1';

const BUILD = '20260830-admin-canecas-li-github-queue-v1';
const QUEUE_NODE = 'canecas/integracoes/loja_integrada/fila';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const innerFetch = window.fetch.bind(window);
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
function queueKey(key) {
  const bytes = new TextEncoder().encode(text(key));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function liActive(p = {}) {
  if (p.loja_integrada_ativo === true) return true;
  if (p.loja_integrada_ativo === false) return false;
  return p.canecafacil_ativo === true;
}
async function fbGet(path) {
  const r = await innerFetch(`${FIREBASE_BASE}/${path}.json?_=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Firebase ${r.status}`);
  return r.json();
}
async function fbPut(path, value) {
  const r = await innerFetch(`${FIREBASE_BASE}/${path}.json`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(value) });
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
async function enqueueProduct(product, { source = 'admin', resetAttempts = true } = {}) {
  const key = keyOf(product), sku = skuOf(product);
  if (!key) throw new Error('Caneca sem chave do Firebase.');
  if (!sku) throw new Error(`${product.nome || key}: SKU não preenchido.`);
  const at = nowIso(), qKey = queueKey(key), oldLi = liOf(product);
  const item = { product_key: key, sku, nome: text(product.nome), acao: 'sincronizar', status: 'pendente', solicitado_em: at, atualizado_em: at, solicitado_por: source, tentativas: resetAttempts ? 0 : Number(oldLi.sync_tentativas || 0) };
  await Promise.all([
    fbPut(`${QUEUE_NODE}/${qKey}`, item),
    patchMug(key, { loja_integrada: { ...oldLi, sync_status: 'pendente', sync_error: '', sync_solicitado_em: at, sync_via: 'github_actions' }, updated_at: at, last_update: Date.now() }),
  ]);
  return item;
}
async function enqueueKeys(keys, options = {}) {
  const unique = [...new Set(keys.map(text).filter(Boolean))];
  if (!unique.length) throw new Error('Selecione ao menos uma caneca.');
  const products = await loadMugs({ force: true }), byKey = new Map(products.map(p => [keyOf(p), p])), dup = duplicateSkus(products), blocked = [], targets = [];
  for (const key of unique) {
    const p = byKey.get(key);
    if (!p) { blocked.push(`${key}: não encontrada`); continue; }
    if (dup.get(norm(skuOf(p)))) { blocked.push(`${skuOf(p)}: SKU repetido no Firebase`); continue; }
    targets.push(p);
  }
  if (!targets.length) throw new Error(blocked[0] || 'Nenhuma caneca válida para enviar.');
  let ok = 0; const errors = [];
  for (let i = 0; i < targets.length; i += 1) {
    const p = targets[i];
    setProgress(`Colocando na fila ${i + 1}/${targets.length}: ${p.nome || skuOf(p)}`);
    try { await enqueueProduct(p, options); ok += 1; }
    catch (error) { errors.push(`${p.nome || skuOf(p)}: ${error?.message || error}`); }
  }
  invalidateMugs('fila github actions');
  await refreshQueuePanel();
  if (blocked.length || errors.length) toast(`${ok} enviada(s) para a fila · ${blocked.length + errors.length} bloqueada(s). ${[...blocked, ...errors][0]}`, true);
  else toast(`${ok} caneca(s) colocada(s) na fila CanecaFácil. O GitHub processa automaticamente.`);
  return { ok, blocked, errors };
}
function selectedKeys() { return $$('input[data-select-mug]:checked', $('#mugs')).map(x => text(x.dataset.selectMug)).filter(Boolean); }
function currentDrawerKey() { return text($('#drawerContent')?.dataset.productKey); }
async function saveDrawerThenQueue() {
  const key = currentDrawerKey();
  if (!key) throw new Error('Abra uma caneca para salvar e enviar.');
  const before = await getMug(key).catch(() => null), beforeStamp = Number(before?.last_update || 0), save = $('#cfSaveOnly');
  if (!save) throw new Error('Botão de salvar não encontrado.');
  save.click();
  const deadline = Date.now() + 9000; let saved = null;
  while (Date.now() < deadline) {
    await sleep(180);
    saved = await getMug(key).catch(() => null);
    const drawerClosed = $('#drawer')?.getAttribute('aria-hidden') === 'true' || !$('#drawer')?.classList.contains('open');
    const changed = Number(saved?.last_update || 0) !== beforeStamp;
    if (saved && (drawerClosed || changed)) break;
  }
  if (!saved) throw new Error('Não foi possível confirmar o salvamento no Firebase.');
  await enqueueProduct({ ...saved, __key: key }, { source: 'admin_individual' });
  toast('Cadastro salvo e colocado na fila CanecaFácil. A sincronização será automática.');
}
async function bulkActivate(keys, both = false) {
  const products = await loadMugs({ force: true }), byKey = new Map(products.map(p => [keyOf(p), p]));
  for (const key of keys) {
    const p = byKey.get(key); if (!p) continue;
    await patchMug(key, { ...(both ? { ativo: true, situacao: 'A' } : {}), loja_integrada_ativo: true, canecafacil_ativo: true, loja_integrada: { ...liOf(p), ativo: true }, updated_at: nowIso(), last_update: Date.now() });
  }
  await enqueueKeys(keys, { source: both ? 'admin_lote_ativar_ambos' : 'admin_lote_ativar_canecafacil' });
}
function setProgress(value) { const el = $('#cfLiQueueProgress'); if (el) el.textContent = value || ''; }
async function withBusy(fn) { if (busy) return; busy = true; enhanceButtons(); try { await fn(); } catch (error) { toast(error?.message || error, true); } finally { busy = false; setProgress(''); enhanceButtons(); } }
async function interceptAction(button) {
  const id = button.id;
  if (id === 'cfSaveSync') return saveDrawerThenQueue();
  if (id === 'cfRefs') return toast('Marca e categorias são consultadas automaticamente pelo GitHub Actions em cada sincronização.');
  const keys = selectedKeys();
  if (id === 'cfBulkActivateCf') return bulkActivate(keys, false);
  if (id === 'cfBulkActivateBoth') return bulkActivate(keys, true);
  if (id === 'cfBulkSync') return enqueueKeys(keys, { source: 'admin_lote' });
}
document.addEventListener('click', event => {
  const button = event.target.closest?.('#cfSaveSync,#cfRefs,#cfBulkActivateCf,#cfBulkActivateBoth,#cfBulkSync');
  if (!button) return;
  event.preventDefault(); event.stopImmediatePropagation();
  void withBusy(() => interceptAction(button));
}, true);

async function queueSelected() { await enqueueKeys(selectedKeys(), { source: 'admin_selecionadas' }); }
async function queueAllActive() {
  const products = await loadMugs({ force: true }), keys = products.filter(liActive).map(keyOf);
  if (!keys.length) throw new Error('Não há canecas ativas no CanecaFácil.');
  if (!confirm(`Colocar ${keys.length} caneca(s) ativas na fila para criar/atualizar?`)) return;
  await enqueueKeys(keys, { source: 'admin_todas_ativas' });
}
async function retryErrors() {
  const products = await loadMugs({ force: true }), keys = products.filter(p => ['erro', 'erro_final'].includes(text(liOf(p).sync_status))).map(keyOf);
  if (!keys.length) throw new Error('Nenhuma caneca está com erro de sincronização.');
  if (!confirm(`Reenviar ${keys.length} caneca(s) com erro?`)) return;
  await enqueueKeys(keys, { source: 'admin_reenviar_erros', resetAttempts: true });
}
function statsOf(queue = {}) {
  const rows = Object.values(queue || {}).filter(Boolean), count = status => rows.filter(x => text(x.status) === status).length;
  return { pendente: count('pendente'), processando: count('processando'), waiting: count('aguardando_imagens'), error: count('erro') + count('erro_final'), done: count('concluido') };
}
function metric(value, label) { return `<div style="padding:9px 11px;border:1px solid #e8e8e3;border-radius:10px;min-width:105px"><b style="font-size:18px">${value}</b><br><span style="font-size:11px">${label}</span></div>`; }
async function refreshQueuePanel() {
  const panel = $('#cfLiGithubQueue'); if (!panel) return;
  const s = statsOf(await readQueue()), stats = $('#cfLiQueueStats', panel);
  if (stats) stats.innerHTML = [metric(s.pendente, 'aguardando'), metric(s.processando, 'processando'), metric(s.waiting, 'aguarda imagens'), metric(s.error, 'com erro'), metric(s.done, 'concluídas')].join('');
}
function ensurePanel() {
  const root = $('#mugs'); if (!root || $('#cfLiGithubQueue', root)) return;
  const panel = document.createElement('section'); panel.id = 'cfLiGithubQueue'; panel.className = 'panel'; panel.style.margin = '14px 0';
  panel.innerHTML = `<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><h3 style="margin:0">CanecaFácil · sincronização automática</h3><p style="margin:4px 0 0;color:#6d726c;max-width:760px">O Admin coloca os produtos na fila. O GitHub Actions cria ou atualiza na Loja Integrada procurando primeiro pelo SKU. Normalmente a atualização acontece em até alguns minutos.</p></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="primary" id="cfLiQueueSelected">Enviar selecionadas</button><button type="button" class="secondary" id="cfLiQueueAllActive">Enviar todas ativas</button><button type="button" class="secondary" id="cfLiQueueRetry">Reenviar erros</button><button type="button" class="secondary" id="cfLiQueueRefresh">Atualizar status</button></div></div><div id="cfLiQueueStats" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"></div><div id="cfLiQueueProgress" style="font-size:12px;margin-top:8px"></div>`;
  root.prepend(panel);
  $('#cfLiQueueSelected', panel).onclick = () => withBusy(queueSelected);
  $('#cfLiQueueAllActive', panel).onclick = () => withBusy(queueAllActive);
  $('#cfLiQueueRetry', panel).onclick = () => withBusy(retryErrors);
  $('#cfLiQueueRefresh', panel).onclick = () => withBusy(async () => { invalidateMugs('atualizar status fila'); await refreshQueuePanel(); toast('Status da fila atualizado.'); });
  void refreshQueuePanel();
}
function enhanceDrawer() {
  const actions = $('.drawer-actions', $('#drawerContent')); if (!actions) return;
  const sync = $('#cfSaveSync');
  if (sync) {
    const key = currentDrawerKey();
    void getMug(key).then(p => { if (!p || !sync) return; const linked = Boolean(text(liOf(p).produto_id)); sync.textContent = linked ? 'Salvar e atualizar CanecaFácil' : 'Salvar e publicar no CanecaFácil'; sync.title = 'Salva no Firebase e coloca na fila do GitHub Actions. O produto existente é localizado pelo SKU antes de qualquer criação.'; }).catch(() => {});
  }
  let box = $('#cfGitHubSyncInfo', $('#drawerContent'));
  if (!box) { box = document.createElement('div'); box.id = 'cfGitHubSyncInfo'; box.className = 'notice'; box.style.margin = '12px 0 8px'; box.innerHTML = '<b>Sincronização segura pelo GitHub Actions.</b><br>Salvar envia para a fila. O sistema procura o SKU, atualiza se já existir e cria somente se for realmente novo.'; actions.insertAdjacentElement('beforebegin', box); }
}
function enhanceButtons() {
  const sync = $('#cfSaveSync'); if (sync) sync.disabled = busy;
  const refs = $('#cfRefs'); if (refs) { refs.textContent = 'Marca/categorias automáticas'; refs.title = 'O GitHub consulta marca e categorias diretamente na Loja Integrada durante a sincronização.'; }
  for (const [selector, label] of [['#cfBulkActivateCf', 'Ativar CanecaFácil + enviar'], ['#cfBulkActivateBoth', 'Ativar nos dois + enviar'], ['#cfBulkSync', 'Enviar/atualizar selecionadas']]) { const b = $(selector); if (b) { b.textContent = label; b.disabled = busy; } }
  ensurePanel();
  if ($('#drawer')?.getAttribute('aria-hidden') !== 'true') enhanceDrawer();
}
function scheduleEnhance() { if (scheduled) return; scheduled = true; setTimeout(() => { scheduled = false; enhanceButtons(); }, 80); }
const observer = new MutationObserver(scheduleEnhance); observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('hashchange', scheduleEnhance);
window.addEventListener('admin-canecas:drawer', event => { if (event.detail?.kind === 'mug') setTimeout(enhanceDrawer, 50); });
document.addEventListener('DOMContentLoaded', scheduleEnhance);
setTimeout(scheduleEnhance, 250);
setInterval(() => { if (location.hash.includes('mugs')) void refreshQueuePanel().catch(() => {}); }, 30000);
document.documentElement.dataset.cfLiGithubQueue = BUILD;
export { BUILD, enqueueProduct, enqueueKeys, readQueue, refreshQueuePanel };
