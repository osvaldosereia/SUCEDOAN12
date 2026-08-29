import { FIREBASE_BASE, text, safeKey } from '../shared/mug-commerce-v1.js?v=20260828-1';

export const MUG_STORE_BUILD = '20260829-admin-canecas-mug-store-v2';
const CACHE_MS = 120000;
const CATEGORY_PREFIX = 'Caneca';
let cache = null;
let cacheAt = 0;
let inFlight = null;

function scopedUrl() {
  const url = new URL(`${FIREBASE_BASE}/produtos.json`);
  url.searchParams.set('orderBy', JSON.stringify('categoria'));
  url.searchParams.set('startAt', JSON.stringify(CATEGORY_PREFIX));
  url.searchParams.set('endAt', JSON.stringify(`${CATEGORY_PREFIX}\uf8ff`));
  url.searchParams.set('_', String(Date.now()));
  return url.toString();
}

function normalize(data) {
  return Object.entries(data || {})
    .map(([__key, value]) => ({ __key, ...(value || {}) }))
    .filter(p => {
      const hay = `${p.tipo_produto || ''} ${p.categoria || ''} ${p.subcategoria || ''} ${p.nome || ''}`.toLowerCase();
      return hay.includes('caneca');
    });
}

export function invalidateMugs(reason = '') {
  cache = null;
  cacheAt = 0;
  inFlight = null;
  if (reason) console.info(`[Admin Canecas] cache de canecas invalidado: ${reason}`);
}

export async function loadMugs({ force = false } = {}) {
  if (!force && cache && Date.now() - cacheAt < CACHE_MS) return cache;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const started = performance.now();
    const response = await fetch(scopedUrl(), { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!response.ok) {
      const raw = await response.text().catch(() => '');
      throw new Error(`Firebase ${response.status}${raw ? ` · ${raw.slice(0, 140)}` : ''}`);
    }
    const rows = normalize(await response.json());
    rows.sort((a, b) => Number(b.last_update || 0) - Number(a.last_update || 0) || text(a.nome).localeCompare(text(b.nome), 'pt-BR'));
    cache = rows;
    cacheAt = Date.now();
    console.info(`[Admin Canecas] ${rows.length} caneca(s) em 1 consulta indexada (${Math.round(performance.now() - started)} ms).`);
    return rows;
  })();
  try { return await inFlight; }
  finally { inFlight = null; }
}

export async function getMug(key) {
  const response = await fetch(`${FIREBASE_BASE}/produtos/${safeKey(key)}.json?_=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Firebase ${response.status}`);
  const data = await response.json();
  return data ? { __key: key, ...data } : null;
}

export async function patchMug(key, patch) {
  const response = await fetch(`${FIREBASE_BASE}/produtos/${safeKey(key)}.json`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(patch)
  });
  if (!response.ok) throw new Error(`Firebase ${response.status}`);
  invalidateMugs('produto alterado');
  return response.json().catch(() => null);
}

export async function putMug(key, value) {
  const response = await fetch(`${FIREBASE_BASE}/produtos/${safeKey(key)}.json`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(value)
  });
  if (!response.ok) throw new Error(`Firebase ${response.status}`);
  invalidateMugs('produto substituído');
  return response.json().catch(() => null);
}

export function cachedMugs() { return cache ? [...cache] : []; }
export function storeDiagnostics() { return { build: MUG_STORE_BUILD, cached: cache?.length || 0, cacheAt, cacheMs: CACHE_MS, query: 'categoria prefix Caneca' }; }

document.documentElement.dataset.adminCanecasMugStore = MUG_STORE_BUILD;
