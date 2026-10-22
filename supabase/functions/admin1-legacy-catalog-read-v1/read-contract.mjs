const clean = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

export function parseLegacyMatchRequest(url) {
  const params = url instanceof URL ? url.searchParams : new URL(url).searchParams;
  const action = params.get('action');
  if (action === 'reader_products') return { ok: true, action };
  if (action !== 'matches') return { ok: false, status: 400, error: 'read_action_not_allowed' };
  const collect = key => [...new Set(params.getAll(key).map(clean).filter(Boolean))];
  const gtin = collect('gtin');
  const sku = collect('sku');
  if (gtin.length + sku.length === 0) return { ok: false, status: 400, error: 'missing_identifiers' };
  if (gtin.length + sku.length > 100) return { ok: false, status: 400, error: 'too_many_identifiers' };
  return { ok: true, action, gtin, sku };
}

export function buildLegacyMatchUrl(baseUrl, { gtin = [], sku = [] } = {}) {
  const url = new URL(baseUrl);
  url.searchParams.set('action', 'matches');
  for (const value of gtin) if (clean(value)) url.searchParams.append('gtin', clean(value));
  for (const value of sku) if (clean(value)) url.searchParams.append('sku', clean(value));
  return url;
}

export function buildReaderProductsUrl(baseUrl) {
  const url = new URL(baseUrl);
  url.searchParams.set('action', 'ean-products');
  return url;
}

const EXPOSED_FIELDS = Object.freeze([
  'id', 'sku', 'gtin', 'name', 'ncm', 'price', 'image_url', 'category', 'subcategory',
  'packaging', 'unit', 'description_short', 'description_long'
]);

export function sanitizeLegacyProducts(products) {
  if (!Array.isArray(products)) return [];
  return products.map(product => Object.fromEntries(EXPOSED_FIELDS
    .filter(field => Object.hasOwn(product || {}, field))
    .map(field => [field, product[field]])));
}

export function sanitizeReaderProductIds(products) {
  if (!Array.isArray(products)) return [];
  return [...new Set(products.map(product => clean(product?.id)).filter(id => /^[0-9a-f-]{36}$/i.test(id)))];
}
