import { describe, expect, it } from 'vitest';
import { priceOrderOnServer } from './quote';
import { DEMO_PRODUCTS, DEMO_TEMPLATES, DEMO_TYPES } from '../../data/demo';
import { DEMO_EXTRA_PRODUCTS, DEMO_EXTRA_TYPES, DEMO_EXTRA_GROUPS } from '../../data/demo-extra';
import { initialSelections } from '../../core/basket';
import { initialExtraSelections } from '../../core/extras';
const basket = DEMO_TEMPLATES[1]!;
const types = [...DEMO_TYPES, ...DEMO_EXTRA_TYPES];
const products = [...DEMO_PRODUCTS, ...DEMO_EXTRA_PRODUCTS];
const initial = {
  basket,
  basketSelections: initialSelections(basket, types, products),
  extraSelections: initialExtraSelections(DEMO_EXTRA_GROUPS, types, products),
  extraGroups: DEMO_EXTRA_GROUPS,
  types,
  products,
  privateBasketAdjustmentCents: 325,
};
describe('Precificação segura no backend', () => {
  it('adiciona ajuste privado à cesta mas nunca publica campos internos', () => {
    const result = priceOrderOnServer(initial);
    expect(result.basketSubtotalCents).toBeGreaterThan(325);
    expect(result.totalCents).toBe(result.basketSubtotalCents + result.extrasSubtotalCents);
    const body = JSON.stringify(result);
    expect(body).not.toMatch(
      /privateBasketAdjustment|unitPriceCents|costCents|supplier|originalBling/i,
    );
    expect(result.basketItems.every((item) => !('priceCents' in item))).toBe(true);
  });
  it('preço dos extras aparece individualmente; quantidade inicia zero', () => {
    const selected = initial.extraSelections.map((value) =>
      value.typeId === 'extra-biscoito' ? { ...value, quantity: 2 } : value,
    );
    const result = priceOrderOnServer({ ...initial, extraSelections: selected });
    expect(result.extraItems).toHaveLength(1);
    expect(result.extraItems[0]!.priceCents).toBeGreaterThan(0);
  });
  it('reserva mentalmente o mesmo SKU usado em cesta e extras antes de permitir confirmar', () => {
    const limited = products.map((product) =>
      product.sku === initial.basketSelections[0]?.sku ? { ...product, stock: 1 } : product,
    );
    const dupType = {
      id: 'extra-repeated',
      name: 'Arroz extra',
      productSkus: [initial.basketSelections[0]!.sku!],
      order: 120,
    };
    const mixedTypes = [...types, dupType];
    const extraGroups = [...DEMO_EXTRA_GROUPS, { typeId: dupType.id, order: 10, active: true }];
    const extras = [
      ...initial.extraSelections,
      { typeId: dupType.id, quantity: 1, sku: initial.basketSelections[0]!.sku },
    ];
    expect(() =>
      priceOrderOnServer({
        ...initial,
        types: mixedTypes,
        products: limited,
        extraGroups,
        extraSelections: extras,
      }),
    ).toThrow(/Estoque insuficiente/);
  });
  it('rejeita ajuste negativo e produtos desativados', () => {
    expect(() => priceOrderOnServer({ ...initial, privateBasketAdjustmentCents: -1 })).toThrow();
    expect(() =>
      priceOrderOnServer({ ...initial, basket: { ...basket, active: false } }),
    ).toThrow();
  });
});
