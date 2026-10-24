import { describe, expect, it } from 'vitest';
import { normalizeBasketConfiguration } from './admin-basket-configuration';
import type { AdminBasketConfiguration } from './admin-basket-configuration';

const config: AdminBasketConfiguration = {
  types: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      name: ' Arroz ',
      order: 1,
      productSkus: ['SKU-1'],
    },
  ],
  baskets: [
    {
      id: 'mini',
      code: 'MINI',
      name: ' Mini ',
      order: 1,
      active: true,
      lines: [{ typeId: '11111111-1111-4111-8111-111111111111', defaultQuantity: 2, order: 1 }],
      privateAdjustmentCents: 250,
    },
  ],
  extras: [{ typeId: '11111111-1111-4111-8111-111111111111', order: 1, active: true }],
};

describe('configuração persistente de cestas', () => {
  it('normaliza nomes e ordena vínculos sem alterar os valores privados', () => {
    expect(normalizeBasketConfiguration(config).types[0]?.name).toBe('Arroz');
    expect(normalizeBasketConfiguration(config).baskets[0]?.privateAdjustmentCents).toBe(250);
  });

  it('rejects duplicate type ids and invalid quantities', () => {
    expect(() =>
      normalizeBasketConfiguration({ ...config, types: [...config.types, config.types[0]!] }),
    ).toThrow(/duplicad/i);
    expect(() =>
      normalizeBasketConfiguration({
        ...config,
        baskets: [
          {
            ...config.baskets[0]!,
            lines: [{ typeId: config.types[0]!.id, defaultQuantity: 1000, order: 1 }],
          },
        ],
      }),
    ).toThrow(/quantidade/i);
  });
});
