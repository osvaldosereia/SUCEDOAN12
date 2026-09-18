export type OrderStatus =
  | 'confirmed'
  | 'separating'
  | 'ready'
  | 'on_route'
  | 'delivered'
  | 'cancelled';

export interface OrderHistoryEntry {
  status: OrderStatus;
  at: number;
}

export interface OrderRecord {
  id: string;
  totalCents: number;
  status: OrderStatus;
  createdAt: number;
  updatedAt: number;
  history: OrderHistoryEntry[];
}

export interface CreateOrderInput {
  id: string;
  totalCents: number;
}

export interface OrderRepository {
  create(input: CreateOrderInput): Promise<OrderRecord>;
  getById(id: string): Promise<OrderRecord | null>;
  advance(id: string): Promise<OrderRecord | null>;
  cancel(id: string): Promise<OrderRecord | null>;
}
