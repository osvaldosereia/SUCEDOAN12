import { describe, expect, it } from 'vitest';
import {
  CHECKOUT_MINIMUM_CENTS,
  makeIdempotencyKey,
  normalizeCity,
  normalizeDigits,
  validateCheckoutRequest,
  type CheckoutOrderRequest,
} from './checkout-order';

const base: CheckoutOrderRequest = {
  basketId: 'mini',
  basketQuantity: 1,
  basketLines: [{ typeId: 'type-1', sku: 'ARROZ', quantity: 2 }],
  extraLines: [],
  customer: {
    name: 'Maria de Souza',
    phone: '(65) 99999-9999',
    address: {
      recipientName: 'Maria de Souza',
      postalCode: '78000000',
      street: 'Rua das Flores',
      streetNumber: '10',
      complement: '',
      neighborhood: 'Centro',
      city: 'Cuiabá',
      stateCode: 'MT',
      referenceNote: '',
    },
  },
  paymentMethod: 'PIX',
  deliveryDate: '2026-10-26',
  idempotencyKey: 'checkout-test-123456789',
};

describe('checkout order contract', () => {
  it('normalizes city and phone without changing the accepted destination', () => {
    expect(normalizeCity(' CUIABÁ ')).toBe('Cuiabá');
    expect(normalizeCity('varzea grande')).toBe('Várzea Grande');
    expect(normalizeCity('Rondonópolis')).toBeNull();
    expect(normalizeDigits('(65) 99999-9999')).toBe('65999999999');
  });

  it('enforces the minimum order and the delivery cutoff', () => {
    expect(validateCheckoutRequest(base, CHECKOUT_MINIMUM_CENTS - 1)).toContain(
      'O pedido mínimo é de R$ 75',
    );
    expect(
      validateCheckoutRequest({ ...base, deliveryDate: '2026-10-24' }, CHECKOUT_MINIMUM_CENTS, {
        now: new Date('2026-10-24T16:00:00Z'),
      }),
    ).toContain('O horário de corte de hoje já passou; escolha outra data.');
  });

  it('rejects Sundays and configured holidays but does not require CPF', () => {
    const sunday = { ...base, deliveryDate: '2026-10-25' };
    expect(validateCheckoutRequest(sunday, CHECKOUT_MINIMUM_CENTS)).toContain(
      'Não fazemos entregas aos domingos.',
    );
    const holiday = { ...base, deliveryDate: '2026-10-26' };
    expect(
      validateCheckoutRequest(holiday, CHECKOUT_MINIMUM_CENTS, { holidays: ['2026-10-26'] }),
    ).toContain('Não fazemos entregas em feriados.');
  });

  it('creates a retry-safe idempotency key', () => {
    const key = makeIdempotencyKey();
    expect(key.length).toBeGreaterThanOrEqual(16);
    expect(
      validateCheckoutRequest({ ...base, idempotencyKey: key }, CHECKOUT_MINIMUM_CENTS),
    ).not.toContain('Identificador de pedido inválido.');
  });
});
