import { clone, normalizeSearch, productKey, productName, text } from './utils.js';

export function cleanRegistryValue(value = '') {
  return text(value).replace(/\s+/g, ' ');
}

function add(map, value, product, context = {}) {
  const clean = cleanRegistryValue(value);
  if (!clean) return;
  const normalized = normalizeSearch(clean);
  if (!map.has(normalized)) map.set(normalized, { normalized, values: new Map(), products: new Set(), contexts: [] });
  const row = map.get(normalized);
  row.values.set(clean, (row.values.get(clean) || 0) + 1);
  row.products.add(productKey(product));
  row.contexts.push(context);
}

function finalize(map, type) {
  return [...map.values()].map(row => {
    const variants = [...row.values.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'));
    return {
      type,
      normalized: row.normalized,
      value: variants[0]?.[0] || '',
      variants: variants.map(([value, count]) => ({ value, count })),
      count: row.products.size,
      productKeys: [...row.products],
      contexts: row.contexts,
      duplicate: variants.length > 1,
    };
  }).sort((a, b) => a.value.localeCompare(b.value, 'pt-BR'));
}

export function buildRegistries(products = []) {
  const maps = { category: new Map(), subcategory: new Map(), subsubcategory: new Map(), brand: new Map(), supplier: new Map(), tag: new Map() };
  products.forEach(product => {
    const category = cleanRegistryValue(product.categoria);
    const subcategory = cleanRegistryValue(product.subcategoria);
    add(maps.category, category, product);
    add(maps.subcategory, subcategory, product, { category });
    add(maps.subsubcategory, product.subsubcategoria, product, { category, subcategory });
    add(maps.brand, product.marca, product);
    add(maps.supplier, product.fornecedor, product);
    const tags = Array.isArray(product.tags) ? product.tags : text(product.tags).split(/[,;|]/);
    tags.map(cleanRegistryValue).filter(Boolean).forEach(tag => add(maps.tag, tag, product));
  });
  return {
    category: finalize(maps.category, 'category'),
    subcategory: finalize(maps.subcategory, 'subcategory'),
    subsubcategory: finalize(maps.subsubcategory, 'subsubcategory'),
    brand: finalize(maps.brand, 'brand'),
    supplier: finalize(maps.supplier, 'supplier'),
    tag: finalize(maps.tag, 'tag'),
  };
}

function scopeMatches(product, scope = {}) {
  if (scope.category && normalizeSearch(product.categoria) !== normalizeSearch(scope.category)) return false;
  if (scope.subcategory && normalizeSearch(product.subcategoria) !== normalizeSearch(scope.subcategory)) return false;
  return true;
}

function fieldForType(type) {
  return { category: 'categoria', subcategory: 'subcategoria', subsubcategory: 'subsubcategoria', brand: 'marca', supplier: 'fornecedor' }[type] || '';
}

export function buildRegistryRenamePlan(products, { type, oldValue, newValue, scope = {} }) {
  const oldClean = cleanRegistryValue(oldValue);
  const newClean = cleanRegistryValue(newValue);
  const errors = [];
  if (!oldClean) errors.push('Valor atual ausente.');
  if (!newClean) errors.push('Informe o novo valor.');
  if (normalizeSearch(oldClean) === normalizeSearch(newClean) && oldClean === newClean) errors.push('O novo valor é igual ao atual.');
  const changes = [];
  for (const product of products || []) {
    if (!scopeMatches(product, scope)) continue;
    const next = clone(product);
    let changed = false;
    if (type === 'tag') {
      const tags = Array.isArray(product.tags) ? product.tags : text(product.tags).split(/[,;|]/).map(cleanRegistryValue).filter(Boolean);
      const replaced = tags.map(tag => normalizeSearch(tag) === normalizeSearch(oldClean) ? newClean : cleanRegistryValue(tag));
      const unique = [...new Map(replaced.map(tag => [normalizeSearch(tag), tag])).values()];
      if (JSON.stringify(tags) !== JSON.stringify(unique)) { next.tags = unique; changed = true; }
    } else {
      const field = fieldForType(type);
      if (field && normalizeSearch(product[field]) === normalizeSearch(oldClean)) {
        next[field] = newClean;
        changed = String(product[field] || '') !== newClean;
      }
    }
    if (changed) {
      next.last_update = Date.now();
      next.updated_at = new Date().toISOString();
      changes.push({ key: productKey(product), name: productName(product), source: clone(product), nextProduct: next });
    }
  }
  if (!changes.length && !errors.length) errors.push('Nenhum produto será alterado com este escopo.');
  return { type, oldValue: oldClean, newValue: newClean, scope: clone(scope), errors, changes, affected: changes.length };
}

export function registrySummary(registries) {
  const all = Object.values(registries || {}).flat();
  return {
    total: all.length,
    duplicates: all.filter(row => row.duplicate).length,
    categories: registries?.category?.length || 0,
    brands: registries?.brand?.length || 0,
    suppliers: registries?.supplier?.length || 0,
    tags: registries?.tag?.length || 0,
  };
}
