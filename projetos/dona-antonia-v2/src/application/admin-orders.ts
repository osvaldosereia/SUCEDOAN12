import type { OrderState } from '../core/orders';

export interface AdminOrderSummary {
  readonly id: string;
  readonly number: string;
  readonly createdAt: string;
  readonly customerName: string;
  readonly customerPhone: string;
  readonly totalCents: number;
  readonly paymentMethod: string;
  readonly paymentStatus: string;
  readonly deliveryStatus: string;
  readonly fiscalStatus: string;
  readonly state: OrderState;
  readonly itemCount: number;
}

export interface AdminOrderItem {
  readonly id: string;
  readonly lineNumber: number;
  readonly kind: 'BASKET_COMPONENT' | 'EXTRA';
  readonly sku: string;
  readonly name: string;
  readonly productTypeName: string;
  readonly quantity: number;
  readonly fulfilledQuantity: number;
  readonly separation: 'PENDENTE' | 'SEPARADO' | 'FALTOU';
  /** Basket component prices are intentionally null; only paid extras expose a price. */
  readonly unitPriceCents: number | null;
  readonly lineTotalCents: number | null;
}

export interface AdminOrderDetail extends AdminOrderSummary {
  readonly address: Readonly<Record<string, unknown>>;
  readonly assignedTo: string | null;
  readonly items: readonly AdminOrderItem[];
}

export interface AdminOrderQuery {
  readonly status: OrderState;
  readonly search: string;
  readonly page: number;
  readonly pageSize: number;
}

export interface AdminOrderPage {
  readonly items: readonly AdminOrderSummary[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface AdminOrdersRepository {
  list(query: AdminOrderQuery): Promise<AdminOrderPage>;
  get(id: string): Promise<AdminOrderDetail>;
}
