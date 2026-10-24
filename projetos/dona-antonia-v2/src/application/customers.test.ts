import { describe, expect, it } from 'vitest';
import { deliveryOutcomeMessage, normalizeCustomerPhone } from './customers';

describe('customer and delivery contracts', () => {
  it('normalizes Brazilian phone digits without keeping country prefix', () => {
    expect(normalizeCustomerPhone('+55 (65) 9 8888-7777')).toBe('65988887777');
    expect(normalizeCustomerPhone('065 3333-2222')).toBe('6533332222');
  });

  it('rejects incomplete phone numbers and explains delivery outcome', () => {
    expect(() => normalizeCustomerPhone('123')).toThrow('Telefone do cliente inválido.');
    expect(deliveryOutcomeMessage('CONCLUIDA')).toBe('Entrega concluída.');
    expect(deliveryOutcomeMessage('PROBLEMA')).toBe('Problema de entrega registrado.');
  });
});
