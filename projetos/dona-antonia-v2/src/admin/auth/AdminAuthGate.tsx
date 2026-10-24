import { useEffect, useState, type ReactNode } from 'react';
import { AuthMessage, LoginForm, PasswordRecoveryForm } from './AuthForms';
import {
  StaffAccessDeniedError,
  type AuthenticationPort,
  type StaffSession,
} from '../../application/authentication-contracts';

interface Props {
  provider: AuthenticationPort | null;
  demoMode: boolean;
  children: (session: StaffSession | null, signOut: () => Promise<void>) => ReactNode;
}

export function AdminAuthGate({ provider, demoMode, children }: Props) {
  const [session, setSession] = useState<StaffSession | null>(null);
  const [loading, setLoading] = useState(!demoMode);
  const [notice, setNotice] = useState('');
  const [passwordRecovery, setPasswordRecovery] = useState(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('recovery') === '1',
  );

  useEffect(() => {
    if (demoMode || !provider) {
      setLoading(false);
      return;
    }
    let active = true;
    let authEvents = 0;
    const unsubscribe = provider.onSessionChanged((next, event) => {
      authEvents += 1;
      if (active) {
        if (event === 'PASSWORD_RECOVERY') {
          setPasswordRecovery(true);
          setSession(null);
          setNotice('');
          setLoading(false);
          return;
        }
        if (event === 'SIGNED_OUT') {
          setPasswordRecovery(false);
          setSession(null);
        }
        setSession(next);
        if (next) setNotice('');
        setLoading(false);
      }
    });
    const initialEvents = authEvents;
    void provider
      .getSession()
      .then((current) => {
        if (active && authEvents === initialEvents) setSession(current);
      })
      .catch((error: unknown) => {
        if (active) {
          setSession(null);
          setNotice(
            error instanceof StaffAccessDeniedError
              ? error.message
              : 'Não foi possível validar sua sessão. Entre novamente.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [demoMode, provider]);

  if (demoMode) return <>{children(null, async () => {})}</>;
  if (!provider) {
    return (
      <AuthMessage
        title="Login não configurado"
        message="Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY para conectar este admin ao projeto V2."
      />
    );
  }
  if (loading) return <AuthMessage title="Validando acesso" message="Aguarde um instante…" />;
  if (passwordRecovery) {
    return (
      <PasswordRecoveryForm
        notice={notice}
        onSubmit={async (password) => {
          setLoading(true);
          setNotice('');
          try {
            await provider.updatePassword(password);
            await provider.signOut();
            window.history.replaceState({}, document.title, window.location.pathname);
            setPasswordRecovery(false);
            setSession(null);
            setNotice('Senha criada. Entre com seu e-mail e a nova senha.');
          } catch {
            setNotice('Não foi possível salvar a senha. Solicite um novo link de recuperação.');
          } finally {
            setLoading(false);
          }
        }}
      />
    );
  }
  if (session) return <>{children(session, () => provider.signOut())}</>;

  return (
    <LoginForm
      notice={notice}
      onSubmit={async (email, password) => {
        setLoading(true);
        setNotice('');
        try {
          const nextSession = await provider.signInWithPassword({ email, password });
          setSession(nextSession);
        } catch (error) {
          setNotice(
            error instanceof StaffAccessDeniedError
              ? error.message
              : error instanceof Error
                ? error.message
                : 'Não foi possível entrar. Tente novamente.',
          );
        } finally {
          setLoading(false);
        }
      }}
      onRequestPasswordReset={async (email) => {
        setNotice('');
        try {
          await provider.requestPasswordReset(email, `${window.location.origin}/admin/?recovery=1`);
          setNotice('Se este e-mail estiver cadastrado, enviaremos um link para criar sua senha.');
        } catch {
          setNotice('Não foi possível solicitar o link agora. Tente novamente mais tarde.');
        }
      }}
    />
  );
}
