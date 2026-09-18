export type SessionGuardState =
  | 'valid'
  | 'missing'
  | 'invalid'
  | 'expired'
  | 'revoked';

export interface SessionGuardInput {
  token: string | null;
  expiresAt: number | null;
  revoked: boolean;
}

export interface SessionGuardResult {
  state: SessionGuardState;
  usableToken: string | null;
}

const TEST_SESSION = /^TEST-SESSION-[A-Za-z0-9_-]{4,160}$/;

export function evaluateSessionGuard(
  input: SessionGuardInput,
  options: { now?: () => number } = {},
): SessionGuardResult {
  const now = options.now ?? Date.now;

  if (!input.token) {
    return { state: 'missing', usableToken: null };
  }

  const token = input.token.trim();
  if (!TEST_SESSION.test(token)) {
    return { state: 'invalid', usableToken: null };
  }

  if (input.revoked) {
    return { state: 'revoked', usableToken: null };
  }

  if (
    input.expiresAt === null
    || !Number.isFinite(input.expiresAt)
    || input.expiresAt <= now()
  ) {
    return { state: 'expired', usableToken: null };
  }

  return { state: 'valid', usableToken: token };
}
