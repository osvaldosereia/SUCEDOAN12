export type FiscalDocumentStatus = 'PENDENTE' | 'ENVIANDO' | 'EMITIDA' | 'ERRO' | 'CANCELADA';
export type FiscalTaxRegime = 'NORMAL' | 'SIMPLES_NACIONAL';

export interface FiscalContext {
  readonly destinationUf: string;
  readonly cfop: string;
  readonly taxSituationCode: string;
  readonly taxRegime: FiscalTaxRegime;
}

export interface FiscalDocument {
  readonly id: string;
  readonly orderId: string;
  readonly provider: 'BLING';
  readonly providerDocumentId: string | null;
  readonly accessKey: string | null;
  readonly documentNumber: string | null;
  readonly series: string | null;
  readonly status: FiscalDocumentStatus;
  readonly idempotencyKey: string;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly nextAttemptAt: string | null;
  readonly lastAttemptAt: string | null;
  readonly errorCode: string | null;
  readonly errorDetail: string | null;
  readonly itemCount: number;
  readonly replayed: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FiscalDocumentRepository {
  request(orderId: string, requestId: string, context: FiscalContext): Promise<FiscalDocument>;
  recordResult(input: RecordFiscalResultInput): Promise<FiscalDocument>;
}

export interface RecordFiscalResultInput {
  readonly documentId: string;
  readonly status: Extract<FiscalDocumentStatus, 'EMITIDA' | 'ERRO'>;
  readonly providerDocumentId: string | null;
  readonly documentNumber: string | null;
  readonly series: string | null;
  readonly accessKey: string | null;
  readonly errorCode: string | null;
  readonly errorDetail: string | null;
  readonly responseSummary: Readonly<Record<string, unknown>>;
}

export function validateFiscalContext(context: FiscalContext): string[] {
  const errors: string[] = [];
  if (!/^[A-Z]{2}$/.test(context.destinationUf)) errors.push('UF de destino inválida.');
  if (!/^\d{4}$/.test(context.cfop)) errors.push('CFOP inválido.');
  if (!/^\d{3}$/.test(context.taxSituationCode)) errors.push('CST/CSOSN inválido.');
  if (!['NORMAL', 'SIMPLES_NACIONAL'].includes(context.taxRegime))
    errors.push('Regime tributário inválido.');
  return errors;
}

export function fiscalRetryState(
  attempts: number,
  maxAttempts: number,
): {
  readonly attempts: number;
  readonly retryable: boolean;
} {
  const nextAttempts = Math.max(0, attempts) + 1;
  return {
    attempts: nextAttempts,
    retryable: nextAttempts < Math.max(1, maxAttempts),
  };
}
