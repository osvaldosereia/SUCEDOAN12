import { describe, expect, it } from 'vitest';
import { parseWhatsAppFlowSubmission } from './whatsapp-flow';

const validResponse = {
  flow_token: 'flow-session-1234567890',
  basketId: 'basket-mini',
  basketQuantity: 1,
  basketLines: [{ typeId: 'type-rice', sku: 'SKU-RICE-01', quantity: 2 }],
  extraLines: [{ typeId: 'type-extra', sku: 'SKU-EXTRA-01', quantity: 1 }],
  customerName: 'Maria da Silva',
  recipientName: 'Maria da Silva',
  postalCode: '78000000',
  street: 'Rua das Flores',
  streetNumber: '123',
  complement: 'Casa 2',
  neighborhood: 'Centro',
  city: 'Cuiaba',
  referenceNote: 'Portão branco',
  paymentMethod: 'PIX',
  deliveryDate: '2026-10-26',
};

describe('parseWhatsAppFlowSubmission', () => {
  it('maps a completed Flow response into the existing checkout contract', () => {
    const result = parseWhatsAppFlowSubmission({
      providerAccount: '0975',
      senderPhone: '+55 (65) 99982-8360',
      messageId: 'wamid.flow-123',
      responseJson: JSON.stringify({ ...validResponse, totalCents: 1, priceCents: 1 }),
    });

    expect(result).toEqual({
      providerAccount: '0975',
      messageId: 'wamid.flow-123',
      flowToken: validResponse.flow_token,
      request: {
        basketId: 'basket-mini',
        basketQuantity: 1,
        basketLines: [{ typeId: 'type-rice', sku: 'SKU-RICE-01', quantity: 2 }],
        extraLines: [{ typeId: 'type-extra', sku: 'SKU-EXTRA-01', quantity: 1 }],
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
      },
    });
    expect(result.request).not.toHaveProperty('totalCents');
    expect(result.request.basketLines[0]).not.toHaveProperty('priceCents');
  });

  it('rejects malformed response JSON', () => {
    expect(() =>
      parseWhatsAppFlowSubmission({
        providerAccount: '0975',
        senderPhone: '65999828360',
        messageId: 'wamid.flow-123',
        responseJson: '{invalid',
      }),
    ).toThrow();
  });

  it('rejects an unknown account or a phone that cannot be normalized', () => {
    const input = {
      providerAccount: 'other',
      senderPhone: '1234',
      messageId: 'wamid.flow-123',
      responseJson: JSON.stringify(validResponse),
    };

    expect(() => parseWhatsAppFlowSubmission(input)).toThrow();
    expect(() =>
      parseWhatsAppFlowSubmission({
        ...input,
        providerAccount: '0975',
        senderPhone: '1234',
      }),
    ).toThrow();
  });

  it('rejects empty basket selections and invalid payment methods', () => {
    expect(() =>
      parseWhatsAppFlowSubmission({
        providerAccount: '1018',
        senderPhone: '5565999828360',
        messageId: 'wamid.flow-456',
        responseJson: JSON.stringify({ ...validResponse, basketLines: [] }),
      }),
    ).toThrow();

    expect(() =>
      parseWhatsAppFlowSubmission({
        providerAccount: '1018',
        senderPhone: '5565999828360',
        messageId: 'wamid.flow-456',
        responseJson: JSON.stringify({ ...validResponse, paymentMethod: 'BOLETO' }),
      }),
    ).toThrow();
  });

  it('rejects a missing or malformed Flow token so retries cannot create unrelated orders', () => {
    expect(() =>
      parseWhatsAppFlowSubmission({
        providerAccount: '0975',
        senderPhone: '5565999828360',
        messageId: 'wamid.flow-789',
        responseJson: JSON.stringify({ ...validResponse, flow_token: '' }),
      }),
    ).toThrow();

    expect(() =>
      parseWhatsAppFlowSubmission({
        providerAccount: '0975',
        senderPhone: '5565999828360',
        messageId: 'wamid.flow-789',
        responseJson: JSON.stringify({ ...validResponse, flow_token: 'short' }),
      }),
    ).toThrow();
  });
});
