/** Motor de pedidos V2 isolado do React, do Supabase e do Bling. */
export const ORDER_STATES = ['NOVO', 'EM_SEPARACAO', 'PRONTO', 'ENTREGUE'] as const;
export type OrderState = (typeof ORDER_STATES)[number];
export type SeparationResult = 'PENDENTE' | 'SEPARADO' | 'FALTOU';
export type PaymentState = 'PENDENTE' | 'RECEBIDO';
export type FiscalState = 'PENDENTE' | 'EMITIDA' | 'ERRO';
export interface OrderItem {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  fulfilledQuantity: number;
  unitPriceCents: number;
  separation: SeparationResult;
  isExtra: boolean;
}
export interface OperationalOrder {
  id: string;
  number: string;
  createdAt: string;
  customerName: string;
  contactLabel: string;
  deliveryAddress: string;
  paymentMethod: string;
  paymentState: PaymentState;
  fiscalState: FiscalState;
  state: OrderState;
  assignedTo: string | null;
  items: readonly OrderItem[];
  version: number;
}
export const ORDER_LABELS: Readonly<Record<OrderState, string>> = {
  NOVO: 'Novo',
  EM_SEPARACAO: 'Em separação',
  PRONTO: 'Pronto',
  ENTREGUE: 'Entregue',
};
export function orderTotal(order: OperationalOrder): number {
  return order.items.reduce((sum, item) => sum + item.fulfilledQuantity * item.unitPriceCents, 0);
}
const next: Partial<Record<OrderState, OrderState>> = {
  NOVO: 'EM_SEPARACAO',
  EM_SEPARACAO: 'PRONTO',
  PRONTO: 'ENTREGUE',
};
export function advanceOrder(
  order: OperationalOrder,
  operator = 'Operador de demonstração',
): OperationalOrder {
  const dest = next[order.state];
  if (!dest) throw new Error('Pedido já entregue');
  if (dest === 'PRONTO' && order.items.some((item) => item.separation === 'PENDENTE')) {
    throw new Error('Marque cada item como separado ou faltou antes de concluir.');
  }
  if (dest === 'PRONTO' && !order.items.some((item) => item.fulfilledQuantity > 0)) {
    throw new Error('Todos os produtos faltaram. É necessário revisar o pedido.');
  }
  return {
    ...order,
    state: dest,
    assignedTo: dest === 'EM_SEPARACAO' ? operator : order.assignedTo,
    version: order.version + 1,
  };
}
export function markSeparated(
  order: OperationalOrder,
  itemId: string,
  result: Exclude<SeparationResult, 'PENDENTE'>,
): OperationalOrder {
  if (order.state !== 'EM_SEPARACAO')
    throw new Error('Só é possível conferir itens durante a separação.');
  if (!order.items.some((item) => item.id === itemId)) throw new Error('Item não encontrado.');
  const items = order.items.map((item) =>
    item.id === itemId
      ? {
          ...item,
          separation: result,
          fulfilledQuantity: result === 'SEPARADO' ? item.quantity : 0,
        }
      : item,
  );
  return { ...order, items, version: order.version + 1 };
}
