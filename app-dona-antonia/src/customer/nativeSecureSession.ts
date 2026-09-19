import type { SecureSession } from './secureSession.ts';
import { evaluateHomologationExecution } from '../platform/homologationGuard.ts';

export interface NativeSecureStorageBridge {
  getValue(key: string): Promise<string | null>;
  setValue(key: string, value: string): Promise<void>;
  removeValue(key: string): Promise<void>;
}

export interface NativeSecureSessionSafetyOptions {
  environment?: 'homologation' | 'production';
  productionEnabled?: boolean;
  resourceId?: string;
}

const SESSION_STORAGE_KEY = 'dona_antonia_secure_session';
const DEFAULT_TEST_RESOURCE_ID = 'TEST-SECURE-SESSION';

function assertSecureSessionAction(
  action: 'secure_session_read' | 'secure_session_write' | 'secure_session_clear',
  options: NativeSecureSessionSafetyOptions,
): void {
  const decision = evaluateHomologationExecution({
    action,
    environment: options.environment ?? 'homologation',
    productionEnabled: options.productionEnabled ?? false,
    resourceId: options.resourceId ?? DEFAULT_TEST_RESOURCE_ID,
  });

  if (!decision.allowed) {
    throw new Error(`secure session blocked: ${decision.reason}`);
  }
}

export function createNativeSecureSession(
  bridge: NativeSecureStorageBridge,
  options: NativeSecureSessionSafetyOptions = {},
): SecureSession {
  return {
    async get() {
      assertSecureSessionAction('secure_session_read', options);
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
      if (!normalized.startsWith('TEST-SESSION-')) {
        throw new Error('secure session token must be TEST-SESSION-* in homologation');
      }
      assertSecureSessionAction('secure_session_write', options);
      await bridge.setValue(SESSION_STORAGE_KEY, normalized);
    },

    async clear() {
      assertSecureSessionAction('secure_session_clear', options);
      await bridge.removeValue(SESSION_STORAGE_KEY);
    },
  };
}
