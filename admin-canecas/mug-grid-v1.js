import { FIREBASE_BASE, text, norm, mugArt, mugImage, audit, nowIso } from '../shared/mug-commerce-v1.js?v=20260828-1';
import { loadMugs, getMug, invalidateMugs } from './mug-store-v2.js?v=20260829-1';
import { liPayload } from './bulk-actions-v1.js?v=20260829-1';

const BUILD = '20260829-admin-canecas-mug-grid-v1.1';
const MAKE_WEBHOOK = window.__CANECAS_ADMIN_CONFIG__?.makeWebhook || 'https://hook.eu1.make.com/cl3r1f56r9txezvltkkwlsspmnja6sw4';
const state = { rendering: false, deleting: false };

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const productKey = product => text(product?.firebaseKey || product?.id || product?.__key);

function toast(message, error = false) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast${error ? ' error' : ''}`;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, error ? 6500 : 3500);
}
function liMeta(product = {}) {
  return product.loja_integrada && typeof product.loja_integrada === 'object' ? product.loja_integrada : {};
}
function daActive(product = {}) {
  if (product.ativo === true) return true;
  if (product.ativo === false) return false;
  return ['a', 'ativo', 'ativa', 'active', '1', 'true', 's', 'sim'].includes(norm(product.situacao || product.status || product.ativo));
}
function liActive(product = {}) {
  if (product.loja_integrada_ativo === true) return true;
  if (product.loja_integrada_ativo === false) return false;
  return product.canecafacil_ativo === true;
}
function hasLiEvidenceWithoutId(product = {}) {
  const li = liMeta(product);
  if (text(li.produto_id)) return false;
  const status = norm(li.sync_status);
  return liActive(product) || ['sincronizado', 'vinculado', 'enviando', 'pendente'].includes(status) || Boolean(text(li.resource_uri || li.url));
}
function horizontalImage(product = {}) {
  const art = text(mugArt(product));
  return /^https?:\/\//i.test(art) ? art : text(mugImage(product));
}

function installStyles() {
  if ($('#cfMugGridStyles')) return;
  const style = document.createElement('style');
  style.id = 'cfMugGridStyles';
  style.textContent = `
    #cfMugGridWrap{display:grid;gap:10px;margin:0 0 14px}
    .cf-mug-grid-tools{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:9px 11px;border:1px solid #e1e3dd;border-radius:12px;background:#fff}
    .cf-mug-grid-tools label{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:800;cursor:pointer}.cf-mug-grid-tools input{width:17px;height:17px;accent-color:#171918}
    .cf-mug-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
    .cf-mug-card{position:relative;display:grid;gap:9px;padding:9px;border:1px solid #dfe2dc;border-radius:14px;background:#fff;box-shadow:0 1px 0 rgba(0,0,0,.02)}
    .cf-mug-card[hidden]{display:none!important}.cf-mug-card.is-selected{border-color:#171918;box-shadow:0 0 0 1px #171918 inset}
    .cf-mug-card-select{position:absolute;z-index:2;top:14px;left:14px;display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:rgba(255,255,255,.94);box-shadow:0 1px 5px rgba(0,0,0,.12);cursor:pointer}
    .cf-mug-card-select input{width:18px;height:18px;margin:0;accent-color:#171918}
    .cf-mug-art{display:block;width:100%;aspect-ratio:2.5/1;object-fit:contain;background:#f4f5f1;border-radius:10px}
    .cf-mug-art-empty{width:100%;aspect-ratio:2.5/1;border-radius:10px;background:#f4f5f1;display:grid;place-items:center;color:#8a8e87;font-size:11px}
    .cf-mug-card-meta{display:grid;grid-template-columns:1fr 1fr;gap:6px}
    .cf-mug-channel{display:flex;align-items:center;justify-content:space-between;gap:5px;padding:7px 8px;border-radius:9px;background:#f7f8f5;font-size:10px;font-weight:800}
    .cf-mug-channel i{width:8px;height:8px;border-radius:50%;background:#a7aba4}.cf-mug-channel.active i{background:#2e7a45}
    .cf-mug-card-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}.cf-mug-card-actions button{min-height:34px;font-size:11px}
    .cf-mug-delete,.cf-mug-delete-selected{border-color:#d9a9a6!important;color:#9d302d!important;background:#fff!important}.cf-mug-delete:hover,.cf-mug-delete-selected:hover{background:#fff4f3!important}
    #cfHiddenCatalogTable{display:none!important}
    @media(max-width:700px){.cf-mug-grid{grid-template-columns:1fr}.cf-mug-card-actions button{min-height:40px}}
  `;
  document.head.appendChild(style);
}

function hiddenTablePanel(root) {
  const table = root?.querySelector('table.table');
  return table?.closest('.panel') || null;
}
function ensureBulkDeleteButton() {
  const bar = $('#cfBulkActions');
  if (!bar || $('#cfBulkDelete', bar)) return;
  const buttons = $('.cf-bulk-buttons', bar);
  if (!buttons) return;
  const button = document.createElement('button');
  button.id = 'cfBulkDelete';
  button.type = 'button';
  button.className = 'secondary cf-bulk-action cf-mug-delete-selected';
  button.textContent = 'Apagar selecionadas';
  button.onclick = deleteSelected;
  const clear = $('#cfBulkClear', buttons);
  if (clear) clear.insertAdjacentElement('beforebegin', button);
  else buttons.appendChild(button);
}
function ensureGridOrder() {
  const root = $('#mugs');
  if (!root) return;
  ensureBulkDeleteButton();
  const bulk = $('#cfBulkActions', root);
  const wrap = $('#cfMugGridWrap', root);
  if (bulk && wrap && bulk.nextElementSibling !== wrap) bulk.insertAdjacentElement('afterend', wrap);
}

function cardHtml(product = {}) {
  const key = productKey(product);
  const art = horizontalImage(product);
  const hiddenBox = $(`input[data-select-mug="${CSS.escape(key)}"]`, $('#mugs'));
  const checked = Boolean(hiddenBox?.checked);
  return `
    <article class="cf-mug-card${checked ? ' is-selected' : ''}" data-grid-mug="${esc(key)}">
      <label class="cf-mug-card-select" title="Selecionar"><input type="checkbox" data-grid-select="${esc(key)}" ${checked ? 'checked' : ''}></label>
      ${art ? `<img class="cf-mug-art" src="${esc(art)}" alt="${esc(product.nome || 'Arte da caneca')}" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '<div class="cf-mug-art-empty">Sem arte horizontal</div>'}
      <div class="cf-mug-card-meta">
        <div class="cf-mug-channel ${daActive(product) ? 'active' : ''}"><span>Dona Antônia</span><i></i></div>
        <div class="cf-mug-channel ${liActive(product) ? 'active' : ''}"><span>Caneca Fácil</span><i></i></div>
      </div>
      <div class="cf-mug-card-actions">
        <button class="secondary" type="button" data-grid-edit="${esc(key)}">Editar</button>
        <button class="secondary cf-mug-delete" type="button" data-grid-delete="${esc(key)}">Apagar</button>
      </div>
    </article>`;
}

async function renderGrid() {
  if (state.rendering || !location.hash.includes('mugs')) return;
  const root = $('#mugs');
  const tablePanel = hiddenTablePanel(root);
  if (!root || !tablePanel) return;
  state.rendering = true;
  try {
    installStyles();
    ensureBulkDeleteButton();
    tablePanel.id = 'cfHiddenCatalogTable';
    tablePanel.hidden = true;

    let wrap = $('#cfMugGridWrap', root);
    if (!wrap) {
      wrap = document.createElement('section');
      wrap.id = 'cfMugGridWrap';
      const bulk = $('#cfBulkActions', root);
      const exportBar = $('.li-export-bar', root);
      if (bulk) bulk.insertAdjacentElement('afterend', wrap);
      else if (exportBar) exportBar.insertAdjacentElement('beforebegin', wrap);
      else tablePanel.insertAdjacentElement('beforebegin', wrap);
    }
    const products = await loadMugs();
    wrap.innerHTML = `
      <div class="cf-mug-grid-tools">
        <label><input id="cfGridSelectVisible" type="checkbox"> Selecionar canecas visíveis</label>
        <span id="cfGridVisibleCount" class="badge">0 visíveis</span>
      </div>
      <div class="cf-mug-grid">${products.map(cardHtml).join('') || '<div class="notice">Nenhuma caneca encontrada.</div>'}</div>`;
    bindGrid();
    syncGridVisibility();
    syncGridSelection();
    ensureGridOrder();
    setTimeout(ensureGridOrder, 180);
    setTimeout(ensureGridOrder, 650);
  } finally {
    state.rendering = false;
  }
}

function syncGridVisibility() {
  const root = $('#mugs');
  if (!root) return;
  const cards = $$('[data-grid-mug]', root);
  let visible = 0;
  for (const card of cards) {
    const row = $(`tr[data-cf-mug="${CSS.escape(card.dataset.gridMug)}"]`, root);
    card.hidden = Boolean(row?.hidden);
    if (!card.hidden) visible += 1;
  }
  const count = $('#cfGridVisibleCount', root);
  if (count) count.textContent = `${visible} visíve${visible === 1 ? 'l' : 'is'}`;
  const selectVisible = $('#cfGridSelectVisible', root);
  if (selectVisible) {
    const visibleCards = cards.filter(card => !card.hidden);
    selectVisible.checked = visibleCards.length > 0 && visibleCards.every(card => $('[data-grid-select]', card)?.checked);
  }
}
function syncGridSelection() {
  const root = $('#mugs');
  if (!root) return;
  $$('[data-grid-mug]', root).forEach(card => {
    const key = card.dataset.gridMug;
    const hidden = $(`input[data-select-mug="${CSS.escape(key)}"]`, root);
    const box = $('[data-grid-select]', card);
    if (!box) return;
    box.checked = Boolean(hidden?.checked);
    card.classList.toggle('is-selected', box.checked);
  });
  syncGridVisibility();
}
function setSelected(key, checked) {
  const root = $('#mugs');
  const hidden = $(`input[data-select-mug="${CSS.escape(key)}"]`, root);
  if (hidden && hidden.checked !== checked) {
    hidden.checked = checked;
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const card = $(`[data-grid-mug="${CSS.escape(key)}"]`, root);
  const box = card ? $('[data-grid-select]', card) : null;
  if (box) box.checked = checked;
  card?.classList.toggle('is-selected', checked);
}
function bindGrid() {
  const root = $('#mugs');
  if (!root) return;
  $('#cfGridSelectVisible', root)?.addEventListener('change', event => {
    $$('[data-grid-mug]:not([hidden])', root).forEach(card => setSelected(card.dataset.gridMug, event.target.checked));
    syncGridSelection();
  });
  $$('[data-grid-select]', root).forEach(box => {
    box.addEventListener('change', () => { setSelected(box.dataset.gridSelect, box.checked); syncGridSelection(); });
  });
  $$('[data-grid-edit]', root).forEach(button => {
    button.addEventListener('click', () => {
      const row = $(`tr[data-cf-mug="${CSS.escape(button.dataset.gridEdit)}"]`, root);
      if (row) row.click();
      else toast('Não foi possível abrir esta caneca.', true);
    });
  });
  $$('[data-grid-delete]', root).forEach(button => {
    button.addEventListener('click', () => deleteOne(button.dataset.gridDelete));
  });
}

async function callMake(payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch(MAKE_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ payload: JSON.stringify(payload) }),
      signal: controller.signal,
    });
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
    if (!response.ok || data.ok === false) throw new Error(data.error || data.error_message || `Make HTTP ${response.status}: ${raw.slice(0, 180)}`);
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Tempo esgotado esperando a Loja Integrada.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function removeFromLojaIntegrada(product) {
  const li = liMeta(product);
  const productId = text(li.produto_id);
  if (!productId) {
    if (hasLiEvidenceWithoutId(product)) {
      throw new Error('A caneca aparenta estar na Loja Integrada, mas o Admin não possui o ID do produto. A exclusão foi bloqueada para não deixar produto órfão.');
    }
    return { skipped: true };
  }
  const payload = liPayload({ ...product, loja_integrada_ativo: false, canecafacil_ativo: false });
  payload.action = 'loja_integrada_update_product';
  payload.request_id = `LI-REMOVE-${Date.now().toString(36).toUpperCase()}`;
  payload.loja_integrada_product_id = productId;
  payload.ativo_loja = false;
  payload.source = BUILD;
  const productBody = JSON.parse(payload.produto_json || '{}');
  productBody.ativo = false;
  productBody.removido = true;
  payload.produto_json = JSON.stringify(productBody);
  return callMake(payload);
}

async function deleteFirebaseProduct(key) {
  const response = await fetch(`${FIREBASE_BASE}/produtos/${encodeURIComponent(key)}.json`, {
    method: 'DELETE', headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Firebase ${response.status} ao apagar a caneca.`);
}

async function performDelete(key) {
  const product = await getMug(key);
  if (!product) return { ok: true, key, alreadyMissing: true };
  const li = liMeta(product);
  if (text(li.produto_id) || hasLiEvidenceWithoutId(product)) await removeFromLojaIntegrada(product);
  await deleteFirebaseProduct(key);
  await audit('caneca_excluida_v1', {
    produto_key: key,
    nome: text(product.nome),
    loja_integrada_produto_id: text(li.produto_id),
    removida_loja_integrada: Boolean(text(li.produto_id)),
    removida_firebase: true,
    source: BUILD,
    excluida_em: nowIso(),
  }).catch(() => {});
  return { ok: true, key };
}

function deleteWarning(product, count = 1) {
  const linked = Boolean(text(liMeta(product).produto_id));
  if (count > 1) return `Apagar ${count} canecas selecionadas? As vinculadas à Loja Integrada serão movidas para a lixeira/ocultadas primeiro e, somente depois, apagadas do Firebase. Esta ação não apaga automaticamente os arquivos físicos das imagens.`;
  return linked
    ? 'Apagar esta caneca? Ela será movida para a lixeira/ocultada na Loja Integrada primeiro e, somente depois, apagada do Firebase. Os arquivos físicos das imagens não são apagados automaticamente.'
    : 'Apagar esta caneca do Firebase? Os arquivos físicos das imagens não são apagados automaticamente.';
}

async function deleteOne(key, { skipConfirm = false } = {}) {
  if (state.deleting) return;
  const product = await getMug(key).catch(() => null);
  if (!product) return toast('Caneca não encontrada.', true);
  if (!skipConfirm && !confirm(deleteWarning(product))) return;
  state.deleting = true;
  try {
    toast(text(liMeta(product).produto_id) ? 'Removendo da Loja Integrada e do Firebase…' : 'Removendo do Firebase…');
    await performDelete(key);
    closeDrawerIfKey(key);
    invalidateMugs('caneca excluída');
    toast('Caneca apagada com segurança.');
    refreshCatalog();
  } catch (error) {
    toast(`Não foi possível apagar: ${error?.message || error}`, true);
  } finally {
    state.deleting = false;
  }
}

async function deleteSelected() {
  if (state.deleting) return;
  const root = $('#mugs');
  const keys = $$('input[data-select-mug]:checked', root).map(box => text(box.dataset.selectMug)).filter(Boolean);
  if (!keys.length) return toast('Selecione ao menos uma caneca.', true);
  const first = await getMug(keys[0]).catch(() => ({}));
  if (!confirm(deleteWarning(first, keys.length))) return;

  state.deleting = true;
  const button = $('#cfBulkDelete');
  if (button) { button.disabled = true; button.textContent = `Apagando 0/${keys.length}`; }
  const success = [];
  const failures = [];
  try {
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (button) button.textContent = `Apagando ${index + 1}/${keys.length}`;
      try {
        await performDelete(key);
        success.push(key);
        setSelected(key, false);
        await sleep(450);
      } catch (error) {
        failures.push({ key, error: error?.message || String(error) });
      }
    }
    invalidateMugs('exclusão em lote');
    const suffix = failures.length ? ` · ${failures.length} falha(s)` : '';
    toast(`${success.length} caneca(s) apagada(s)${suffix}.`, failures.length > 0 && success.length === 0);
    if (failures.length) console.warn('[Admin Canecas] falhas ao apagar em lote:', failures);
    refreshCatalog();
  } finally {
    state.deleting = false;
    if (button) { button.textContent = 'Apagar selecionadas'; button.disabled = false; }
  }
}

function closeDrawerIfKey(key) {
  const content = $('#drawerContent');
  if (content?.dataset.productKey !== key) return;
  $('#drawer')?.classList.remove('open');
  $('#drawer')?.setAttribute('aria-hidden', 'true');
  const overlay = $('#overlay');
  if (overlay) overlay.hidden = true;
}
function installDrawerDelete() {
  const content = $('#drawerContent');
  const key = text(content?.dataset.productKey);
  const actions = $('.drawer-actions', content);
  if (!key || !actions || $('#cfDeleteProduct', actions)) return;
  const button = document.createElement('button');
  button.id = 'cfDeleteProduct';
  button.type = 'button';
  button.className = 'danger cf-mug-delete';
  button.textContent = 'Apagar caneca';
  button.onclick = () => deleteOne(key);
  actions.appendChild(button);
}

function refreshCatalog() {
  const reload = $('#cfMugReload');
  if (reload) reload.click();
  else window.dispatchEvent(new CustomEvent('admin-canecas:route', { detail: { route: 'mugs', force: true, source: BUILD } }));
  setTimeout(() => renderGrid(), 450);
  setTimeout(ensureGridOrder, 800);
}
function scheduleRender(attempt = 0) {
  if (!location.hash.includes('mugs')) return;
  const root = $('#mugs');
  if (root?.querySelector('table.table')) return void renderGrid();
  if (attempt < 40) setTimeout(() => scheduleRender(attempt + 1), 120);
}

window.addEventListener('admin-canecas:route', event => {
  if (event.detail?.route === 'mugs') {
    setTimeout(() => scheduleRender(), 0);
    setTimeout(ensureGridOrder, 700);
  }
});
window.addEventListener('admin-canecas:drawer', event => {
  if (event.detail?.kind === 'mug') queueMicrotask(installDrawerDelete);
});
document.addEventListener('input', event => {
  if (event.target.matches?.('#cfMugSearch')) setTimeout(syncGridVisibility, 0);
});
document.addEventListener('change', event => {
  if (event.target.matches?.('#cfMugFilter')) setTimeout(syncGridVisibility, 0);
  if (event.target.matches?.('input[data-select-mug],#cfSelectAll')) queueMicrotask(syncGridSelection);
});
document.addEventListener('click', event => {
  if (event.target.closest?.('#cfMugReload')) {
    setTimeout(() => scheduleRender(), 350);
    setTimeout(ensureGridOrder, 850);
  }
}, true);

if (location.hash.includes('mugs')) scheduleRender();
document.documentElement.dataset.cfMugGrid = BUILD;

export { BUILD, renderGrid, deleteOne, deleteSelected, performDelete, removeFromLojaIntegrada };
