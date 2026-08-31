import { FIREBASE_BASE, text, norm, nowIso } from '../shared/mug-commerce-v1.js?v=20260828-1';
import { loadMugs, getMug, patchMug, invalidateMugs } from './mug-store-v2.js?v=20260829-1';

const BUILD = '20260831-admin-canecas-li-dual-sync-v3';
const QUEUE_NODE = 'canecas/integracoes/loja_integrada/fila';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let busy = false;
let refreshBusy = false;

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
    setProgress(`Enviando ${i + 1}/${targets.length}: ${p.nome || skuOf(p)}`);
    try { await enqueueProduct(p, source); ok += 1; }
    catch (error) { errors.push(`${p.nome || skuOf(p)}: ${error?.message || error}`); }
  }
  invalidateMugs('fila github actions');
  await refreshQueuePanel();
  const failures = [...blocked, ...errors];
  if (failures.length) toast(`${ok} enviada(s) · ${failures.length} bloqueada(s). ${failures[0]}`, true);
  else toast(`${ok} caneca(s) enviadas ao GitHub para publicação.`);
}
function selectedKeys() {
  return $$('input[data-select-mug]:checked', $('#mugs')).map(x => text(x.dataset.selectMug)).filter(Boolean);
}
function currentDrawerKey() { return text($('#drawerContent')?.dataset.productKey); }
function setProgress(value) {
  const el = $('#cfDualSyncProgress');
  if (el && el.textContent !== (value || '')) el.textContent = value || '';
}
async function withBusy(fn) {
  if (busy) return;
  busy = true;
  applyDisabledState();
  try { await fn(); }
  catch (error) { toast(error?.message || error, true); }
  finally { busy = false; setProgress(''); applyDisabledState(); }
}
async function saveDrawerThenQueue() {
  const key = currentDrawerKey();
  if (!key) throw new Error('Abra uma caneca para salvar e publicar.');
  const before = await getMug(key).catch(() => null);
  const beforeStamp = Number(before?.last_update || 0);
  const save = $('#cfSaveOnly');
  if (!save) throw new Error('Botão Salvar não encontrado.');
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
  toast('Cadastro salvo e enviado ao GitHub para publicação.');
}
async function queueSelected() { await enqueueKeys(selectedKeys(), 'admin_github_selecionadas'); }
async function queueAllActive() {
  const products = await loadMugs({ force: true });
  const keys = products.filter(liActive).map(keyOf);
  if (!keys.length) throw new Error('Não há canecas ativas no CanecaFácil.');
  if (!confirm(`Publicar/atualizar ${keys.length} caneca(s) ativas pelo GitHub?`)) return;
  await enqueueKeys(keys, 'admin_github_todas_ativas');
}
async function retryErrors() {
  const products = await loadMugs({ force: true });
  const keys = products.filter(p => ['erro', 'erro_final'].includes(text(liOf(p).sync_status))).map(keyOf);
  if (!keys.length) throw new Error('Nenhuma caneca está com erro de publicação.');
  if (!confirm(`Reenviar ${keys.length} caneca(s) com erro?`)) return;
  await enqueueKeys(keys, 'admin_github_reenviar_erros');
}
function statsOf(queue = {}) {
  const rows = Object.values(queue || {}).filter(Boolean);
  const count = status => rows.filter(x => text(x.status) === status).length;
  return {
    waiting: count('pendente') + count('aguardando_imagens'),
    processing: count('processando'),
    error: count('erro') + count('erro_final'),
    done: count('concluido'),
  };
}
function metric(value, label) { return `<span class="cf-dual-mini"><b>${value}</b> ${label}</span>`; }
async function refreshQueuePanel() {
  const panel = $('#cfDualSyncPanel');
  if (!panel || refreshBusy) return;
  refreshBusy = true;
  try {
    const s = statsOf(await readQueue());
    const html = [metric(s.waiting, 'aguardando'), metric(s.processing, 'processando'), metric(s.error, 'erros'), metric(s.done, 'concluídas')].join('');
    const stats = $('#cfDualSyncStats', panel);
    if (stats && stats.innerHTML !== html) stats.innerHTML = html;
  } finally { refreshBusy = false; }
}
function installStyles() {
  if ($('#cfDualSyncStylesV3')) return;
  const style = document.createElement('style');
  style.id = 'cfDualSyncStylesV3';
  style.textContent = `
    #cfDualSyncPanel{margin:0 0 12px;padding:13px 14px;border:1px solid #dfe3dc;border-radius:14px;background:#fff}
    .cf-dual-head{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}
    .cf-dual-head h3{margin:0;font-size:15px}.cf-dual-head p{margin:4px 0 0;color:#697068;font-size:11px}
    .cf-dual-actions{display:flex;gap:7px;flex-wrap:wrap}.cf-dual-actions button{white-space:nowrap}
    #cfDualSyncStats{display:flex;gap:12px;flex-wrap:wrap;margin-top:9px;color:#697068;font-size:11px}.cf-dual-mini b{color:#202420}
    .cf-dual-note{font-size:11px;color:#697068;margin-top:7px}.cf-github-primary{background:#111!important;color:#fff!important}
    .cf-dual-drawer{padding:9px 11px;margin:9px 0;border:1px solid #e3e6df;border-radius:10px;background:#f8f9f6;font-size:11px;color:#5f655f}
    #mugs .li-export-bar{display:none!important}
    #cfBulkActivateDa,#cfBulkActivateCf,#cfBulkActivateBoth{display:none!important}
    #cfBulkProgress[hidden]{display:none!important}
    @media(max-width:760px){.cf-dual-actions{display:grid;grid-template-columns:1fr 1fr;width:100%}.cf-dual-actions button{width:100%}}
  `;
  document.head.appendChild(style);
}
function ensurePanel() {
  if (!location.hash.includes('mugs')) return false;
  const root = $('#mugs');
  if (!root) return false;
  if ($('#cfDualSyncPanel', root)) return true;
  const panel = document.createElement('section');
  panel.id = 'cfDualSyncPanel';
  panel.innerHTML = `
    <div class="cf-dual-head">
      <div><h3>Publicar na Loja Integrada</h3><p>GitHub é o caminho padrão. Use o Make somente como reserva se precisar.</p></div>
      <div class="cf-dual-actions">
        <button type="button" class="primary cf-github-primary" id="cfGithubSelected">Publicar selecionadas · GitHub</button>
        <button type="button" class="secondary" id="cfGithubAllActive">Publicar todas ativas</button>
        <button type="button" class="secondary" id="cfGithubRetry">Reenviar erros</button>
        <button type="button" class="secondary" id="cfGithubRefresh">Atualizar status</button>
      </div>
    </div>
    <div id="cfDualSyncStats"></div>
    <div id="cfDualSyncProgress" class="cf-dual-note"></div>`;
  root.prepend(panel);
  $('#cfGithubSelected', panel).onclick = () => withBusy(queueSelected);
  $('#cfGithubAllActive', panel).onclick = () => withBusy(queueAllActive);
  $('#cfGithubRetry', panel).onclick = () => withBusy(retryErrors);
  $('#cfGithubRefresh', panel).onclick = () => withBusy(refreshQueuePanel);
  void refreshQueuePanel();
  return true;
}
function setButtonText(button, label, title = '') {
  if (!button) return;
  if (button.textContent !== label) button.textContent = label;
  if (title && button.title !== title) button.title = title;
}
function simplifyBulkBar() {
  const bar = $('#cfBulkActions');
  if (!bar) return;
  const title = $('.cf-bulk-head strong', bar);
  const helper = $('.cf-bulk-head small', bar);
  if (title) title.textContent = 'Seleção';
  if (helper) helper.textContent = 'Marque as canecas que deseja publicar, apagar ou desmarcar.';
  for (const id of ['cfBulkActivateDa','cfBulkActivateCf','cfBulkActivateBoth']) {
    const button = $(`#${id}`, bar);
    if (button) button.hidden = true;
  }
  setButtonText($('#cfBulkSync', bar), 'Publicar selecionadas · Make', 'Reserva: envia imediatamente pelo Make.');
  setButtonText($('#cfBulkDelete', bar), 'Apagar selecionadas');
  setButtonText($('#cfBulkClear', bar), 'Desmarcar');
  const status = $('#cfBulkStatus', bar);
  if (status && /selecione as canecas/i.test(status.textContent || '')) status.textContent = 'Make = reserva. Para o uso normal, publique pelo GitHub acima.';

  const root = $('#mugs');
  if (root) {
    [...root.children].forEach(node => {
      if (node.classList?.contains('notice') && /uma única fonte de dados/i.test(node.textContent || '')) node.hidden = true;
    });
  }
}
function enhanceDrawer() {
  const content = $('#drawerContent');
  const actions = $('.drawer-actions', content);
  if (!content || !actions) return;
  setButtonText($('#cfSaveOnly', content), 'Salvar');
  setButtonText($('#cfSaveSync', content), 'Salvar + publicar · Make', 'Reserva imediata pelo Make.');
  const syncNow = $('#cfSyncNow', content);
  if (syncNow) syncNow.hidden = true;

  let github = $('#cfSaveGithub', content);
  if (!github) {
    github = document.createElement('button');
    github.id = 'cfSaveGithub';
    github.type = 'button';
    github.className = 'primary cf-github-primary';
    github.textContent = 'Salvar + publicar · GitHub';
    github.onclick = () => withBusy(saveDrawerThenQueue);
    actions.insertBefore(github, actions.firstChild?.nextSibling || actions.firstChild);
  }
  const key = currentDrawerKey();
  if (key && github.dataset.labelKey !== key) {
    github.dataset.labelKey = key;
    void getMug(key).then(p => {
      if (!p || !github?.isConnected) return;
      setButtonText(github, text(liOf(p).produto_id) ? 'Salvar + atualizar · GitHub' : 'Salvar + publicar · GitHub');
    }).catch(() => {});
  }
  if (!$('#cfDualDrawerInfo', content)) {
    const info = document.createElement('div');
    info.id = 'cfDualDrawerInfo';
    info.className = 'cf-dual-drawer';
    info.textContent = 'GitHub é o padrão. Use Make apenas se precisar publicar imediatamente por contingência.';
    actions.insertAdjacentElement('beforebegin', info);
  }
}
function applyDisabledState() {
  for (const id of ['cfGithubSelected','cfGithubAllActive','cfGithubRetry','cfGithubRefresh','cfSaveGithub']) {
    const b = $(`#${id}`);
    if (b && b.disabled !== busy) b.disabled = busy;
  }
}
function updateUi() {
  if (!location.hash.includes('mugs')) return;
  installStyles();
  ensurePanel();
  simplifyBulkBar();
  if ($('#drawer')?.getAttribute('aria-hidden') !== 'true') enhanceDrawer();
  applyDisabledState();
}
function scheduleUi(delays = [0, 140]) {
  for (const delay of delays) setTimeout(updateUi, delay);
}

window.addEventListener('hashchange', () => scheduleUi());
window.addEventListener('admin-canecas:route', event => { if (event.detail?.route === 'mugs') scheduleUi(); });
window.addEventListener('admin-canecas:mugs-stable-rendered', () => scheduleUi([0, 80]));
window.addEventListener('admin-canecas:drawer', event => { if (event.detail?.kind === 'mug') scheduleUi([30, 180]); });
document.addEventListener('DOMContentLoaded', () => scheduleUi());
setTimeout(updateUi, 350);

document.documentElement.dataset.cfLiDualSync = BUILD;
export { BUILD, enqueueProduct, enqueueKeys, readQueue, refreshQueuePanel };
