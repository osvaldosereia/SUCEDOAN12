function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

export function getProductStockState(quantity) {
  const stock = Number(quantity) || 0;
  if (stock <= 0) return { key: 'out', label: 'Sem estoque' };
  if (stock <= 5) return { key: 'low', label: 'Estoque baixo' };
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

  return products.filter(product => {
    const matchesQuery = !query || [product.name, product.sku, product.gtin, product.brand, product.packaging]
      .some(value => normalizeText(value).includes(query));
    const matchesCategory = !category || product.category === category;
    const stockKey = getProductStockState(product.stock_quantity).key;
    const matchesStock = !stock || stockKey === stock;
    return matchesQuery && matchesCategory && matchesStock;
  });
}
