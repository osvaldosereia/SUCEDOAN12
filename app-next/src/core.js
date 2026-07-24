import { CONFIG } from './config.js';

export const hasDOM = typeof window !== 'undefined' && typeof document !== 'undefined';

export function storageKey(name) {
  return `${CONFIG.STORAGE.PREFIX}${name}`;
}

export function readStorage(name, fallback = null, storage = hasDOM ? window.localStorage : null) {
  if (!storage) return fallback;
  try {
    const value = storage.getItem(storageKey(name));
    return value == null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function writeStorage(name, value, storage = hasDOM ? window.localStorage : null) {
  if (!storage) return false;
  try {
    storage.setItem(storageKey(name), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeStorage(name, storage = hasDOM ? window.localStorage : null) {
  if (!storage) return;
  try { storage.removeItem(storageKey(name)); } catch {}
}

export function createEventBus() {
  const listeners = new Map();
  return {
    on(eventName, handler) {
      if (!listeners.has(eventName)) listeners.set(eventName, new Set());
      listeners.get(eventName).add(handler);
      return () => listeners.get(eventName)?.delete(handler);
    },
    emit(eventName, payload) {
      for (const handler of listeners.get(eventName) || []) {
        try { handler(payload); } catch (error) { console.error(`Event ${eventName} failed`, error); }
      }
    }
  };
}

export function createInitialState() {
  return {
    products: [],
    productMap: new Map(),
    productExactMap: new Map(),
    productCodeMap: new Map(),
    baskets: [],
    kits: [],
    coupons: [],
    banners: [],
    bannerConfig: {},
    cart: {},
    cartOrder: [],
    favorites: new Set(),
    basketCustomizations: {},
    basketDrafts: {},
    virtualFees: {},
    activeCouponCode: '',
    searchQuery: '',
    checkoutPayment: 'DINHEIRO',
    customerLookupStatus: 'unknown',
    customerLookupCpf: '',
    catalogVersion: '',
    catalogSource: '',
    catalogLoadedAt: 0,
    isReady: false,
    route: { name: 'home', params: {}, query: new URLSearchParams() }
  };
}

export function createStore(initialState = createInitialState()) {
  let state = initialState;
  const subscribers = new Set();
  return {
    getState: () => state,
    patch(patch, reason = '') {
      state = Object.assign({}, state, typeof patch === 'function' ? patch(state) : patch);
      subscribers.forEach(listener => listener(state, reason));
      return state;
    },
    mutate(mutator, reason = '') {
      mutator(state);
      subscribers.forEach(listener => listener(state, reason));
      return state;
    },
    subscribe(listener) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    }
  };
}

export function fmt(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export function parseMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function norm(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function slug(value) {
  return norm(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function words(value) {
  return norm(value).split(/[^a-z0-9]+/g).filter(Boolean);
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatName(value) {
  const raw = String(value || 'Produto').trim().replace(/\s+/g, ' ');
  if (!raw) return 'Produto';
  return raw.toLowerCase()
    .replace(/(^|\s|[-/])([a-záéíóúâêôãõç])/g, (_, sep, char) => sep + char.toUpperCase())
    .replace(/\b(kg|g|ml|l|un|und|pct|cx)\b/gi, item => item.toLowerCase());
}

export function parseDate(value, endOfDay = true) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  let match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  if (match) {
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateBR(value) {
  const date = value instanceof Date ? value : parseDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

export function codeVariants(value) {
  const raw = String(value ?? '').trim();
  const base = norm(raw);
  if (!base) return [];
  const compact = base.replace(/[^a-z0-9]/g, '');
  const noPrefixZeros = compact.replace(/^([a-z]+)0+(\d+)$/, '$1$2');
  const onlyNumber = compact.replace(/^[a-z]+0*(\d+)$/, '$1');
  const noLeadingZeros = compact.replace(/^0+(\d+)$/, '$1');
  return [...new Set([base, compact, noPrefixZeros, onlyNumber, noLeadingZeros].filter(Boolean))];
}

export function numbersOnly(value) {
  return String(value ?? '').replace(/\D/g, '');
}

export function cleanCpf(value) { return numbersOnly(value).slice(0, 11); }
export function cleanCep(value) { return numbersOnly(value).slice(0, 8); }
export function cleanPhone(value) {
  let phone = numbersOnly(value).slice(0, 13);
  if ((phone.length === 12 || phone.length === 13) && phone.startsWith('55')) phone = phone.slice(2);
  if (phone.length === 12 && phone.startsWith('0')) phone = phone.slice(1);
  if (phone.length === 10 && /^[1-9]{2}\d{8}$/.test(phone)) phone = phone.slice(0, 2) + '9' + phone.slice(2);
  return phone.slice(0, 11);
}

export function formatCpf(value) {
  const digits = cleanCpf(value);
  return digits.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export function formatCep(value) {
  return cleanCep(value).replace(/(\d{5})(\d)/, '$1-$2');
}

export function formatPhone(value) {
  const digits = cleanPhone(value);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

export function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? '').trim()); }
export function validPhone(value) { return /^[1-9]{2}9\d{8}$/.test(cleanPhone(value)); }

export function assetUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '../img/logoantonia5.png';
  if (/^(https?:|data:)/i.test(raw)) return raw;
  const clean = raw.replace(/^(\.\.\/|\.\/)+/g, '').replace(/^\/+/, '');
  if (/^(site\/img\/(produtos_3|produtos_2|produtos|kits)\/|site\/banners\/)/i.test(clean)) {
    return `${CONFIG.GITHUB_RAW_BASE}/${clean}`;
  }
  if (/^img\/(produtos_3|produtos_2|produtos|kits)\//i.test(clean)) {
    return `${CONFIG.GITHUB_RAW_BASE}/site/${clean}`;
  }
  return `../${clean}`;
}

export function createRouter(onRoute) {
  const parse = () => {
    const hash = (hasDOM ? window.location.hash : '#/') || '#/';
    const [pathPart, queryPart = ''] = hash.replace(/^#\/?/, '').split('?');
    const parts = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
    const first = parts[0] || 'home';
    const aliases = { categorias: 'categories', categoria: 'category', subcategoria: 'subcategory', marca: 'brand', ofertas: 'offers', favoritos: 'favorites', produto: 'product', cestas: 'baskets', cesta: 'basket', kits: 'kits', kit: 'kit', busca: 'search', rotina: 'routine', informacoes: 'info', 'campanha-cupom': 'campaignCoupon' };
    return { name: aliases[first] || first, params: { segments: parts.slice(1) }, query: new URLSearchParams(queryPart), hash };
  };
  const handle = () => onRoute(parse());
  return {
    start() {
      if (!hasDOM) return;
      window.addEventListener('hashchange', handle);
      handle();
    },
    current: parse,
    navigate(hash) {
      if (!hasDOM) return;
      if (window.location.hash === hash) handle();
      else window.location.hash = hash;
    }
  };
}
