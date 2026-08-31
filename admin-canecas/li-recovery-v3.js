import { text, norm, nowIso } from '../shared/mug-commerce-v1.js?v=20260828-1';
import { patchMug } from './mug-store-v2.js?v=20260829-1';

const BUILD = '20260831-admin-canecas-li-recovery-v3';
const MAKE_WEBHOOK = window.__CANECAS_ADMIN_CONFIG__?.makeWebhook || 'https://hook.eu1.make.com/cl3r1f56r9txezvltkkwlsspmnja6sw4';

function liMeta(product = {}) {
  const nested = product.loja_integrada && typeof product.loja_integrada === 'object' ? product.loja_integrada : {};
  return {
    ...nested,
    produto_id: text(nested.produto_id || product.loja_integrada_product_id || product.canecafacil_product_id || product.li_product_id),
    seo_id: text(nested.seo_id || product.loja_integrada_seo_id || product.canecafacil_seo_id || product.li_seo_id),
  };
}
function keyOf(product = {}) { return text(product.firebaseKey || product.__key || product.id); }
function skuOf(product = {}) { return text(product.codigo || product.sku).trim(); }
function parseSeoId(value) {
  const match = text(value).match(/\/seo\/(\d+)/i);
  return match ? match[1] : '';
}
function decodeB64Json(value) {
  try {
    if (!value) return null;
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return JSON.parse(new TextDecoder('utf-8').decode(bytes));
  } catch {
    return null;
  }
}
async function lookupBySku(sku) {
  const cleanSku = text(sku).trim();
  if (!cleanSku) throw new Error('SKU vazio: não é possível consultar a Loja Integrada.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const payload = {
      action: 'loja_integrada_find_product_by_sku',
      request_id: `LI-REC-${Date.now().toString(36).toUpperCase()}`,
      sku: cleanSku,
      source: BUILD,
    };
    const response = await fetch(MAKE_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ payload: JSON.stringify(payload) }),
      signal: controller.signal,
    });
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
    if (!response.ok || data.ok === false) throw new Error(data.error || data.error_message || `Make HTTP ${response.status}`);
    const catalog = decodeB64Json(data.produto_b64) || data.catalog || data;
    const objects = Array.isArray(catalog?.objects) ? catalog.objects : [];
    return objects.filter(item => norm(item?.sku) === norm(cleanSku));
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('O Make não respondeu à consulta de SKU em 30 segundos.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
function duplicateSkuGroups(products) {
  const groups = new Map();
  for (const product of products) {
    const sku = norm(skuOf(product));
    if (!sku) continue;
    if (!groups.has(sku)) groups.set(sku, []);
    groups.get(sku).push(product);
  }
  return new Map([...groups].filter(([, items]) => items.length > 1));
}
async function recoverOne(product, options = {}) {
  const key = keyOf(product);
  const sku = text(options.sku || skuOf(product)).trim();
  const li = liMeta(product);
  if (li.produto_id) return { key, sku, status: 'already_linked', productId: li.produto_id };
  const matches = await lookupBySku(sku);
  if (!matches.length) return { key, sku, status: 'not_found' };
  if (matches.length > 1) return { key, sku, status: 'ambiguous', count: matches.length };
  const found = matches[0];
  const productId = text(found.id);
  if (!productId) return { key, sku, status: 'invalid' };
  const seoId = parseSeoId(found.seo);
  const next = {
    ...li,
    produto_id: productId,
    seo_id: seoId || li.seo_id || '',
    resource_uri: text(found.resource_uri || li.resource_uri),
    url: text(found.url || li.url),
    sync_status: 'vinculado',
    sync_error: '',
    recovered_by: 'sku',
    recovered_at: nowIso(),
  };
  await patchMug(key, {
    loja_integrada: next,
    loja_integrada_product_id: productId,
    loja_integrada_seo_id: next.seo_id,
    updated_at: nowIso(),
    last_update: Date.now(),
  });
  return { key, sku, status: 'recovered', productId, found };
}

document.documentElement.dataset.cfLiRecovery = BUILD;
export { BUILD, recoverOne, lookupBySku, duplicateSkuGroups, liMeta, skuOf, keyOf };
