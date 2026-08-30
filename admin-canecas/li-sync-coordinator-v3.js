import { text, norm, nowIso } from '../shared/mug-commerce-v1.js?v=20260828-1';
import { loadMugs, getMug, patchMug } from './mug-store-v2.js?v=20260829-1';
import { recoverOne, duplicateSkuGroups, liMeta, skuOf, keyOf } from './li-recovery-v2.js?v=20260830-2';

const BUILD = '20260830-admin-canecas-li-sync-coordinator-v3';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const replaying = new WeakSet();
const preparing = new Set();

function toast(message, error = false) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast${error ? ' error' : ''}`;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, error ? 7000 : 3500);
}
function slug(value) {
  return norm(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 145) || 'caneca';
}
function linked(product = {}) { return Boolean(text(liMeta(product).produto_id)); }
function uniqueAlias(product = {}) {
  const li = liMeta(product);
  const current = slug(text(product.loja_integrada_alias || li.alias));
  if (current && linked(product)) return current;
  const base = slug(product.nome || 'caneca');
  const suffix = slug(product.codigo || product.sku || keyOf(product)).slice(-34);
  const maxBase = Math.max(40, 140 - suffix.length - 1);
  return slug(`${base.slice(0, maxBase)}-${suffix}`);
}
async function ensureAlias(key, product) {
  if (linked(product)) return text(product.loja_integrada_alias || liMeta(product).alias);
  const alias = uniqueAlias(product);
  const li = liMeta(product);
  const current = slug(text(product.loja_integrada_alias || li.alias));
  if (current === alias) return alias;
  await patchMug(key, {
    loja_integrada_alias: alias,
    loja_integrada: { ...li, alias },
    updated_at: nowIso(),
    last_update: Date.now(),
  });
  return alias;
}
function currentDrawerKey() { return text($('#drawerContent')?.dataset.productKey); }
function currentDrawerSku(product = {}) { return text($('#cfSku')?.value || skuOf(product)).trim(); }
function localDuplicateForSku(products, key, sku) {
  const target = norm(sku);
  return products.filter(item => keyOf(item) !== key && norm(skuOf(item)) === target);
}
async function reconcileBeforeWrite(product, options = {}) {
  const key = keyOf(product);
  const sku = text(options.sku || skuOf(product)).trim();
  if (!key) throw new Error('Produto sem chave Firebase.');
  if (!sku) throw new Error('Preencha o SKU antes de publicar ou atualizar.');
  if (linked(product)) return { status: 'already_linked', productId: liMeta(product).produto_id };
  const result = await recoverOne(product, { sku });
  if (result.status === 'ambiguous') throw new Error(`O SKU ${sku} retornou mais de um produto na Loja Integrada. A operação foi bloqueada para evitar atualização incorreta.`);
  if (result.status === 'invalid') throw new Error(`A Loja Integrada retornou o SKU ${sku}, mas sem ID válido. A operação foi bloqueada.`);
  return result;
}
async function prepareDrawer() {
  const key = currentDrawerKey();
  if (!key || preparing.has(key)) return;
  preparing.add(key);
  try {
    let product = await getMug(key);
    if (!product) throw new Error('Caneca não encontrada no Firebase.');
    const sku = currentDrawerSku(product);
    const products = await loadMugs({ force: true });
    const duplicates = localDuplicateForSku(products, key, sku);
    if (duplicates.length) throw new Error(`O SKU ${sku} também está em ${duplicates.length} outro(s) cadastro(s) no Firebase. Corrija o SKU antes de sincronizar.`);
    await ensureAlias(key, product);
    product = await getMug(key) || product;
    const result = await reconcileBeforeWrite(product, { sku });
    if (result.status === 'recovered') toast(`Produto existente localizado pelo SKU ${sku}. A ação será ATUALIZAR, não criar.`);
  } finally {
    preparing.delete(key);
  }
}
function selectedKeys() {
  return $$('input[data-select-mug]:checked', $('#mugs')).map(box => text(box.dataset.selectMug)).filter(Boolean);
}
async function prepareBulk() {
  const keys = selectedKeys();
  if (!keys.length) throw new Error('Selecione ao menos uma caneca.');
  const products = await loadMugs({ force: true });
  const duplicates = duplicateSkuGroups(products);
  const blocked = [];
  for (const [, items] of duplicates) if (items.some(item => keys.includes(keyOf(item)))) blocked.push(skuOf(items[0]));
  if (blocked.length) throw new Error(`Existem SKUs repetidos no Firebase (${blocked.slice(0, 5).join(', ')}${blocked.length > 5 ? '…' : ''}). Corrija antes da sincronização em lote.`);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const buttonStatus = $('#cfBulkStatus');
    if (buttonStatus) buttonStatus.textContent = `Verificando Loja Integrada ${index + 1}/${keys.length}…`;
    let product = await getMug(key);
    if (!product) throw new Error(`Caneca ${key} não encontrada.`);
    await ensureAlias(key, product);
    product = await getMug(key) || product;
    await reconcileBeforeWrite(product);
  }
}
function ensureDrawerInfoBox() {
  const content = $('#drawerContent');
  const actions = $('.drawer-actions', content);
  if (!content || !actions) return null;
  let box = $('#cfLiActionInfo', content);
  if (!box) {
    box = document.createElement('div');
    box.id = 'cfLiActionInfo';
    box.className = 'notice';
    box.style.margin = '12px 0 8px';
    actions.insertAdjacentElement('beforebegin', box);
  }
  return box;
}
async function enhanceDrawer() {
  const key = currentDrawerKey();
  if (!key) return;
  const product = await getMug(key).catch(() => null);
  if (!product) return;
  const li = liMeta(product);
  const saveOnly = $('#cfSaveOnly');
  const saveSync = $('#cfSaveSync');
  const syncNow = $('#cfSyncNow');
  if (saveOnly) {
    saveOnly.textContent = 'Salvar somente no Admin';
    saveOnly.title = 'Salva as alterações no Firebase. Não envia nada para a Loja Integrada.';
  }
  if (syncNow) syncNow.remove();
  const box = ensureDrawerInfoBox();
  if (saveSync) {
    if (linked(product)) {
      saveSync.textContent = 'Salvar e atualizar Loja Integrada';
      saveSync.title = `Atualiza o produto já vinculado na Loja Integrada (ID ${li.produto_id}). Não cria outro produto.`;
    } else {
      saveSync.textContent = 'Salvar e publicar na Loja Integrada';
      saveSync.title = 'Antes de criar, o sistema procura este SKU na Loja Integrada. Se já existir, recupera o ID e atualiza; só cria se o SKU realmente não existir.';
    }
  }
  if (box) {
    if (linked(product)) {
      box.className = 'notice';
      box.innerHTML = `<b>Loja Integrada vinculada · ID ${li.produto_id}</b><br>As alterações desta tela serão enviadas por atualização do produto existente. Nenhum novo cadastro será criado.`;
    } else {
      const duplicateHint = norm(li.sync_error).includes('duplic') ? '<br><b>Foi detectado erro anterior de SKU duplicado.</b>' : '';
      box.className = 'notice warn';
      box.innerHTML = `<b>Sem ID da Loja Integrada salvo no Firebase.</b><br>Ao publicar, o Admin primeiro procura o SKU <b>${skuOf(product) || '—'}</b> na Loja Integrada. Se encontrar, recupera o vínculo e atualiza. Só cria um produto novo se o SKU não existir.${duplicateHint}`;
    }
  }
}
function enhanceBulkBar() {
  const bar = $('#cfBulkActions');
  if (!bar) return;
  const cf = $('#cfBulkActivateCf', bar);
  const both = $('#cfBulkActivateBoth', bar);
  const sync = $('#cfBulkSync', bar);
  if (cf) {
    cf.textContent = 'Ativar na Loja Integrada + publicar/atualizar';
    cf.title = 'Ativa o canal e, para cada SKU, atualiza o produto existente ou cria somente se ainda não existir.';
  }
  if (both) {
    both.textContent = 'Ativar nos dois + publicar/atualizar';
    both.title = 'Ativa Dona Antônia e Loja Integrada e faz publicação/atualização segura por SKU.';
  }
  if (sync) {
    sync.textContent = 'Publicar/atualizar Loja Integrada';
    sync.title = 'Com ID salvo: atualiza. Sem ID: procura pelo SKU antes de decidir criar.';
  }
  const status = $('#cfBulkStatus', bar);
  if (status && !status.dataset.cfCoordinatorHelp) {
    status.dataset.cfCoordinatorHelp = '1';
    status.textContent = 'Regra segura: produto vinculado = atualizar; sem vínculo = procurar SKU; criar somente quando o SKU não existir.';
  }
}
async function intercept(button, mode) {
  button.disabled = true;
  const oldText = button.textContent;
  try {
    button.textContent = mode === 'bulk' ? 'Verificando SKUs…' : 'Verificando Loja Integrada…';
    if (mode === 'bulk') await prepareBulk();
    else await prepareDrawer();
    replaying.add(button);
    button.disabled = false;
    button.textContent = oldText;
    button.click();
    return true;
  } catch (error) {
    toast(`Loja Integrada: ${error?.message || error}`, true);
    return true;
  } finally {
    if (!replaying.has(button)) {
      button.disabled = false;
      button.textContent = oldText;
    }
  }
}
document.addEventListener('click', event => {
  const bulk = event.target.closest?.('#cfBulkActivateCf,#cfBulkActivateBoth,#cfBulkSync');
  const drawer = event.target.closest?.('#cfSaveSync');
  const button = bulk || drawer;
  if (!button) return;
  if (replaying.has(button)) {
    replaying.delete(button);
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  void intercept(button, bulk ? 'bulk' : 'drawer');
}, true);

window.addEventListener('admin-canecas:drawer', event => {
  if (event.detail?.kind === 'mug') setTimeout(() => enhanceDrawer().catch(() => {}), 0);
});
const observer = new MutationObserver(() => {
  enhanceBulkBar();
  if ($('#drawer')?.classList.contains('open')) enhanceDrawer().catch(() => {});
});
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('hashchange', () => setTimeout(enhanceBulkBar, 100));
document.addEventListener('DOMContentLoaded', () => setTimeout(enhanceBulkBar, 200));
setTimeout(enhanceBulkBar, 350);

document.documentElement.dataset.cfLiSyncCoordinator = BUILD;
export { BUILD, prepareDrawer, prepareBulk, reconcileBeforeWrite, uniqueAlias };
