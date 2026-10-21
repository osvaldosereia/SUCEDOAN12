import { ADMIN_AUTH_API, AUTH_VERIFY_API, SESSION_KEY, SUPABASE_PUBLISHABLE_KEY } from './config.js';

function validToken(token) {
  if (!token) return false;
  try {
    const raw = token.split('.')[1] || '';
    const base64 = raw.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - raw.length % 4) % 4);
    const payload = JSON.parse(atob(base64));
    return Number(payload.exp || 0) > Math.floor(Date.now() / 1000) + 60;
  } catch {
    return false;
  }
}

export function readSession() {
  const token = sessionStorage.getItem(SESSION_KEY) || '';
  if (validToken(token)) return token;
  sessionStorage.removeItem(SESSION_KEY);
  return '';
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export async function ensureSession() {
  const existing = readSession();
  if (existing) return existing;
  const bootstrap = await fetch(ADMIN_AUTH_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify({ pin: '000000' }),
    cache: 'no-store'
  });
  const ticket = await bootstrap.json().catch(() => ({}));
  if (!bootstrap.ok || !ticket.ok || !ticket.token_hash) throw new Error(ticket.error || 'admin_auto_auth_failed');
  const verify = await fetch(AUTH_VERIFY_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify({ token_hash: ticket.token_hash, type: ticket.verification_type || 'email' }),
    cache: 'no-store'
  });
  const session = await verify.json().catch(() => ({}));
  if (!verify.ok || !session.access_token) throw new Error(session.msg || session.error_description || 'admin_auto_session_failed');
  sessionStorage.setItem(SESSION_KEY, session.access_token);
  return session.access_token;
}
