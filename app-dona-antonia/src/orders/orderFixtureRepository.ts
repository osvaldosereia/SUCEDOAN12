import type {
  CreateOrderInput,
  OrderRecord,
  OrderRepository,
  OrderStatus,
} from './types.ts';

const ORDER_STATUSES: OrderStatus[] = [
  'confirmed',
  'separating',
  'ready',
  'on_route',
  'delivered',
  'cancelled',
];

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  confirmed: 'separating',
  separating: 'ready',
  ready: 'on_route',
  on_route: 'delivered',
};

function cloneOrder(order: OrderRecord): OrderRecord {
  return {
    ...order,
    history: order.history.map((entry) => ({ ...entry })),
  };
}

export function isOrderStatus(value: string): value is OrderStatus {
  return ORDER_STATUSES.includes(value as OrderStatus);
}

export function createOrderFixtureRepository(
  options: { now?: () => number } = {},
): OrderRepository {
  const now = options.now ?? Date.now;
  const orders = new Map<string, OrderRecord>();

  function updateStatus(order: OrderRecord, status: OrderStatus): OrderRecord {
    const at = now();
    const updated: OrderRecord = {
      ...order,
      status,
      updatedAt: at,
      history: [
        ...order.history,
        { status, at },
      ],
    };
    orders.set(updated.id, updated);
    return cloneOrder(updated);
  }

  return {
    async create(input: CreateOrderInput) {
      if (!input.id.startsWith('TEST-')) {
        throw new Error('Fixture order id must start with TEST-');
      }

      const at = now();
      const order: OrderRecord = {
        id: input.id,
        totalCents: input.totalCents,
        status: 'confirmed',
        createdAt: at,
        updatedAt: at,
        history: [{ status: 'confirmed', at }],
      };
      orders.set(order.id, order);
      return cloneOrder(order);
    },

    async getById(id) {
      const order = orders.get(id);
      return order ? cloneOrder(order) : null;
    },

    async advance(id) {
      const order = orders.get(id);
      if (!order) return null;

      const next = NEXT_STATUS[order.status];
      if (!next) return cloneOrder(order);

      return updateStatus(order, next);
    },

    async cancel(id) {
      const order = orders.get(id);
      if (!order) return null;

      if (!['confirmed', 'separating', 'ready'].includes(order.status)) {
        return cloneOrder(order);
      }

      return updateStatus(order, 'cancelled');
    },
  };
}
