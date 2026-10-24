import { describe, expect, it } from 'vitest';
import {
  utilityEventFromOrderEvent,
  utilityRetryState,
  type UtilityDeliveryStatus,
} from './whatsapp-utility';

describe('mensagens utilitárias Meta V2', () => {
  it('mapeia apenas os eventos operacionais autorizados', () => {
    expect(utilityEventFromOrderEvent('OrderStarted')).toBe('OrderSeparating');
    expect(utilityEventFromOrderEvent('OrderReady')).toBe('OrderReady');
    expect(utilityEventFromOrderEvent('OrderDelivered')).toBe('OrderDelivered');
    expect(utilityEventFromOrderEvent('OrderItemMarked')).toBeNull();
    expect(utilityEventFromOrderEvent('OrderCreated')).toBe('OrderReceived');
  });

  it('limita retries de falha e preserva estados de entrega', () => {
    const fail = (attempts: number) => utilityRetryState('FALHA', attempts, 3);
    expect(fail(0)).toEqual({ status: 'NA_FILA', attempts: 1, retryable: true });
    expect(fail(2)).toEqual({ status: 'FALHA_FINAL', attempts: 3, retryable: false });
    expect(utilityRetryState('ENTREGUE' as UtilityDeliveryStatus, 1, 3)).toEqual({
      status: 'ENTREGUE',
      attempts: 1,
      retryable: false,
    });
  });
});
