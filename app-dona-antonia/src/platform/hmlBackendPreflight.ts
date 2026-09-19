export type HmlBackendPreflightInput = {
  environment: 'homologation' | 'production' | 'development';
  productionEnabled: boolean;
  targetProjectId: string;
  expectedHmlProjectId: string;
  migrationsReviewed: boolean;
  rollbackDocumented: boolean;
  isolationSuiteExecuted: boolean;
  typecheckExecuted: boolean;
  edgeFunctionQuotaAvailable: boolean;
  destructiveMigrationDetected: boolean;
  realExecutorEnabled: boolean;
};

export type HmlBackendPreflightResult = {
  ready: boolean;
  blockers: string[];
};

const TEST_PROJECT_PREFIX = 'TEST-PROJECT-';

export function evaluateHmlBackendPreflight(
  input: HmlBackendPreflightInput,
): HmlBackendPreflightResult {
  const blockers: string[] = [];

  if (input.environment !== 'homologation') blockers.push('environment_not_homologation');
  if (input.productionEnabled) blockers.push('production_enabled');
  if (!input.targetProjectId.startsWith(TEST_PROJECT_PREFIX)) blockers.push('target_project_not_synthetic');
  if (input.targetProjectId !== input.expectedHmlProjectId) blockers.push('target_project_mismatch');
  if (!input.migrationsReviewed) blockers.push('migrations_not_reviewed');
  if (!input.rollbackDocumented) blockers.push('rollback_not_documented');
  if (!input.isolationSuiteExecuted) blockers.push('isolation_suite_not_executed');
  if (!input.typecheckExecuted) blockers.push('typecheck_not_executed');
  if (!input.edgeFunctionQuotaAvailable) blockers.push('edge_function_quota_unavailable');
  if (input.destructiveMigrationDetected) blockers.push('destructive_migration_detected');
  if (input.realExecutorEnabled) blockers.push('real_executor_enabled');

  return { ready: blockers.length === 0, blockers };
}
