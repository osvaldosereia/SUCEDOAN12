import { norm, slug } from './core.js?v=20260727-4';

const ROOT_APP_PATH = '/';

function decodeRouteReference(value) {
  try { return decodeURIComponent(String(value || '').trim()); }
  catch { return String(value || '').trim(); }
}

function isCleanComboPath(pathname = '') {
  return /^\/(cestas|kits)(?:\/[^/]+)?\/?$/i.test(String(pathname || '').replace(/\/{2,}/g, '/'));
}

export function comboSeoPath(combo, type) {
  const kind = type === 'kit' ? 'kits' : 'cestas';
  const fallback = type === 'kit' ? 'kit-promocional' : 'cesta-basica';
  const name = slug(combo?.nome || fallback) || fallback;
  const reference = slug(combo?.codigo || combo?.id || name) || name;
  return `/${kind}/${name}-${reference}/`;
}

export function comboRouteReference(combo, type) {
  return comboSeoPath(combo, type).split('/').filter(Boolean).pop() || '';
}

function matchesCombo(combo, reference, type) {
  const decoded = decodeRouteReference(reference);
  const normalized = norm(decoded);
  const pathReference = comboRouteReference(combo, type);
  return [
    combo?.id,
    combo?.codigo,
    combo?.nome,
    pathReference,
    comboSeoPath(combo, type),
  ].some(value => {
    const text = String(value || '').trim();
    return text === decoded || norm(text) === normalized || slug(text) === slug(decoded);
  });
}

export function findBasketByReference(state, reference) {
  return (state?.baskets || []).find(item => matchesCombo(item, reference, 'basket')) || null;
}

export function findKitByReference(state, reference) {
  return (state?.kits || []).find(item => matchesCombo(item, reference, 'kit')) || null;
}

export function cleanComboRouteFromLocation(locationLike = globalThis.location) {
  if (!locationLike) return null;
  const pathname = String(locationLike.pathname || '/').replace(/\/{2,}/g, '/');
  const match = pathname.match(/^\/(cestas|kits)(?:\/([^/]+))?\/?$/i);
  if (match) {
    const collection = match[1].toLowerCase();
    const reference = decodeRouteReference(match[2] || '');
    return {
      name: reference ? (collection === 'kits' ? 'kit' : 'basket') : (collection === 'kits' ? 'kits' : 'baskets'),
      reference,
    };
  }
  const params = new URLSearchParams(String(locationLike.search || ''));
  if (params.get('cesta')) return { name: 'basket', reference: params.get('cesta') };
  if (params.get('kit')) return { name: 'kit', reference: params.get('kit') };
  return null;
}

export function rootHashTarget(href) {
  const value = String(href || '').trim();
  return value.startsWith('#/') ? `${ROOT_APP_PATH}${value}` : '';
}

export function installCleanComboNavigationGuard(documentLike = globalThis.document, locationLike = globalThis.location) {
  if (!documentLike?.addEventListener || !locationLike || !isCleanComboPath(locationLike.pathname)) return false;
  if (documentLike.documentElement?.dataset.comboNavigationGuard === 'true') return true;
  if (documentLike.documentElement) documentLike.documentElement.dataset.comboNavigationGuard = 'true';

  documentLike.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target?.closest?.('a[href]');
    if (!link || link.target || link.hasAttribute('download')) return;
    const target = rootHashTarget(link.getAttribute('href'));
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    locationLike.assign(target);
  }, true);
  return true;
}

installCleanComboNavigationGuard();
