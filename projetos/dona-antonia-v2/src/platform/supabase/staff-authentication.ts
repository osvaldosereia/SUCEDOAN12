import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { StaffAccessDeniedError } from '../../application/authentication-contracts';
import type {
  AuthenticationPort,
  AuthenticatedIdentity,
  SignInWithPasswordInput,
  StaffSession,
} from '../../application/authentication-contracts';
import type { StaffRole } from '../../application/authorization';

const STAFF_ROLES = new Set<StaffRole>(['ADMIN', 'PRODUCTS', 'SEPARATION', 'SUPPORT']);

function toIdentity(user: { id: string; email?: string }): AuthenticatedIdentity {
  if (!user.email) throw new Error('A conta autenticada não possui e-mail.');
  return { userId: user.id, email: user.email };
}

export function createStaffAuthentication(client: SupabaseClient): AuthenticationPort {
  const toStaffSession = async (session: Session | null): Promise<StaffSession | null> => {
    if (!session) return null;

    const { data: verified, error: userError } = await client.auth.getUser(session.access_token);
    if (userError || !verified.user)
      throw new Error('A sessão não pôde ser validada. Entre novamente.');

    const identity = toIdentity(verified.user);
    const { data: role, error: roleError } = await client.rpc('get_my_staff_role');
    if (roleError) throw new Error('Não foi possível validar o papel de acesso.');
    if (typeof role !== 'string' || !STAFF_ROLES.has(role as StaffRole)) {
      throw new StaffAccessDeniedError();
    }

    return {
      identity,
      role: role as StaffRole,
      expiresAt: (session.expires_at ?? 0) * 1000,
    };
  };

  return {
    async signInWithPassword(input: SignInWithPasswordInput) {
      const { data, error } = await client.auth.signInWithPassword({
        email: input.email.trim(),
        password: input.password,
      });
      if (error || !data.session) throw new Error('E-mail ou senha inválidos.');
      try {
        const staffSession = await toStaffSession(data.session);
        if (!staffSession) throw new StaffAccessDeniedError();
        return staffSession;
      } catch (error) {
        await client.auth.signOut();
        throw error;
      }
    },

    async requestPasswordReset(email: string, redirectTo: string) {
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error) throw error;
    },

    async updatePassword(password: string) {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
    },

    async getSession() {
      const { data, error } = await client.auth.getSession();
      if (error) throw new Error('Não foi possível recuperar a sessão.');
      try {
        return await toStaffSession(data.session);
      } catch (error) {
        await client.auth.signOut();
        throw error;
      }
    },

    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw new Error('Não foi possível encerrar a sessão.');
    },

    onSessionChanged(listener) {
      const { data } = client.auth.onAuthStateChange((event, session) => {
        // Supabase advises deferring network work out of the auth callback lock.
        setTimeout(() => {
          if (event === 'PASSWORD_RECOVERY') {
            listener(null, event);
            return;
          }
          void toStaffSession(session)
            .then((nextSession) => listener(nextSession, event))
            .catch(async () => {
              await client.auth.signOut();
              listener(null, event);
            });
        }, 0);
      });
      return () => data.subscription.unsubscribe();
    },
  };
}
