import { describe, expect, it } from 'vitest';
import { evaluateHmlRequestSafety, SyntheticIdempotencyLedger } from '../../src/platform/hmlRequestSafety';

const safe = {
  environment: 'homologation' as const,
  productionEnabled: false,
  subjectId: 'TEST-SUBJECT-001',
  operationId: 'TEST-OP-CHECKOUT-001',
  idempotencyKey: 'TEST-IDEMPOTENCY-001',
  cartTotalCents: 12990,
  serverTotalCents: 12990,
  attempt: 1,
  maxAttempts: 3,
};

describe('evaluateHmlRequestSafety', () => {
  it('aceita somente request HML sintético com total server-authoritative consistente', () => {
    expect(evaluateHmlRequestSafety(safe)).toEqual({ accepted: true, blockers: [] });
  });

  it.each([
    [{ ...safe, environment: 'production' as const }, 'environment_not_homologation'],
    [{ ...safe, productionEnabled: true }, 'production_enabled'],
    [{ ...safe, subjectId: 'customer-real' }, 'subject_not_synthetic'],
    [{ ...safe, operationId: 'checkout-real' }, 'operation_not_synthetic'],
    [{ ...safe, idempotencyKey: 'real-key' }, 'idempotency_key_not_synthetic'],
    [{ ...safe, cartTotalCents: 12989 }, 'server_total_mismatch'],
    [{ ...safe, serverTotalCents: -1 }, 'invalid_server_total'],
    [{ ...safe, attempt: 4 }, 'rate_limit_exceeded'],
    [{ ...safe, maxAttempts: 6 }, 'invalid_rate_limit'],
  ])('falha fechado para %s', (input, blocker) => {
    const result = evaluateHmlRequestSafety(input);
    expect(result.accepted).toBe(false);
    expect(result.blockers).toContain(blocker);
  });
});

describe('SyntheticIdempotencyLedger', () => {
  it('consome chave TEST uma única vez e rejeita replay', () => {
    const ledger = new SyntheticIdempotencyLedger();
    expect(ledger.consume('TEST-IDEMPOTENCY-ABC')).toBe(true);
    expect(ledger.has('TEST-IDEMPOTENCY-ABC')).toBe(true);
    expect(ledger.consume('TEST-IDEMPOTENCY-ABC')).toBe(false);
  });

  it('nunca registra chave não sintética', () => {
    const ledger = new SyntheticIdempotencyLedger();
    expect(ledger.consume('real-key')).toBe(false);
    expect(ledger.has('real-key')).toBe(false);
  });
});
