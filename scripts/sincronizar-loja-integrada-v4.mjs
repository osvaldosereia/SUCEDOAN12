// V4: mantém toda a compatibilidade do V3, mas dá precedência à categoria real escolhida no produto.
// O catálogo vem da Loja Integrada via GitHub; Make não participa deste fluxo.
// Desde 2026-09-03, o personalizador é nativo na página do produto: qualquer bloco legado
// cf-personalizer-box/iframe é removido do payload antes de gravar na Loja Integrada.
const FIREBASE_HOST = 'cedar-chemist-310801-default-rtdb.firebaseio.com';
const LI_HOST = 'api.awsli.com.br';
const CATALOG_PATH = '/canecas/integracoes/loja_integrada/catalog_refs.json';
const originalFetch = globalThis.fetch.bind(globalThis);
const text = value => String(value ?? '').trim();
const norm = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const normUri = value => text(value).replace(/\/$/, '');
const categoryId = value => {
  const uri = typeof value === 'object' ? text(value?.resource_uri || value?.uri) : text(value);
  return text(value?.id) || uri.match(/\/categoria\/(\d+)/i)?.[1] || '';
};
const sameCategory = (a, b) => {
  const x = categoryId(a), y = categoryId(b);
  return x && y ? x === y : Boolean(normUri(typeof a === 'object' ? a?.resource_uri : a) && normUri(typeof a === 'object' ? a?.resource_uri : a) === normUri(typeof b === 'object' ? b?.resource_uri : b));
};

function stripLegacyPersonalizer(value = '') {
  return String(value || '')
    .replace(/<div[^>]*class=["'][^"']*cf-personalizer-box[^"']*["'][\s\S]*?<\/div>/gi, '')
    .replace(/<a[^>]*class=["'][^"']*cf-personalize-link[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, '')
    .replace(/<iframe[^>]*\/loja-integrada\/personalizar\/[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<a[^>]*>\s*PERSONALIZAR ESTA CANECA\s*<\/a>/gi, '')
    .replace(/(?:\r?\n\s*){3,}/g, '\n\n')
    .trim();
}

async function loadCatalog() {
  try {
    const response = await originalFetch(`https://${FIREBASE_HOST}${CATALOG_PATH}?_=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
    return response.ok ? ((await response.json()) || {}) : {};
  } catch {
    return {};
  }
}
const catalog = await loadCatalog();

function categories() {
  const list = Object.values(catalog?.categorias_lista || {}).filter(Boolean);
  if (list.length) return list.filter(item => text(item.nome) && text(item.resource_uri) && item.ativo !== false);
  return Object.entries(catalog?.categorias || {}).map(([nome, resource_uri]) => ({ nome, resource_uri, id: categoryId(resource_uri), ativo: true }));
}
function liMeta(p = {}) { return p.loja_integrada && typeof p.loja_integrada === 'object' ? p.loja_integrada : {}; }
function fallbackType(p = {}) {
  const direct = text(p.loja_integrada_categoria_tipo || liMeta(p).categoria_tipo || p.canecafacil_categoria_tipo);
  if (['padronizadas','personalizaveis','empresas'].includes(direct)) return direct;
  const personal = p.personalizavel === true || p.loja_integrada_personalizavel === true || p.canecafacil_personalizavel === true || p.personalizacao_publica === true;
  return personal ? 'personalizaveis' : 'padronizadas';
}
function resolveCategory(p = {}) {
  const list = categories();
  const meta = liMeta(p);
  const savedUri = text(p.loja_integrada_categoria_uri || meta.categoria_uri);
  const savedName = text(p.loja_integrada_categoria_nome || meta.categoria_nome);
  if (savedUri) {
    const byId = list.find(item => sameCategory(item, savedUri));
    if (byId) return { id: categoryId(byId), nome: text(byId.nome), resource_uri: text(byId.resource_uri), origem: 'produto_exato' };
  }
  if (savedName) {
    const matches = list.filter(item => norm(item.nome) === norm(savedName));
    if (matches.length === 1) return { id: categoryId(matches[0]), nome: text(matches[0].nome), resource_uri: text(matches[0].resource_uri), origem: 'produto_nome' };
  }
  const type = fallbackType(p);
  const mapping = catalog?.tipos?.[type];
  if (mapping && mapping.resolvido !== false && text(mapping.resource_uri)) {
    const current = list.find(item => sameCategory(item, mapping.resource_uri));
    const item = current || mapping;
    return { id: categoryId(item), nome: text(item.nome), resource_uri: text(item.resource_uri), origem: `fallback_${type}` };
  }
  return null;
}

const bySku = new Map();
const byKey = new Map();
function rememberProduct(key, product) {
  if (!product || typeof product !== 'object') return;
  const resolved = resolveCategory(product);
  if (!resolved?.resource_uri) return;
  const sku = text(product.codigo || product.sku);
  if (sku) bySku.set(norm(sku), resolved);
  if (key) byKey.set(key, resolved);
}
function productKeyFromPath(pathname) {
  const match = pathname.match(/^\/produtos\/([^/]+)\.json$/);
  return match ? decodeURIComponent(match[1]) : '';
}
function applyCategoryToPatch(payload, desired) {
  if (!payload || typeof payload !== 'object' || !desired?.resource_uri) return payload;
  const out = structuredClone(payload);
  out.loja_integrada_categoria_id = desired.id;
  out.loja_integrada_categoria_nome = desired.nome;
  out.loja_integrada_categoria_uri = desired.resource_uri;
  if (out.loja_integrada && typeof out.loja_integrada === 'object') {
    out.loja_integrada = {
      ...out.loja_integrada,
      categoria_id: desired.id,
      categoria_nome: desired.nome,
      categoria_uri: desired.resource_uri,
      categoria_origem: desired.origem,
    };
  }
  return out;
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  const method = String(init.method || (typeof input !== 'string' ? input.method : 'GET') || 'GET').toUpperCase();

  if (url.hostname === FIREBASE_HOST && method === 'GET') {
    const key = productKeyFromPath(url.pathname);
    if (key) {
      const response = await originalFetch(input, init);
      if (response.ok) {
        const product = await response.clone().json().catch(() => null);
        rememberProduct(key, product);
      }
      return response;
    }
  }

  if (url.hostname === FIREBASE_HOST && method === 'PATCH' && typeof init.body === 'string') {
    const key = productKeyFromPath(url.pathname);
    const desired = key ? byKey.get(key) : null;
    if (desired) {
      try {
        const patched = applyCategoryToPatch(JSON.parse(init.body), desired);
        return originalFetch(input, { ...init, body: JSON.stringify(patched) });
      } catch {}
    }
  }

  if (url.hostname === LI_HOST && method.match(/^(POST|PUT)$/) && (/^\/v1\/produto\/?$/.test(url.pathname) || /^\/v1\/produto\/\d+\/?$/.test(url.pathname)) && typeof init.body === 'string') {
    try {
      const body = JSON.parse(init.body);
      if (typeof body.descricao_completa === 'string') {
        const originalDescription = body.descricao_completa;
        body.descricao_completa = stripLegacyPersonalizer(originalDescription);
        if (body.descricao_completa !== originalDescription) {
          console.log(`LI V4 · personalizador legado removido do payload · SKU ${text(body.sku)}`);
        }
      }
      const desired = bySku.get(norm(body?.sku));
      if (desired?.resource_uri) {
        body.categorias = [desired.resource_uri];
        console.log(`LI V4 · categoria exata · SKU ${text(body.sku)} · ${desired.nome} -> ${desired.resource_uri} · ${desired.origem}`);
      }
      return originalFetch(input, { ...init, body: JSON.stringify(body) });
    } catch {}
  }

  return originalFetch(input, init);
};

console.log(`CanecaFácil LI Sync V4 · categoria específica > fallback lógico · catálogo=${categories().length} · personalizador legado bloqueado · Make não utilizado`);
await import('./sincronizar-loja-integrada-v3.mjs');
