const CLEAN_COMBO_PATH = /^\/(?:cestas|kits)(?:\/|$)/i;
const NON_HTTP_LINK = /^(?:javascript:|mailto:|tel:)/i;

export function cleanComboNavigationTarget({ href, currentHref, currentOrigin } = {}) {
  const rawHref = String(href || '').trim();
  if (!rawHref || rawHref.startsWith('#') || NON_HTTP_LINK.test(rawHref)) return '';

  let url;
  try {
    url = new URL(rawHref, currentHref || 'https://donaantonia.com.br/');
  } catch {
    return '';
  }

  let origin = String(currentOrigin || '').trim();
  if (!origin) {
    try { origin = new URL(currentHref || url.href).origin; } catch { origin = url.origin; }
  }

  if (url.origin !== origin || url.hash || !CLEAN_COMBO_PATH.test(url.pathname)) return '';
  return `${url.pathname}${url.search}`;
}
