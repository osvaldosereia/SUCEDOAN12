export interface SecureSession {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
}

export function createMemorySecureSession(): SecureSession {
  let token: string | null = null;

  return {
    async get() {
      return token;
    },

    async set(value) {
      const normalized = value.trim();
      if (!normalized) {
        throw new Error('secure session token must be non-empty');
      }
      token = normalized;
    },

    async clear() {
      token = null;
    },
  };
}
