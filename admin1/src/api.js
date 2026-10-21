import { normalizeAdminProduct, requestAdminCatalog, requestAdminProductStatus } from './public-api.js?v=8';

export async function adminApi(action, params = {}) {
  if (action === 'product_detail') {
    const id = String(params.id || '').trim();
    if (!id) throw new Error('Produto sem identificador.');
    const result = await requestAdminCatalog('product', { product_id: id });
    if (!result.product) throw new Error('Produto não encontrado no catálogo.');
    return { product: normalizeAdminProduct(result.product) };
  }

  if (action === 'product_matches') {
    const items = Array.isArray(params.items) ? params.items : [];
    const gtins = [...new Set(items.flatMap(item => [item.commercial_gtin, item.tax_gtin, item.gtin]).filter(Boolean))];
    const skus = [...new Set(items.map(item => item.sku).filter(Boolean))];
    if (!gtins.length && !skus.length) return { products: [] };
    const result = await requestAdminCatalog('matches', { gtin: gtins, sku: skus });
    return { products: (result.products || []).map(normalizeAdminProduct) };
  }

  if (action === 'categories') {
    const result = await requestAdminCatalog('categories');
    return { categories: result.categories || [], assignment_categories: result.assignment_categories || [] };
  }

  if (action === 'set_product_active') {
    return requestAdminProductStatus({ id: params.id, active: params.active });
  }

  if (action !== 'products') throw new Error('Ação não disponível nesta etapa.');

  const result = await requestAdminCatalog('products', {
    limit: Math.min(100, Number(params.limit) || 36),
    offset: params.offset || 0,
    q: params.q || '',
    category: params.category || '',
    status: params.status || 'all',
    stock: params.stock || 'all'
  });
  return {
    products: (result.products || []).map(normalizeAdminProduct),
    next_offset: result.next_offset ?? null,
    total: Number(result.total || 0)
  };
}
