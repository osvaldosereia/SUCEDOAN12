import { admin1Data } from './admin1-data.js?v=4';

export async function adminApi(action, params = {}) {
  if (action === 'products') {
    return admin1Data.listProducts({ limit: params.limit, offset: params.offset, q: params.q, category: params.category, status: params.status, stock: params.stock });
  }
  if (action === 'categories') {
    const categories = await admin1Data.getCategories();
    return { categories, assignment_categories: categories };
  }
  if (action === 'product_detail') return { product: await admin1Data.getProduct(params.id) };
  if (action === 'product_matches') return { products: await admin1Data.findProducts(params.items || []) };
  if (action === 'search_products') return { products: await admin1Data.searchProducts(params.query || '', params.limit) };
  if (action === 'baskets') return { baskets: await admin1Data.listBaskets({ query: params.query || '' }) };
  if (action === 'basket_detail') return { basket: await admin1Data.getBasket(params.id) };
  if (action === 'save_basket') return { basket: await admin1Data.saveBasket(params.basket || {}) };
  if (action === 'basket_sizes') return { sizes: await admin1Data.listBasketSizes() };
  if (action === 'save_basket_size') return { size: await admin1Data.saveBasketSize(params.size || {}) };
  if (action === 'reorder_basket_sizes') return admin1Data.reorderBasketSizes(params.ids || []);
  if (action === 'basket_types') return { types: await admin1Data.listBasketTypes() };
  if (action === 'basket_type_detail') return { type: await admin1Data.getBasketType(params.id) };
  if (action === 'save_basket_type') return { type: await admin1Data.saveBasketType(params.type || {}) };
  if (action === 'legacy_matches') return { products: await admin1Data.findLegacyByEans(params.eans || []) };
  if (action === 'ean_reader_products') return admin1Data.listEanReaderProducts();
  if (action === 'save_product') return { product: await admin1Data.saveProduct(params.product || {}) };
  if (action === 'set_product_active') {
    return { product: await admin1Data.setProductActive(params.id, params.active) };
  }
  if (action === 'import_legacy_product') {
    return { product: await admin1Data.importLegacyProduct(params.product || {}, params.category || '') };
  }
  throw new Error('Ação não disponível no Admin1.');
}
