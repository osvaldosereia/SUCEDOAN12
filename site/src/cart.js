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
    ...baskets.flatMap(item => [item, ...basketComponents(item).map((component, component_index) => ({ ...component, type: 'component', basket_id: item.id, component_index }))]),
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
      type: item.mold_mode ? 'basket_mold' : item.type,
      id: item.id,
      qty: Number(item.qty || 1),
      ...(item.mold_mode ? { composition_number: Number(item.composition_number || 1) } : {}),
      split_mode: item.split_mode === true,
      lot_id: item.lot_id || null,
      components: item.type === 'basket' ? (item.components || []).map(component => ({ position_id: component.position_id, product_id: component.product_id, quantity: Number(component.quantity ?? component.base_quantity ?? 1) })) : []
    }))
  };
}

export function minimumOrderStatus(totalCents, minimumCents) {
  const remainingCents = Math.max(0, Number(minimumCents) - Number(totalCents));
  return { meetsMinimum: remainingCents === 0, remainingCents };
}

export function canAdjustBasketComponent(basket, component, delta) {
  const current = Number(component.quantity ?? component.base_quantity ?? 0);
  const next = current + Number(delta);
  if (!Number.isInteger(next) || next < 0) return false;
  if (delta < 0 && basket?.mold_mode !== true && component.quantity_editable === false && component.removable !== true) return false;
  if (delta > 0 && basket?.mold_mode !== true && component.quantity_editable === false) return false;
  if (basket?.mold_mode === true) {
    const max = component.stock_quantity == null ? 1000 : Math.floor(Number(component.stock_quantity) / Math.max(1, Number(basket.qty || 1)));
    return next <= max;
  }
  const min = Math.max(0, Number(component.min_quantity ?? (component.removable === false ? component.base_quantity ?? current : 0)));
  const max = Number(component.max_quantity ?? (component.stock_quantity == null ? 1000 : Number(component.base_quantity ?? current) + Number(component.stock_quantity)));
  return next >= min && next <= max && !(next === 0 && component.removable === false);
}

export function basketWouldBeEmpty(components, componentIndex, nextQuantity) {
  return !components.some((item, index) => (index === componentIndex ? nextQuantity : Number(item.quantity ?? item.base_quantity ?? 0)) > 0);
}

export function basketQuoteRequest(basket, items) {
  if (basket?.mold_mode === true) return { action: 'basket_mold_quote', payload: { basket_id: basket.id, composition_number: Number(basket.composition_number || 1), lightweight: true, items: items.map(item => ({ position_id: item.position_id, product_id: item.product_id, quantity: Number(item.quantity ?? item.base_quantity ?? 1) })) } };
  const rows = items.map(item => ({ product_id: item.product_id, quantity: Number(item.quantity || 0) }));
  if (basket?.split_mode === true) return { action: 'basket_quote', payload: { basket_id: basket.id, food_lot_id: basket.food_lot_id, hygiene_lot_id: basket.hygiene_lot_id, food_lot_code: basket.food_lot_code, hygiene_lot_code: basket.hygiene_lot_code, items: items.map((item, index) => ({ ...rows[index], component_group: item.component_group })) } };
  return { action: 'basket_quote', payload: { basket_id: basket.id, lot_id: basket.lot_id || null, items: rows } };
}
