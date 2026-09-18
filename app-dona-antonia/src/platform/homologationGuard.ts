export type HomologationAction =
  | 'read_fixture'
  | 'write_fixture'
  | 'simulate_checkout'
  | 'simulate_push'
  | 'simulate_media'
  | 'hml_network'
  | 'production_order'
  | 'production_push'
  | 'external_executor';

export interface HomologationExecutionInput {
  action: HomologationAction;
  environment: 'homologation' | 'production';
  resourceId?: string;
  productionEnabled: boolean;
}

export interface HomologationExecutionDecision {
  allowed: boolean;
  reason:
    | 'allowed_test_only'
    | 'production_environment_blocked'
    | 'production_flag_blocked'
    | 'production_action_blocked'
    | 'test_resource_required';
}

const PRODUCTION_ACTIONS = new Set<HomologationAction>([
  'production_order',
  'production_push',
  'external_executor',
]);

const RESOURCE_ACTIONS = new Set<HomologationAction>([
  'read_fixture',
  'write_fixture',
  'simulate_checkout',
  'simulate_push',
  'simulate_media',
  'hml_network',
]);

/**
 * Final local safety boundary for the isolated app.
 *
 * This guard is deliberately stricter than feature flags: homologation only,
 * TEST-* resources only, and no production/external action under any input.
 * It performs no I/O and cannot enable production.
 */
export function evaluateHomologationExecution(
  input: HomologationExecutionInput,
): HomologationExecutionDecision {
  if (input.environment !== 'homologation') {
    return { allowed: false, reason: 'production_environment_blocked' };
  }

  if (input.productionEnabled) {
    return { allowed: false, reason: 'production_flag_blocked' };
  }

  if (PRODUCTION_ACTIONS.has(input.action)) {
    return { allowed: false, reason: 'production_action_blocked' };
  }

  if (RESOURCE_ACTIONS.has(input.action)) {
    const id = input.resourceId?.trim() ?? '';
    if (!id.startsWith('TEST-')) {
      return { allowed: false, reason: 'test_resource_required' };
    }
  }

  return { allowed: true, reason: 'allowed_test_only' };
}
