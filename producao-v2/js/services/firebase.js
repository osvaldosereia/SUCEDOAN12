import { clone, nowIso, number, productKey, text } from '../core/utils.js';

let productsCache = null;
let productsCacheAt = 0;
let productsLoading = null;
const PRODUCTS_CACHE_MS = 8000;
const SESSION_KEY = 'da_admin_v2_session_id';

function baseUrl(config) {
  return text(config.firebaseUrl).replace(/\/+$/, '');
}

function nodePath(config, fallback = 'produtos') {
  return text(config.productsNode || fallback).replace(/^\/+|\/+$/g, '').replace(/\.json$/i, '');
}

function databaseUrl(config, path = '') {
  const clean = text(path).replace(/^\/+|\/+$/g, '').replace(/\.json$/i, '');
  return `${baseUrl(config)}/${clean}.json`;
}

function productUrl(config, key = '') {
  const node = nodePath(config);
  const suffix = key ? `/${encodeURIComponent(key)}` : '';
  return `${baseUrl(config)}/${node}${suffix}.json`;
}

function adminCatalogUrl(config) {
  const path = text(config.adminProductsPath || 'site/produtos-admin.json').replace(/^\/+/, '');
  if (/^https?:\/\//i.test(path)) return path;
  const base = globalThis.location?.href || 'https://donaantonia.com.br/producao-v2/';
  return new URL(`../${path}`, base).href;
}

async function request(url, options = {}, timeout = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { cache: 'no-store', ...options, signal: controller.signal });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Fonte de dados retornou ${response.status}${detail ? `: ${detail.slice(0, 220)}` : ''}`);
    }
    if (response.status === 204) return null;
    return await response.json().catch(() => null);
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Tempo esgotado ao consultar a fonte de dados.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function sessionId() {
  try {
    let id = globalThis.localStorage?.getItem(SESSION_KEY);
    if (!id) {
      id = `admin-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      globalThis.localStorage?.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return 'admin-sem-storage';
  }
}

async function logAdminAction(config, action, details = {}) {
  const payload = {
    action: text(action),
    origem: 'admin-v2-oficial',
    sessao: sessionId(),
    criado_em: nowIso(),
    timestamp: Date.now(),
    details: clone(details),
  };
  try {
    await request(databaseUrl(config, 'logs_admin'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, 10000);
  } catch (error) {
    console.warn('Não foi possível registrar logs_admin:', error);
  }
}

function normalizeProduct(key, value) {
  const product = value && typeof value === 'object' ? clone(value) : {};
  product.firebaseKey = text(product.firebaseKey || key);
  product.id = text(product.id || product.firebaseKey);
  product.codigo = text(product.codigo || product.sku || product.id || product.firebaseKey);
  product.nome = text(product.nome || product.titulo || '');
  product.preco = number(product.preco);
  product.preco_custo = number(product.preco_custo);
  product.estoque = Math.max(0, Math.floor(number(product.estoque)));
  product.situacao = text(product.situacao || product.status || 'A').toUpperCase();
  return product;
}

function normalizeProductsCollection(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  return Object.entries(data)
    .filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value))
    .map(([key, value]) => normalizeProduct(key, value));
}

function normalizeForCompare(value) {
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(normalizeForCompare);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalizeForCompare(value[key])]));
  }
  return value;
}

function equalValue(a, b) {
  return JSON.stringify(normalizeForCompare(a)) === JSON.stringify(normalizeForCompare(b));
}

const SERVER_FIELDS = new Set(['updated_at', 'last_update', 'stock_updated_at']);
const DECIMAL_FIELDS = new Set(['preco', 'preco_custo', 'preco_oferta', 'preco_atacado', 'peso', 'largura', 'altura', 'comprimento']);
const INTEGER_FIELDS = new Set(['estoque', 'estoque_minimo', 'multiplo_venda', 'quantidade_caixa', 'ordem']);

function changedFields(before = {}, after = {}) {
  const fields = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...fields].filter(field => !SERVER_FIELDS.has(field) && !equalValue(before?.[field], after?.[field]));
}

function booleanValue(value) {
  if (value === true || value === 1) return true;
  return ['1', 'true', 'sim', 'yes'].includes(text(value).toLowerCase());
}

function normalizePatchTypes(patch) {
  for (const field of DECIMAL_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patch, field) && patch[field] !== null) patch[field] = Math.max(0, number(patch[field]));
  }
  for (const field of INTEGER_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(patch, field) || patch[field] === null) continue;
    const minimum = field === 'multiplo_venda' ? 1 : 0;
    patch[field] = Math.max(minimum, Math.floor(number(patch[field]) || minimum));
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'destaque')) patch.destaque = booleanValue(patch.destaque);
  if (Object.prototype.hasOwnProperty.call(patch, 'gtin')) patch.gtin = String(patch.gtin || '').replace(/\D/g, '');
  if (Object.prototype.hasOwnProperty.call(patch, 'ean')) patch.ean = String(patch.ean || '').replace(/\D/g, '');
  if (Object.prototype.hasOwnProperty.call(patch, 'ncm')) patch.ncm = String(patch.ncm || '').replace(/\D/g, '');
  if (Object.prototype.hasOwnProperty.call(patch, 'cest')) patch.cest = String(patch.cest || '').replace(/\D/g, '');
  return patch;
}

function imageHistory(remote, product, localChanged) {
  if (!localChanged.some(field => ['url_imagem', 'imagem', 'imagem_url', 'imagem_path'].includes(field))) return null;
  const previous = text(remote?.url_imagem || remote?.imagem_url || remote?.imagem || remote?.imagem_path);
  const next = text(product?.url_imagem || product?.imagem_url || product?.imagem || product?.imagem_path);
  if (!previous || previous === next) return null;
  const current = Array.isArray(remote?.imagens_historico) ? remote.imagens_historico : [];
  return [...new Set([...current, previous].map(text).filter(Boolean))].slice(-20);
}

function buildPatch(product, originalSnapshot, remote) {
  const localChanged = changedFields(originalSnapshot || {}, product || {});
  const remoteChanged = changedFields(originalSnapshot || {}, remote || {});
  const remoteChangedSet = new Set(remoteChanged);
  const conflicts = localChanged.filter(field => remoteChangedSet.has(field) && !equalValue(product?.[field], remote?.[field]));
  if (conflicts.length) {
    throw new Error(`Este produto mudou em outra sessão nos campos: ${conflicts.join(', ')}. Atualize os dados antes de salvar.`);
  }

  const patch = {};
  for (const field of localChanged) {
    const value = product?.[field];
    patch[field] = value === undefined ? null : clone(value);
  }

  const key = productKey(product);
  patch.firebaseKey = key;
  patch.id = text(product.id || key);
  patch.codigo = text(product.codigo || product.sku || product.id || key);
  normalizePatchTypes(patch);
  const history = imageHistory(remote, product, localChanged);
  if (history) patch.imagens_historico = history;
  patch.updated_at = nowIso();
  patch.last_update = Date.now();
  if (localChanged.includes('estoque')) patch.stock_updated_at = nowIso();

  return { patch, localChanged, conflicts };
}

function invalidateProductsCache() {
  productsCache = null;
  productsCacheAt = 0;
  productsLoading = null;
  globalThis.window?.dispatchEvent?.(new CustomEvent('admin-v2-products-invalidated'));
}

async function fetchAdminProducts(config) {
  const data = await request(`${adminCatalogUrl(config)}${adminCatalogUrl(config).includes('?') ? '&' : '?'}_admin=${Date.now()}`, {}, 15000);
  const products = normalizeProductsCollection(data);
  if (!products.length) throw new Error('O índice administrativo está vazio.');
  return products;
}

async function fetchProductsFromFirebase(config) {
  const data = await request(`${productUrl(config)}?_admin_v2=${Date.now()}`, {}, 30000);
  return normalizeProductsCollection(data);
}

export async function loadProducts(config, { force = false } = {}) {
  if (!force && productsCache && Date.now() - productsCacheAt < PRODUCTS_CACHE_MS) return clone(productsCache);
  if (!force && productsLoading) return clone(await productsLoading);
  productsLoading = (async () => {
    try {
      return await fetchAdminProducts(config);
    } catch (indexError) {
      console.warn('Índice administrativo indisponível; usando leitura completa do Firebase.', indexError);
      return fetchProductsFromFirebase(config);
    }
  })();
  try {
    productsCache = await productsLoading;
    productsCacheAt = Date.now();
    return clone(productsCache);
  } finally {
    productsLoading = null;
  }
}

export async function loadProduct(config, key) {
  const value = await request(`${productUrl(config, key)}?_=${Date.now()}`, {}, 15000);
  return value && typeof value === 'object' ? normalizeProduct(key, value) : null;
}

export async function saveProduct(config, product, originalSnapshot = null) {
  if (!config.writeMode) throw new Error('As gravações estão bloqueadas nas configurações.');
  const key = productKey(product);
  if (!key) throw new Error('Produto sem chave do Firebase.');

  const remote = await loadProduct(config, key);
  if (!remote) throw new Error('Este produto não existe mais no Firebase. Atualize os dados antes de salvar.');

  const base = originalSnapshot || remote;
  const { patch, localChanged } = buildPatch(product, base, remote);
  if (!localChanged.length) return remote;

  await request(productUrl(config, key), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  invalidateProductsCache();
  logAdminAction(config, 'produto_atualizado', { key, nome: product.nome, campos: localChanged, antes: Object.fromEntries(localChanged.map(field => [field, remote[field]])), depois: Object.fromEntries(localChanged.map(field => [field, patch[field]])) });
  return normalizeProduct(key, { ...remote, ...patch });
}

export async function createProduct(config, product, requestedKey = '') {
  if (!config.writeMode) throw new Error('As gravações estão bloqueadas nas configurações.');
  const key = text(requestedKey || productKey(product) || `${Date.now()}`);
  if (!key) throw new Error('Não foi possível gerar a chave do produto.');
  const existing = await loadProduct(config, key);
  if (existing) throw new Error('Já existe um produto com esta chave.');

  const payload = clone(product || {});
  payload.firebaseKey = key;
  payload.id = text(payload.id || key);
  payload.codigo = text(payload.codigo || payload.sku || payload.id || key);
  payload.nome = text(payload.nome || payload.titulo);
  payload.situacao = text(payload.situacao || 'A').toUpperCase() === 'I' ? 'I' : 'A';
  normalizePatchTypes(payload);
  payload.created_at = text(payload.created_at || nowIso());
  payload.updated_at = nowIso();
  payload.last_update = Date.now();
  payload.stock_updated_at = nowIso();

  await request(productUrl(config, key), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  invalidateProductsCache();
  logAdminAction(config, 'produto_criado', { key, codigo: payload.codigo, nome: payload.nome, origem: payload.origem_cadastro || 'admin-v2' });
  return normalizeProduct(key, payload);
}

export async function archiveProduct(config, key, { reason = '', source = 'admin-v2' } = {}) {
  if (!config.writeMode) throw new Error('As gravações estão bloqueadas nas configurações.');
  const product = await loadProduct(config, key);
  if (!product) throw new Error('Produto não encontrado no Firebase.');

  const archivedAt = nowIso();
  const archived = {
    ...clone(product),
    firebaseKey: key,
    id: text(product.id || key),
    situacao_anterior: product.situacao || 'A',
    arquivado_em: archivedAt,
    arquivado_motivo: text(reason || 'Arquivado pelo Admin oficial'),
    arquivado_origem: source,
  };
  await request(databaseUrl(config, `produtos_excluidos/${encodeURIComponent(key)}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(archived),
  });
  await request(productUrl(config, key), { method: 'DELETE' });
  invalidateProductsCache();
  logAdminAction(config, 'produto_arquivado', { key, codigo: product.codigo, nome: product.nome, motivo: archived.arquivado_motivo });
  return archived;
}

export async function loadArchivedProducts(config) {
  const data = await request(`${databaseUrl(config, 'produtos_excluidos')}?_=${Date.now()}`);
  if (!data || typeof data !== 'object') return [];
  return Object.entries(data)
    .filter(([, value]) => value && typeof value === 'object')
    .map(([key, value]) => normalizeProduct(key, value))
    .sort((a, b) => String(b.arquivado_em || '').localeCompare(String(a.arquivado_em || '')));
}

export async function restoreProduct(config, key) {
  if (!config.writeMode) throw new Error('As gravações estão bloqueadas nas configurações.');
  const archived = await request(`${databaseUrl(config, `produtos_excluidos/${encodeURIComponent(key)}`)}?_=${Date.now()}`);
  if (!archived || typeof archived !== 'object') throw new Error('Produto arquivado não encontrado.');
  const existing = await loadProduct(config, key);
  if (existing) throw new Error('Já existe um produto ativo com esta chave.');

  const restored = clone(archived);
  restored.firebaseKey = key;
  restored.id = text(restored.id || key);
  restored.situacao = text(restored.situacao_anterior || restored.situacao || 'A').toUpperCase() === 'I' ? 'I' : 'A';
  restored.restaurado_em = nowIso();
  restored.updated_at = nowIso();
  restored.last_update = Date.now();
  delete restored.arquivado_em;
  delete restored.arquivado_motivo;
  delete restored.arquivado_origem;
  delete restored.situacao_anterior;

  await request(productUrl(config, key), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(restored),
  });
  await request(databaseUrl(config, `produtos_excluidos/${encodeURIComponent(key)}`), { method: 'DELETE' });
  invalidateProductsCache();
  logAdminAction(config, 'produto_restaurado', { key, codigo: restored.codigo, nome: restored.nome });
  return normalizeProduct(key, restored);
}

export async function loadOrders(config, limit = 250) {
  const data = await request(`${databaseUrl(config, 'pedidos')}?_=${Date.now()}`, {}, 30000);
  if (!data || typeof data !== 'object') return [];
  return Object.entries(data)
    .map(([key, value]) => ({ firebaseKey: key, ...(value || {}) }))
    .sort((a, b) => {
      const date = value => new Date(value?.criado_em || value?.created_at || value?.data || 0).getTime() || 0;
      return date(b) - date(a);
    })
    .slice(0, Math.max(1, Math.min(1000, Number(limit) || 250)));
}

export async function patchOrder(config, key, patch) {
  if (!config.writeMode) throw new Error('As gravações estão bloqueadas nas configurações.');
  const payload = { ...patch, atualizado_em: nowIso() };
  await request(databaseUrl(config, `pedidos/${encodeURIComponent(key)}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  logAdminAction(config, 'pedido_atualizado', { key, campos: Object.keys(patch), valores: patch });
}

export { buildPatch, changedFields, equalValue, invalidateProductsCache, logAdminAction, normalizePatchTypes, normalizeProduct };
