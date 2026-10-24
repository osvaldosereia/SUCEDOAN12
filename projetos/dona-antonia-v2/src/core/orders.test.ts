import { describe, it, expect } from 'vitest';
import { advanceOrder, markSeparated, orderTotal } from './orders';
import type { OperationalOrder } from './orders';
const initial: OperationalOrder = {
  id: 'test',
  number: 'TESTE-1',
  createdAt: '2026-10-24T10:00:00Z',
  customerName: 'Cliente teste',
  contactLabel: '—',
  deliveryAddress: 'Endereço demonstrativo',
  paymentMethod: 'PIX na entrega',
  paymentState: 'PENDENTE',
  fiscalState: 'ERRO',
  state: 'NOVO',
  assignedTo: null,
  version: 1,
  items: [
    {
      id: 'a',
      sku: 'SKU-A',
      name: 'Arroz',
      quantity: 2,
      fulfilledQuantity: 2,
      unitPriceCents: 900,
      separation: 'PENDENTE',
      isExtra: false,
    },
  ],
};
describe('Pedidos - quatro estados operacionais', () => {
  it('obriga a separação dos itens antes de PRONTO', () => {
    const picking = advanceOrder(initial);
    expect(picking.state).toBe('EM_SEPARACAO');
    expect(() => advanceOrder(picking)).toThrow(/Marque cada item/);
    const marked = markSeparated(picking, 'a', 'SEPARADO');
    expect(advanceOrder(marked).state).toBe('PRONTO');
    expect(advanceOrder(advanceOrder(marked)).state).toBe('ENTREGUE');
  });
  it('não bloqueia PRONTO quando a nota fiscal está com erro', () => {
    const marked = markSeparated(advanceOrder(initial), 'a', 'SEPARADO');
    const ready = advanceOrder(marked);
    expect(ready.fiscalState).toBe('ERRO');
    expect(ready.state).toBe('PRONTO');
  });
  it('abate item que faltou e impede conclusão de pedido sem nenhum item', () => {
    const marked = markSeparated(advanceOrder(initial), 'a', 'FALTOU');
    expect(orderTotal(marked)).toBe(0);
    expect(() => advanceOrder(marked)).toThrow(/Todos os produtos faltaram/);
  });
  it('não aceita alteração de separação após pronto', () => {
    const ready = advanceOrder(markSeparated(advanceOrder(initial), 'a', 'SEPARADO'));
    expect(() => markSeparated(ready, 'a', 'FALTOU')).toThrow();
  });
  it('separa versão e identidade do pedido ao avançar, sem mutar original', () => {
    const next = advanceOrder(initial);
    expect(next.number).toBe(initial.number);
    expect(next.version).toBe(2);
    expect(initial.state).toBe('NOVO');
  });
});
