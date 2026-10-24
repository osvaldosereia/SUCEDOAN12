import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseWhatsappUtilityRepository } from './whatsapp-utility';

const row = {
  id: '00000000-0000-4000-8000-000000000021',
  order_id: '00000000-0000-4000-8000-000000000022',
  order_number: 'DA-20261024-000001',
  provider_account: '0975',
  event_type: 'OrderReady',
  template_name: 'dona_antonia_order_ready',
  phone_snapshot: '65999999999',
  delivery_status: 'NA_FILA',
  attempts: 0,
  max_attempts: 3,
  provider_message_id: null,
  last_error_code: null,
  next_attempt_at: '2026-10-24T14:00:00Z',
  created_at: '2026-10-24T14:00:00Z',
  updated_at: '2026-10-24T14:00:00Z',
};

function repository(data: unknown, error: { code?: string; message?: string } | null = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return {
    rpc,
    repo: createSupabaseWhatsappUtilityRepository({ rpc } as unknown as SupabaseClient),
  };
}

describe('adapter de mensagens utilitárias V2', () => {
  it('lista a outbox sem expor payload ou segredo de Meta', async () => {
    const { rpc, repo } = repository({ items: [row], total: 1 });
    const page = await repo.list({
      account: '0975',
      status: 'NA_FILA',
      search: '',
      page: 1,
      pageSize: 20,
    });
    expect(rpc).toHaveBeenCalledWith('admin_list_whatsapp_utility_messages', {
      p_provider_account: '0975',
      p_delivery_status: 'NA_FILA',
      p_search: null,
      p_limit: 20,
      p_offset: 0,
    });
    expect(page.items[0]).toMatchObject({ eventType: 'OrderReady', phone: '65999999999' });
    expect(JSON.stringify(page)).not.toContain('access_token');
  });

  it('registra resultado sem permitir retry infinito', async () => {
    const { rpc, repo } = repository({ ...row, delivery_status: 'FALHA_FINAL', attempts: 3 });
    const result = await repo.recordResult({
      id: row.id,
      status: 'FALHA',
      providerMessageId: null,
      errorCode: 'RATE_LIMIT',
    });
    expect(rpc).toHaveBeenCalledWith('admin_record_whatsapp_utility_result', {
      p_message_id: row.id,
      p_delivery_status: 'FALHA',
      p_provider_message_id: null,
      p_error_code: 'RATE_LIMIT',
    });
    expect(result).toMatchObject({ deliveryStatus: 'FALHA_FINAL', attempts: 3 });
  });

  it('traduz falha de permissão', async () => {
    const { repo } = repository(null, { code: '42501' });
    await expect(
      repo.list({ account: null, status: null, search: '', page: 1, pageSize: 20 }),
    ).rejects.toThrow(/permissão/i);
  });
});
