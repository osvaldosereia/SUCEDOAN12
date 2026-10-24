import { describe, expect, it } from 'vitest';
import { mapPublicCatalogSnapshot } from './public-catalog';

describe('projeção pública do catálogo', () => {
  it('preserva total agregado e rejeita composição/preço privado', () => {
    const result = mapPublicCatalogSnapshot({
      products: [
        {
          sku: 'A',
          name: 'Arroz',
          brand: 'Marca',
          gtin: null,
          category: 'MERCEARIA BÁSICA',
          priceCents: 100,
          stock: 2,
          active: true,
        },
      ],
      types: [{ id: 't1', name: 'Arroz', order: 1, active: true, productSkus: ['A'] }],
      baskets: [
        {
          id: 'mini',
          name: 'Mini',
          active: true,
          startingTotalCents: 350,
          lines: [{ typeId: 't1', defaultQuantity: 2, order: 1 }],
        },
      ],
      extras: [{ typeId: 't1', order: 1, active: true }],
    });
    expect(result.baskets[0]?.startingTotalCents).toBe(350);
    expect(JSON.stringify(result)).not.toMatch(/private|composition/i);
  });

  it('falha se o servidor tentar enviar o ajuste interno', () => {
    expect(() =>
      mapPublicCatalogSnapshot({
        products: [],
        types: [],
        extras: [],
        baskets: [
          {
            id: 'mini',
            name: 'Mini',
            active: true,
            startingTotalCents: 1,
            privateAdjustmentCents: 99,
            lines: [],
          },
        ],
      }),
    ).toThrow(/privad/i);
  });
});
