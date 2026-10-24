import { describe, expect, it } from 'vitest';
import { conversationMessageFingerprint, type AdminConversationMessage } from './admin-inbox';

describe('contrato do Inbox V2', () => {
  it('mantém mensagens de áudio como metadados, sem expor payload binário', () => {
    const message: AdminConversationMessage = {
      id: 'message-1',
      providerAccount: '1018',
      providerMessageId: null,
      direction: 'ENTRADA',
      contentText: null,
      mediaMetadata: [{ type: 'audio', mimeType: 'audio/ogg', durationSeconds: 9 }],
      deliveryStatus: 'RECEBIDA',
      idempotencyKey: 'provider:message-1',
      occurredAt: '2026-10-24T10:00:00Z',
    };
    expect(message.mediaMetadata[0]).toMatchObject({ type: 'audio', mimeType: 'audio/ogg' });
    expect(JSON.stringify(message)).not.toContain('base64');
  });

  it('gera fingerprint estável para a mesma tentativa de fila', () => {
    expect(
      conversationMessageFingerprint({
        conversationId: 'conversation-1',
        providerAccount: '0975',
        idempotencyKey: 'client:1',
        contentText: 'Olá',
        mediaMetadata: [],
      }),
    ).toBe(
      conversationMessageFingerprint({
        conversationId: 'conversation-1',
        providerAccount: '0975',
        idempotencyKey: 'client:1',
        contentText: 'Olá',
        mediaMetadata: [],
      }),
    );
  });
});
