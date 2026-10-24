import { describe, expect, it } from 'vitest';
import type { BasketSelection, BasketTemplate, Product, ProductType } from './model';
import type { ExtraGroup } from './extras';
import {
  basketStartingTotal,
  chooseStorefrontProduct,
  updateStorefrontQuantity,
} from './storefront-selection';

const products: Product[] = [
  {
    sku: 'RICE-A',
    name: 'Arroz A',
    brand: 'A',
    category: 'MERCEARIA BÁSICA',
    gtin: null,
    priceCents: 500,
    active: true,
    stock: 8,
  },
  {
    sku: 'RICE-B',
    name: 'Arroz B',
    brand: 'B',
    category: 'MERCEARIA BÁSICA',
    gtin: null,
    priceCents: 600,
    active: true,
    stock: 8,
  },
];
const types: ProductType[] = [
  { id: 'rice', name: 'Arroz', order: 1, productSkus: ['RICE-A', 'RICE-B'] },
];
const basket: BasketTemplate = {
  id: 'mini',
  name: 'Mini',
  active: true,
  lines: [{ typeId: 'rice', defaultQuantity: 2, order: 1 }],
};
const templates = [basket];
const extras: ExtraGroup[] = [{ typeId: 'rice', order: 1, active: true }];

describe('seleção da vitrine', () => {
  it('seleciona a opção vendável mais barata ao aumentar uma quantidade vazia', () => {
    const result = updateStorefrontQuantity({
      mode: 'basket',
      current: [{ typeId: 'rice', sku: null, quantity: 0 }],
      typeId: 'rice',
      amount: 2,
      basket,
      extras,
      types,
      products,
    });

    expect(result).toEqual([{ typeId: 'rice', sku: 'RICE-A', quantity: 2 }]);
  });

  it('preserva a quantidade da cesta ao trocar o SKU e restaura zero como uma unidade', () => {
    const current: BasketSelection[] = [{ typeId: 'rice', sku: 'RICE-A', quantity: 3 }];
    const switched = chooseStorefrontProduct(
      'basket',
      current,
      'rice',
      'RICE-B',
      basket,
      extras,
      types,
      products,
    );
    const restored = chooseStorefrontProduct(
      'basket',
      [{ typeId: 'rice', sku: null, quantity: 0 }],
      'rice',
      'RICE-A',
      basket,
      extras,
      types,
      products,
    );

    expect(switched[0]).toMatchObject({ sku: 'RICE-B', quantity: 3 });
    expect(restored[0]).toMatchObject({ sku: 'RICE-A', quantity: 1 });
  });

  it('extras começam em zero, adicionam uma unidade e preservam quantidade na troca', () => {
    const first = chooseStorefrontProduct(
      'extras',
      [{ typeId: 'rice', sku: null, quantity: 0 }],
      'rice',
      'RICE-A',
      basket,
      extras,
      types,
      products,
    );
    const switched = chooseStorefrontProduct(
      'extras',
      [{ typeId: 'rice', sku: 'RICE-A', quantity: 4 }],
      'rice',
      'RICE-B',
      basket,
      extras,
      types,
      products,
    );

    expect(first[0]).toMatchObject({ sku: 'RICE-A', quantity: 1 });
    expect(switched[0]).toMatchObject({ sku: 'RICE-B', quantity: 4 });
  });

  it('calcula o preço inicial e informa indisponibilidade sem inventar valor', () => {
    expect(basketStartingTotal('mini', templates, types, products)).toBe(1000);
    expect(basketStartingTotal('mini', templates, types, products.slice(0, 0))).toBeNull();
  });
});
