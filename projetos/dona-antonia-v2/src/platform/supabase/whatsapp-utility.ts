import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  UtilityDeliveryStatus,
  WhatsAppUtilityAccount,
  WhatsAppUtilityEvent,
  WhatsAppUtilityMessage,
  WhatsAppUtilityPage,
  WhatsAppUtilityQuery,
  WhatsAppUtilityRepository,
  RecordUtilityResultInput,
} from '../../application/whatsapp-utility';

type JsonObject = Record<string, unknown>;
function object(value: unknown, label: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`Resposta inválida ao ${label}.`);
  return value as JsonObject;
}
function text(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Campo ${field} inválido na resposta utilitária.`);
  return value;
}
function nullableText(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  return text(value, field);
}
function integer(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed))
    throw new Error(`Campo ${field} inválido na resposta utilitária.`);
  return parsed;
}
function account(value: unknown): WhatsAppUtilityAccount {
  const parsed = text(value, 'provider_account');
  if (parsed !== '0975' && parsed !== '1018') throw new Error('Conta WhatsApp inválida.');
  return parsed;
}
function event(value: unknown): WhatsAppUtilityEvent {
  const parsed = text(value, 'event_type');
  if (!['OrderReceived', 'OrderSeparating', 'OrderReady', 'OrderDelivered'].includes(parsed))
    throw new Error('Evento utilitário inválido.');
  return parsed as WhatsAppUtilityEvent;
}
function deliveryStatus(value: unknown): UtilityDeliveryStatus {
  const parsed = text(value, 'delivery_status');
  if (
    !['NA_FILA', 'ENVIANDO', 'ENVIADA', 'ENTREGUE', 'LIDA', 'FALHA', 'FALHA_FINAL'].includes(parsed)
  )
    throw new Error('Status utilitário inválido.');
  return parsed as UtilityDeliveryStatus;
}
function errorMessage(error: { code?: string; message?: string } | null, action: string): void {
  if (!error) return;
  if (error.code === '42501')
    throw new Error('Seu perfil não tem permissão para mensagens utilitárias.');
  if (error.code === '40001') throw new Error('Mensagem utilitária atualizada por outro processo.');
  throw new Error(`Não foi possível ${action}. Tente novamente.`);
}
function messageFrom(value: unknown): WhatsAppUtilityMessage {
  const row = object(value, 'carregar mensagem utilitária');
  return {
    id: text(row.id, 'id'),
    orderId: text(row.order_id, 'order_id'),
    orderNumber: text(row.order_number, 'order_number'),
    providerAccount: account(row.provider_account),
    eventType: event(row.event_type),
    templateName: text(row.template_name, 'template_name'),
    phone: text(row.phone_snapshot, 'phone_snapshot'),
    deliveryStatus: deliveryStatus(row.delivery_status),
    attempts: integer(row.attempts, 'attempts'),
    maxAttempts: integer(row.max_attempts, 'max_attempts'),
    providerMessageId: nullableText(row.provider_message_id, 'provider_message_id'),
    lastErrorCode: nullableText(row.last_error_code, 'last_error_code'),
    nextAttemptAt: nullableText(row.next_attempt_at, 'next_attempt_at'),
    createdAt: text(row.created_at, 'created_at'),
    updatedAt: text(row.updated_at, 'updated_at'),
  };
}

export function createSupabaseWhatsappUtilityRepository(
  client: SupabaseClient,
): WhatsAppUtilityRepository {
  return {
    async list(query: WhatsAppUtilityQuery): Promise<WhatsAppUtilityPage> {
      const page = Math.max(1, Math.trunc(query.page));
      const pageSize = Math.min(50, Math.max(1, Math.trunc(query.pageSize)));
      const { data, error } = await client.rpc('admin_list_whatsapp_utility_messages', {
        p_provider_account: query.account,
        p_delivery_status: query.status,
        p_search: query.search.trim() || null,
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
      });
      errorMessage(error, 'carregar as mensagens utilitárias');
      const result = object(data, 'carregar mensagens utilitárias');
      if (!Array.isArray(result.items)) throw new Error('Lista utilitária inválida.');
      return {
        items: result.items.map(messageFrom),
        total: integer(result.total, 'total'),
        page,
        pageSize,
      };
    },
    async recordResult(input: RecordUtilityResultInput): Promise<WhatsAppUtilityMessage> {
      const { data, error } = await client.rpc('admin_record_whatsapp_utility_result', {
        p_message_id: input.id,
        p_delivery_status: input.status,
        p_provider_message_id: input.providerMessageId,
        p_error_code: input.errorCode,
      });
      errorMessage(error, 'registrar o resultado utilitário');
      return messageFrom(data);
    },
  };
}
