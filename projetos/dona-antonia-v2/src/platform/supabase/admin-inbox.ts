import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AdminConversationDetail,
  AdminConversationMessage,
  AdminConversationPage,
  AdminConversationQuery,
  AdminConversationSummary,
  AdminInboxRepository,
  ConversationDeliveryStatus,
  ConversationDirection,
  ConversationMediaMetadata,
  ConversationStatus,
  QueueConversationMessageInput,
  WhatsAppAccount,
} from '../../application/admin-inbox';

type JsonObject = Record<string, unknown>;
function object(value: unknown, label: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`Resposta inválida ao ${label}.`);
  return value as JsonObject;
}
function text(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Campo ${field} inválido na resposta do Inbox.`);
  return value;
}
function nullableText(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  return text(value, field);
}
function integer(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed))
    throw new Error(`Campo ${field} inválido na resposta do Inbox.`);
  return parsed;
}
function account(value: unknown): WhatsAppAccount {
  const parsed = text(value, 'provider_account');
  if (parsed !== '0975' && parsed !== '1018') throw new Error('Conta WhatsApp inválida.');
  return parsed;
}
function status(value: unknown): ConversationStatus {
  const parsed = text(value, 'status');
  if (!['ABERTA', 'PENDENTE', 'CONCLUIDA'].includes(parsed))
    throw new Error('Status de conversa inválido.');
  return parsed as ConversationStatus;
}
function direction(value: unknown): ConversationDirection {
  const parsed = text(value, 'direction');
  if (parsed !== 'ENTRADA' && parsed !== 'SAIDA') throw new Error('Direção de mensagem inválida.');
  return parsed;
}
function deliveryStatus(value: unknown): ConversationDeliveryStatus {
  const parsed = text(value, 'delivery_status');
  if (!['RECEBIDA', 'NA_FILA', 'ENVIADA', 'ENTREGUE', 'LIDA', 'FALHA'].includes(parsed))
    throw new Error('Status de entrega inválido.');
  return parsed as ConversationDeliveryStatus;
}
function media(value: unknown): readonly ConversationMediaMetadata[] {
  if (!Array.isArray(value)) throw new Error('Anexos inválidos na resposta do Inbox.');
  return value.map((item) => {
    const row = object(item, 'anexo');
    return { ...row, type: text(row.type, 'media.type') } as ConversationMediaMetadata;
  });
}
function errorMessage(error: { code?: string; message?: string } | null, action: string): void {
  if (!error) return;
  if (error.code === '42501') throw new Error('Seu perfil não tem permissão para o atendimento.');
  if (error.code === '40001') throw new Error('Chave de idempotência reutilizada.');
  throw new Error(`Não foi possível ${action}. Tente novamente.`);
}
function summaryFrom(value: unknown): AdminConversationSummary {
  const row = object(value, 'carregar conversa');
  return {
    id: text(row.id, 'id'),
    provider: text(row.provider, 'provider') as 'WHATSAPP',
    providerAccount: account(row.provider_account),
    externalContactId: text(row.external_contact_id, 'external_contact_id'),
    phone: text(row.customer_phone_snapshot, 'customer_phone_snapshot'),
    customerId: nullableText(row.customer_id, 'customer_id'),
    orderId: nullableText(row.order_id, 'order_id'),
    status: status(row.status),
    assignedTo: nullableText(row.assigned_to, 'assigned_to'),
    lastMessageAt: nullableText(row.last_message_at, 'last_message_at'),
    updatedAt: text(row.updated_at, 'updated_at'),
    lastMessagePreview: nullableText(row.last_message_preview, 'last_message_preview'),
    messageCount: integer(row.message_count, 'message_count'),
  };
}
function messageFrom(value: unknown): AdminConversationMessage {
  const row = object(value, 'carregar mensagem');
  return {
    id: text(row.id, 'id'),
    providerAccount: account(row.provider_account),
    providerMessageId: nullableText(row.provider_message_id, 'provider_message_id'),
    direction: direction(row.direction),
    contentText: nullableText(row.content_text, 'content_text'),
    mediaMetadata: media(row.media_metadata),
    deliveryStatus: deliveryStatus(row.delivery_status),
    idempotencyKey: text(row.idempotency_key, 'idempotency_key'),
    occurredAt: text(row.occurred_at, 'occurred_at'),
  };
}

export function createSupabaseAdminInboxRepository(client: SupabaseClient): AdminInboxRepository {
  return {
    async list(query: AdminConversationQuery): Promise<AdminConversationPage> {
      const page = Math.max(1, Math.trunc(query.page));
      const pageSize = Math.min(50, Math.max(1, Math.trunc(query.pageSize)));
      const { data, error } = await client.rpc('admin_list_conversations', {
        p_provider_account: query.account,
        p_status: query.status,
        p_search: query.search.trim() || null,
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
      });
      errorMessage(error, 'carregar as conversas');
      const result = object(data, 'carregar conversas');
      if (!Array.isArray(result.items)) throw new Error('Lista de conversas inválida.');
      return {
        items: result.items.map(summaryFrom),
        total: integer(result.total, 'total'),
        page,
        pageSize,
      };
    },
    async get(id: string): Promise<AdminConversationDetail> {
      const { data, error } = await client.rpc('admin_get_conversation', { p_conversation_id: id });
      errorMessage(error, 'carregar a conversa');
      const row = object(data, 'carregar a conversa');
      if (!Array.isArray(row.messages)) throw new Error('Mensagens inválidas.');
      return {
        ...summaryFrom({ ...row, message_count: row.messages.length }),
        version: integer(row.version, 'version'),
        messages: row.messages.map(messageFrom),
      };
    },
    async queueMessage(input: QueueConversationMessageInput) {
      const { data, error } = await client.rpc('admin_queue_conversation_message', {
        p_conversation_id: input.conversationId,
        p_provider_account: input.providerAccount,
        p_idempotency_key: input.idempotencyKey,
        p_content_text: input.contentText,
        p_media_metadata: input.mediaMetadata,
      });
      errorMessage(error, 'enfileirar a mensagem');
      const row = object(data, 'enfileirar a mensagem');
      return { ...messageFrom(row), replayed: row.replayed === true };
    },
  };
}
