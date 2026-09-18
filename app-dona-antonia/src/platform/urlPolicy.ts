const FORBIDDEN_QUERY_KEYS = new Set([
  'phone',
  'telefone',
  'cpf',
  'address',
  'endereco',
  'street',
  'email',
  'token',
  'session',
  'secret',
  'auth',
  'code',
]);

const PII_DIGIT_SEQUENCE = /(?:^|\D)\d{10,11}(?:\D|$)/;

function decoded(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function isSafeAppUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value, 'https://app.invalid');
  } catch {
    return false;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (url.username || url.password) return false;

  for (const key of url.searchParams.keys()) {
    if (FORBIDDEN_QUERY_KEYS.has(key.toLocaleLowerCase('pt-BR'))) {
      return false;
    }
  }

  const pathSegments = decoded(url.pathname)
    .split('/')
    .filter(Boolean);

  if (pathSegments.some((segment) => /^\d{10,11}$/.test(segment))) {
    return false;
  }

  for (const [, queryValue] of url.searchParams) {
    if (PII_DIGIT_SEQUENCE.test(decoded(queryValue))) return false;
  }

  const hash = decoded(url.hash).toLocaleLowerCase('pt-BR');
  if (PII_DIGIT_SEQUENCE.test(hash)) return false;
  for (const key of FORBIDDEN_QUERY_KEYS) {
    if (
      hash.includes(`${key}=`)
      || hash.includes(`${key}%3d`)
    ) {
      return false;
    }
  }

  return true;
}

export function assertSafeAppUrl(value: string): void {
  if (!isSafeAppUrl(value)) {
    throw new Error('unsafe app URL: PII, credentials, session material or scheme rejected');
  }
}
