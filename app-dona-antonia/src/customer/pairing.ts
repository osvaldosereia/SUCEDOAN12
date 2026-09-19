export interface PairingChallenge {
  challengeId: string;
  humanCode: string;
  deviceSecret: string;
  expiresAt: number;
}

export type PairingPollResult =
  | { state: 'pending' }
  | { state: 'invalid_challenge' }
  | { state: 'invalid_secret' }
  | { state: 'expired' }
  | { state: 'rate_limited' }
  | { state: 'consumed' }
  | { state: 'confirmed'; sessionToken: string };

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TEN_MINUTES_MS = 10 * 60 * 1000;

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/g, '');
}

function createHumanCode(bytes: Uint8Array): string {
  return Array.from(bytes.slice(0, 6))
    .map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length])
    .join('');
}

function sameSecret(left: string, right: string): boolean {
  const comparisonLength = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;

  for (let index = 0; index < comparisonLength; index += 1) {
    const leftCode = index < left.length ? left.charCodeAt(index) : 0;
    const rightCode = index < right.length ? right.charCodeAt(index) : 0;
    difference |= leftCode ^ rightCode;
  }

  return difference === 0;
}

function requireSyntheticSessionToken(token: string): string {
  if (!token.startsWith('TEST-SESSION-')) {
    throw new Error('pairing session token must remain synthetic in homologation');
  }
  return token;
}

export function createPairingChallenge(
  options: { now?: () => number } = {},
): PairingChallenge {
  const now = options.now ?? Date.now;
  const secretBytes = randomBytes(32);
  const codeBytes = randomBytes(6);

  return {
    challengeId: `TEST-PAIR-${crypto.randomUUID()}`,
    humanCode: createHumanCode(codeBytes),
    deviceSecret: toBase64Url(secretBytes),
    expiresAt: now() + TEN_MINUTES_MS,
  };
}

export function createPairingFixture(
  options: {
    now?: () => number;
    maxPollAttempts?: number;
    maxConfirmAttempts?: number;
    sessionTokenFactory?: () => string;
  } = {},
) {
  const now = options.now ?? Date.now;
  const maxPollAttempts = Math.max(1, options.maxPollAttempts ?? 20);
  const maxConfirmAttempts = Math.max(1, options.maxConfirmAttempts ?? 6);
  const sessionTokenFactory = options.sessionTokenFactory
    ?? (() => 'TEST-SESSION-PAIRING');

  const challenge = createPairingChallenge({ now });
  let humanConfirmed = false;
  let consumed = false;
  let pollAttempts = 0;
  let confirmAttempts = 0;

  function expired(): boolean {
    return now() > challenge.expiresAt;
  }

  return {
    challenge: { ...challenge },

    confirmHumanCode(code: string): boolean {
      if (expired() || consumed || humanConfirmed) return false;
      if (confirmAttempts >= maxConfirmAttempts) return false;

      confirmAttempts += 1;
      if (code !== challenge.humanCode) return false;
      humanConfirmed = true;
      return true;
    },

    pollPairing(
      challengeId: string,
      deviceSecret: string,
    ): PairingPollResult {
      if (challengeId !== challenge.challengeId) {
        return { state: 'invalid_challenge' };
      }
      if (expired()) return { state: 'expired' };
      if (consumed) return { state: 'consumed' };
      if (pollAttempts >= maxPollAttempts) {
        return { state: 'rate_limited' };
      }

      pollAttempts += 1;

      if (!sameSecret(deviceSecret, challenge.deviceSecret)) {
        return { state: 'invalid_secret' };
      }

      if (!humanConfirmed) return { state: 'pending' };

      const sessionToken = requireSyntheticSessionToken(sessionTokenFactory());
      consumed = true;
      return {
        state: 'confirmed',
        sessionToken,
      };
    },
  };
}
