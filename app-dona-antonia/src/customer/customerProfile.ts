import type { SecureSession } from './secureSession.ts';

export interface CustomerProfile {
  id: string;
  firstName: string;
}

export interface CustomerProfileRepository {
  getBySessionToken(token: string): Promise<CustomerProfile | null>;
}

const TEST_SESSION = /^TEST-SESSION-[A-Za-z0-9_-]{4,160}$/;
const TEST_CUSTOMER = /^TEST-CUSTOMER-[A-Za-z0-9_-]{4,160}$/;

function cloneProfile(profile: CustomerProfile): CustomerProfile {
  return { ...profile };
}

export function createCustomerProfileFixtureRepository(
  source: Array<{ sessionToken: string; profile: CustomerProfile }>,
): CustomerProfileRepository {
  const entries = source.map((entry) => ({
    sessionToken: entry.sessionToken,
    profile: cloneProfile(entry.profile),
  }));

  return {
    async getBySessionToken(token) {
      if (!TEST_SESSION.test(token)) return null;
      const entry = entries.find((item) => item.sessionToken === token);
      if (!entry || !TEST_CUSTOMER.test(entry.profile.id)) return null;
      return cloneProfile(entry.profile);
    },
  };
}

export async function loadVerifiedCustomerProfile(
  session: SecureSession,
  repository: CustomerProfileRepository,
): Promise<CustomerProfile | null> {
  const token = await session.get();
  if (!token || !TEST_SESSION.test(token)) return null;
  return repository.getBySessionToken(token);
}
