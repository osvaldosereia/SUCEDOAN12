import { describe, expect, it } from 'vitest';
import { createWhatsAppFlowToken, verifyWhatsAppFlowToken } from './flow-token';

const secret = 'v2-flow-token-signing-secret-with-32-plus-bytes';
const now = new Date('2026-10-25T12:00:00.000Z');

describe('WhatsApp Flow tokens', () => {
  it('creates an opaque account and sender-bound token with a short expiry', async () => {
    const token = await createWhatsAppFlowToken({
      account: '0975',
      recipientPhone: '+55 (65) 99982-8360',
      secret,
      now,
    });

    expect(token).toMatch(/^v1\.0975\.\d+\./);
    expect(token.length).toBeLessThanOrEqual(120);
    expect(token).not.toContain('65999828360');
    await expect(
      verifyWhatsAppFlowToken({
        token,
        secret,
        account: '0975',
        senderPhone: '5565999828360',
        now,
      }),
    ).resolves.toEqual({
      account: '0975',
      expiresAt: Math.floor(now.valueOf() / 1000) + 1800,
    });
  });

  it('rejects wrong account, sender, secret, tampering, and expired tokens', async () => {
    const token = await createWhatsAppFlowToken({
      account: '0975',
      recipientPhone: '65999828360',
      secret,
      now,
    });

    await expect(
      verifyWhatsAppFlowToken({ token, secret, account: '1018', now }),
    ).resolves.toBeNull();
    await expect(
      verifyWhatsAppFlowToken({
        token,
        secret,
        account: '0975',
        senderPhone: '65999828361',
        now,
      }),
    ).resolves.toBeNull();
    await expect(
      verifyWhatsAppFlowToken({ token, secret: 'wrong-secret-which-is-long-enough', now }),
    ).resolves.toBeNull();
    await expect(
      verifyWhatsAppFlowToken({
        token: token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A'),
        secret,
        now,
      }),
    ).resolves.toBeNull();
    await expect(
      verifyWhatsAppFlowToken({
        token,
        secret,
        now: new Date(now.valueOf() + 1_801_000),
      }),
    ).resolves.toBeNull();
  });

  it('preserves local DDD 55 when binding a sender phone', async () => {
    const token = await createWhatsAppFlowToken({
      account: '1018',
      recipientPhone: '55999877665',
      secret,
      now,
    });

    await expect(
      verifyWhatsAppFlowToken({
        token,
        secret,
        account: '1018',
        senderPhone: '55999877665',
        now,
      }),
    ).resolves.toMatchObject({ account: '1018' });
  });

  it('rejects malformed token input', async () => {
    await expect(
      verifyWhatsAppFlowToken({
        token: 'not-a-flow-token',
        secret,
        now,
      }),
    ).resolves.toBeNull();
  });
});
