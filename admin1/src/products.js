function normalizeText(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}

export function getProductStockState(quantity, lowStockThreshold = 5, known = true) {
  if (!known) return { key: 'unknown', label: 'Estoque indisponível' };
  const stock = Number(quantity) || 0;
  if (stock <= 0) return { key: 'out', label: 'Sem estoque' };
  if (stock <= Math.max(0, Number(lowStockThreshold) || 5)) return { key: 'low', label: 'Estoque baixo' };
  return { key: 'available', label: 'Disponível' };
}

export function listProductCategories(products = []) {
  return [...new Set(products.map(product => String(product.category || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function filterProducts(products = [], filters = {}) {
  const query = normalizeText(filters.query);
  const category = String(filters.category || '');
  const stock = String(filters.stock || '');
  const status = String(filters.status || 'all');
  const readerOnly = filters.readerOnly === true;

  return products.filter(product => {
    const matchesReader = !readerOnly || product.ean_reader_match === true;
    const matchesQuery = !query || [product.name, product.sku, product.gtin, product.packaging]
      .some(value => normalizeText(value).includes(query));
    const matchesCategory = !category || product.category === category;
    const stockKey = getProductStockState(product.stock_quantity, product.min_stock, product.stock_known !== false).key;
    const matchesStock = !stock || stock === 'all' || stockKey === stock;
    const matchesStatus = status === 'all' || (status === 'active' ? product.active === true : product.active !== true);
    return matchesReader && matchesQuery && matchesCategory && matchesStock && matchesStatus;
  });
}

export function listCategoryOptions(categories = []) {
  const values = categories.map(item => typeof item === 'string' ? item : item?.value || item?.category).filter(Boolean);
  return [...new Set(values.map(value => String(value).trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

