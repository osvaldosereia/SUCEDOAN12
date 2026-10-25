import { describe, expect, it, vi } from 'vitest';
import { createWhatsAppFlowController } from './whatsapp-flow-controller';

const catalog = {
  products: [
    { sku: 'SKU-RICE-01', name: 'Arroz integral', active: true, stock: 5, priceCents: 2000 },
    { sku: 'SKU-RICE-02', name: 'Arroz esgotado', active: true, stock: 0, priceCents: 2200 },
    { sku: 'SKU-RICE-03', name: 'Arroz inativo', active: false, stock: 10, priceCents: 2300 },
    { sku: 'SKU-SUGAR-01', name: 'Açúcar mascavo', active: true, stock: 8, priceCents: 1200 },
  ],
  types: [
    {
      id: 'type-rice',
      name: 'Arroz',
      productSkus: ['SKU-RICE-01', 'SKU-RICE-02', 'SKU-RICE-03'],
      active: true,
      order: 1,
    },
    {
      id: 'type-sugar',
      name: 'Açúcar',
      productSkus: ['SKU-SUGAR-01'],
      active: true,
      order: 2,
    },
    {
      id: 'type-disabled',
      name: 'Tipo indisponível',
      productSkus: ['SKU-RICE-03'],
      active: true,
      order: 3,
    },
  ],
  baskets: [
    {
      id: 'mini',
      name: 'Cesta Mini',
      active: true,
      lines: [{ typeId: 'type-rice', defaultQuantity: 2, order: 1 }],
    },
    {
      id: 'unavailable',
      name: 'Cesta indisponível',
      active: true,
      lines: [{ typeId: 'type-disabled', defaultQuantity: 1, order: 1 }],
    },
    {
      id: 'inactive',
      name: 'Cesta inativa',
      active: false,
      lines: [{ typeId: 'type-rice', defaultQuantity: 1, order: 1 }],
    },
  ],
  extras: [{ typeId: 'type-sugar', active: true, order: 1 }],
};

describe('createWhatsAppFlowController', () => {
  it('answers ping and returns only active basket/product choices on INIT', async () => {
    const quote = vi.fn();
    const controller = createWhatsAppFlowController({
      readCatalog: async () => catalog,
      quote,
    });

    await expect(controller({ action: 'ping' })).resolves.toEqual({
      data: { status: 'active' },
    });
    await expect(
      controller({ action: 'INIT', flow_token: 'flow-session-1234567890' }),
    ).resolves.toEqual({
      screen: 'BASKET',
      data: { baskets: [{ id: 'mini', title: 'Cesta Mini' }] },
    });
    expect(quote).not.toHaveBeenCalled();
    expect(JSON.stringify(await controller({ action: 'INIT' }))).not.toMatch(
      /priceCents|stock|unitPrice/i,
    );
  });

  it('returns stock-backed product options for a selected basket', async () => {
    const controller = createWhatsAppFlowController({
      readCatalog: async () => catalog,
      quote: vi.fn(),
    });

    await expect(
      controller({
        action: 'data_exchange',
        screen: 'BASKET',
        flow_token: 'flow-session-1234567890',
        data: { basketId: 'mini', basketQuantity: 2 },
      }),
    ).resolves.toEqual({
      screen: 'PRODUCTS',
      data: {
        basketId: 'mini',
        basketName: 'Cesta Mini',
        basketQuantity: 2,
        productGroups: [
          {
            typeId: 'type-rice',
            typeName: 'Arroz',
            quantity: 2,
            options: [{ id: 'SKU-RICE-01', title: 'Arroz integral' }],
          },
        ],
        extraGroups: [
          {
            typeId: 'type-sugar',
            typeName: 'Açúcar',
            options: [{ id: 'SKU-SUGAR-01', title: 'Açúcar mascavo' }],
          },
        ],
      },
    });
  });

  it('quotes a sanitized order on the customer screen before review', async () => {
    const quote = vi.fn(async () => ({
      totalCents: 12345,
      basketSubtotalCents: 10000,
      extrasSubtotalCents: 2345,
      itemCount: 3,
    }));
    const controller = createWhatsAppFlowController({
      readCatalog: async () => catalog,
      quote,
    });

    const result = await controller({
      action: 'data_exchange',
      screen: 'CUSTOMER',
      flow_token: 'flow-session-1234567890',
      data: {
        basketId: 'mini',
        basketQuantity: 1,
        basketLines: [{ typeId: 'type-rice', sku: 'SKU-RICE-01', quantity: 2 }],
        extraLines: [],
        customerName: 'Maria da Silva',
        phone: '5565999828360',
        recipientName: 'Maria da Silva',
        postalCode: '78000-000',
        street: 'Rua das Flores',
        streetNumber: '123',
        complement: 'Casa 2',
        neighborhood: 'Centro',
        city: 'Cuiaba',
        referenceNote: 'Portão branco',
        paymentMethod: 'PIX',
        deliveryDate: '2026-10-26',
        totalCents: 1,
      },
    });

    expect(result.screen).toBe('REVIEW');
    expect(result.data).toMatchObject({ totalCents: 12345 });
    expect(result.data.totalLabel).toContain('123,45');
    expect(quote).toHaveBeenCalledOnce();
    const quotedRequest = quote.mock.calls[0]?.[0];
    expect(quotedRequest).toEqual({
      basketId: 'mini',
      basketQuantity: 1,
      basketLines: [{ typeId: 'type-rice', sku: 'SKU-RICE-01', quantity: 2 }],
      extraLines: [],
      customer: {
        name: 'Maria da Silva',
        phone: '65999828360',
        address: {
          recipientName: 'Maria da Silva',
          postalCode: '78000000',
          street: 'Rua das Flores',
          streetNumber: '123',
          complement: 'Casa 2',
          neighborhood: 'Centro',
          city: 'Cuiabá',
          stateCode: 'MT',
          referenceNote: 'Portão branco',
        },
      },
      paymentMethod: 'PIX',
      deliveryDate: '2026-10-26',
      idempotencyKey: 'flow:flow-session-1234567890',
    });
    expect(quotedRequest).not.toHaveProperty('totalCents');
  });

  it('keeps quote failures generic and inside the customer screen', async () => {
    const controller = createWhatsAppFlowController({
      readCatalog: async () => catalog,
      quote: async () => {
        throw new Error('private database message');
      },
    });

    const result = await controller({
      action: 'data_exchange',
      screen: 'CUSTOMER',
      flow_token: 'flow-session-1234567890',
      data: { basketId: 'mini', basketQuantity: 1 },
    });

    expect(result.screen).toBe('CUSTOMER');
    expect(result.data.errorMessage).toBe('Não foi possível calcular o pedido. Revise os dados.');
    expect(JSON.stringify(result)).not.toContain('private database message');
  });

  it('rejects an unavailable basket selection and unsupported actions', async () => {
    const controller = createWhatsAppFlowController({
      readCatalog: async () => catalog,
      quote: vi.fn(),
    });

    await expect(
      controller({
        action: 'data_exchange',
        screen: 'BASKET',
        data: { basketId: 'unavailable', basketQuantity: 1 },
      }),
    ).resolves.toEqual({
      screen: 'BASKET',
      data: {
        baskets: [{ id: 'mini', title: 'Cesta Mini' }],
        errorMessage: 'Esta cesta está temporariamente indisponível.',
      },
    });

    await expect(controller({ action: 'DELETE_EVERYTHING' })).rejects.toThrow();
  });

  it('acknowledges client error notifications and returns a safe unavailable state', async () => {
    const controller = createWhatsAppFlowController({
      readCatalog: async () => {
        throw new Error('private upstream detail');
      },
      quote: vi.fn(),
    });

    await expect(
      controller({ action: 'data_exchange', data: { error: 'client error' } }),
    ).resolves.toEqual({ data: { acknowledged: true } });
    await expect(controller({ action: 'INIT' })).resolves.toEqual({
      screen: 'BASKET',
      data: {
        baskets: [],
        errorMessage: 'As opções de compra estão temporariamente indisponíveis.',
      },
    });
  });

  it('fails closed when the active catalogue exceeds the endpoint payload limit', async () => {
    const tooManyProducts = Array.from({ length: 60 }, (_, index) => ({
      sku: `SKU-${index}`,
      name: `Product ${index}`,
      active: true,
      stock: 10,
      priceCents: 100,
    }));
    const oversizedCatalog = {
      ...catalog,
      products: tooManyProducts,
      types: [
        {
          id: 'type-rice',
          name: 'Arroz',
          productSkus: tooManyProducts.map((product) => product.sku),
          active: true,
          order: 1,
        },
      ],
    };
    const controller = createWhatsAppFlowController({
      readCatalog: async () => oversizedCatalog,
      quote: vi.fn(),
    });

    await expect(controller({ action: 'INIT' })).resolves.toEqual({
      screen: 'BASKET',
      data: {
        baskets: [],
        errorMessage: 'As opções de compra estão temporariamente indisponíveis.',
      },
    });
  });
});
