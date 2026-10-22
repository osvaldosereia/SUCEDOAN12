const API = 'https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/storefront-v2';

export async function request(action, params = {}, options = {}) {
  const url = new URL(API);
  url.searchParams.set('action', action);
  if (action === 'home') url.searchParams.set('layout', 'basket-carousel-v1');
  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && value != null) url.searchParams.set(key, String(value));
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), action === 'home_priority' ? 6000 : 10000);
  try {
    const response = await fetch(url, {
      cache: ['products', 'basket', 'basket_quote', 'submit_order'].includes(action) ? 'no-store' : 'default',
      ...options,
      signal: options.signal || controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || 'Não foi possível carregar.');
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

export const loadHome = (priority = false) => request(priority ? 'home_priority' : 'home');
export const loadBasket = id => request('basket', { basket_id: id, lightweight: 1 });
export const loadProducts = (category, offset = 0, query = '') => request('products', query ? { q: query, limit: 24, offset } : { category, limit: 24, offset });
export const loadDeliveryDates = () => request('delivery_options', {}, { cache: 'no-store' });
export const submitOrder = payload => request('submit_order', {}, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

export const loadBasketAlternatives = (basketId, compositionNumber, positionId, selectedProductId, quantity, offset = 0) => request('basket_mold_options', { basket_id: basketId, composition_number: compositionNumber, position_id: positionId, selected_product_id: selectedProductId, quantity, offset });
