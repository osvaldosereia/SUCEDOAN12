import type { NetworkState } from '../platform/networkState.ts';

export type SafeRecoveryActionKind =
  | 'bootstrap'
  | 'catalog_refresh'
  | 'search'
  | 'route_restore';

export interface SafeRecoveryAction {
  kind: SafeRecoveryActionKind;
  run(): Promise<void>;
}

export interface RecoveryResult {
  retried: boolean;
  reason: 'success' | 'offline' | 'no_action' | 'action_failed';
}

const SAFE_ACTIONS = new Set<SafeRecoveryActionKind>([
  'bootstrap',
  'catalog_refresh',
  'search',
  'route_restore',
]);

export function createRecoveryController(options: {
  getNetworkState(): NetworkState;
}) {
  let lastSafeAction: SafeRecoveryAction | null = null;
  let running = false;

  return {
    rememberSafeAction(action: SafeRecoveryAction): void {
      if (!SAFE_ACTIONS.has(action.kind)) {
        throw new Error('unsafe recovery action');
      }
      lastSafeAction = action;
    },

    clear(): void {
      lastSafeAction = null;
    },

    async retryLastSafeAction(): Promise<RecoveryResult> {
      if (options.getNetworkState() !== 'online') {
        return { retried: false, reason: 'offline' };
      }

      if (!lastSafeAction || running) {
        return { retried: false, reason: 'no_action' };
      }

      const action = lastSafeAction;
      lastSafeAction = null;
      running = true;

      try {
        await action.run();
        return { retried: true, reason: 'success' };
      } catch {
        lastSafeAction = action;
        return { retried: true, reason: 'action_failed' };
      } finally {
        running = false;
      }
    },
  };
}
