import { describe, expect, it } from 'vitest';
import {
  validateBootstrapContract,
  validateCatalogContract,
  validateCheckoutContract,
} from '../../src/platform/hmlBoundaryContracts.ts';

const base = {
  environment: 'homologation' as const,
  productionEnabled: false,
  subjectId: 'TEST-SUBJECT-001',
};

describe('HML boundary contracts', () => {
  it('accepts an isolated bootstrap with zero external requests', () => {
    expect(validateBootstrapContract({ ...base, externalRequests: 0 })).toEqual({ accepted: true, blockers: [] });
  });

  it('fails bootstrap closed when an external request is declared', () => {
    expect(validateBootstrapContract({ ...base, externalRequests: 1 }).blockers).toContain('bootstrap_external_request_forbidden');
  });

  it('accepts only synthetic catalog products with valid cents', () => {
    expect(validateCatalogContract({
      ...base,
      productIds: ['TEST-PRODUCT-1', 'TEST-PRODUCT-2'],
      pricesCents: [1090, 2590],
    }).accepted).toBe(true);

    expect(validateCatalogContract({ ...base, productIds: ['REAL-1'], pricesCents: [100] }).accepted).toBe(false);
    expect(validateCatalogContract({ ...base, productIds: ['TEST-PRODUCT-1'], pricesCents: [-1] }).accepted).toBe(false);
  });

  it('requires a fully synthetic checkout and authoritative total agreement', () => {
    const valid = {
      ...base,
      cartId: 'TEST-CART-1',
      operationId: 'TEST-OP-CHECKOUT-1',
      idempotencyKey: 'TEST-IDEMPOTENCY-1',
      itemProductIds: ['TEST-PRODUCT-1'],
      presentedTotalCents: 1500,
      authoritativeTotalCents: 1500,
    };
    expect(validateCheckoutContract(valid).accepted).toBe(true);
    expect(validateCheckoutContract({ ...valid, authoritativeTotalCents: 1600 }).blockers).toContain('authoritative_total_mismatch');
    expect(validateCheckoutContract({ ...valid, itemProductIds: ['REAL-PRODUCT'] }).blockers).toContain('checkout_product_not_synthetic');
  });

  it('rejects production and non-synthetic subjects at every boundary', () => {
    const result = validateBootstrapContract({
      environment: 'production',
      productionEnabled: true,
      subjectId: 'CUSTOMER-1',
      externalRequests: 0,
    });
    expect(result.accepted).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      'environment_not_homologation',
      'production_enabled',
      'subject_not_synthetic',
    ]));
  });
});
