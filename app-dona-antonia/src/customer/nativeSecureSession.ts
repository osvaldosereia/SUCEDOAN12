import type { SecureSession } from './secureSession.ts';

export interface NativeSecureStorageBridge {
  getValue(key: string): Promise<string | null>;
  setValue(key: string, value: string): Promise<void>;
  removeValue(key: string): Promise<void>;
}

const SESSION_STORAGE_KEY = 'dona_antonia_secure_session';

export function createNativeSecureSession(
  bridge: NativeSecureStorageBridge,
): SecureSession {
  return {
    async get() {
      const value = await bridge.getValue(SESSION_STORAGE_KEY);
      if (value === null) return null;
      const normalized = value.trim();
      return normalized || null;
    },

    async set(value) {
      const normalized = value.trim();
      if (!normalized) {
        throw new Error('secure session token must be non-empty');
      }
      await bridge.setValue(SESSION_STORAGE_KEY, normalized);
    },

    async clear() {
      await bridge.removeValue(SESSION_STORAGE_KEY);
    },
  };
}
