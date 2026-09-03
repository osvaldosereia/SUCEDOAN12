import { text, norm, nowIso } from '../shared/mug-commerce-v1.js?v=20260828-1';
import { loadMugs, getMug, patchMug } from './mug-store-v2.js?v=20260829-1';
import { recoverOne, duplicateSkuGroups, liMeta, skuOf, keyOf } from './li-recovery-v3.js?v=20260831-1';

const BUILD = '20260903-admin-canecas-li-sync-coordinator-v4.2-no-legacy-personalizer';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const replaying = new WeakSet();
const preparing = new Set();
const nativeFetch = window.fetch.bind(window);

function stripLegacyPersonalizer(value = '') {
  return String(value || '')
    .replace(/<div[^>]*class=["'][^"']*cf-personalizer-box[^"']*["'][\s\S]*?<\/div>/gi, '')
    .replace(/<a[^>]*class=["'][^"']*cf-personalize-link[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, '')
    .replace(/<iframe[^>]*\/loja-integrada\/personalizar\/[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<a[^>]*>\s*PERSONALIZAR ESTA CANECA\s*<\/a>/gi, '')
    .replace(/(?:\r?\n\s*){3,}/g, '\n\n')
    .trim();
}

function sanitizeMakePayload(input, init = {}) {
  try {
    const rawUrl = typeof input === 'string' ? input : input?.url || '';
    const url = new URL(rawUrl, location.href);
    if (!/^hook\.[a-z0-9-]+\.make\.com$/i.test(url.hostname)) return init;
    if (String(init.method || 'GET').toUpperCase() !== 'POST' || typeof init.body !== 'string') return init;

    const outer = JSON.parse(init.body);
    if (!outer || typeof outer.payload !== 'string') return init;
    const payload = JSON.parse(outer.payload);
    if (!payload || typeof payload.produto_json !== 'string') return init;

    const product = JSON.parse(payload.produto_json);
    if (!product || typeof product !== 'object' || typeof product.descricao_completa !== 'string') return init;
    const before = product.descricao_completa;
    const after = stripLegacyPersonalizer(before);
    if (after === before) return init;

    product.descricao_completa = after;
    payload.produto_json = JSON.stringify(product);
    payload.personalizador_descricao = 'nativo_inline';
    payload.personalizador_legado_removido = true;
    outer.payload = JSON.stringify(payload);
    console.info('[CanecaFácil] Personalizador legado removido do payload de contingência Make.');
    return { ...init, body:JSON.stringify(outer) };
  } catch {
    return init;
  }
}

window.fetch = function cfAdminNoLegacyPersonalizerFetch(input, init = {}) {
  return nativeFetch(input, sanitizeMakePayload(input, init));
};

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
  if (result.status === 'ambiguous') throw new Error(`O SKU ${sku} retornou mais de um produto na Loja Integrada. Operação bloqueada.`);
  if (result.status === 'invalid') throw new Error(`A Loja Integrada retornou o SKU ${sku}, mas sem ID válido.`);
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
    if (duplicates.length) throw new Error(`O SKU ${sku} também está em ${duplicates.length} outro(s) cadastro(s) no Firebase.`);
    await ensureAlias(key, product);
    product = await getMug(key) || product;
    const result = await reconcileBeforeWrite(product, { sku });
    if (result.status === 'recovered') toast(`SKU ${sku} já existia na Loja Integrada. O produto será atualizado, não duplicado.`);
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
  for (const [, items] of duplicates) {
    if (items.some(item => keys.includes(keyOf(item)))) blocked.push(skuOf(items[0]));
  }
  if (blocked.length) throw new Error(`Existem SKUs repetidos no Firebase (${blocked.slice(0, 5).join(', ')}${blocked.length > 5 ? '…' : ''}).`);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const buttonStatus = $('#cfBulkStatus');
    if (buttonStatus) buttonStatus.textContent = `MAKE (reserva): verificando SKU ${index + 1}/${keys.length}…`;
    let product = await getMug(key);
    if (!product) throw new Error(`Caneca ${key} não encontrada.`);
    await ensureAlias(key, product);
    product = await getMug(key) || product;
    await reconcileBeforeWrite(product);
  }
}
async function intercept(button, mode) {
  button.disabled = true;
  const oldText = button.textContent;
  try {
    button.textContent = mode === 'bulk' ? 'MAKE · Verificando SKUs…' : 'MAKE · Verificando SKU…';
    if (mode === 'bulk') await prepareBulk();
    else await prepareDrawer();
    replaying.add(button);
    button.disabled = false;
    button.textContent = oldText;
    button.click();
    return true;
  } catch (error) {
    toast(`Loja Integrada · MAKE (reserva): ${error?.message || error}`, true);
    return true;
  } finally {
    if (!replaying.has(button)) {
      button.disabled = false;
      button.textContent = oldText;
    }
  }
}

function confirmMakeUse() {
  return confirm(
    'ATENÇÃO: este comando atualiza a Loja Integrada pelo MAKE.\n\n' +
    'O caminho padrão do CanecaFácil é GITHUB ACTIONS.\n' +
    'Use o Make somente como RESERVA/CONTINGÊNCIA.\n\n' +
    'Deseja realmente continuar pelo Make?'
  );
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
  if (!confirmMakeUse()) {
    toast('Envio pelo Make cancelado. Use o comando GITHUB para a atualização normal.');
    return;
  }
  void intercept(button, bulk ? 'bulk' : 'drawer');
}, true);

document.documentElement.dataset.cfLiSyncCoordinator = BUILD;
export { BUILD, prepareDrawer, prepareBulk, reconcileBeforeWrite, uniqueAlias };
