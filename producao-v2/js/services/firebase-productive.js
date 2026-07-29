import { clone, nowIso, productKey, text } from '../core/utils.js';
import {
  archiveProduct,
  createProduct,
  invalidateProductsCache,
  loadArchivedProducts,
  loadOrders,
  loadProduct,
  loadProducts,
  logAdminAction,
  normalizePatchTypes,
  normalizeProduct,
  patchOrder,
  restoreProduct,
} from './firebase.js?admin_base=20260729-save-merge-v1';

export {
  archiveProduct,
  createProduct,
  invalidateProductsCache,
  loadArchivedProducts,
  loadOrders,
  loadProduct,
  loadProducts,
  logAdminAction,
  normalizePatchTypes,
  normalizeProduct,
  patchOrder,
  restoreProduct,
};

const SERVER_FIELDS = new Set(['updated_at', 'last_update', 'stock_updated_at']);
const STRICT_CONFLICT_FIELDS = new Set([
  'codigo', 'sku', 'gtin', 'ean', 'ncm', 'cest', 'situacao',
  'preco', 'preco_custo', 'preco_oferta', 'preco_atacado',
  'estoque', 'validade', 'validade_oferta',
]);

function baseUrl(config) {
  return text(config.firebaseUrl).replace(/\/+$/, '');
}

function nodePath(config) {
  return text(config.productsNode || 'produtos').replace(/^\/+|\/+$/g, '').replace(/\.json$/i, '');
}

function productUrl(config, key) {
  return `${baseUrl(config)}/${nodePath(config)}/${encodeURIComponent(key)}.json`;
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
    if (error?.name === 'AbortError') throw new Error('Tempo esgotado ao salvar o produto.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeForCompare(value) {
  if (value === undefined) return null;
  if (typeof value === 'string') return value.replace(/\r\n?/g, '\n').trim();
  if (Array.isArray(value)) return value.map(normalizeForCompare);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalizeForCompare(value[key])]));
  }
  return value;
}

export function equalValue(a, b) {
  return JSON.stringify(normalizeForCompare(a)) === JSON.stringify(normalizeForCompare(b));
}

export function changedFields(before = {}, after = {}) {
  const fields = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...fields].filter(field => !SERVER_FIELDS.has(field) && !equalValue(before?.[field], after?.[field]));
}

function imageHistory(remote, product, localChanged) {
  if (!localChanged.some(field => ['url_imagem', 'imagem', 'imagem_url', 'imagem_path'].includes(field))) return null;
  const previous = text(remote?.url_imagem || remote?.imagem_url || remote?.imagem || remote?.imagem_path);
  const next = text(product?.url_imagem || product?.imagem_url || product?.imagem || product?.imagem_path);
  if (!previous || previous === next) return null;
  const current = Array.isArray(remote?.imagens_historico) ? remote.imagens_historico : [];
  return [...new Set([...current, previous].map(text).filter(Boolean))].slice(-20);
}

export function buildPatch(product, originalSnapshot, remote) {
  const base = originalSnapshot || remote || {};
  const localChanged = changedFields(base, product || {});
  const remoteChanged = changedFields(base, remote || {});
  const remoteChangedSet = new Set(remoteChanged);
  const concurrentFields = localChanged.filter(field => remoteChangedSet.has(field) && !equalValue(product?.[field], remote?.[field]));
  const conflicts = concurrentFields.filter(field => STRICT_CONFLICT_FIELDS.has(field));
  const autoMergedFields = concurrentFields.filter(field => !STRICT_CONFLICT_FIELDS.has(field));

  if (conflicts.length) {
    throw new Error(`Há uma atualização operacional mais recente nos campos: ${conflicts.join(', ')}. Reabra o produto antes de alterar preço, estoque, validade ou identificação. Campos de conteúdo, como descrição, não bloqueiam mais o salvamento.`);
  }

  const patch = {};
  for (const field of localChanged) {
    const value = product?.[field];
    patch[field] = value === undefined ? null : clone(value);
  }

  const key = productKey(product);
  if (!text(remote?.firebaseKey)) patch.firebaseKey = key;
  if (!text(remote?.id)) patch.id = text(product.id || key);
  if (localChanged.includes('codigo') || !text(remote?.codigo)) patch.codigo = text(product.codigo || product.sku || product.id || key);
  normalizePatchTypes(patch);

  const history = imageHistory(remote, product, localChanged);
  if (history) patch.imagens_historico = history;
  patch.updated_at = nowIso();
  patch.last_update = Date.now();
  if (localChanged.includes('estoque')) patch.stock_updated_at = nowIso();

  return { patch, localChanged, conflicts, autoMergedFields };
}

export async function saveProduct(config, product, originalSnapshot = null) {
  if (!config.writeMode) throw new Error('As gravações estão bloqueadas nas configurações.');
  const key = productKey(product);
  if (!key) throw new Error('Produto sem chave do Firebase.');

  const remote = await loadProduct(config, key);
  if (!remote) throw new Error('Este produto não existe mais no Firebase. Atualize os dados antes de salvar.');

  const { patch, localChanged, autoMergedFields } = buildPatch(product, originalSnapshot || remote, remote);
  if (!localChanged.length) return remote;

  await request(productUrl(config, key), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });

  invalidateProductsCache();
  logAdminAction(config, 'produto_atualizado', {
    key,
    nome: product.nome,
    campos: localChanged,
    mesclados_automaticamente: autoMergedFields,
    antes: Object.fromEntries(localChanged.map(field => [field, remote[field]])),
    depois: Object.fromEntries(localChanged.map(field => [field, patch[field]])),
  });

  if (autoMergedFields.length) {
    console.info(`Admin V2: campos mesclados automaticamente em ${key}:`, autoMergedFields);
  }
  return normalizeProduct(key, { ...remote, ...patch });
}
