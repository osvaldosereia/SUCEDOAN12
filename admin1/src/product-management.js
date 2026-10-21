const digits = value => String(value ?? '').replace(/\D/g, '');
const text = value => String(value ?? '').trim();
const normalize = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
const validOrigin = value => /^[0-8]$/.test(text(value));

export const PRODUCT_CATEGORY_OPTIONS = Object.freeze([
  'Mercearia',
  'Limpeza e lavanderia',
  'Higiene e beleza',
  'Casa e pet'
]);

const categoryAliases = new Map([
  ['mercearia', 'mercearia'],
  ['limpeza e lavanderia', 'limpeza_lavanderia'],
  ['limpeza_lavanderia', 'limpeza_lavanderia'],
  ['higiene e beleza', 'higiene_beleza'],
  ['higiene_beleza', 'higiene_beleza'],
  ['casa e pet', 'casa_pet'],
  ['casa_pet', 'casa_pet']
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
  const linkedId = text(draft.catalog_product_id);
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
  const categoryCode = categoryAliases.get(category);
  const allowed = PRODUCT_CATEGORY_OPTIONS.some(option => normalize(option) === category) || Boolean(categoryCode);
  if (!allowed) add('category', 'Categoria controlada');
  const rawPrice = product.sale_price_cents ?? product.price_cents;
  const price = rawPrice === undefined
    ? Number(String(product.sale_price ?? '').trim().replace(',', '.')) * 100
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

