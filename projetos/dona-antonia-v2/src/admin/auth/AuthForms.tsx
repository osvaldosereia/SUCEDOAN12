import { useState, type FormEvent } from 'react';

export function AuthMessage({ title, message }: { title: string; message: string }) {
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

export function LoginForm({
  notice,
  onSubmit,
  onRequestPasswordReset,
}: {
  notice: string;
  onSubmit: (email: string, password: string) => Promise<void>;
  onRequestPasswordReset: (email: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requestingReset, setRequestingReset] = useState(false);
  const [resetMode, setResetMode] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (resetMode) {
      setRequestingReset(true);
      try {
        await onRequestPasswordReset(email);
      } finally {
        setRequestingReset(false);
      }
      return;
    }
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
        <h1>{resetMode ? 'Criar ou recuperar senha' : 'Entrar no administrador'}</h1>
        <p className="da-auth-subtitle">
          {resetMode
            ? 'Enviaremos um link seguro para o e-mail da sua conta.'
            : 'Use seu acesso autorizado da Dona Antônia.'}
        </p>
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
          {!resetMode && (
            <>
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
            </>
          )}
          {notice && (
            <p className="da-auth-notice" role="alert">
              {notice}
            </p>
          )}
          <button className="da-auth-submit" type="submit" disabled={submitting || requestingReset}>
            {resetMode
              ? requestingReset
                ? 'Enviando link…'
                : 'Enviar link de recuperação'
              : submitting
                ? 'Validando acesso…'
                : 'Entrar'}
          </button>
        </form>
        <button
          className="da-auth-link"
          type="button"
          onClick={() => {
            setResetMode(!resetMode);
            setPassword('');
          }}
        >
          {resetMode ? 'Voltar para entrar' : 'Esqueci ou ainda não criei minha senha'}
        </button>
        <small className="da-auth-footnote">Acesso restrito a pessoas autorizadas.</small>
      </section>
    </main>
  );
}

export function PasswordRecoveryForm({
  notice,
  onSubmit,
}: {
  notice: string;
  onSubmit: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmation) {
      setValidationMessage('As senhas digitadas não são iguais.');
      return;
    }
    setSubmitting(true);
    setValidationMessage('');
    try {
      await onSubmit(password);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="da-auth-page">
      <section className="da-auth-card">
        <BrandMark />
        <p className="da-auth-eyebrow">ÁREA DA EQUIPE</p>
        <h1>Defina sua senha</h1>
        <p className="da-auth-subtitle">Escolha uma senha com pelo menos 8 caracteres.</p>
        <form onSubmit={submit}>
          <label htmlFor="da-auth-new-password">Nova senha</label>
          <input
            autoComplete="new-password"
            id="da-auth-new-password"
            minLength={8}
            required
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <label htmlFor="da-auth-confirm-password">Confirme a nova senha</label>
          <input
            autoComplete="new-password"
            id="da-auth-confirm-password"
            minLength={8}
            required
            type="password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
          {(notice || validationMessage) && (
            <p className="da-auth-notice" role="alert">
              {validationMessage || notice}
            </p>
          )}
          <button className="da-auth-submit" type="submit" disabled={submitting}>
            {submitting ? 'Salvando senha…' : 'Salvar senha'}
          </button>
        </form>
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
