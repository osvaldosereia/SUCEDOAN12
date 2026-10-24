import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdminOrdersRepository } from './admin-orders';

const summary = {
  id: '00000000-0000-4000-8000-000000000001',
  order_number: 'DA-20261024-000001',
  created_at: '2026-10-24T08:00:00Z',
  customer_name: 'Cliente V2',
  customer_phone: '65999999999',
  total_cents: 8900,
  payment_method: 'PIX',
  payment_status: 'PENDENTE',
  delivery_status: 'AGUARDANDO',
  fiscal_status: 'PENDENTE',
  status: 'NOVO',
  version: 1,
  item_count: 3,
};

function repository(data: unknown, error: { code?: string; message?: string } | null = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { rpc, repo: createSupabaseAdminOrdersRepository({ rpc } as unknown as SupabaseClient) };
}

describe('adapter Supabase de pedidos', () => {
  it('consulta a aba paginada sem expor preço privado', async () => {
    const { rpc, repo } = repository({ items: [summary], total: 1 });
    const result = await repo.list({ status: 'NOVO', search: ' Cliente ', page: 2, pageSize: 20 });
    expect(rpc).toHaveBeenCalledWith('admin_list_orders', {
      p_status: 'NOVO',
      p_search: 'Cliente',
      p_limit: 20,
      p_offset: 20,
    });
    expect(result.items[0]).toMatchObject({ number: 'DA-20261024-000001', totalCents: 8900 });
  });

  it('mapeia detalhe e mantém componente de cesta sem preço unitário', async () => {
    const { repo } = repository({
      ...summary,
      address: { city: 'Cuiabá', stateCode: 'MT' },
      assigned_to: null,
      items: [
        {
          id: 'item-1',
          line_number: 1,
          kind: 'BASKET_COMPONENT',
          sku: 'ARROZ-5KG',
          name: 'Arroz 5 kg',
          product_type_name: 'Arroz',
          quantity: 2,
          fulfilled_quantity: 0,
          separation: 'PENDENTE',
          unit_price_cents: null,
          line_total_cents: null,
        },
      ],
    });
    const result = await repo.get(summary.id);
    expect(result.items[0]).toMatchObject({ unitPriceCents: null, lineTotalCents: null });
  });

  it('traduz falha de permissão', async () => {
    const { repo } = repository(null, { code: '42501' });
    await expect(repo.list({ status: 'NOVO', search: '', page: 1, pageSize: 20 })).rejects.toThrow(
      /permissão/i,
    );
  });

  it('aplica comando com versão esperada e mapeia o pedido atualizado', async () => {
    const { rpc, repo } = repository({
      ...summary,
      status: 'EM_SEPARACAO',
      version: 2,
      address: { city: 'Cuiabá', stateCode: 'MT' },
      assigned_to: 'operator-1',
      items: [],
    });
    const result = await repo.applyCommand({
      orderId: summary.id,
      commandId: 'command-1',
      expectedVersion: 1,
      command: { type: 'START' },
    });
    expect(rpc).toHaveBeenCalledWith('admin_apply_order_command', {
      p_order_id: summary.id,
      p_command_id: 'command-1',
      p_expected_version: 1,
      p_command: { type: 'START' },
    });
    expect(result).toMatchObject({ state: 'EM_SEPARACAO', version: 2 });
  });
});
