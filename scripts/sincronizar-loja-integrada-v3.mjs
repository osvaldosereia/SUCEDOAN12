// Compatibilidade V3: mantém o worker robusto existente, mas converte a mídia em tempo de execução
// para o padrão oficial de 3 imagens e injeta as categorias reais descobertas pelo GitHub.
const FIREBASE_HOST = 'cedar-chemist-310801-default-rtdb.firebaseio.com';
const LI_HOST = 'api.awsli.com.br';
const CATALOG_PATH = '/canecas/integracoes/loja_integrada/catalog_refs.json';
const nativeFetch = globalThis.fetch.bind(globalThis);
const posted = new Set();

const LEGACY_CATEGORY_NAMES = Object.freeze({
  padronizadas: 'Canecas Padronizadas',
  personalizaveis: 'Canecas Personalizáveis',
  empresas: 'Canecas para Empresas',
});

const text = v => String(v ?? '').trim();
const normUri = v => text(v).replace(/\/$/, '');
function squareOf(p = {}) {
  return text(p.vitrine_horizontal_quadrada || p.vitrine_loja_integrada?.url || p.loja_integrada?.horizontal_quadrada || p.loja_integrada_horizontal_quadrada);
}
function adaptProduct(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return p;
  const square = squareOf(p);
  if (!square) return p;
  // Somente na memória: satisfaz o worker V2 sem recriar campos de recorte no Firebase.
  return { ...p, vitrine_recorte_esquerda:square, vitrine_recorte_direita:square };
}

async function loadCatalogRefs() {
  try {
    const response = await nativeFetch(`https://${FIREBASE_HOST}${CATALOG_PATH}?_=${Date.now()}`, {
      cache:'no-store',
      headers:{ Accept:'application/json' },
    });
    return response.ok ? ((await response.json()) || {}) : {};
  } catch {
    return {};
  }
}
let catalogRefs = await loadCatalogRefs();

function mappedType(type) {
  const item = catalogRefs?.tipos?.[type];
  return item && item.resolvido !== false && text(item.resource_uri) ? item : null;
}
function mappedTypeByLegacyName(name) {
  for (const [type, legacyName] of Object.entries(LEGACY_CATEGORY_NAMES)) {
    if (legacyName === name) return mappedType(type);
  }
  return null;
}
function adaptFirebasePayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const out = structuredClone(value);
  const li = out.loja_integrada;
  if (li && typeof li === 'object') {
    if (Array.isArray(li.synced_storefront_images)) li.synced_storefront_images = [...new Set(li.synced_storefront_images.map(text).filter(Boolean))].slice(0,3);
    if (Array.isArray(li.image_ids)) li.image_ids = li.image_ids.map(text).filter(Boolean).slice(0,3);

    const mapping = mappedType(text(li.categoria_tipo));
    if (mapping) {
      li.categoria_nome = text(mapping.nome);
      li.categoria_uri = text(mapping.resource_uri);
      out.loja_integrada_categoria_nome = text(mapping.nome);
      out.loja_integrada_categoria_uri = text(mapping.resource_uri);
    }
  }
  for (const key of ['vitrine_recorte_esquerda','vitrine_recorte_centro','vitrine_recorte_direita','vitrine_recortes']) delete out[key];
  return out;
}

function jsonResponse(data, original) {
  return new Response(JSON.stringify(data), {
    status:original.status,
    statusText:original.statusText,
    headers:{ 'Content-Type':'application/json; charset=utf-8' },
  });
}

function categoryAliases(data) {
  if (!data || !Array.isArray(data.objects)) return data;
  const out = structuredClone(data);
  for (const [type, legacyName] of Object.entries(LEGACY_CATEGORY_NAMES)) {
    const mapping = mappedType(type);
    if (!mapping) continue;
    const targetUri = normUri(mapping.resource_uri);
    const real = out.objects.find(item => normUri(item?.resource_uri) === targetUri);
    if (!real) continue;
    const already = out.objects.some(item => text(item?.nome) === legacyName);
    if (!already) {
      out.objects.push({ ...real, nome:legacyName, cf_nome_real:text(real.nome), cf_alias_categoria:true });
    }
  }
  return out;
}

async function preserveCatalogPut(input, init) {
  let incoming = {};
  try { incoming = JSON.parse(init.body || '{}') || {}; } catch {}
  const previous = catalogRefs && typeof catalogRefs === 'object' ? catalogRefs : {};
  const merged = {
    ...previous,
    ...incoming,
    categorias:{ ...(previous.categorias || {}), ...(incoming.categorias || {}) },
    tipos:previous.tipos || {},
    categorias_lista:previous.categorias_lista || {},
    total_categorias:previous.total_categorias ?? incoming.total_categorias,
    via:'github_actions',
    fonte:previous.fonte || 'api_loja_integrada',
  };
  catalogRefs = merged;
  return nativeFetch(input, { ...init, body:JSON.stringify(merged) });
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  const method = String(init.method || (typeof input !== 'string' ? input.method : 'GET') || 'GET').toUpperCase();

  if (url.hostname === FIREBASE_HOST && url.pathname === CATALOG_PATH && method === 'PUT' && typeof init.body === 'string') {
    return preserveCatalogPut(input, init);
  }

  if (url.hostname === FIREBASE_HOST && /\/produtos\/[^/]+\.json$/.test(url.pathname) && method === 'GET') {
    const response = await nativeFetch(input, init);
    if (!response.ok) return response;
    const data = await response.clone().json().catch(() => null);
    return jsonResponse(adaptProduct(data), response);
  }

  if (url.hostname === FIREBASE_HOST && method === 'PATCH' && typeof init.body === 'string') {
    try {
      const body = adaptFirebasePayload(JSON.parse(init.body));
      return nativeFetch(input, { ...init, body:JSON.stringify(body) });
    } catch {}
  }

  if (url.hostname === LI_HOST && /^\/v1\/categoria\/?$/.test(url.pathname) && method === 'GET') {
    const response = await nativeFetch(input, init);
    if (!response.ok) return response;
    const data = await response.clone().json().catch(() => null);
    return jsonResponse(categoryAliases(data), response);
  }

  if (url.hostname === LI_HOST && url.pathname.endsWith('/produto_imagem') && method === 'POST' && typeof init.body === 'string') {
    try {
      const body = JSON.parse(init.body);
      const key = `${text(body.produto)}|${text(body.imagem_url)}`;
      if (posted.has(key)) {
        console.log(`LI V3 · imagem duplicada suprimida: ${text(body.imagem_url)}`);
        return new Response('{}', { status:201, headers:{ 'Content-Type':'application/json' } });
      }
      posted.add(key);
    } catch {}
  }

  return nativeFetch(input, init);
};

for (const [type, legacyName] of Object.entries(LEGACY_CATEGORY_NAMES)) {
  const mapping = mappedTypeByLegacyName(legacyName);
  console.log(`LI V3 · categoria ${type}: ${mapping ? `${mapping.nome} -> ${mapping.resource_uri}` : 'sem mapeamento automático'}`);
}
console.log('CanecaFácil LI Sync V3 · 3 imagens + categorias dinâmicas via GitHub ativadas');
await import('./sincronizar-loja-integrada.mjs');
