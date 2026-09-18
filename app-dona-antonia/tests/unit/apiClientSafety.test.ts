import { describe, expect, it, vi } from 'vitest';
import { createHmlApiClient } from '../../src/platform/apiClient';

const BASE_OPTIONS = {
  enabled: true,
  baseUrl: 'https://hml.invalid',
  publishableKey: 'TEST-PUBLISHABLE-KEY',
  jwt: 'TEST-JWT',
  clientId: 'TEST-CLIENT-SAFETY',
} as const;

describe('HML API client safety boundary', () => {
  it('fails closed before any network call in production environment', () => {
    const fetchImpl = vi.fn();

    expect(() => createHmlApiClient({
      ...BASE_OPTIONS,
      environment: 'production',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).toThrow('production_environment_blocked');

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed before any network call when production flag is enabled', () => {
    const fetchImpl = vi.fn();

    expect(() => createHmlApiClient({
      ...BASE_OPTIONS,
      productionEnabled: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).toThrow('production_flag_blocked');

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('keeps disabled client inert without requiring credentials', async () => {
    const client = createHmlApiClient({ enabled: false });
    await expect(client.bootstrap()).resolves.toEqual({
      ok: false,
      reason: 'client_disabled',
    });
  });
});
