import { describe, expect, it } from 'vitest';
import { evaluateHomologationExecution } from '../../src/platform/homologationGuard';

describe('homologation execution guard', () => {
  it('allows only TEST resources in homologation', () => {
    expect(
      evaluateHomologationExecution({
        action: 'simulate_checkout',
        environment: 'homologation',
        resourceId: 'TEST-BASKET-001',
        productionEnabled: false,
      }),
    ).toEqual({ allowed: true, reason: 'allowed_test_only' });

    expect(
      evaluateHomologationExecution({
        action: 'simulate_checkout',
        environment: 'homologation',
        resourceId: 'BASKET-001',
        productionEnabled: false,
      }),
    ).toEqual({ allowed: false, reason: 'test_resource_required' });
  });

  it('gates HML network behind a TEST client resource', () => {
    expect(
      evaluateHomologationExecution({
        action: 'hml_network',
        environment: 'homologation',
        resourceId: 'TEST-CLIENT-R22',
        productionEnabled: false,
      }),
    ).toEqual({ allowed: true, reason: 'allowed_test_only' });

    expect(
      evaluateHomologationExecution({
        action: 'hml_network',
        environment: 'homologation',
        resourceId: 'CLIENT-R22',
        productionEnabled: false,
      }),
    ).toEqual({ allowed: false, reason: 'test_resource_required' });
  });

  it('blocks production environment and production flag', () => {
    expect(
      evaluateHomologationExecution({
        action: 'read_fixture',
        environment: 'production',
        resourceId: 'TEST-PROD-001',
        productionEnabled: false,
      }).allowed,
    ).toBe(false);

    expect(
      evaluateHomologationExecution({
        action: 'read_fixture',
        environment: 'homologation',
        resourceId: 'TEST-PROD-001',
        productionEnabled: true,
      }).allowed,
    ).toBe(false);
  });

  it.each(['production_order', 'production_push', 'external_executor'] as const)(
    'blocks %s even with homologation-safe flags',
    (action) => {
      expect(
        evaluateHomologationExecution({
          action,
          environment: 'homologation',
          resourceId: 'TEST-ONLY',
          productionEnabled: false,
        }),
      ).toEqual({ allowed: false, reason: 'production_action_blocked' });
    },
  );
});
