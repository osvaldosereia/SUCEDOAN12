import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseCustomerRepository } from './customers';

function repository(data: unknown, error: { code?: string; message?: string } | null = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { rpc, repo: createSupabaseCustomerRepository({ rpc } as unknown as SupabaseClient) };
}

describe('adapter Supabase de clientes e relatórios', () => {
  it('lista clientes sem trazer endereço completo na linha resumida', async () => {
    const { rpc, repo } = repository({
      items: [
        {
          id: 'customer-1',
          display_name: 'Cliente V2',
          phone_digits: '65999999999',
          order_count: 2,
          last_order_at: '2026-10-24T12:00:00Z',
          default_address: { city: 'Cuiabá', stateCode: 'MT' },
        },
      ],
      total: 1,
    });
    const result = await repo.list({ search: 'Cliente', page: 2, pageSize: 20 });
    expect(rpc).toHaveBeenCalledWith('admin_list_customers', {
      p_search: 'Cliente',
      p_limit: 20,
      p_offset: 20,
    });
    expect(result.items[0]).toMatchObject({ displayName: 'Cliente V2', orderCount: 2 });
  });

  it('mapeia histórico e relatório operacional', async () => {
    const { repo } = repository({
      id: 'customer-1',
      displayName: 'Cliente V2',
      phoneDigits: '65999999999',
      createdAt: '2026-10-20T12:00:00Z',
      addresses: [
        {
          id: 'address-1',
          label: 'Principal',
          recipientName: 'Cliente V2',
          postalCode: '78000000',
          street: 'Rua Teste',
          streetNumber: '10',
          complement: null,
          neighborhood: 'Centro',
          city: 'Cuiabá',
          stateCode: 'MT',
          referenceNote: null,
          isDefault: true,
        },
      ],
      orders: [
        {
          id: 'order-1',
          number: 'DA-1',
          createdAt: '2026-10-24T12:00:00Z',
          status: 'ENTREGUE',
          deliveryStatus: 'CONCLUIDA',
          totalCents: 9000,
          address: { city: 'Cuiabá' },
        },
      ],
    });
    const detail = await repo.get('customer-1');
    expect(detail.orders[0]?.deliveryStatus).toBe('CONCLUIDA');
  });

  it('traduz falha de permissão', async () => {
    const { repo } = repository(null, { code: '42501' });
    await expect(repo.report('2026-10-01', '2026-10-24')).rejects.toThrow(/permissão/i);
  });
});
