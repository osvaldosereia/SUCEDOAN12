import { describe, expect, it, vi } from 'vitest';
import {
  mapPublicQuote,
  mapPublicReceipt,
  createSupabasePublicCheckoutClient,
} from './public-checkout';

describe('checkout público', () => {
  it('aceita somente o resumo financeiro público', () => {
    expect(
      mapPublicQuote({
        totalCents: 7500,
        basketSubtotalCents: 7000,
        extrasSubtotalCents: 500,
        itemCount: 4,
      }),
    ).toEqual({
      totalCents: 7500,
      basketSubtotalCents: 7000,
      extrasSubtotalCents: 500,
      itemCount: 4,
    });
    expect(() => mapPublicQuote({ totalCents: 7500, privateAdjustmentCents: 500 })).toThrow(
      /privad/i,
    );
  });

  it('mapeia recibo e envia payload sem confiar no total do browser', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        orderId: 'order-1',
        orderNumber: 'DA-2026-000001',
        totalCents: 8000,
        status: 'NOVO',
        replayed: false,
      },
      error: null,
    });
    const client = createSupabasePublicCheckoutClient({ rpc } as never);
    const request = {
      basketId: 'mini',
      basketQuantity: 1,
      basketLines: [{ typeId: 'type-1', sku: 'ARROZ', quantity: 2 }],
      extraLines: [],
      customer: {
        name: 'Cliente Teste',
        phone: '65999999999',
        address: {
          recipientName: 'Cliente Teste',
          postalCode: '78000000',
          street: 'Rua A',
          streetNumber: '1',
          complement: '',
          neighborhood: 'Centro',
          city: 'Cuiabá' as const,
          stateCode: 'MT' as const,
          referenceNote: '',
        },
      },
      paymentMethod: 'PIX' as const,
      deliveryDate: '2026-10-26',
      idempotencyKey: 'checkout-test-123456789',
    };
    await expect(client.createOrder(request)).resolves.toMatchObject({
      orderNumber: 'DA-2026-000001',
    });
    const payload = rpc.mock.calls[0]?.[1].p_payload;
    expect(payload).not.toHaveProperty('totalCents');
    expect(payload).toHaveProperty('basketLines[0].sku', 'ARROZ');
  });

  it('rejeita recibo com dados de endereço ou status diferente de NOVO', () => {
    expect(() =>
      mapPublicReceipt({
        orderId: '1',
        orderNumber: 'DA-1',
        totalCents: 7500,
        status: 'NOVO',
        address: {},
      }),
    ).toThrow(/privad/i);
    expect(() =>
      mapPublicReceipt({ orderId: '1', orderNumber: 'DA-1', totalCents: 7500, status: 'ENTREGUE' }),
    ).toThrow(/status/i);
  });
});
