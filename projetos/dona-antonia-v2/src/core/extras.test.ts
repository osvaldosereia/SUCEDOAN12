import { describe, it, expect } from 'vitest';
import type { BasketTemplate, Product, ProductType } from './model';
import { initialSelections, setSelectionQuantity, summarizeBasket } from './basket';
import {
  initialExtraSelections,
  selectExtraProduct,
  summarizeExtras,
  summarizeOrder,
  extrasAsLines,
} from './extras';

const products: Product[] = [
  {
    sku: 'C',
    name: 'Café',
    gtin: null,
    category: 'MERCEARIA BÁSICA',
    brand: 'Teste',
    priceCents: 800,
    stock: 10,
    active: true,
  },
  {
    sku: 'X',
    name: 'Sabonete A',
    gtin: null,
    category: 'HIGIÊNE',
    brand: 'Teste',
    priceCents: 250,
    stock: 10,
    active: true,
  },
  {
    sku: 'Y',
    name: 'Sabonete B',
    gtin: null,
    category: 'HIGIÊNE',
    brand: 'Teste',
    priceCents: 300,
    stock: 10,
    active: true,
  },
];
const types: ProductType[] = [
  { id: 'cafe', name: 'Café', order: 1, productSkus: ['C'] },
  { id: 'sabonete', name: 'Sabonete', order: 2, productSkus: ['X', 'Y'] },
];
const basket: BasketTemplate = {
  id: 'mini',
  name: 'Mini',
  active: true,
  lines: [{ typeId: 'cafe', order: 1, defaultQuantity: 2 }],
};
const extras = [{ typeId: 'sabonete', order: 1, active: true }];
describe('etapa de extras', () => {
  it('inicia sem custo e permite pular todos', () => {
    const select = initialExtraSelections(extras, types, products);
    expect(select[0]?.quantity).toBe(0);
    expect(summarizeExtras(extras, select, types, products).totalCents).toBe(0);
  });
  it('selecionar card adiciona uma unidade e trocar preserva a quantidade', () => {
    const initial = initialExtraSelections(extras, types, products);
    const first = selectExtraProduct(initial, 'sabonete', 'X', types, products);
    expect(first[0]?.quantity).toBe(1);
    const twice = setSelectionQuantity(first, 'sabonete', 3);
    const switched = selectExtraProduct(twice, 'sabonete', 'Y', types, products);
    expect(switched[0]?.quantity).toBe(3);
    expect(summarizeExtras(extras, switched, types, products).totalCents).toBe(900);
  });
  it('somar cesta e extras preserva quantidade de origem', () => {
    const selected = initialSelections(basket, types, products);
    const extra = selectExtraProduct(
      initialExtraSelections(extras, types, products),
      'sabonete',
      'X',
      types,
      products,
    );
    const order = summarizeOrder(
      summarizeBasket(basket, selected, types, products).lines,
      summarizeExtras(extras, extra, types, products).lines,
    );
    expect(order.totalCents).toBe(1850);
    expect(order.itemCount).toBe(3);
    expect(basket.lines[0]?.defaultQuantity).toBe(2);
    expect(extrasAsLines(extras)[0]?.defaultQuantity).toBe(0);
  });
  it('não duplica mesmo SKU escolhido nas duas etapas', () => {
    const both = [{ typeId: 'cafe', order: 1, active: true }];
    const extra = selectExtraProduct(
      initialExtraSelections(both, types, products),
      'cafe',
      'C',
      types,
      products,
    );
    const order = summarizeOrder(
      summarizeBasket(basket, initialSelections(basket, types, products), types, products).lines,
      summarizeExtras(both, extra, types, products).lines,
    );
    expect(order.lines).toHaveLength(1);
    expect(order.lines[0]?.quantity).toBe(3);
    expect(order.totalCents).toBe(2400);
  });
  it('produto que ficou sem estoque é marcado indisponível, mas mantém outras opções', () => {
    const selected = initialSelections(basket, types, products);
    const out = products.map((p) => (p.sku === 'C' ? { ...p, stock: 0 } : p));
    const result = summarizeBasket(basket, selected, types, out);
    expect(result.unavailableTypeIds).toEqual(['cafe']);
    expect(result.totalCents).toBe(0);
  });
});
