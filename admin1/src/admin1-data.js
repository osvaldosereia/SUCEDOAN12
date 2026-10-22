const ADMIN1_URL = 'https://xaoeldjuxzsdsblimzxo.supabase.co';
const ADMIN1_KEY = 'sb_publishable_eTLpVSFd4ZCNQXIPYASyWw_Y-5Mzhfs';
const LEGACY_MATCH_URL = `${ADMIN1_URL}/functions/v1/admin1-legacy-catalog-read-v1`;
const SOURCE_PROJECT = 'ssbesxgaijknwsjbsbcz';

const clean = value => String(value ?? '').trim();

function hiddenValueToCents(value) {
  const amount = Number(String(value ?? '0').trim().replace(',', '.'));
  if (!Number.isFinite(amount) || amount < 0) throw new Error('O valor oculto deve ser igual ou maior que zero.');
  const cents = Math.round((amount + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(cents)) throw new Error('O valor oculto está fora do limite permitido.');
  return cents;
}

function headers(extra = {}) {
  return { apikey: ADMIN1_KEY, Authorization: `Bearer ${ADMIN1_KEY}`, Accept: 'application/json', ...extra };
}

async function readJson(response, fallback) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.message || body?.details || body?.hint || fallback;
    if (body?.code === '23505') throw new Error('Este SKU ou código já está cadastrado.');
    if (body?.code === '23503') throw new Error('Selecione uma das categorias oficiais do Admin1.');
    throw new Error(message || fallback);
  }
  return body;
}

function normalizeProduct(row = {}) {
  const stock = Number(row.stock_quantity ?? 0);
  const lotDates = (Array.isArray(row.admin1_product_lots) ? row.admin1_product_lots : [])
    .filter(lot => Number(lot.available_quantity || 0) > 0 && lot.expiration_date)
    .map(lot => String(lot.expiration_date)).sort();
  return {
    ...row,
    id: String(row.id || ''), name: String(row.name || ''), sku: String(row.sku || ''),
    gtin: String(row.gtin || row.commercial_gtin || ''), commercial_gtin: String(row.commercial_gtin || row.gtin || ''),
    tax_gtin: String(row.tax_gtin || ''), ncm: String(row.ncm || ''), cest: String(row.cest || ''),
    origin_code: row.origin_code == null ? '' : String(row.origin_code),
    packaging: String(row.packaging || ''), category: String(row.category || ''),
    unit: String(row.unit || row.commercial_unit || ''), commercial_unit: String(row.commercial_unit || row.unit || ''),
    tax_unit: String(row.tax_unit || ''), cost: row.cost == null ? null : Number(row.cost),
    price: Number(row.price_cents || 0) / 100, sale_price_cents: Number(row.price_cents || 0),
    stock: stock, stock_quantity: stock, stock_known: true, min_stock: Number(row.min_stock || 0),
    gondola: String(row.gondola || ''), shelf: String(row.shelf || ''), supplier: String(row.supplier || ''),
    image_url: String(row.image_url || ''), description_short: String(row.description_short || ''),
    description_long: String(row.description_long || ''), description: String(row.description_long || row.description_short || ''),
    active: row.is_active === true && stock > 0, is_active: row.is_active === true && stock > 0,
    validity_date: String(row.validity_date || lotDates[0] || ''), workspace_source: 'admin1'
  };
}

function normalizeBasket(row = {}) {
  const items = Array.isArray(row.admin1_basket_items) ? row.admin1_basket_items : [];
  return {
    ...row,
    id: String(row.id || ''), name: String(row.name || ''), sku: String(row.sku || ''),
    description: String(row.description || ''), image_url: String(row.image_url || ''),
    price_cents: Number(row.price_cents || 0), price: Number(row.price_cents || 0) / 100,
    active: row.is_active === true, is_active: row.is_active === true,
    items: items.map(item => ({
      id: String(item.id || ''), product_id: String(item.product_id || ''),
      quantity: Number(item.quantity || 0), sort_order: Number(item.sort_order || 0),
      product: item.product ? normalizeProduct(item.product) : null
    }))
  };
}

export function normalizeEanSequence(value) {
  const values = String(value || '').split(/[\s,;]+/).map(item => item.replace(/\D/g, '')).filter(Boolean);
  return [...new Set(values)];
}

export function mapLegacyProduct(product = {}, category = '') {
  const sourceId = clean(product.id);
  const gtin = clean(product.gtin).replace(/\D/g, '');
  return {
    name: clean(product.name), sku: clean(product.sku) || gtin,
    gtin, commercial_gtin: gtin, tax_gtin: gtin,
    ncm: clean(product.ncm).replace(/\D/g, ''),
    category: clean(category), packaging: clean(product.packaging),
    unit: clean(product.unit).toUpperCase(), commercial_unit: clean(product.unit).toUpperCase(),
    price_cents: Math.max(0, Math.round(Number(product.price || 0) * 100)),
    stock_quantity: 0, min_stock: 0, is_active: false,
    image_url: /^https:\/\//i.test(clean(product.image_url)) ? clean(product.image_url) : '',
    description_short: clean(product.description_short), description_long: clean(product.description_long),
    source_project: SOURCE_PROJECT, source_product_id: sourceId
  };
}

// Resolve fetch at request time so tests can inject a mock and browser/polyfill
// changes made after module loading are respected.
export function createAdmin1Data(fetchImpl = (...args) => globalThis.fetch(...args)) {
  async function restResponse(path, options = {}) {
    const response = await fetchImpl(`${ADMIN1_URL}/rest/v1/${path}`, {
      ...options,
      headers: headers(options.headers || {}),
      cache: 'no-store'
    });
    return { data: await readJson(response, 'Não foi possível acessar o catálogo do Admin1.'), response };
  }

  async function rest(path, options = {}) {
    return (await restResponse(path, options)).data;
  }

  async function listProducts({ limit = 36, offset = 0, q = '', category = '', status = 'all', stock = 'all' } = {}) {
    const start = Math.max(0, Number(offset) || 0);
    const size = Math.max(1, Math.min(100, Number(limit) || 36));
    const query = new URLSearchParams({ select: '*,admin1_product_lots(expiration_date,available_quantity)', order: 'name.asc', limit: String(size), offset: String(start) });
    const term = clean(q);
    if (term) {
      const escaped = term.replace(/[\\(),"%_*]/g, character => `\\${character}`);
      query.set('or', `(name.ilike.*${escaped}*,sku.ilike.*${escaped}*,gtin.ilike.*${escaped}*)`);
    }
    if (clean(category)) query.set('category', `eq.${clean(category)}`);
    if (status === 'active') query.set('is_active', 'eq.true');
    if (status === 'inactive') query.set('is_active', 'eq.false');
    if (stock === 'available') query.set('stock_quantity', 'gt.0');
    if (stock === 'out') query.set('stock_quantity', 'eq.0');
    const { data: rows, response } = await restResponse(`admin1_products?${query}`, {
      method: 'GET', headers: { Range: `${start}-${start + size - 1}`, Prefer: 'count=exact' }
    });
    const products = rows.map(normalizeProduct);
    const total = Number((response.headers.get('content-range') || '').split('/')[1]) || products.length;
    return { products, total, next_offset: start + products.length < total ? start + products.length : null };
  }

  async function getProduct(id) {
    const rows = await rest(`admin1_products?select=*,admin1_product_lots(expiration_date,available_quantity)&id=eq.${encodeURIComponent(clean(id))}&limit=1`, { method: 'GET' });
    if (!rows[0]) throw new Error('Produto não encontrado no Admin1.');
    return normalizeProduct(rows[0]);
  }

  async function getCategories() {
    const rows = await rest('admin1_categories?select=name&is_active=eq.true&order=sort_order.asc', { method: 'GET' });
    return rows.map(row => row.name);
  }

  async function searchProducts(query = '', limit = 24) {
    const term = clean(query);
    if (!term) return [];
    const escaped = term.replace(/[\\(),"%_*]/g, character => `\\${character}`);
    const params = new URLSearchParams({
      select: 'id,name,sku,gtin,commercial_gtin,category,stock_quantity,min_stock,image_url,is_active',
      order: 'name.asc', limit: String(Math.max(1, Math.min(50, Number(limit) || 24))),
      or: `(name.ilike.*${escaped}*,sku.ilike.*${escaped}*,gtin.ilike.*${escaped}*)`
    });
    const rows = await rest(`admin1_products?${params}`, { method: 'GET' });
    return rows.map(normalizeProduct);
  }

  async function findProducts(items = []) {
    const digitIds = [...new Set(items.flatMap(item => [item.commercial_gtin, item.tax_gtin, item.gtin]).map(value => clean(value).replace(/\D/g, '')).filter(Boolean))];
    const skuIds = [...new Set(items.map(item => clean(item.sku)).filter(Boolean))];
    if (!digitIds.length && !skuIds.length) return [];
    const query = new URLSearchParams({ select: '*' });
    const filters = [];
    const inList = values => `in.(${[...new Set(values)].map(value => `"${value.replaceAll('"', '\\"')}"`).join(',')})`;
    if (digitIds.length) {
      filters.push(`gtin.${inList(digitIds)}`, `commercial_gtin.${inList(digitIds)}`, `tax_gtin.${inList(digitIds)}`);
    }
    if (skuIds.length) filters.push(`sku.${inList(skuIds)}`);
    query.set('or', `(${filters.join(',')})`);
    const rows = await rest(`admin1_products?${query}`, { method: 'GET' });
    return rows.map(normalizeProduct);
  }

  async function findLegacyByEans(eans = []) {
    const query = new URLSearchParams({ action: 'matches' });
    for (const ean of [...new Set(eans.map(value => String(value).replace(/\D/g, '')).filter(Boolean))]) query.append('gtin', ean);
    const response = await fetchImpl(`${LEGACY_MATCH_URL}?${query}`, {
      method: 'GET', headers: headers(), cache: 'no-store'
    });
    const result = await readJson(response, 'Não foi possível consultar o catálogo antigo.');
    if (result?.ok !== true || !Array.isArray(result.products)) throw new Error('A consulta ao catálogo antigo retornou uma resposta inválida.');
    return result.products;
  }

  async function saveProduct(product) {
    const payload = {
      ...product,
      price_cents: Math.max(0, Math.round(product.price !== undefined && product.price !== ''
        ? Number(product.price) * 100
        : Number(product.sale_price_cents ?? product.price_cents ?? 0))),
      stock_quantity: Math.max(0, Number(product.stock ?? product.stock_quantity ?? 0)),
      expiration_date: clean(product.validity_date || product.expiration_date) || null,
      is_active: product.active === true && Number(product.stock ?? product.stock_quantity ?? 0) > 0,
      gtin: clean(product.gtin || product.commercial_gtin) || null,
      commercial_gtin: clean(product.commercial_gtin || product.gtin) || null,
      tax_gtin: clean(product.tax_gtin) || null,
      ncm: clean(product.ncm) || null, cest: clean(product.cest) || null,
      origin_code: clean(product.origin_code) || null,
      cost: product.cost === '' || product.cost == null ? null : Number(product.cost),
      source_project: product.source_project || null,
      source_product_id: product.source_product_id || null
    };
    const result = await rest('rpc/admin1_save_product_v1', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_product: payload })
    });
    const row = Array.isArray(result) ? result[0] : result;
    return normalizeProduct(row);
  }

  async function setProductActive(id, active) {
    const product = await getProduct(id);
    if (active && product.stock_quantity <= 0) throw new Error('Produto sem estoque não pode ser ativado.');
    if (active && !product.image_url) throw new Error('Adicione uma imagem antes de ativar o produto.');
    return saveProduct({ ...product, active: Boolean(active), stock_quantity: product.stock_quantity });
  }

  async function listBaskets({ query = '' } = {}) {
    const params = new URLSearchParams({
      select: '*,admin1_basket_items(id,product_id,quantity,sort_order,product:admin1_products(id,name,sku,gtin,commercial_gtin,category,stock_quantity,min_stock,image_url,is_active))',
      order: 'name.asc', limit: '200'
    });
    const term = clean(query);
    if (term) {
      const escaped = term.replace(/[\\(),"%_*]/g, character => `\\${character}`);
      params.set('or', `(name.ilike.*${escaped}*,sku.ilike.*${escaped}*)`);
    }
    const rows = await rest(`admin1_baskets?${params}`, { method: 'GET' });
    return rows.map(normalizeBasket);
  }

  async function getBasket(id) {
    const params = new URLSearchParams({
      select: '*,admin1_basket_items(id,product_id,quantity,sort_order,product:admin1_products(id,name,sku,gtin,commercial_gtin,category,stock_quantity,min_stock,image_url,is_active))',
      id: `eq.${clean(id)}`, limit: '1'
    });
    const rows = await rest(`admin1_baskets?${params}`, { method: 'GET' });
    if (!rows[0]) throw new Error('Cesta não encontrada no Admin1.');
    return normalizeBasket(rows[0]);
  }

  async function saveBasket(basket) {
    const priceCents = basket.price !== undefined && basket.price !== ''
      ? Math.max(0, Math.round(Number(basket.price) * 100))
      : Math.max(0, Number(basket.price_cents || 0));
    const payload = {
      ...basket,
      price_cents: priceCents,
      is_active: basket.active === true || basket.is_active === true,
      image_url: clean(basket.image_url) || null,
      description: clean(basket.description) || null,
      items: (Array.isArray(basket.items) ? basket.items : []).map((item, index) => ({
        product_id: clean(item.product_id), quantity: Number(item.quantity), sort_order: index
      }))
    };
    const result = await rest('rpc/admin1_save_basket_v1', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_basket: payload })
    });
    const row = Array.isArray(result) ? result[0] : result;
    return normalizeBasket(row);
  }

  async function listBasketSizes() {
    const rows = await rest('admin1_basket_sizes?select=*&order=sort_order.asc,name.asc', { method: 'GET' });
    return rows.map(row => ({ ...row, id: String(row.id), name: String(row.name || ''), sort_order: Number(row.sort_order || 0), active: row.is_active === true, hidden_value_cents: Math.max(0, Number(row.hidden_value_cents || 0)) }));
  }

  async function saveBasketSize(size) {
    const hiddenValueCents = size.hidden_value !== undefined
      ? hiddenValueToCents(size.hidden_value)
      : hiddenValueToCents(Number(size.hidden_value_cents || 0) / 100);
    const payload = { name: clean(size.name), sort_order: Number(size.sort_order || 0), is_active: size.active !== false, hidden_value_cents: hiddenValueCents };
    if (!payload.name) throw new Error('Informe o nome do tamanho.');
    if (size.id) payload.id = clean(size.id);
    const rows = await rest('admin1_basket_sizes?on_conflict=id', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(payload)
    });
    return rows[0];
  }

  async function reorderBasketSizes(ids) {
    await rest('rpc/admin1_reorder_basket_sizes_v1', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_size_ids: ids.map(clean) })
    });
  }

  function normalizeBasketType(row = {}) {
    return {
      ...row, id: String(row.id || ''), name: String(row.name || ''),
      sort_order: Number(row.sort_order || 0), active: row.is_active === true,
      products: (row.admin1_basket_type_products || []).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)).map(link => ({
        ...link, product_id: String(link.product_id), sort_order: Number(link.sort_order || 0)
      })),
      quantities: Object.fromEntries((row.admin1_basket_type_quantities || []).map(item => [String(item.size_id), Number(item.quantity || 0)]))
    };
  }

  async function listBasketTypes() {
    const params = new URLSearchParams({
      select: 'id,name,sort_order,is_active,updated_at,admin1_basket_type_products(product_id,sort_order,product:admin1_products(id,name,sku,gtin,image_url,category,stock_quantity,is_active)),admin1_basket_type_quantities(size_id,quantity)',
      order: 'sort_order.asc,name.asc', limit: '500'
    });
    const rows = await rest(`admin1_basket_product_types?${params}`, { method: 'GET' });
    return rows.map(normalizeBasketType);
  }

  async function getBasketType(id) {
    const params = new URLSearchParams({
      select: 'id,name,sort_order,is_active,admin1_basket_type_products(product_id,sort_order,product:admin1_products(id,name,sku,gtin,image_url,category,stock_quantity,is_active)),admin1_basket_type_quantities(size_id,quantity)',
      id: `eq.${clean(id)}`, limit: '1'
    });
    const rows = await rest(`admin1_basket_product_types?${params}`, { method: 'GET' });
    if (!rows[0]) throw new Error('Tipo de produto não encontrado.');
    return normalizeBasketType(rows[0]);
  }

  async function saveBasketType(type) {
    const products = (Array.isArray(type.products) ? type.products : []).map((item, sort_order) => ({ product_id: clean(item.product_id), sort_order }));
    const quantities = Object.entries(type.quantities || {}).map(([size_id, value]) => ({ size_id, quantity: Number(value || 0) }));
    const payload = { id: type.id || null, name: clean(type.name), sort_order: Number(type.sort_order || 0), is_active: type.active !== false, products, quantities };
    if (!payload.name) throw new Error('Informe o nome do tipo de produto.');
    if (products.some(item => !item.product_id)) throw new Error('Revise os produtos selecionados.');
    if (quantities.some(item => !Number.isFinite(item.quantity) || item.quantity < 0)) throw new Error('As quantidades por tamanho devem ser zero ou maiores.');
    const result = await rest('rpc/admin1_save_basket_product_type_v1', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_type: payload })
    });
    return Array.isArray(result) ? result[0] : result;
  }

  async function importLegacyProduct(product, category) {
    const payload = mapLegacyProduct(product, category);
    if (!payload.name || !payload.sku || !payload.gtin || !payload.category || !payload.source_product_id) {
      throw new Error('O produto precisa ter nome, EAN, categoria e identificador de origem.');
    }
    const existingSource = await rest(`admin1_products?select=id&source_project=eq.${SOURCE_PROJECT}&source_product_id=eq.${encodeURIComponent(payload.source_product_id)}&limit=1`, { method: 'GET' });
    if (existingSource.length) throw new Error('Este produto do catálogo antigo já foi transferido.');
    return saveProduct(payload);
  }

  return {
    listProducts, getProduct, getCategories, searchProducts, findProducts, findLegacyByEans,
    saveProduct, setProductActive, listBaskets, getBasket, saveBasket, importLegacyProduct,
    listBasketSizes, saveBasketSize, reorderBasketSizes, listBasketTypes, getBasketType, saveBasketType
  };
}

export const admin1Data = createAdmin1Data();
