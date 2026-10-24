export type WhatsAppAccount = '0975' | '1018';
export type ConversationStatus = 'ABERTA' | 'PENDENTE' | 'CONCLUIDA';
export type ConversationDirection = 'ENTRADA' | 'SAIDA';
export type ConversationDeliveryStatus =
  'RECEBIDA' | 'NA_FILA' | 'ENVIADA' | 'ENTREGUE' | 'LIDA' | 'FALHA';

export interface ConversationMediaMetadata {
  readonly type: string;
  readonly mimeType?: string;
  readonly durationSeconds?: number;
  readonly [key: string]: unknown;
}

export interface AdminConversationSummary {
  readonly id: string;
  readonly provider: 'WHATSAPP';
  readonly providerAccount: WhatsAppAccount;
  readonly externalContactId: string;
  readonly phone: string;
  readonly customerId: string | null;
  readonly orderId: string | null;
  readonly status: ConversationStatus;
  readonly assignedTo: string | null;
  readonly lastMessageAt: string | null;
  readonly updatedAt: string;
  readonly lastMessagePreview: string | null;
  readonly messageCount: number;
}

export interface AdminConversationMessage {
  readonly id: string;
  readonly providerAccount: WhatsAppAccount;
  readonly providerMessageId: string | null;
  readonly direction: ConversationDirection;
  readonly contentText: string | null;
  readonly mediaMetadata: readonly ConversationMediaMetadata[];
  readonly deliveryStatus: ConversationDeliveryStatus;
  readonly idempotencyKey: string;
  readonly occurredAt: string;
}

export interface AdminConversationDetail extends AdminConversationSummary {
  readonly version: number;
  readonly messages: readonly AdminConversationMessage[];
}

export interface AdminConversationQuery {
  readonly account: WhatsAppAccount | null;
  readonly status: ConversationStatus | null;
  readonly search: string;
  readonly page: number;
  readonly pageSize: number;
}

export interface AdminConversationPage {
  readonly items: readonly AdminConversationSummary[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface QueueConversationMessageInput {
  readonly conversationId: string;
  readonly providerAccount: WhatsAppAccount;
  readonly idempotencyKey: string;
  readonly contentText: string | null;
  readonly mediaMetadata: readonly ConversationMediaMetadata[];
}

export interface AdminInboxRepository {
  list(query: AdminConversationQuery): Promise<AdminConversationPage>;
  get(id: string): Promise<AdminConversationDetail>;
  queueMessage(
    input: QueueConversationMessageInput,
  ): Promise<AdminConversationMessage & { replayed: boolean }>;
}

export function conversationMessageFingerprint(input: QueueConversationMessageInput): string {
  return JSON.stringify([
    input.conversationId,
    input.providerAccount,
    input.idempotencyKey,
    input.contentText,
    input.mediaMetadata,
  ]);
}
