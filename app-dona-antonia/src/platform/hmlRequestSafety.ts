export type HmlRequest = {
  environment: 'homologation' | 'production' | 'development';
  productionEnabled: boolean;
  subjectId: string;
  operationId: string;
  idempotencyKey: string;
  cartTotalCents: number;
  serverTotalCents: number;
  attempt: number;
  maxAttempts: number;
};

export type HmlRequestSafetyResult = {
  accepted: boolean;
  blockers: string[];
};

const TEST_SUBJECT_PREFIX = 'TEST-SUBJECT-';
const TEST_OPERATION_PREFIX = 'TEST-OP-';
const TEST_IDEMPOTENCY_PREFIX = 'TEST-IDEMPOTENCY-';

export function evaluateHmlRequestSafety(input: HmlRequest): HmlRequestSafetyResult {
  const blockers: string[] = [];

  if (input.environment !== 'homologation') blockers.push('environment_not_homologation');
  if (input.productionEnabled) blockers.push('production_enabled');
  if (!input.subjectId.startsWith(TEST_SUBJECT_PREFIX)) blockers.push('subject_not_synthetic');
  if (!input.operationId.startsWith(TEST_OPERATION_PREFIX)) blockers.push('operation_not_synthetic');
  if (!input.idempotencyKey.startsWith(TEST_IDEMPOTENCY_PREFIX)) blockers.push('idempotency_key_not_synthetic');
  if (!Number.isSafeInteger(input.cartTotalCents) || input.cartTotalCents < 0) blockers.push('invalid_cart_total');
  if (!Number.isSafeInteger(input.serverTotalCents) || input.serverTotalCents < 0) blockers.push('invalid_server_total');
  if (input.cartTotalCents !== input.serverTotalCents) blockers.push('server_total_mismatch');
  if (!Number.isSafeInteger(input.maxAttempts) || input.maxAttempts < 1 || input.maxAttempts > 5) blockers.push('invalid_rate_limit');
  if (!Number.isSafeInteger(input.attempt) || input.attempt < 1 || input.attempt > input.maxAttempts) blockers.push('rate_limit_exceeded');

  return { accepted: blockers.length === 0, blockers };
}

export class SyntheticIdempotencyLedger {
  private readonly consumed = new Set<string>();

  consume(key: string): boolean {
    if (!key.startsWith(TEST_IDEMPOTENCY_PREFIX)) return false;
    if (this.consumed.has(key)) return false;
    this.consumed.add(key);
    return true;
  }

  has(key: string): boolean {
    return this.consumed.has(key);
  }
}
