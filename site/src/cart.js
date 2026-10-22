export function basketComponents(item) {
  return (item.components || []).map(({ price_cents, price, ...component }) => component);
}

export function cartTotalCents(cart) {
  return cart.reduce((total, item) => total + Number(item.price_cents || 0) * Number(item.qty || 1), 0);
}

export function orderLines(cart) {
  const baskets = cart.filter(item => item.type === 'basket');
  const looseProducts = cart.filter(item => item.type !== 'basket');
  return [
    ...baskets.flatMap(item => [item, ...basketComponents(item).map(component => ({ ...component, type: 'component' }))]),
    ...looseProducts
  ];
}

export function orderPayload(cart, checkout = {}) {
  return {
    payment_method: checkout.payment || '',
    whatsapp_phone: checkout.phone || '',
    delivery_date: checkout.deliveryDate || '',
    whatsapp_origin: '0975',
    items: cart.map(item => ({
      type: item.type,
      id: item.id,
      qty: Number(item.qty || 1),
      split_mode: item.split_mode === true,
      lot_id: item.lot_id || null,
      components: item.type === 'basket' ? (item.components || []) : []
    }))
  };
}
