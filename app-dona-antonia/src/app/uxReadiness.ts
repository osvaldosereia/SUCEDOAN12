export type UiState = 'loading' | 'ready' | 'empty' | 'error' | 'offline';

export const UX_LIMITS = Object.freeze({
  minimumViewportPx: 320,
  minimumTouchTargetPx: 44,
  maxInitialJsBytes: 250_000,
  maxInitialCssBytes: 80_000,
  maxCriticalImageBytes: 350_000,
  maxRecoveryAttempts: 3,
});

export type RecoveryAction = 'none' | 'retry' | 'use-cache' | 'reload';

export function recoveryActionFor(state: UiState, attempts = 0): RecoveryAction {
  if (!Number.isInteger(attempts) || attempts < 0) throw new Error('invalid-recovery-attempts');
  if (state === 'offline') return 'use-cache';
  if (state === 'error') return attempts < UX_LIMITS.maxRecoveryAttempts ? 'retry' : 'reload';
  return 'none';
}

export function assertPerformanceBudget(input: {
  initialJsBytes: number;
  initialCssBytes: number;
  criticalImageBytes: number;
}): void {
  for (const [key, value] of Object.entries(input)) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`invalid-budget-value:${key}`);
  }
  if (input.initialJsBytes > UX_LIMITS.maxInitialJsBytes) throw new Error('budget-exceeded:js');
  if (input.initialCssBytes > UX_LIMITS.maxInitialCssBytes) throw new Error('budget-exceeded:css');
  if (input.criticalImageBytes > UX_LIMITS.maxCriticalImageBytes) throw new Error('budget-exceeded:image');
}

export function assertAccessibleControl(input: {
  widthPx: number;
  heightPx: number;
  label: string;
  keyboardReachable: boolean;
}): void {
  if (input.widthPx < UX_LIMITS.minimumTouchTargetPx || input.heightPx < UX_LIMITS.minimumTouchTargetPx) {
    throw new Error('touch-target-too-small');
  }
  if (!input.label.trim()) throw new Error('accessible-label-required');
  if (!input.keyboardReachable) throw new Error('keyboard-reachability-required');
}
