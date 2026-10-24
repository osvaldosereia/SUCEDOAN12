import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AdminOrderDetail,
  AdminOrderCommandInput,
  AdminOrderItem,
  AdminOrderPage,
  AdminOrderQuery,
  AdminOrderSummary,
  AdminOrdersRepository,
} from '../../application/admin-orders';
import { ORDER_STATES, type OrderState } from '../../core/orders';

type JsonObject = Record<string, unknown>;

function object(value: unknown, label: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`Resposta inválida ao ${label}.`);
  return value as JsonObject;
}
function text(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Campo ${field} inválido na resposta de pedidos.`);
  return value;
}
function integer(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed))
    throw new Error(`Campo ${field} inválido na resposta de pedidos.`);
  return parsed;
}
function nullableText(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  return text(value, field);
}
function state(value: unknown): OrderState {
  const parsed = text(value, 'status');
  if (!ORDER_STATES.includes(parsed as OrderState))
    throw new Error('Status inválido na resposta de pedidos.');
  return parsed as OrderState;
}
function errorMessage(error: { code?: string; message?: string } | null, action: string): void {
  if (!error) return;
  if (error.code === '42501')
    throw new Error('Seu perfil não tem permissão para consultar pedidos.');
  if (error.code === '40001')
    throw new Error('Pedido atualizado por outro operador. Atualize a tela.');
  throw new Error(`Não foi possível ${action}. Tente novamente.`);
}
function summaryFrom(value: unknown): AdminOrderSummary {
  const row = object(value, 'carregar pedido');
  return {
    id: text(row.id, 'id'),
    number: text(row.order_number, 'order_number'),
    createdAt: text(row.created_at, 'created_at'),
    customerName: text(row.customer_name, 'customer_name'),
    customerPhone: text(row.customer_phone, 'customer_phone'),
    totalCents: integer(row.total_cents, 'total_cents'),
    paymentMethod: text(row.payment_method, 'payment_method'),
    paymentStatus: text(row.payment_status, 'payment_status'),
    deliveryStatus: text(row.delivery_status, 'delivery_status'),
    fiscalStatus: text(row.fiscal_status, 'fiscal_status'),
    state: state(row.status),
    itemCount: integer(row.item_count, 'item_count'),
    version: integer(row.version, 'version'),
  };
}
function itemFrom(value: unknown): AdminOrderItem {
  const row = object(value, 'carregar item do pedido');
  const kind = text(row.kind, 'kind');
  if (kind !== 'BASKET_COMPONENT' && kind !== 'EXTRA') throw new Error('Tipo de item inválido.');
  const separation = text(row.separation, 'separation');
  if (!['PENDENTE', 'SEPARADO', 'FALTOU'].includes(separation))
    throw new Error('Separação inválida.');
  return {
    id: text(row.id, 'id'),
    lineNumber: integer(row.line_number, 'line_number'),
    kind,
    sku: text(row.sku, 'sku'),
    name: text(row.name, 'name'),
    productTypeName: text(row.product_type_name, 'product_type_name'),
    quantity: integer(row.quantity, 'quantity'),
    fulfilledQuantity: integer(row.fulfilled_quantity, 'fulfilled_quantity'),
    separation: separation as AdminOrderItem['separation'],
    unitPriceCents:
      row.unit_price_cents === null ? null : integer(row.unit_price_cents, 'unit_price_cents'),
    lineTotalCents:
      row.line_total_cents === null ? null : integer(row.line_total_cents, 'line_total_cents'),
  };
}

export function createSupabaseAdminOrdersRepository(client: SupabaseClient): AdminOrdersRepository {
  const detailFrom = (value: unknown): AdminOrderDetail => {
    const row = object(value, 'carregar detalhes do pedido');
    if (!Array.isArray(row.items)) throw new Error('Itens do pedido inválidos.');
    return {
      ...summaryFrom(row),
      address: object(row.address, 'carregar endereço do pedido'),
      assignedTo: nullableText(row.assigned_to, 'assigned_to'),
      items: row.items.map(itemFrom),
    };
  };
  return {
    async list(query: AdminOrderQuery): Promise<AdminOrderPage> {
      const page = Math.max(1, Math.trunc(query.page));
      const pageSize = Math.min(50, Math.max(1, Math.trunc(query.pageSize)));
      const { data, error } = await client.rpc('admin_list_orders', {
        p_status: query.status,
        p_search: query.search.trim() || null,
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
      });
      errorMessage(error, 'carregar os pedidos');
      const result = object(data, 'carregar pedidos');
      if (!Array.isArray(result.items)) throw new Error('Lista de pedidos inválida.');
      return {
        items: result.items.map(summaryFrom),
        total: integer(result.total, 'total'),
        page,
        pageSize,
      };
    },
    async get(id: string): Promise<AdminOrderDetail> {
      const { data, error } = await client.rpc('admin_get_order', { p_order_id: id });
      errorMessage(error, 'carregar os detalhes do pedido');
      return detailFrom(data);
    },
    async applyCommand(input: AdminOrderCommandInput): Promise<AdminOrderDetail> {
      const { data, error } = await client.rpc('admin_apply_order_command', {
        p_order_id: input.orderId,
        p_command_id: input.commandId,
        p_expected_version: input.expectedVersion,
        p_command: input.command,
      });
      errorMessage(error, 'aplicar a operação no pedido');
      return detailFrom(data);
    },
    async recordDeliveryOutcome(input) {
      const { data, error } = await client.rpc('admin_record_delivery_outcome', {
        p_order_id: input.orderId,
        p_request_id: input.requestId,
        p_status: input.status,
        p_note: input.note.trim() || null,
      });
      errorMessage(error, 'registrar o resultado da entrega');
      return detailFrom(data);
    },
  };
}
