import { describe, it, expect } from 'vitest';
import type { BasketSummary, BasketLineSummary, Product } from './model';
import { buildCheckoutView } from './checkout';
const product: Product = {
  sku: 'ARR-1',
  name: 'Arroz teste',
  gtin: null,
  category: 'MERCEARIA BÁSICA',
  brand: 'Teste',
  stock: 5,
  priceCents: 2300,
  active: true,
};
const line: BasketLineSummary = {
  typeId: 'arroz',
  typeName: 'Arroz',
  selected: product,
  options: [product],
  quantity: 2,
  totalCents: 4600,
};
const basket: BasketSummary = {
  templateId: 'mini',
  lines: [line],
  totalCents: 4600,
  itemCount: 2,
  unavailableTypeIds: [],
};
describe('Checkout em cesta e extras', () => {
  it('nunca expõe preços individuais dos componentes de cesta', () => {
    const view = buildCheckoutView(basket, []);
    expect(view.basketItems).toEqual([
      { typeId: 'arroz', sku: 'ARR-1', name: 'Arroz teste', quantity: 2 },
    ]);
    expect(JSON.stringify(view.basketItems)).not.toContain('price');
    expect(view.basketSubtotalCents).toBe(4600);
  });
  it('exibe preço unitário somente nos extras e combina totais', () => {
    const extra: BasketLineSummary = {
      ...line,
      typeId: 'arroz-extra',
      quantity: 1,
      totalCents: 2300,
    };
    const view = buildCheckoutView(basket, [extra]);
    expect(view.extraItems[0]?.priceCents).toBe(2300);
    expect(view.totalCents).toBe(6900);
    expect(view.itemCount).toBe(3);
  });
  it('remove qualquer linha zerada imediatamente da revisão', () => {
    const view = buildCheckoutView(
      { ...basket, lines: [{ ...line, quantity: 0, totalCents: 0 }], totalCents: 0 },
      [{ ...line, typeId: 'extra', quantity: 0, totalCents: 0 }],
    );
    expect(view.basketItems).toEqual([]);
    expect(view.extraItems).toEqual([]);
    expect(view.totalCents).toBe(0);
  });
});
