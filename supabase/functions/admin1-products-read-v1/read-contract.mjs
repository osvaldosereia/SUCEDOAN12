export const ADMIN_PRODUCT_COLUMNS = Object.freeze([
  'id', 'sku', 'gtin', 'name', 'ncm', 'price', 'stock', 'image_url', 'brand',
  'category', 'subcategory', 'packaging', 'unit', 'is_active',
  'description_short', 'description_long', 'tags', 'min_stock'
]);

export const ADMIN1_READ_ACTIONS = Object.freeze(new Set([
  'products', 'product', 'matches', 'categories', 'ean-products', 'health'
]));

const clampInteger = (value, fallback, max) => {
  const number = Number(value);
  return Number.isInteger(number) ? Math.max(0, Math.min(max, number)) : fallback;
};

const clean = (value, maxLength = 120) => String(value ?? '')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, maxLength);

function collect(params, key, maxItems = 200) {
  return [...new Set(params.getAll(key).map(value => clean(value, 80)).filter(Boolean))].slice(0, maxItems);
}

export function parseCatalogRequest(request) {
  if (request.method !== 'GET') return { ok: false, status: 405, error: 'method_not_allowed' };
  const url = new URL(request.url);
  const action = clean(url.searchParams.get('action') || 'products', 32);
  if (!ADMIN1_READ_ACTIONS.has(action)) return { ok: false, status: 400, error: 'read_action_not_allowed' };
  const params = url.searchParams;
  const status = clean(params.get('status') || 'all', 16);
  const stock = clean(params.get('stock') || 'all', 16);
  if (!['all', 'active', 'inactive'].includes(status)) return { ok: false, status: 400, error: 'invalid_status_filter' };
  if (!['all', 'available', 'out'].includes(stock)) return { ok: false, status: 400, error: 'invalid_stock_filter' };
  const q = clean(params.get('q'), 100).replace(/[,%()*."\\]/g, ' ').replace(/\s+/g, ' ').trim();
  const gtins = collect(params, 'gtin');
  const skus = collect(params, 'sku');
  if (action === 'product' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(params.get('product_id'), 40))) {
    return { ok: false, status: 400, error: 'invalid_product_id' };
  }
  if (action === 'matches' && gtins.length + skus.length === 0) return { ok: false, status: 400, error: 'missing_identifiers' };
  return {
    ok: true,
    action,
    params: {
      limit: clampInteger(params.get('limit'), 36, 100) || 36,
      offset: clampInteger(params.get('offset'), 0, 10000),
      q,
      category: clean(params.get('category'), 80),
      status,
      stock,
      product_id: clean(params.get('product_id'), 40),
      gtins,
      skus
    }
  };
}

