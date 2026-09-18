export interface NotificationPreferences {
  transactionalPushEnabled: boolean;
  marketingPushOptIn: boolean;
  marketingPushOptInAt: number | null;
  marketingPushOptOutAt: number | null;
}

export function createPreferencesStore(
  options: { now?: () => number } = {},
) {
  const now = options.now ?? Date.now;
  let state: NotificationPreferences = {
    transactionalPushEnabled: true,
    marketingPushOptIn: false,
    marketingPushOptInAt: null,
    marketingPushOptOutAt: null,
  };

  return {
    getSnapshot(): NotificationPreferences {
      return { ...state };
    },

    setTransactional(enabled: boolean): void {
      state = {
        ...state,
        transactionalPushEnabled: enabled,
      };
    },

    setMarketing(enabled: boolean): void {
      const at = now();
      state = {
        ...state,
        marketingPushOptIn: enabled,
        marketingPushOptInAt: enabled
          ? state.marketingPushOptInAt ?? at
          : state.marketingPushOptInAt,
        marketingPushOptOutAt: enabled ? null : at,
      };
    },
  };
}
