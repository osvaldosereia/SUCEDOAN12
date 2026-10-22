import { admin1Data } from './admin1-data.js?v=1';

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
  if (action === 'legacy_matches') return { products: await admin1Data.findLegacyByEans(params.eans || []) };
  if (action === 'save_product') return { product: await admin1Data.saveProduct(params.product || {}) };
  if (action === 'set_product_active') {
    return { product: await admin1Data.setProductActive(params.id, params.active) };
  }
  if (action === 'import_legacy_product') {
    return { product: await admin1Data.importLegacyProduct(params.product || {}, params.category || '') };
  }
  throw new Error('Ação não disponível no Admin1.');
}
