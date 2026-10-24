import { describe, expect, it } from 'vitest';
import {
  initialSelections,
  setSelectionQuantity,
  setSelectionProduct,
  summarizeBasket,
  validateBasketTemplate,
} from './basket';
import type { Product, BasketTemplate, ProductType } from './model';

const products: Product[] = [
  {
    sku: 'A',
    name: 'Arroz A',
    gtin: null,
    brand: 'A',
    category: 'MERCEARIA BÁSICA',
    priceCents: 2100,
    active: true,
    stock: 10,
  },
  {
    sku: 'B',
    name: 'Arroz B',
    gtin: null,
    brand: 'B',
    category: 'MERCEARIA BÁSICA',
    priceCents: 2500,
    active: true,
    stock: 10,
  },
  {
    sku: 'C',
    name: 'Arroz C',
    gtin: null,
    brand: 'C',
    category: 'MERCEARIA BÁSICA',
    priceCents: 1900,
    active: false,
    stock: 10,
  },
];
const types: ProductType[] = [
  { id: 'arroz', name: 'Arroz', productSkus: ['A', 'B', 'C'], order: 1 },
];
const basket: BasketTemplate = {
  id: 'mini',
  name: 'Mini',
  lines: [{ typeId: 'arroz', defaultQuantity: 2, order: 1 }],
  active: true,
};

describe('cestas personalizáveis', () => {
  it('escolhe o menor preço entre SKUs vendáveis e calcula centavos', () => {
    const selected = initialSelections(basket, types, products);
    expect(selected[0]?.sku).toBe('A');
    expect(summarizeBasket(basket, selected, types, products).totalCents).toBe(4200);
  });
  it('troca a marca e recalcula o total', () => {
    const selected = setSelectionProduct(
      initialSelections(basket, types, products),
      'arroz',
      'B',
      types,
      products,
    );
    expect(summarizeBasket(basket, selected, types, products).totalCents).toBe(5000);
  });
  it('remove o tipo da cesta sem apagar sua definição', () => {
    const selected = setSelectionQuantity(initialSelections(basket, types, products), 'arroz', 0);
    expect(summarizeBasket(basket, selected, types, products).totalCents).toBe(0);
    expect(selected[0]?.typeId).toBe('arroz');
  });
  it('bloqueia estoque insuficiente e produto inativo', () => {
    expect(() =>
      setSelectionProduct(
        initialSelections(basket, types, products),
        'arroz',
        'C',
        types,
        products,
      ),
    ).toThrow();
    const impossible = summarizeBasket(
      basket,
      setSelectionQuantity(initialSelections(basket, types, products), 'arroz', 11),
      types,
      products,
    );
    expect(impossible.unavailableTypeIds).toContain('arroz');
    expect(impossible.totalCents).toBe(0);
  });
  it('rejeita linhas duplicadas e quantidade negativa no admin', () => {
    const invalid = {
      ...basket,
      lines: [...basket.lines, { typeId: 'arroz', defaultQuantity: -1, order: 2 }],
    };
    expect(validateBasketTemplate(invalid, types)).toHaveLength(2);
  });
});
