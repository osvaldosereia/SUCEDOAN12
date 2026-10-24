import type { SupabaseClient } from '@supabase/supabase-js';
import type { CheckoutOrderRequest } from '../../core/checkout-order';

export interface PublicCheckoutQuote {
  readonly totalCents: number;
  readonly basketSubtotalCents: number;
  readonly extrasSubtotalCents: number;
  readonly itemCount: number;
}

export interface PublicOrderReceipt {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly totalCents: number;
  readonly status: 'NOVO';
  readonly replayed: boolean;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Resposta do checkout inválida.');
  return value as Record<string, unknown>;
}
function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`Resposta do checkout inválida: ${label}.`);
  return Number(value);
}
function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`Resposta do checkout inválida: ${label}.`);
  return value;
}

export function toCheckoutPayload(request: CheckoutOrderRequest): Record<string, unknown> {
  return {
    basketId: request.basketId,
    basketQuantity: request.basketQuantity,
    basketLines: request.basketLines.map(({ typeId, sku, quantity }) => ({
      typeId,
      sku,
      quantity,
    })),
    extraLines: request.extraLines.map(({ typeId, sku, quantity }) => ({ typeId, sku, quantity })),
    customer: {
      name: request.customer.name.trim(),
      phone: request.customer.phone,
      address: { ...request.customer.address, city: request.customer.address.city },
    },
    paymentMethod: request.paymentMethod,
    deliveryDate: request.deliveryDate,
    idempotencyKey: request.idempotencyKey,
  };
}

export function mapPublicQuote(value: unknown): PublicCheckoutQuote {
  const row = object(value);
  if ('privateAdjustmentCents' in row || 'unitPriceCents' in row || 'sku' in row)
    throw new Error('A cotação pública contém dados privados.');
  return {
    totalCents: integer(row.totalCents, 'total'),
    basketSubtotalCents: integer(row.basketSubtotalCents, 'subtotal da cesta'),
    extrasSubtotalCents: integer(row.extrasSubtotalCents, 'subtotal dos extras'),
    itemCount: integer(row.itemCount, 'quantidade'),
  };
}

export function mapPublicReceipt(value: unknown): PublicOrderReceipt {
  const row = object(value);
  if ('privateAdjustmentCents' in row || 'address' in row || 'customerPhone' in row)
    throw new Error('O recibo público contém dados privados.');
  const status = string(row.status, 'status');
  if (status !== 'NOVO') throw new Error('Status inicial do pedido inválido.');
  return {
    orderId: string(row.orderId, 'id'),
    orderNumber: string(row.orderNumber, 'número'),
    totalCents: integer(row.totalCents, 'total'),
    status,
    replayed: row.replayed === true,
  };
}

export interface PublicCheckoutClient {
  quote(request: CheckoutOrderRequest): Promise<PublicCheckoutQuote>;
  createOrder(request: CheckoutOrderRequest): Promise<PublicOrderReceipt>;
}

export function createSupabasePublicCheckoutClient(client: SupabaseClient): PublicCheckoutClient {
  return {
    async quote(request) {
      const { data, error } = await client.rpc('quote_storefront_order', {
        p_payload: toCheckoutPayload(request),
      });
      if (error) throw new Error(error.message || 'Não foi possível cotar o pedido.');
      return mapPublicQuote(data);
    },
    async createOrder(request) {
      const { data, error } = await client.rpc('create_storefront_order', {
        p_payload: toCheckoutPayload(request),
      });
      if (error) throw new Error(error.message || 'Não foi possível confirmar o pedido.');
      return mapPublicReceipt(data);
    },
  };
}
