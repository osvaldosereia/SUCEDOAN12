import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
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

  useEffect(() => {
    if (demoMode || !provider) {
      setLoading(false);
      return;
    }
    let active = true;
    let authEvents = 0;
    const unsubscribe = provider.onSessionChanged((next) => {
      authEvents += 1;
      if (active) {
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
    />
  );
}

function AuthMessage({ title, message }: { title: string; message: string }) {
  return (
    <main className="da-auth-page">
      <section className="da-auth-card" aria-live="polite">
        <BrandMark />
        <h1>{title}</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}

function LoginForm({
  notice,
  onSubmit,
}: {
  notice: string;
  onSubmit: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(email, password);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="da-auth-page">
      <section className="da-auth-card">
        <BrandMark />
        <p className="da-auth-eyebrow">ÁREA DA EQUIPE</p>
        <h1>Entrar no administrador</h1>
        <p className="da-auth-subtitle">Use seu acesso autorizado da Dona Antônia.</p>
        <form onSubmit={submit}>
          <label htmlFor="da-auth-email">E-mail</label>
          <input
            autoComplete="username"
            id="da-auth-email"
            name="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <label htmlFor="da-auth-password">Senha</label>
          <input
            autoComplete="current-password"
            id="da-auth-password"
            name="password"
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {notice && (
            <p className="da-auth-notice" role="alert">
              {notice}
            </p>
          )}
          <button className="da-auth-submit" type="submit" disabled={submitting}>
            {submitting ? 'Validando acesso…' : 'Entrar'}
          </button>
        </form>
        <small className="da-auth-footnote">Acesso restrito a pessoas autorizadas.</small>
      </section>
    </main>
  );
}

function BrandMark() {
  return (
    <div className="da-auth-mark" aria-label="Dona Antônia">
      DA
    </div>
  );
}
