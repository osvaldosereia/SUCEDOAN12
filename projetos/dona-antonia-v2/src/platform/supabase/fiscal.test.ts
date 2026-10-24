import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseFiscalRepository } from './fiscal';

const row = {
  id: '00000000-0000-4000-8000-000000000031',
  order_id: '00000000-0000-4000-8000-000000000032',
  provider: 'BLING',
  provider_document_id: null,
  access_key: null,
  document_number: null,
  series: null,
  status: 'PENDENTE',
  idempotency_key: 'fiscal-document:order',
  attempts: 0,
  max_attempts: 3,
  next_attempt_at: '2026-10-24T14:00:00Z',
  last_attempt_at: null,
  error_code: null,
  error_detail: null,
  item_count: 2,
  replayed: false,
  created_at: '2026-10-24T14:00:00Z',
  updated_at: '2026-10-24T14:00:00Z',
};

function repository(data: unknown, error: { code?: string; message?: string } | null = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { rpc, repo: createSupabaseFiscalRepository({ rpc } as unknown as SupabaseClient) };
}

describe('adapter fiscal V2', () => {
  it('envia somente contexto tributário explícito ao RPC', async () => {
    const { rpc, repo } = repository(row);
    const result = await repo.request('order-1', 'request-1', {
      destinationUf: 'MT',
      cfop: '5102',
      taxSituationCode: '102',
      taxRegime: 'SIMPLES_NACIONAL',
    });
    expect(rpc).toHaveBeenCalledWith('admin_request_fiscal_document', {
      p_order_id: 'order-1',
      p_request_id: 'request-1',
      p_fiscal_context: {
        destination_uf: 'MT',
        cfop: '5102',
        tax_situation_code: '102',
        tax_regime: 'SIMPLES_NACIONAL',
      },
    });
    expect(result.itemCount).toBe(2);
    expect(JSON.stringify(result)).not.toContain('access_token');
  });

  it('reconcilia erro sem fabricar documento emitido', async () => {
    const { rpc, repo } = repository({
      ...row,
      status: 'ERRO',
      attempts: 1,
      error_code: 'HTTP_429',
    });
    const result = await repo.recordResult({
      documentId: row.id,
      status: 'ERRO',
      providerDocumentId: null,
      documentNumber: null,
      series: null,
      accessKey: null,
      errorCode: 'HTTP_429',
      errorDetail: 'Limite de API',
      responseSummary: { httpStatus: 429 },
    });
    expect(rpc).toHaveBeenCalledWith(
      'admin_record_fiscal_result',
      expect.objectContaining({
        p_document_id: row.id,
        p_status: 'ERRO',
        p_error_code: 'HTTP_429',
      }),
    );
    expect(result.status).toBe('ERRO');
    expect(result.attempts).toBe(1);
  });
});
