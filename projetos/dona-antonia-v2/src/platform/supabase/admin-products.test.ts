import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdminProductsRepository } from './admin-products';
import { ProductRevisionConflict } from '../../application/admin-products';

const row = {
  id: '00000000-0000-4000-8000-000000000001',
  sku: 'ARROZ-5KG',
  name: 'Arroz Tipo 1 5 kg',
  brand: 'Dona Antônia',
  category: 'MERCEARIA BÁSICA',
  gtin: '7891234567895',
  price_cents: 2590,
  stock_units: 12,
  active: true,
  photo_url: null,
  valid_until: null,
  revision: 4,
  updated_at: '2026-10-24T06:00:00Z',
};

function repository(data: unknown, error: { code?: string; message?: string } | null = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { rpc, repo: createSupabaseAdminProductsRepository({ rpc } as unknown as SupabaseClient) };
}

describe('adapter Supabase de produtos', () => {
  it('usa RPC paginada no servidor e mapeia a projeção', async () => {
    const { rpc, repo } = repository({ items: [row], total: 802 });
    const result = await repo.list({
      search: ' arroz ',
      category: 'MERCEARIA BÁSICA',
      status: 'inativos',
      page: 2,
      pageSize: 30,
    });
    expect(rpc).toHaveBeenCalledWith('admin_list_products', {
      p_search: 'arroz',
      p_category: 'MERCEARIA BÁSICA',
      p_status: 'inativos',
      p_limit: 30,
      p_offset: 30,
    });
    expect(result).toMatchObject({
      total: 802,
      page: 2,
      items: [{ sku: 'ARROZ-5KG', revision: 4 }],
    });
  });

  it('submete alterações versionadas e o motivo idempotente do ajuste de estoque', async () => {
    const { rpc, repo } = repository(row);
    await repo.save({
      id: row.id,
      expectedRevision: 4,
      patch: { stockUnits: 12, active: true },
      requestId: '00000000-0000-4000-8000-000000000100',
      stockNote: 'Conferência física',
    });
    expect(rpc).toHaveBeenCalledWith('admin_save_product', {
      p_product_id: row.id,
      p_expected_revision: 4,
      p_patch: { stock_units: 12, active: true },
      p_request_id: '00000000-0000-4000-8000-000000000100',
      p_stock_note: 'Conferência física',
    });
  });

  it('converte revisão obsoleta em conflito de edição compreensível', async () => {
    const { repo } = repository(null, { code: '40001', message: 'CATALOG_CONFLICT' });
    await expect(
      repo.save({
        id: row.id,
        expectedRevision: 3,
        patch: { active: false },
        requestId: '00000000-0000-4000-8000-000000000100',
      }),
    ).rejects.toBeInstanceOf(ProductRevisionConflict);
  });

  it('loads fiscal and supplier fields through the private-profile RPC', async () => {
    const { rpc, repo } = repository({
      sku: 'ARROZ-5KG',
      unit: 'UN',
      origin_code: '0',
      ncm: '10063021',
      cest: null,
      packaging_gtin: null,
      units_per_case: 6,
      supplier_name: 'Fornecedor V2',
      supplier_code: 'FOR-1',
      purchase_cost_exact: '8.1234',
      revision: 2,
      updated_at: '2026-10-24T06:00:00Z',
    });
    const result = await repo.getPrivateProfile(row.id);
    expect(rpc).toHaveBeenCalledWith('admin_get_product_private_profile', {
      p_product_id: row.id,
    });
    expect(result).toMatchObject({
      sku: 'ARROZ-5KG',
      ncm: '10063021',
      purchaseCostExact: '8.1234',
    });
  });

  it('writes an exact cost string with an expected profile revision', async () => {
    const { rpc, repo } = repository({
      sku: 'ARROZ-5KG',
      unit: 'UN',
      origin_code: null,
      ncm: null,
      cest: null,
      packaging_gtin: null,
      units_per_case: null,
      supplier_name: 'Fornecedor V2',
      supplier_code: null,
      purchase_cost_exact: '8.1234',
      revision: 3,
      updated_at: '2026-10-24T06:00:00Z',
    });
    await repo.savePrivateProfile({
      productId: row.id,
      expectedRevision: 2,
      patch: {
        originCode: null,
        ncm: null,
        cest: null,
        packagingGtin: null,
        unitsPerCase: null,
        supplierName: 'Fornecedor V2',
        supplierCode: null,
        purchaseCostExact: '8.1234',
      },
      requestId: '00000000-0000-4000-8000-000000000201',
    });
    expect(rpc).toHaveBeenCalledWith('admin_save_product_private_profile', {
      p_product_id: row.id,
      p_expected_revision: 2,
      p_patch: {
        origin_code: null,
        ncm: null,
        cest: null,
        packaging_gtin: null,
        units_per_case: null,
        supplier_name: 'Fornecedor V2',
        supplier_code: null,
        purchase_cost_exact: '8.1234',
      },
      p_request_id: '00000000-0000-4000-8000-000000000201',
    });
  });

  it('returns an explicit permission error for a private-profile request', async () => {
    const { repo } = repository(null, { code: '42501', message: 'Acesso negado' });
    await expect(repo.getPrivateProfile(row.id)).rejects.toThrow(/somente administradores/i);
  });
});
