export type OperationalFailureKind =
  | 'pairing_failure'
  | 'deep_link_rejected'
  | 'push_registration_failure';

export interface OperationalHealthSnapshot {
  pairingFailureCount: number;
  deepLinkRejectedCount: number;
  pushRegistrationFailureCount: number;
}

const ZERO: OperationalHealthSnapshot = {
  pairingFailureCount: 0,
  deepLinkRejectedCount: 0,
  pushRegistrationFailureCount: 0,
};

export function createOperationalHealthCounters() {
  let state: OperationalHealthSnapshot = { ...ZERO };

  return {
    increment(kind: OperationalFailureKind): void {
      switch (kind) {
        case 'pairing_failure':
          state = { ...state, pairingFailureCount: state.pairingFailureCount + 1 };
          break;
        case 'deep_link_rejected':
          state = { ...state, deepLinkRejectedCount: state.deepLinkRejectedCount + 1 };
          break;
        case 'push_registration_failure':
          state = { ...state, pushRegistrationFailureCount: state.pushRegistrationFailureCount + 1 };
          break;
      }
    },

    getSnapshot(): OperationalHealthSnapshot {
      return { ...state };
    },

    reset(): void {
      state = { ...ZERO };
    },
  };
}
