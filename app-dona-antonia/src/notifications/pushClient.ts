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

const TEST_PUSH_TOKEN = /^TEST-PUSH-[A-Za-z0-9_-]{16,180}$/;

function cloneRegistration(registration: PushRegistration | null): PushRegistration | null {
  return registration ? { ...registration } : null;
}

export function createHomologationPushClient(): PushClient {
  let registration: PushRegistration | null = null;
  let preferences: PushPreferences = {
    transactional: false,
    marketing: false,
  };

  return {
    registerPushToken(token, platform) {
      const normalized = token.trim();
      if (!TEST_PUSH_TOKEN.test(normalized)) {
        throw new Error('homologation push token must use TEST-PUSH-*');
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
