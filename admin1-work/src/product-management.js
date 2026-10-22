const digits = value => String(value ?? '').replace(/\D/g, '');
const text = value => String(value ?? '').trim();
const normalize = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
const validOrigin = value => /^[0-8]$/.test(text(value));

export const PRODUCT_CATEGORY_OPTIONS = Object.freeze([
  'Mercearia',
  'Limpeza',
  'Lavanderia',
  'Higiene',
  'Beleza',
  'Casa',
  'Pet'
]);

export function isValidGtin(value) {
  const code = digits(value);
  if (![8, 12, 13, 14].includes(code.length)) return false;
  const check = Number(code.at(-1));
  let sum = 0;
  for (let index = code.length - 2, weight = 0; index >= 0; index -= 1, weight += 1) {
    sum += Number(code[index]) * (weight % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === check;
}

export function calculateUnitConversion({ purchase_quantity, purchase_unit_price, tax_quantity } = {}) {
  const purchaseQuantity = Number(purchase_quantity);
  const purchaseUnitPrice = Number(purchase_unit_price);
  const taxQuantity = Number(tax_quantity);
  if (![purchaseQuantity, purchaseUnitPrice, taxQuantity].every(Number.isFinite)
    || purchaseQuantity <= 0 || purchaseUnitPrice < 0 || taxQuantity <= 0) return null;
  const factor = taxQuantity / purchaseQuantity;
  const costPerTaxUnit = purchaseUnitPrice / factor;
  if (!Number.isFinite(factor) || !Number.isFinite(costPerTaxUnit)) return null;
  return {
    units_per_purchase_unit: Number(factor.toFixed(4)),
    cost_per_tax_unit: Number(costPerTaxUnit.toFixed(4))
  };
}

export function findCatalogMatch(item = {}, products = []) {
  const gtins = new Set([item.commercial_gtin, item.tax_gtin, item.gtin]
    .map(value => text(value).toUpperCase() === 'SEM GTIN' ? '' : digits(value))
    .filter(value => isValidGtin(value)));
  let matches = gtins.size
    ? products.filter(product => gtins.has(digits(product.gtin)))
    : [];
  let matchedBy = 'GTIN';

  if (!matches.length) {
    const sku = normalize(item.sku);
    if (!sku) return null;
    matchedBy = 'SKU';
    matches = products.filter(product => normalize(product.sku) === sku);
  }

  const unique = [...new Map(matches.map(product => [String(product.id), product])).values()];
  if (unique.length > 1) return { ambiguous: true, matched_by: matchedBy, candidates: unique };
  return unique.length ? { ...unique[0], matched_by: matchedBy } : null;
}

export function findIdentifierConflicts(draft = {}, matches = []) {
  const linkedId = text(draft.catalog_product_id || draft.id);
  const sku = normalize(draft.sku);
  const gtins = new Set([draft.commercial_gtin || draft.gtin, draft.tax_gtin]
    .map(value => text(value).toUpperCase() === 'SEM GTIN' ? '' : digits(value))
    .filter(value => isValidGtin(value)));
  const conflicts = [];
  if (sku && matches.some(product => normalize(product.sku) === sku && String(product.id) !== linkedId)) {
    conflicts.push({ key: 'sku', label: 'Este SKU já pertence a outro produto.' });
  }
  if ([...gtins].some(gtin => matches.some(product => digits(product.gtin) === gtin && String(product.id) !== linkedId))) {
    conflicts.push({ key: 'gtin', label: 'Este GTIN já pertence a outro produto.' });
  }
  return conflicts;
}

export function getProductReadinessIssues(product = {}) {
  const issues = [];
  const add = (key, label) => issues.push({ key, label });
  if (!text(product.name)) add('name', 'Nome do produto');
  if (!text(product.sku)) add('sku', 'SKU interno');
  const category = normalize(product.category);
  const allowed = PRODUCT_CATEGORY_OPTIONS.some(option => normalize(option) === category);
  if (!allowed) add('category', 'Categoria controlada');
  const rawPrice = product.sale_price_cents ?? product.price_cents;
  const price = rawPrice === undefined
    ? Number(parseProductAmount(product.price ?? product.sale_price) ?? 0) * 100
    : Number(rawPrice);
  if (!Number.isFinite(price) || price <= 0) add('sale_price_cents', 'Preço de venda');
  const ncm = digits(product.ncm);
  if (ncm.length !== 8) add('ncm', 'NCM com 8 dígitos');
  if (text(product.cest) && digits(product.cest).length !== 7) add('cest', 'CEST com 7 dígitos');
  if (!text(product.origin_code) || !validOrigin(product.origin_code)) add('origin_code', 'Origem da mercadoria');
  const gtin = text(product.gtin || product.commercial_gtin).toUpperCase();
  if (!gtin) add('gtin', 'GTIN comercial ou SEM GTIN');
  else if (gtin !== 'SEM GTIN' && !isValidGtin(gtin)) add('gtin', 'GTIN comercial inválido');
  const taxGtin = text(product.tax_gtin).toUpperCase();
  if (!taxGtin) add('tax_gtin', 'GTIN tributável ou SEM GTIN');
  else if (taxGtin !== 'SEM GTIN' && !isValidGtin(taxGtin)) add('tax_gtin', 'GTIN tributável inválido');
  if (!text(product.commercial_unit || product.unit)) add('commercial_unit', 'Unidade comercial');
  if (!text(product.tax_unit || product.unit)) add('tax_unit', 'Unidade tributável');
  return issues;
}


export function getProductListEmptyState({ query = '', category = '', stock = 'all', status = 'all' } = {}) {
  const hasFilters = Boolean(text(query) || text(category) || stock !== 'all' || status !== 'all');
  return hasFilters
    ? { hasFilters, title: 'Nenhum produto encontrado', description: 'Tente ajustar os filtros ou a busca.' }
    : { hasFilters, title: 'Nenhum produto disponível', description: 'Atualize a lista para consultar novamente.' };
}

export function parseProductAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = text(value).replace(/\s/g, '');
  if (!raw) return null;
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function normalizeProductCode(value, key, length, errors) {
  const raw = text(value);
  if (!raw) return '';
  if (!/^[\d.\-/\s]+$/.test(raw)) {
    errors.push({ key, message: `${key.toUpperCase()} deve conter apenas números.` });
    return digits(raw);
  }
  const code = digits(raw);
  if (code.length !== length) errors.push({ key, message: `${key.toUpperCase()} deve ter ${length} dígitos.` });
  return code;
}

export function buildAdminProductRecord(input = {}, now = new Date()) {
  const price = input.price !== undefined || input.sale_price !== undefined
    ? parseProductAmount(input.price ?? input.sale_price)
    : input.sale_price_cents !== undefined
      ? Number(input.sale_price_cents) / 100
      : null;
  const cost = parseProductAmount(input.cost);
  const stock = parseProductAmount(input.stock_quantity ?? input.stock) ?? 0;
  const minStock = parseProductAmount(input.min_stock) ?? 0;
  const errors = [];
  if (price === null || !Number.isFinite(price) || price < 0) errors.push({ key: 'price', message: 'Informe um preço de venda válido.' });
  if (cost !== null && cost < 0) errors.push({ key: 'cost', message: 'O custo não pode ser negativo.' });
  if (stock < 0) errors.push({ key: 'stock', message: 'O estoque não pode ser negativo.' });
  if (minStock < 0) errors.push({ key: 'min_stock', message: 'O estoque mínimo não pode ser negativo.' });
  if (text(input.stock_quantity ?? input.stock) && parseProductAmount(input.stock_quantity ?? input.stock) === null) {
    errors.push({ key: 'stock', message: 'Informe um estoque válido.' });
  }
  if (!text(input.stock_quantity ?? input.stock)) errors.push({ key: 'stock', message: 'Informe a quantidade em estoque, mesmo que seja zero.' });
  if (text(input.cost) && cost === null) errors.push({ key: 'cost', message: 'Informe um custo válido.' });
  if (text(input.price ?? input.sale_price) && price === null) errors.push({ key: 'price', message: 'Informe um preço de venda válido.' });
  const ncm = normalizeProductCode(input.ncm, 'ncm', 8, errors);
  const cest = normalizeProductCode(input.cest, 'cest', 7, errors);
  const originCode = text(input.origin_code);
  if (originCode && !validOrigin(originCode)) errors.push({ key: 'origin_code', message: 'Origem da mercadoria deve ser de 0 a 8.' });
  const gtin = text(input.gtin || input.commercial_gtin);
  const commercialGtin = text(input.commercial_gtin || input.gtin);
  const taxGtin = text(input.tax_gtin);
  for (const [key, value] of [['gtin', gtin], ['commercial_gtin', commercialGtin], ['tax_gtin', taxGtin]]) {
    if (value && value.toUpperCase() !== 'SEM GTIN' && !isValidGtin(value)) {
      errors.push({ key, message: 'GTIN inválido; confira os números ou informe SEM GTIN quando aplicável.' });
    }
  }
  const activeRequested = input.active ?? input.is_active ?? false;
  const id = text(input.id) || globalThis.crypto?.randomUUID?.() || `local-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    ...input,
    id,
    name: text(input.name),
    sku: text(input.sku),
    gtin: gtin || commercialGtin,
    commercial_gtin: commercialGtin,
    tax_gtin: taxGtin,
    ncm,
    cest,
    origin_code: originCode,
    category: text(input.category),
    subcategory: text(input.subcategory),
    packaging: text(input.packaging),
    unit: text(input.unit || input.commercial_unit),
    commercial_unit: text(input.commercial_unit || input.unit),
    tax_unit: text(input.tax_unit || input.unit),
    price: price === null ? null : Number(price.toFixed(2)),
    sale_price_cents: price === null ? null : Math.round(price * 100),
    cost: cost === null ? null : Number(cost.toFixed(4)),
    stock: stock,
    stock_quantity: stock,
    stock_known: true,
    min_stock: minStock,
    validity_date: text(input.validity_date || input.expiration_date),
    gondola: text(input.gondola),
    shelf: text(input.shelf),
    supplier: text(input.supplier || input.supplier_name),
    image_url: text(input.image_url),
    description_short: text(input.description_short),
    description_long: text(input.description_long || input.description),
    active: stock > 0 && activeRequested === true,
    is_active: stock > 0 && activeRequested === true,
    validation_errors: errors,
    source_system: 'admin1-local',
    sync_status: 'local_only',
    updated_at: now.toISOString()
  };
}

export function getProductEditorErrors(product = {}) {
  const errors = Array.isArray(product.validation_errors) ? [...product.validation_errors] : [];
  if (!text(product.name)) errors.push({ key: 'name', message: 'Informe o nome do produto.' });
  if (!text(product.sku)) errors.push({ key: 'sku', message: 'Informe o SKU ou código interno.' });
  if (!text(product.category)) errors.push({ key: 'category', message: 'Selecione a categoria do produto.' });
  const price = product.sale_price_cents !== undefined ? Number(product.sale_price_cents) / 100 : parseProductAmount(product.price);
  if (price === null || !Number.isFinite(price) || price <= 0) errors.push({ key: 'price', message: 'Informe um preço de venda maior que zero.' });
  const stock = parseProductAmount(product.stock_quantity ?? product.stock);
  if (stock === null || stock < 0) errors.push({ key: 'stock', message: 'Informe um estoque igual ou maior que zero.' });
  if ((product.active === true || product.is_active === true) && !text(product.image_url)) {
    errors.push({ key: 'image_url', message: 'Adicione uma imagem do produto antes de ativar.' });
  }
  const seen = new Set();
  return errors.filter(error => {
    const key = String(error.key || error.message);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

