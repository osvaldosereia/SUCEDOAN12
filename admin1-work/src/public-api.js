const PROJECT_URL = 'https://ssbesxgaijknwsjbsbcz.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_tFXHtH0HCXZepVtwgKElIg_DxS76Gu8';
const PREVIEW_READ_ACTIONS = new Set(['products', 'product']);
const ADMIN_READ_ACTIONS = new Set(['products', 'product', 'matches', 'categories']);
export const ADMIN1_SUPABASE_WRITES_ENABLED = false;

export function normalizePublicProduct(product = {}) {
  return {
    id: String(product.id || ''), name: String(product.name || ''), sku: String(product.sku || ''),
    gtin: String(product.gtin || ''), brand: String(product.brand || ''), packaging: String(product.packaging || ''),
    image_url: String(product.image_url || ''), category: String(product.category || product.subcategory || ''),
    sale_price_cents: Math.max(0, Number(product.price_cents || 0)),
    stock_quantity: Math.max(0, Number(product.stock_quantity || 0)), active: product.is_active === true,
    description: String(product.description || ''),
    characteristics: Array.isArray(product.characteristics) ? product.characteristics
      .filter(item => item && typeof item === 'object')
      .map(item => ({ label: String(item.label || ''), value: String(item.value || '') })) : []
  };
}

export function normalizePublicBasket() { return null; }

export async function requestPreview(action, params = {}, fetchImpl = fetch) {
  if (!PREVIEW_READ_ACTIONS.has(action)) throw new Error('Ação não permitida: somente leitura');
  const query = new URLSearchParams();
  for (const key of ['limit', 'offset', 'q', 'category', 'subcategory', 'product_id']) {
    if (params[key] !== undefined && params[key] !== null && String(params[key]).trim() !== '') query.set(key, String(params[key]));
  }
  query.set('action', action);
  const response = await fetchImpl(`${PROJECT_URL}/functions/v1/storefront-v2?${query}`, {
    method: 'GET', headers: { apikey: PUBLISHABLE_KEY, Accept: 'application/json' }, cache: 'no-store'
  });
  if (!response.ok) throw new Error(`Falha ao consultar catálogo (${response.status})`);
  const result = await response.json();
  if (result?.ok !== true) throw new Error(result?.error || 'Falha ao consultar catálogo');
  return result;
}

export function normalizeAdminProduct(product = {}) {
  const price = Number(product.price || 0);
  const stockKnown = product.stock !== null && product.stock !== undefined && Number.isFinite(Number(product.stock));
  const stockQuantity = Math.max(0, Number(product.stock || 0));
  return {
    id: String(product.id || ''),
    name: String(product.name || ''),
    sku: String(product.sku || ''),
    gtin: String(product.gtin || ''),
    ncm: String(product.ncm || ''),
    brand: String(product.brand || ''),
    packaging: String(product.packaging || ''),
    image_url: String(product.image_url || ''),
    category: String(product.category || ''),
    subcategory: String(product.subcategory || ''),
    unit: String(product.unit || ''),
    cost: product.cost === null || product.cost === undefined ? null : Number(product.cost),
    supplier: String(product.supplier || ''),
    validity_date: String(product.validity_date || ''),
    gondola: String(product.gondola || ''),
    shelf: String(product.shelf || ''),
    cest: String(product.cest || ''),
    origin_code: product.origin_code === null || product.origin_code === undefined ? '' : String(product.origin_code),
    sale_price_cents: Math.max(0, Math.round((Number.isFinite(price) ? price : 0) * 100)),
    stock_quantity: stockQuantity,
    stock_known: stockKnown,
    active: product.is_active === true && !(stockKnown && stockQuantity <= 0),
    description: String(product.description_long || product.description_short || ''),
    tags: Array.isArray(product.tags) ? product.tags.map(String) : [],
    min_stock: Math.max(0, Number(product.min_stock || 0))
  };
}

export async function requestAdminCatalog(action, params = {}, fetchImpl = fetch) {
  if (!ADMIN_READ_ACTIONS.has(action)) throw new Error('Ação não permitida: somente leitura.');
  const query = new URLSearchParams({ action });
  for (const key of ['limit', 'offset', 'q', 'category', 'status', 'stock', 'product_id']) {
    const value = params[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') query.set(key, String(value));
  }
  for (const key of ['gtin', 'sku']) {
    for (const value of params[key] || []) if (String(value || '').trim()) query.append(key, String(value).trim());
  }
  const response = await fetchImpl(`${PROJECT_URL}/functions/v1/admin1-products-read-v1?${query}`, {
    method: 'GET',
    headers: { apikey: PUBLISHABLE_KEY, Accept: 'application/json' },
    cache: 'no-store'
  });
  const result = await response.json();
  if (!response.ok || result?.ok !== true) throw new Error(result?.error || `Falha ao consultar produtos (${response.status})`);
  return result;
}

export async function requestAdminProductStatus({ id, active }, fetchImpl = fetch) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id || '')) || typeof active !== 'boolean') {
    throw new Error('Dados inválidos para alterar o status do produto.');
  }
  if (!ADMIN1_SUPABASE_WRITES_ENABLED) {
    throw new Error('Gravações no Supabase estão bloqueadas; a situação será salva somente neste navegador.');
  }
  const response = await fetchImpl(`${PROJECT_URL}/functions/v1/admin1-product-status-v1`, {
    method: 'POST',
    headers: { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ product_id: id, is_active: active }),
    cache: 'no-store'
  });
  const result = await response.json();
  if (!response.ok || result?.ok !== true) {
    const messages = {
      product_out_of_stock: 'Produto sem estoque não pode ser ativado.',
      stock_unconfirmed: 'Não foi possível confirmar o estoque vendável agora. Atualize a lista e tente novamente.'
    };
    throw new Error(messages[result?.error] || result?.error || `Falha ao atualizar produto (${response.status})`);
  }
  return result;
}

