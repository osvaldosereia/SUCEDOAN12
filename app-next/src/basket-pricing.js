import { roundMoney } from './core.js';

export function basketDefaultProductTotal(rows = []) {
  return roundMoney(rows.reduce((sum, row) => {
    return sum + Number(row?.product?.price || 0) * Number(row?.qty || 0);
  }, 0));
}

export function basketFixedAdjustment(basket, rows = []) {
  if (!basket || !Number(basket.preco || 0)) return 0;
  return roundMoney(Number(basket.preco) - basketDefaultProductTotal(rows));
}

export function basketDraftProductTotal(productMap, draft = {}) {
  return roundMoney(Object.entries(draft || {}).reduce((sum, [productId, qty]) => {
    const product = productMap?.get?.(String(productId));
    return product ? sum + Number(product.price || 0) * Number(qty || 0) : sum;
  }, 0));
}

export function basketDraftTotal(productMap, basket, rows = [], draft = {}) {
  return roundMoney(
    basketDraftProductTotal(productMap, draft) + basketFixedAdjustment(basket, rows)
  );
}
