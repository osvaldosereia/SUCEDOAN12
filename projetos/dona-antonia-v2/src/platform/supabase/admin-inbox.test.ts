import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdminInboxRepository } from './admin-inbox';

const conversation = {
  id: '00000000-0000-4000-8000-000000000011',
  provider: 'WHATSAPP',
  provider_account: '0975',
  external_contact_id: 'contact-1',
  customer_phone_snapshot: '65999999999',
  customer_id: null,
  order_id: null,
  status: 'ABERTA',
  assigned_to: null,
  last_message_at: '2026-10-24T10:00:00Z',
  updated_at: '2026-10-24T10:00:00Z',
  last_message_preview: 'Olá',
  message_count: 1,
};
const message = {
  id: '00000000-0000-4000-8000-000000000012',
  provider_account: '0975',
  provider_message_id: 'provider-1',
  direction: 'ENTRADA',
  content_text: 'Olá',
  media_metadata: [],
  delivery_status: 'RECEBIDA',
  idempotency_key: 'provider:1',
  occurred_at: '2026-10-24T10:00:00Z',
};
const queuedMessage = {
  id: '00000000-0000-4000-8000-000000000013',
  conversation_id: conversation.id,
  provider_account: '0975',
  provider_message_id: null,
  direction: 'SAIDA',
  content_text: 'Resposta',
  media_metadata: [],
  delivery_status: 'NA_FILA',
  idempotency_key: 'client:1',
  occurred_at: '2026-10-24T10:01:00Z',
  replayed: false,
};

function repository(data: unknown, error: { code?: string; message?: string } | null = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { rpc, repo: createSupabaseAdminInboxRepository({ rpc } as unknown as SupabaseClient) };
}

describe('adapter Supabase do Inbox V2', () => {
  it('lista por conta, status e pesquisa no servidor', async () => {
    const { rpc, repo } = repository({ items: [conversation], total: 1 });
    const result = await repo.list({
      account: '1018',
      status: 'PENDENTE',
      search: ' 6599 ',
      page: 2,
      pageSize: 20,
    });
    expect(rpc).toHaveBeenCalledWith('admin_list_conversations', {
      p_provider_account: '1018',
      p_status: 'PENDENTE',
      p_search: '6599',
      p_limit: 20,
      p_offset: 20,
    });
    expect(result.items[0]).toMatchObject({ providerAccount: '0975', phone: '65999999999' });
  });

  it('carrega mensagens e fila saída com chave idempotente', async () => {
    const { rpc, repo } = repository({
      ...conversation,
      version: 1,
      messages: [message],
    });
    rpc.mockReset();
    rpc.mockResolvedValueOnce({
      data: { ...conversation, version: 1, messages: [message] },
      error: null,
    });
    rpc.mockResolvedValueOnce({ data: queuedMessage, error: null });
    const detail = await repo.get(conversation.id);
    expect(detail.messages[0]).toMatchObject({ direction: 'ENTRADA', contentText: 'Olá' });
    await repo.queueMessage({
      conversationId: conversation.id,
      providerAccount: '0975',
      idempotencyKey: 'client:1',
      contentText: 'Resposta',
      mediaMetadata: [],
    });
    expect(rpc).toHaveBeenLastCalledWith('admin_queue_conversation_message', {
      p_conversation_id: conversation.id,
      p_provider_account: '0975',
      p_idempotency_key: 'client:1',
      p_content_text: 'Resposta',
      p_media_metadata: [],
    });
  });

  it('traduz permissão e conflito de idempotência', async () => {
    const forbidden = repository(null, { code: '42501' }).repo;
    await expect(
      forbidden.list({ account: null, status: null, search: '', page: 1, pageSize: 20 }),
    ).rejects.toThrow(/permissão/i);
    const conflict = repository(null, { code: '40001' }).repo;
    await expect(
      conflict.queueMessage({
        conversationId: conversation.id,
        providerAccount: '0975',
        idempotencyKey: 'client:1',
        contentText: 'outra',
        mediaMetadata: [],
      }),
    ).rejects.toThrow(/idempotência/i);
  });
});
