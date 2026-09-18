import type { AppRoute } from '../app/navigation.ts';
import { isSafeAppUrl } from './urlPolicy.ts';

const OPAQUE_TOKEN = /^[A-Za-z0-9_-]{16,160}$/;

export function parseAppLink(value: string): AppRoute | null {
  if (!isSafeAppUrl(value)) return null;

  let url: URL;
  try {
    url = new URL(value, 'https://app.invalid');
  } catch {
    return null;
  }

  const segments = url.pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));

  if (segments[0] !== 'app') return 'home';

  if (segments[1] === 'ofertas') return 'catalog';

  if (segments[1] === 'cestas' && segments[2]) {
    return 'basket';
  }

  if (segments[1] === 'pedido') {
    const token = segments[2] ?? '';
    return OPAQUE_TOKEN.test(token) ? 'order' : null;
  }

  return 'home';
}
