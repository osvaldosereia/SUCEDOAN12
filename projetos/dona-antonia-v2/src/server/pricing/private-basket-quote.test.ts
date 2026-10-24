import { describe, expect, it } from 'vitest';
import { calculateBasketQuote } from './private-basket-quote';
describe('precificação privada das cestas (servidor)', () => {
  it('soma ajuste privado ao valor dos produtos sem expor campo sensível', () => {
    const quote = calculateBasketQuote({
      productSubtotalCents: 4000,
      privateBasketAdjustmentCents: 700,
    });
    expect(quote).toEqual({ totalCents: 4700 });
    expect(Object.keys(quote)).toEqual(['totalCents']);
  });
  it('bloqueia valores inválidos e overflow', () => {
    expect(() =>
      calculateBasketQuote({ productSubtotalCents: -1, privateBasketAdjustmentCents: 0 }),
    ).toThrow();
    expect(() =>
      calculateBasketQuote({
        productSubtotalCents: Number.MAX_SAFE_INTEGER,
        privateBasketAdjustmentCents: 2,
      }),
    ).toThrow();
  });
});
