import type { OperationalOrder, OrderState } from '../../core/orders';
import { InvalidCommand, VersionConflict } from '../order-commands';
import type { OrderCommandStore, OrderMutation } from '../order-commands';
/** Fake deterministic transaction store. No localStorage/network — for test and development only. */
const clone = (order: OperationalOrder): OperationalOrder => ({
  ...order,
  items: order.items.map((item) => ({ ...item })),
});
export class MemoryOrderStore implements OrderCommandStore {
  private orders = new Map<string, OperationalOrder>();
  private results = new Map<
    string,
    { fingerprint: string; orderId: string; result: OperationalOrder }
  >();
  readonly outbox: { orderId: string; event: string; version: number }[] = [];
  constructor(orders: readonly OperationalOrder[]) {
    for (const order of orders) this.orders.set(order.id, clone(order));
  }
  async get(id: string) {
    const order = this.orders.get(id);
    return order ? clone(order) : null;
  }
  async list(state: OrderState, limit = 20) {
    return [...this.orders.values()]
      .filter((order) => order.state === state)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map(clone);
  }
  async apply(
    mutation: OrderMutation,
    fingerprint: string,
    change: (order: OperationalOrder) => OperationalOrder,
  ) {
    const previous = this.results.get(mutation.commandId);
    if (previous) {
      if (previous.fingerprint !== fingerprint || previous.orderId !== mutation.orderId) {
        throw new InvalidCommand('Chave de idempotência reutilizada para outra operação');
      }
      return clone(previous.result);
    }
    const current = this.orders.get(mutation.orderId);
    if (!current) throw new InvalidCommand('Pedido inexistente');
    if (current.version !== mutation.expectedVersion) throw new VersionConflict();
    const next = change(clone(current));
    if (
      next.id !== current.id ||
      next.number !== current.number ||
      next.version !== current.version + 1
    ) {
      throw new InvalidCommand('Transição inconsistente ou número modificado');
    }
    this.orders.set(current.id, clone(next));
    this.results.set(mutation.commandId, {
      fingerprint,
      orderId: mutation.orderId,
      result: clone(next),
    });
    if (next.state !== current.state)
      this.outbox.push({
        orderId: next.id,
        event: 'OrderStateChanged:' + next.state,
        version: next.version,
      });
    return clone(next);
  }
}
