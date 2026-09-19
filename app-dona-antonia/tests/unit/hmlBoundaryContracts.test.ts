import { describe, expect, it } from 'vitest';
import {
  validateBootstrapContract, validateCatalogContract, validateCheckoutContract,
  validatePairingBoundary, validatePrivacyBoundary, validateTelemetryBoundary,
} from '../../src/platform/hmlBoundaryContracts.ts';

const base = { environment: 'homologation' as const, productionEnabled: false, subjectId: 'TEST-SUBJECT-001' };

describe('HML boundary contracts', () => {
  it('accepts an isolated bootstrap with zero external requests', () => {
    expect(validateBootstrapContract({ ...base, externalRequests: 0 })).toEqual({ accepted: true, blockers: [] });
  });

  it('fails bootstrap closed when an external request is declared', () => {
    expect(validateBootstrapContract({ ...base, externalRequests: 1 }).blockers).toContain('bootstrap_external_request_forbidden');
  });

  it('accepts only synthetic catalog products with valid cents', () => {
    expect(validateCatalogContract({ ...base, productIds: ['TEST-PRODUCT-1'], pricesCents: [1090] }).accepted).toBe(true);
    expect(validateCatalogContract({ ...base, productIds: ['REAL-1'], pricesCents: [100] }).accepted).toBe(false);
    expect(validateCatalogContract({ ...base, productIds: ['TEST-PRODUCT-1'], pricesCents: [-1] }).accepted).toBe(false);
  });

  it('requires a fully synthetic checkout and authoritative total agreement', () => {
    const valid = { ...base, cartId: 'TEST-CART-1', operationId: 'TEST-OP-CHECKOUT-1', idempotencyKey: 'TEST-IDEMPOTENCY-1', itemProductIds: ['TEST-PRODUCT-1'], presentedTotalCents: 1500, authoritativeTotalCents: 1500 };
    expect(validateCheckoutContract(valid).accepted).toBe(true);
    expect(validateCheckoutContract({ ...valid, authoritativeTotalCents: 1600 }).blockers).toContain('authoritative_total_mismatch');
  });

  it('closes pairing to fresh, one-use synthetic challenge/session material', () => {
    const valid = { ...base, challengeId: 'TEST-PAIR-1', sessionToken: 'TEST-SESSION-1', consumed: false, nowMs: 1000, expiresAtMs: 2000 };
    expect(validatePairingBoundary(valid).accepted).toBe(true);
    expect(validatePairingBoundary({ ...valid, consumed: true }).blockers).toContain('pairing_challenge_already_consumed');
    expect(validatePairingBoundary({ ...valid, sessionToken: 'REAL-SESSION' }).blockers).toContain('pairing_session_not_synthetic');
    expect(validatePairingBoundary({ ...valid, nowMs: 2000 }).blockers).toContain('pairing_challenge_expired');
  });

  it('forbids PII, free text, advertising IDs and external telemetry sinks', () => {
    const valid = { ...base, eventId: 'TEST-TELEMETRY-1', containsPii: false, containsFreeText: false, containsAdvertisingId: false, externalSinkCalls: 0 };
    expect(validateTelemetryBoundary(valid).accepted).toBe(true);
    expect(validateTelemetryBoundary({ ...valid, containsPii: true }).blockers).toContain('telemetry_pii_forbidden');
    expect(validateTelemetryBoundary({ ...valid, externalSinkCalls: 1 }).blockers).toContain('telemetry_external_sink_forbidden');
  });

  it('limits privacy access/delete to the same synthetic subject with no external writes', () => {
    const valid = { ...base, requestId: 'TEST-PRIVACY-1', operation: 'delete' as const, targetSubjectId: base.subjectId, externalWrites: 0 };
    expect(validatePrivacyBoundary(valid).accepted).toBe(true);
    expect(validatePrivacyBoundary({ ...valid, targetSubjectId: 'TEST-SUBJECT-OTHER' }).blockers).toContain('privacy_subject_mismatch');
    expect(validatePrivacyBoundary({ ...valid, externalWrites: 1 }).blockers).toContain('privacy_external_write_forbidden');
  });

  it('rejects production and non-synthetic subjects at every boundary', () => {
    const result = validateBootstrapContract({ environment: 'production', productionEnabled: true, subjectId: 'CUSTOMER-1', externalRequests: 0 });
    expect(result.blockers).toEqual(expect.arrayContaining(['environment_not_homologation', 'production_enabled', 'subject_not_synthetic']));
  });
});
