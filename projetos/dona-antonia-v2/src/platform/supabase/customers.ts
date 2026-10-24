import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CustomerAddress,
  CustomerDetail,
  CustomerOrderSummary,
  CustomerPage,
  CustomerQuery,
  CustomerRepository,
  CustomerSummary,
  OperationalReport,
} from '../../application/customers';

type JsonObject = Record<string, unknown>;

function object(value: unknown, label: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`Resposta inválida ao ${label}.`);
  return value as JsonObject;
}
function text(value: unknown, field: string): string {
  if (typeof value !== 'string')
    throw new Error(`Campo ${field} inválido na resposta de clientes.`);
  return value;
}
function nullableText(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  return text(value, field);
}
function integer(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Campo ${field} inválido na resposta.`);
  return parsed;
}
function errorMessage(error: { code?: string; message?: string } | null, action: string): void {
  if (!error) return;
  if (error.code === '42501')
    throw new Error('Seu perfil não tem permissão para consultar clientes.');
  throw new Error(`Não foi possível ${action}. Tente novamente.`);
}
function address(value: unknown): CustomerAddress {
  const row = object(value, 'carregar endereço');
  return {
    id: text(row.id, 'id'),
    label: text(row.label, 'label'),
    recipientName: text(row.recipientName, 'recipientName'),
    postalCode: text(row.postalCode, 'postalCode'),
    street: text(row.street, 'street'),
    streetNumber: text(row.streetNumber, 'streetNumber'),
    complement: nullableText(row.complement, 'complement'),
    neighborhood: text(row.neighborhood, 'neighborhood'),
    city: text(row.city, 'city'),
    stateCode: text(row.stateCode, 'stateCode'),
    referenceNote: nullableText(row.referenceNote, 'referenceNote'),
    isDefault: row.isDefault === true,
  };
}
function summary(value: unknown): CustomerSummary {
  const row = object(value, 'carregar cliente');
  return {
    id: text(row.id, 'id'),
    displayName: text(row.display_name, 'display_name'),
    phoneDigits: text(row.phone_digits, 'phone_digits'),
    orderCount: integer(row.order_count, 'order_count'),
    lastOrderAt: nullableText(row.last_order_at, 'last_order_at'),
    defaultAddress:
      row.default_address === null || row.default_address === undefined
        ? null
        : object(row.default_address, 'default_address'),
  };
}
function order(value: unknown): CustomerOrderSummary {
  const row = object(value, 'carregar histórico do cliente');
  return {
    id: text(row.id, 'id'),
    number: text(row.number, 'number'),
    createdAt: text(row.createdAt, 'createdAt'),
    status: text(row.status, 'status'),
    deliveryStatus: text(row.deliveryStatus, 'deliveryStatus'),
    totalCents: integer(row.totalCents, 'totalCents'),
    address: object(row.address, 'address'),
  };
}

export function createSupabaseCustomerRepository(client: SupabaseClient): CustomerRepository {
  return {
    async list(query: CustomerQuery): Promise<CustomerPage> {
      const page = Math.max(1, Math.trunc(query.page));
      const pageSize = Math.min(50, Math.max(1, Math.trunc(query.pageSize)));
      const { data, error } = await client.rpc('admin_list_customers', {
        p_search: query.search.trim() || null,
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
      });
      errorMessage(error, 'carregar os clientes');
      const result = object(data, 'carregar clientes');
      if (!Array.isArray(result.items)) throw new Error('Lista de clientes inválida.');
      return {
        items: result.items.map(summary),
        total: integer(result.total, 'total'),
        page,
        pageSize,
      };
    },
    async get(id: string): Promise<CustomerDetail> {
      const { data, error } = await client.rpc('admin_get_customer', { p_customer_id: id });
      errorMessage(error, 'carregar os dados do cliente');
      const row = object(data, 'carregar dados do cliente');
      if (!Array.isArray(row.addresses) || !Array.isArray(row.orders))
        throw new Error('Histórico do cliente inválido.');
      return {
        ...summary({
          ...row,
          display_name: row.displayName,
          phone_digits: row.phoneDigits,
          order_count: row.orders.length,
          last_order_at: row.orders[0] ? object(row.orders[0], 'último pedido').createdAt : null,
          default_address: row.addresses.find((item) => object(item, 'endereço').isDefault) ?? null,
        }),
        createdAt: text(row.createdAt, 'createdAt'),
        addresses: row.addresses.map(address),
        orders: row.orders.map(order),
      };
    },
    async report(from: string, to: string): Promise<OperationalReport> {
      const { data, error } = await client.rpc('admin_get_operational_report', {
        p_from: from || null,
        p_to: to || null,
      });
      errorMessage(error, 'carregar o relatório');
      const row = object(data, 'carregar relatório');
      const map = (value: unknown): Readonly<Record<string, number>> => {
        const source = object(value, 'carregar indicadores');
        return Object.fromEntries(
          Object.entries(source).map(([key, entry]) => [key, integer(entry, key)]),
        );
      };
      return {
        from: text(row.from, 'from'),
        to: text(row.to, 'to'),
        ordersTotal: integer(row.ordersTotal, 'ordersTotal'),
        salesTotalCents: integer(row.salesTotalCents, 'salesTotalCents'),
        byStatus: map(row.byStatus),
        byDeliveryStatus: map(row.byDeliveryStatus),
        byFiscalStatus: map(row.byFiscalStatus),
      };
    },
  };
}
