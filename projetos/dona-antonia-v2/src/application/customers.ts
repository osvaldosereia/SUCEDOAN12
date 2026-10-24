import type { AdminOrderDetail } from './admin-orders';

export interface CustomerAddress {
  readonly id: string;
  readonly label: string;
  readonly recipientName: string;
  readonly postalCode: string;
  readonly street: string;
  readonly streetNumber: string;
  readonly complement: string | null;
  readonly neighborhood: string;
  readonly city: string;
  readonly stateCode: string;
  readonly referenceNote: string | null;
  readonly isDefault: boolean;
}

export interface CustomerOrderSummary {
  readonly id: string;
  readonly number: string;
  readonly createdAt: string;
  readonly status: string;
  readonly deliveryStatus: string;
  readonly totalCents: number;
  readonly address: Readonly<Record<string, unknown>>;
}

export interface CustomerSummary {
  readonly id: string;
  readonly displayName: string;
  readonly phoneDigits: string;
  readonly orderCount: number;
  readonly lastOrderAt: string | null;
  readonly defaultAddress: Readonly<Record<string, unknown>> | null;
}

export interface CustomerDetail extends CustomerSummary {
  readonly createdAt: string;
  readonly addresses: readonly CustomerAddress[];
  readonly orders: readonly CustomerOrderSummary[];
}

export interface CustomerQuery {
  readonly search: string;
  readonly page: number;
  readonly pageSize: number;
}

export interface CustomerPage {
  readonly items: readonly CustomerSummary[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface OperationalReport {
  readonly from: string;
  readonly to: string;
  readonly ordersTotal: number;
  readonly salesTotalCents: number;
  readonly byStatus: Readonly<Record<string, number>>;
  readonly byDeliveryStatus: Readonly<Record<string, number>>;
  readonly byFiscalStatus: Readonly<Record<string, number>>;
}

export interface CustomerRepository {
  list(query: CustomerQuery): Promise<CustomerPage>;
  get(id: string): Promise<CustomerDetail>;
  report(from: string, to: string): Promise<OperationalReport>;
}

export function normalizeCustomerPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  const withoutCountry = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
  const normalized = withoutCountry.replace(/^0+/, '');
  if (!/^\d{10,11}$/.test(normalized)) throw new Error('Telefone do cliente inválido.');
  return normalized;
}

export function deliveryOutcomeMessage(status: 'CONCLUIDA' | 'PROBLEMA'): string {
  return status === 'CONCLUIDA' ? 'Entrega concluída.' : 'Problema de entrega registrado.';
}

export type DeliveryOutcomeRepository = {
  recordDeliveryOutcome(input: {
    readonly orderId: string;
    readonly requestId: string;
    readonly status: 'CONCLUIDA' | 'PROBLEMA';
    readonly note: string;
  }): Promise<AdminOrderDetail>;
};
