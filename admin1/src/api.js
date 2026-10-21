import { normalizePublicProduct, requestPreview } from './public-api.js?v=4';

export async function adminApi(action, params = {}) {
  if (action === 'product_detail') {
    const id = String(params.id || '').trim();
    if (!id) throw new Error('Produto sem identificador.');
    const result = await requestPreview('product', { product_id: id });
    if (!result.product) throw new Error('Produto não encontrado na vitrine.');
    return { product: normalizePublicProduct(result.product) };
  }

  if (action !== 'products') {
    throw new Error('Ação não disponível nesta etapa.');
  }

  const result = await requestPreview('products', {
    limit: Math.min(36, Number(params.limit) || 36),
    offset: params.offset || 0,
    q: params.q || '',
    category: params.category || ''
  });

  return {
    products: (result.products || []).map(normalizePublicProduct),
    next_offset: result.next_offset ?? null
  };
}

export async function adminWrite() {
  throw new Error('Somente leitura: alterações estão bloqueadas.');
}

