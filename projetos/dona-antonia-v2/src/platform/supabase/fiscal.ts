import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  FiscalContext,
  FiscalDocument,
  FiscalDocumentRepository,
  FiscalDocumentStatus,
  RecordFiscalResultInput,
} from '../../application/fiscal';

type JsonObject = Record<string, unknown>;
function object(value: unknown, label: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`Resposta inválida ao ${label}.`);
  return value as JsonObject;
}
function text(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Campo ${field} inválido na resposta fiscal.`);
  return value;
}
function nullableText(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  return text(value, field);
}
function integer(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Campo ${field} inválido na resposta fiscal.`);
  return parsed;
}
function status(value: unknown): FiscalDocumentStatus {
  const parsed = text(value, 'status');
  if (!['PENDENTE', 'ENVIANDO', 'EMITIDA', 'ERRO', 'CANCELADA'].includes(parsed))
    throw new Error('Status fiscal inválido.');
  return parsed as FiscalDocumentStatus;
}
function provider(value: unknown): 'BLING' {
  if (value !== 'BLING') throw new Error('Provedor fiscal inválido.');
  return 'BLING';
}
function errorMessage(error: { code?: string; message?: string } | null, action: string): void {
  if (!error) return;
  if (error.code === '42501') throw new Error('Seu perfil não tem permissão para o fiscal.');
  if (error.code === '40001') throw new Error('Documento fiscal atualizado por outro processo.');
  throw new Error(`Não foi possível ${action}. Tente novamente.`);
}
function fiscalFrom(value: unknown): FiscalDocument {
  const row = object(value, 'carregar documento fiscal');
  return {
    id: text(row.id, 'id'),
    orderId: text(row.order_id, 'order_id'),
    provider: provider(row.provider),
    providerDocumentId: nullableText(row.provider_document_id, 'provider_document_id'),
    accessKey: nullableText(row.access_key, 'access_key'),
    documentNumber: nullableText(row.document_number, 'document_number'),
    series: nullableText(row.series, 'series'),
    status: status(row.status),
    idempotencyKey: text(row.idempotency_key, 'idempotency_key'),
    attempts: integer(row.attempts, 'attempts'),
    maxAttempts: integer(row.max_attempts, 'max_attempts'),
    nextAttemptAt: nullableText(row.next_attempt_at, 'next_attempt_at'),
    lastAttemptAt: nullableText(row.last_attempt_at, 'last_attempt_at'),
    errorCode: nullableText(row.error_code, 'error_code'),
    errorDetail: nullableText(row.error_detail, 'error_detail'),
    itemCount: integer(row.item_count, 'item_count'),
    replayed: row.replayed === true,
    createdAt: text(row.created_at, 'created_at'),
    updatedAt: text(row.updated_at, 'updated_at'),
  };
}

export function createSupabaseFiscalRepository(client: SupabaseClient): FiscalDocumentRepository {
  return {
    async request(
      orderId: string,
      requestId: string,
      context: FiscalContext,
    ): Promise<FiscalDocument> {
      const { data, error } = await client.rpc('admin_request_fiscal_document', {
        p_order_id: orderId,
        p_request_id: requestId,
        p_fiscal_context: {
          destination_uf: context.destinationUf,
          cfop: context.cfop,
          tax_situation_code: context.taxSituationCode,
          tax_regime: context.taxRegime,
        },
      });
      errorMessage(error, 'solicitar a emissão fiscal');
      return fiscalFrom(data);
    },
    async recordResult(input: RecordFiscalResultInput): Promise<FiscalDocument> {
      const { data, error } = await client.rpc('admin_record_fiscal_result', {
        p_document_id: input.documentId,
        p_status: input.status,
        p_provider_document_id: input.providerDocumentId,
        p_document_number: input.documentNumber,
        p_series: input.series,
        p_access_key: input.accessKey,
        p_error_code: input.errorCode,
        p_error_detail: input.errorDetail,
        p_response_summary: input.responseSummary,
      });
      errorMessage(error, 'reconciliar o resultado fiscal');
      return fiscalFrom(data);
    },
  };
}
