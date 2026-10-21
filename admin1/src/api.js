import { normalizePublicProduct, requestPreview } from './public-api.js';

export async function adminApi(action, params = {}) {
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
