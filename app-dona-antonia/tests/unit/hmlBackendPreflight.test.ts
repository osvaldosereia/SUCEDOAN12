import { describe, expect, it } from 'vitest';
import { evaluateHmlBackendPreflight } from '../../src/platform/hmlBackendPreflight';

const safe = {
  environment: 'homologation' as const,
  productionEnabled: false,
  targetProjectId: 'TEST-PROJECT-HML',
  expectedHmlProjectId: 'TEST-PROJECT-HML',
  migrationsReviewed: true,
  rollbackDocumented: true,
  isolationSuiteExecuted: true,
  typecheckExecuted: true,
  edgeFunctionQuotaAvailable: true,
  destructiveMigrationDetected: false,
  realExecutorEnabled: false,
};

describe('evaluateHmlBackendPreflight', () => {
  it('permite somente baseline HML sintético completamente evidenciado', () => {
    expect(evaluateHmlBackendPreflight(safe)).toEqual({ ready: true, blockers: [] });
  });

  it.each([
    [{ ...safe, environment: 'production' as const }, 'environment_not_homologation'],
    [{ ...safe, productionEnabled: true }, 'production_enabled'],
    [{ ...safe, targetProjectId: 'real-project' }, 'target_project_not_synthetic'],
    [{ ...safe, targetProjectId: 'TEST-PROJECT-OTHER' }, 'target_project_mismatch'],
    [{ ...safe, migrationsReviewed: false }, 'migrations_not_reviewed'],
    [{ ...safe, rollbackDocumented: false }, 'rollback_not_documented'],
    [{ ...safe, isolationSuiteExecuted: false }, 'isolation_suite_not_executed'],
    [{ ...safe, typecheckExecuted: false }, 'typecheck_not_executed'],
    [{ ...safe, edgeFunctionQuotaAvailable: false }, 'edge_function_quota_unavailable'],
    [{ ...safe, destructiveMigrationDetected: true }, 'destructive_migration_detected'],
    [{ ...safe, realExecutorEnabled: true }, 'real_executor_enabled'],
  ])('bloqueia gate inseguro: %s', (input, blocker) => {
    const result = evaluateHmlBackendPreflight(input);
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain(blocker);
  });
});
