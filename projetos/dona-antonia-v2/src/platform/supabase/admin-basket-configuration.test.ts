import { describe, expect, it } from 'vitest';
import { mapBasketConfiguration } from './admin-basket-configuration';

describe('mapeamento da configuração persistida de cestas', () => {
  it('maps relationships, order, quantities and nullable private pricing', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const result = mapBasketConfiguration({
      types: [{ id, name: 'Arroz', order: 1, productSkus: ['ARROZ-5KG'] }],
      baskets: [
        {
          id: 'mini',
          code: 'MINI',
          name: 'Mini',
          order: 1,
          active: true,
          privateAdjustmentCents: null,
          lines: [{ typeId: id, defaultQuantity: 2, order: 1 }],
        },
      ],
      extras: [{ typeId: id, order: 1, active: true }],
    });
    expect(result.baskets[0]?.lines[0]?.defaultQuantity).toBe(2);
    expect(result.baskets[0]?.privateAdjustmentCents).toBeNull();
    expect(result.extras[0]?.typeId).toBe(id);
  });

  it('rejects an incomplete RPC response', () => {
    expect(() => mapBasketConfiguration({ types: [], baskets: [] })).toThrow(/incompleta/i);
  });
});
