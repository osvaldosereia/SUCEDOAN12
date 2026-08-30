import { FIREBASE_BASE, text, norm, nowIso } from '../shared/mug-commerce-v1.js?v=20260828-1';

const BUILD = '20260830-admin-canecas-li-sync-guard-v1';
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
  toast.timer = setTimeout(() => { el.hidden = true; }, error ? 6000 : 2800);
}

function slug(value) {
  return norm(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 145) || 'caneca';
}
function liMeta(product = {}) {
  return product.loja_integrada && typeof product.loja_integrada === 'object' ? product.loja_integrada : {};
}
function keyOf(product = {}) {
  return text(product.firebaseKey || product.__key || product.id);
}
function synced(product = {}) {
  const li = liMeta(product);
  return li.sync_status === 'sincronizado' && Boolean(text(li.produto_id)) && Boolean(text(li.url || li.resource_uri));
}
function uniqueAlias(product = {}) {
  const li = liMeta(product);
  const existing = slug(text(product.loja_integrada_alias || li.alias));
  if (existing && synced(product)) return existing;

  const base = slug(product.nome || 'caneca');
  const suffix = slug(product.codigo || product.sku || keyOf(product)).slice(-34);
  const maxBase = Math.max(40, 140 - suffix.length - 1);
  return slug(`${base.slice(0, maxBase)}-${suffix}`);
}

async function getProduct(key) {
  const response = await fetch(`${FIREBASE_BASE}/produtos/${encodeURIComponent(key)}.json?_=${Date.now()}`, {
    cache: 'no-store', headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`Firebase ${response.status}`);
  const data = await response.json();
  return data ? { __key: key, ...data } : null;
}

async function persistBulkAlias(key, product) {
  const alias = uniqueAlias(product);
  const li = liMeta(product);
  const current = slug(text(product.loja_integrada_alias || li.alias));
  if (current === alias) return alias;

  const response = await fetch(`${FIREBASE_BASE}/produtos/${encodeURIComponent(key)}.json`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      loja_integrada_alias: alias,
      loja_integrada: { ...li, alias },
      updated_at: nowIso(),
    })
  });
  if (!response.ok) throw new Error(`Firebase ${response.status} ao preparar URL da caneca.`);
  return alias;
}

function selectedKeys() {
  return $$('input[data-select-mug]:checked', $('#mugs'))
    .map(box => text(box.dataset.selectMug)).filter(Boolean);
}

async function prepareBulk(keys) {
  for (const key of keys) {
    if (preparing.has(key)) continue;
    preparing.add(key);
    try {
      const product = await getProduct(key);
      if (!product) throw new Error(`Caneca ${key} não encontrada.`);
      await persistBulkAlias(key, product);
    } finally {
      preparing.delete(key);
    }
  }
}

async function prepareDrawerAlias() {
  const content = $('#drawerContent');
  const key = text(content?.dataset.productKey);
  const input = $('#cfAlias', content);
  if (!key || !input) return;
  const product = await getProduct(key);
  if (!product) return;
  const alias = uniqueAlias(product);
  const current = slug(input.value);
  const nameOnly = slug(product.nome);
  if (!current || (!synced(product) && current === nameOnly)) input.value = alias;
}

async function intercept(button, mode) {
  if (replaying.has(button)) {
    replaying.delete(button);
    return false;
  }

  button.disabled = true;
  const oldText = button.textContent;
  try {
    if (mode === 'bulk') {
      const keys = selectedKeys();
      if (!keys.length) return false;
      button.textContent = 'Preparando URLs…';
      await prepareBulk(keys);
    } else {
      button.textContent = 'Preparando URL…';
      await prepareDrawerAlias();
    }
    replaying.add(button);
    button.disabled = false;
    button.textContent = oldText;
    button.click();
    return true;
  } catch (error) {
    toast(`Sincronização: ${error?.message || error}`, true);
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
  const drawer = event.target.closest?.('#cfSaveSync,#cfSyncNow');
  const button = bulk || drawer;
  if (!button || replaying.has(button)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void intercept(button, bulk ? 'bulk' : 'drawer');
}, true);

window.addEventListener('admin-canecas:drawer', event => {
  if (event.detail?.kind === 'mug') setTimeout(() => prepareDrawerAlias().catch(() => {}), 0);
});

document.documentElement.dataset.cfLiSyncGuard = BUILD;
export { BUILD, uniqueAlias, prepareBulk };
