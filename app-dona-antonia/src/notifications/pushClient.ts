import { evaluateHomologationExecution } from '../platform/homologationGuard.ts';

export type PushPlatform = 'android' | 'ios';
export type NotificationPreferenceKind = 'transactional' | 'marketing';

export interface PushRegistration {
  token: string;
  platform: PushPlatform;
}

export interface PushPreferences {
  transactional: boolean;
  marketing: boolean;
}

export interface PushSnapshot {
  registration: PushRegistration | null;
  preferences: PushPreferences;
  externalRequestCount: 0;
}

export interface PushClient {
  registerPushToken(token: string, platform: PushPlatform): void;
  clearPushToken(): void;
  setNotificationPreference(kind: NotificationPreferenceKind, enabled: boolean): void;
  getSnapshot(): PushSnapshot;
}

export interface HomologationPushClientOptions {
  environment?: 'homologation' | 'production';
  productionEnabled?: boolean;
}

const TEST_PUSH_TOKEN = /^TEST-PUSH-[A-Za-z0-9_-]{16,180}$/;

function cloneRegistration(registration: PushRegistration | null): PushRegistration | null {
  return registration ? { ...registration } : null;
}

export function createHomologationPushClient(
  options: HomologationPushClientOptions = {},
): PushClient {
  let registration: PushRegistration | null = null;
  let preferences: PushPreferences = {
    transactional: true,
    marketing: false,
  };

  return {
    registerPushToken(token, platform) {
      const normalized = token.trim();
      if (!TEST_PUSH_TOKEN.test(normalized)) {
        throw new Error('homologation push token must use TEST-PUSH-*');
      }

      const guard = evaluateHomologationExecution({
        action: 'simulate_push',
        environment: options.environment ?? 'homologation',
        productionEnabled: options.productionEnabled === true,
        resourceId: normalized,
      });
      if (!guard.allowed) {
        throw new Error(`homologation push safety guard blocked registration: ${guard.reason}`);
      }

      registration = { token: normalized, platform };
    },

    clearPushToken() {
      registration = null;
    },

    setNotificationPreference(kind, enabled) {
      preferences = {
        ...preferences,
        [kind]: enabled,
      };
    },

    getSnapshot() {
      return {
        registration: cloneRegistration(registration),
        preferences: { ...preferences },
        externalRequestCount: 0,
      };
    },
  };
}
