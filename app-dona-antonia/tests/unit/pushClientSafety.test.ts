import { describe, expect, it } from 'vitest';
import { createHomologationPushClient } from '../../src/notifications/pushClient';

const TEST_TOKEN = 'TEST-PUSH-1234567890abcdef';

describe('homologation push safety boundary', () => {
  it('accepts only synthetic push registrations in homologation', () => {
    const client = createHomologationPushClient();
    client.registerPushToken(TEST_TOKEN, 'android');

    expect(client.getSnapshot()).toMatchObject({
      registration: { token: TEST_TOKEN, platform: 'android' },
      externalRequestCount: 0,
    });
  });

  it('fails closed in production environment without mutating registration', () => {
    const client = createHomologationPushClient({ environment: 'production' });

    expect(() => client.registerPushToken(TEST_TOKEN, 'ios'))
      .toThrow('production_environment_blocked');
    expect(client.getSnapshot().registration).toBeNull();
    expect(client.getSnapshot().externalRequestCount).toBe(0);
  });

  it('fails closed when production flag is enabled', () => {
    const client = createHomologationPushClient({ productionEnabled: true });

    expect(() => client.registerPushToken(TEST_TOKEN, 'android'))
      .toThrow('production_flag_blocked');
    expect(client.getSnapshot().registration).toBeNull();
  });

  it('rejects real-looking tokens before registration', () => {
    const client = createHomologationPushClient();

    expect(() => client.registerPushToken('real-device-token', 'android'))
      .toThrow('TEST-PUSH-*');
    expect(client.getSnapshot().registration).toBeNull();
  });
});
