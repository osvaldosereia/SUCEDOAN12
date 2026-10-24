import { describe, expect, it, vi } from 'vitest';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { createStaffAuthentication } from './staff-authentication';
import { StaffAccessDeniedError } from '../../application/authentication-contracts';

function fakeClient(role: string | null, userMetadata: Record<string, unknown> = {}) {
  const session = {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_at: 1_900_000_000,
  } as Session;
  const signOut = vi.fn(async () => ({ error: null }));
  const client = {
    auth: {
      signInWithPassword: vi.fn(async () => ({ data: { session, user: null }, error: null })),
      getSession: vi.fn(async () => ({ data: { session }, error: null })),
      getUser: vi.fn(async () => ({
        data: { user: { id: 'staff-1', email: 'staff@example.test', user_metadata: userMetadata } },
        error: null,
      })),
      signOut,
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    rpc: vi.fn(async () => ({ data: role, error: null })),
  } as unknown as SupabaseClient;
  return { client, signOut };
}

describe('Supabase staff authentication adapter', () => {
  it('uses the database role lookup to build the staff session', async () => {
    const { client } = fakeClient('PRODUCTS', { role: 'ADMIN' });
    const provider = createStaffAuthentication(client);
    const session = await provider.signInWithPassword({
      email: ' staff@example.test ',
      password: 'valid-password',
    });

    expect(session.role).toBe('PRODUCTS');
    expect(session.identity.email).toBe('staff@example.test');
    expect(client.rpc).toHaveBeenCalledWith('get_my_staff_role');
  });

  it('rejects user metadata as a source of access and clears the unassigned session', async () => {
    const { client, signOut } = fakeClient(null, { role: 'ADMIN' });
    const provider = createStaffAuthentication(client);

    await expect(
      provider.signInWithPassword({ email: 'staff@example.test', password: 'valid-password' }),
    ).rejects.toBeInstanceOf(StaffAccessDeniedError);
    expect(signOut).toHaveBeenCalledOnce();
  });
});
