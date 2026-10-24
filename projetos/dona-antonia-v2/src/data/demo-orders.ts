import type { OperationalOrder, OrderState } from '../core/orders';
const products = [
  { sku: 'DA-0028', name: 'Arroz Caibi Tipo 1 5 kg', quantity: 1, unitPriceCents: 2377 },
  { sku: 'DA-0069', name: 'Feijão Carioca Dona Dê 1 kg', quantity: 2, unitPriceCents: 979 },
  { sku: 'DA-0110', name: 'Óleo de Soja Concord 900 ml', quantity: 1, unitPriceCents: 965 },
];
function makeOrder(index: number, state: OrderState): OperationalOrder {
  const items = products.slice(0, index % 2 === 0 ? 3 : 2).map((item, i) => ({
    id: 'item-' + index + '-' + i,
    sku: item.sku,
    name: item.name,
    quantity: item.quantity,
    fulfilledQuantity: item.quantity,
    unitPriceCents: item.unitPriceCents,
    separation:
      state === 'NOVO'
        ? ('PENDENTE' as const)
        : state === 'EM_SEPARACAO' && i > 0
          ? ('PENDENTE' as const)
          : ('SEPARADO' as const),
    isExtra: false,
  }));
  return {
    id: 'demo-' + index,
    number: 'DEMO-2026-' + String(index + 1).padStart(3, '0'),
    createdAt: '2026-10-23T' + String(8 + index).padStart(2, '0') + ':15:00-04:00',
    customerName: 'Cliente demonstração ' + String.fromCharCode(65 + index),
    contactLabel: 'Contato fictício',
    deliveryAddress: 'Endereço demonstrativo — Cuiabá/MT',
    paymentMethod: index % 2 ? 'Dinheiro' : 'PIX na entrega',
    paymentState: 'PENDENTE',
    fiscalState: 'PENDENTE',
    state,
    assignedTo: state === 'NOVO' ? null : 'Operador de demonstração',
    items,
    version: 1,
  };
}
/** Apenas amostras fictícias: nunca representar clientes ou pedidos reais. */
export const DEMO_ORDERS: OperationalOrder[] = [
  makeOrder(0, 'NOVO'),
  makeOrder(1, 'NOVO'),
  makeOrder(2, 'EM_SEPARACAO'),
  makeOrder(3, 'PRONTO'),
  makeOrder(4, 'ENTREGUE'),
];
