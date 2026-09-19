const FORBIDDEN_QUERY_KEYS = new Set([
  'phone', 'telefone', 'cpf', 'address', 'endereco', 'street', 'email',
  'token', 'session', 'secret', 'auth', 'code',
]);

const PII_DIGIT_SEQUENCE = /(?:^|\D)\d{10,11}(?:\D|$)/;

function decoded(value: string): string | null {
  try { return decodeURIComponent(value); } catch { return null; }
}

export function isSafeAppUrl(value: string): boolean {
  const trimmed = value.trim();
  const isAbsolute = /^[A-Za-z][A-Za-z0-9+.-]*:/.test(trimmed);
  let url: URL;
  try { url = new URL(trimmed, 'https://app.invalid'); } catch { return false; }

  // Relative links are resolved against the inert HTTPS base. Any absolute URL
  // must itself use HTTPS; HTTP is never acceptable for app/deep links.
  if (isAbsolute && url.protocol !== 'https:') return false;
  if (!isAbsolute && url.hostname !== 'app.invalid') return false;
  if (url.username || url.password) return false;

  for (const key of url.searchParams.keys()) {
    if (FORBIDDEN_QUERY_KEYS.has(key.toLocaleLowerCase('pt-BR'))) return false;
  }

  const decodedPath = decoded(url.pathname);
  if (decodedPath === null) return false;
  const pathSegments = decodedPath.split('/').filter(Boolean);
  if (pathSegments.some((segment) => /^\d{10,11}$/.test(segment))) return false;

  for (const [, queryValue] of url.searchParams) {
    const decodedQueryValue = decoded(queryValue);
    if (decodedQueryValue === null || PII_DIGIT_SEQUENCE.test(decodedQueryValue)) return false;
  }

  const decodedHash = decoded(url.hash);
  if (decodedHash === null) return false;
  const hash = decodedHash.toLocaleLowerCase('pt-BR');
  if (PII_DIGIT_SEQUENCE.test(hash)) return false;
  for (const key of FORBIDDEN_QUERY_KEYS) {
    if (hash.includes(`${key}=`) || hash.includes(`${key}%3d`)) return false;
  }

  return true;
}

export function assertSafeAppUrl(value: string): void {
  if (!isSafeAppUrl(value)) {
    throw new Error('unsafe app URL: PII, credentials, session material or scheme rejected');
  }
}
