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
  let authStateListener: ((event: string, session: Session | null) => void) | null = null;
  const client = {
    auth: {
      signInWithPassword: vi.fn(async () => ({ data: { session, user: null }, error: null })),
      resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
      updateUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      getSession: vi.fn(async () => ({ data: { session }, error: null })),
      getUser: vi.fn(async () => ({
        data: { user: { id: 'staff-1', email: 'staff@example.test', user_metadata: userMetadata } },
        error: null,
      })),
      signOut,
      onAuthStateChange: vi.fn((listener: (event: string, session: Session | null) => void) => {
        authStateListener = listener;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
    rpc: vi.fn(async () => ({ data: role, error: null })),
  } as unknown as SupabaseClient;
  return { client, signOut, emitAuthState: (event: string) => authStateListener?.(event, session) };
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

  it('sends password recovery to the admin callback and updates only the signed-in user', async () => {
    const { client } = fakeClient('ADMIN');
    const provider = createStaffAuthentication(client);

    await provider.requestPasswordReset(
      ' staff@example.test ',
      'https://admin.example.test/admin/?recovery=1',
    );
    await provider.updatePassword('new-long-password');

    expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith('staff@example.test', {
      redirectTo: 'https://admin.example.test/admin/?recovery=1',
    });
    expect(client.auth.updateUser).toHaveBeenCalledWith({ password: 'new-long-password' });
  });

  it('routes password recovery events to the reset screen without requiring an existing staff session', async () => {
    const { client, emitAuthState } = fakeClient(null);
    const provider = createStaffAuthentication(client);
    const listener = vi.fn();
    provider.onSessionChanged(listener);

    emitAuthState('PASSWORD_RECOVERY');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(listener).toHaveBeenCalledWith(null, 'PASSWORD_RECOVERY');
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
