const FIREBASE = (process.env.FIREBASE_BASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/, '');
const LI_BASE = (process.env.LOJA_INTEGRADA_BASE_URL || 'https://api.awsli.com.br/v1').replace(/\/$/, '');
const AUTH = String(process.env.LOJA_INTEGRADA_AUTHORIZATION || '').trim();
const REFS = 'canecas/integracoes/loja_integrada/catalog_refs';
const REQUEST_SPACING_MS = 650;

const TYPE_CONFIG = Object.freeze({
  padronizadas: {
    legacyName: 'Canecas Padronizadas',
    hints: ['padron', 'pronta', 'tradicional'],
  },
  personalizaveis: {
    legacyName: 'Canecas Personalizáveis',
    hints: ['personaliz'],
  },
  empresas: {
    legacyName: 'Canecas para Empresas',
    hints: ['empresa', 'corporativ', 'brinde'],
  },
});

const text = value => String(value ?? '').trim();
const norm = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const now = () => new Date().toISOString();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

if (!AUTH) throw new Error('Secret LOJA_INTEGRADA_AUTHORIZATION não configurado no GitHub Actions.');

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
  if (!response.ok) {
    const message = data?.error_message || data?.detail || data?.message || data?.error || raw || String(response.status);
    throw new Error(`${response.status} ${message}`);
  }
  return data;
}

async function fbGet(path) {
  return jsonFetch(`${FIREBASE}/${path}.json`, { headers: { Accept: 'application/json' } });
}
async function fbPatch(path, value) {
  return jsonFetch(`${FIREBASE}/${path}.json`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(value),
  });
}

let lastLi = 0;
async function liGet(path) {
  const wait = Math.max(0, REQUEST_SPACING_MS - (Date.now() - lastLi));
  if (wait) await sleep(wait);
  lastLi = Date.now();
  return jsonFetch(`${LI_BASE}${path}`, {
    headers: {
      Authorization: AUTH,
      Accept: 'application/json',
      'User-Agent': 'CanecaFacil-GitHub-Catalog/1.0',
    },
  });
}

async function listAll(endpoint) {
  let offset = 0;
  const limit = 100;
  const objects = [];
  while (offset < 5000) {
    const data = await liGet(`${endpoint}?limit=${limit}&offset=${offset}`);
    const batch = Array.isArray(data?.objects) ? data.objects : [];
    objects.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  return objects;
}

function categoryId(item = {}) {
  const direct = text(item.id);
  if (direct) return direct;
  const match = text(item.resource_uri).match(/\/categoria\/(\d+)/i);
  return match?.[1] || '';
}
function normalizeCategory(item = {}) {
  const id = categoryId(item);
  return {
    id,
    nome: text(item.nome),
    resource_uri: text(item.resource_uri),
    pai: text(item.pai),
    ativo: item.ativo !== false,
  };
}
function findByUri(categories, uri) {
  const target = text(uri).replace(/\/$/, '');
  if (!target) return null;
  return categories.find(item => text(item.resource_uri).replace(/\/$/, '') === target) || null;
}
function findByName(categories, name) {
  const target = norm(name);
  if (!target) return null;
  return categories.find(item => norm(item.nome) === target) || null;
}
function productType(product = {}) {
  const li = product.loja_integrada && typeof product.loja_integrada === 'object' ? product.loja_integrada : {};
  const direct = text(product.loja_integrada_categoria_tipo || li.categoria_tipo || product.canecafacil_categoria_tipo);
  if (TYPE_CONFIG[direct]) return direct;
  const personal = product.personalizavel === true || product.loja_integrada_personalizavel === true || product.canecafacil_personalizavel === true || product.personalizacao_publica === true;
  return personal ? 'personalizaveis' : 'padronizadas';
}
function productUri(product = {}) {
  const li = product.loja_integrada && typeof product.loja_integrada === 'object' ? product.loja_integrada : {};
  return text(product.loja_integrada_categoria_uri || li.categoria_uri);
}
function mostCommonProductUri(products = {}, type, categories) {
  const counts = new Map();
  for (const product of Object.values(products || {})) {
    if (!product || productType(product) !== type) continue;
    const uri = productUri(product);
    if (!uri || !findByUri(categories, uri)) continue;
    counts.set(uri, (counts.get(uri) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}
function uniqueHintMatch(categories, hints = []) {
  const matches = categories.filter(item => {
    const name = norm(item.nome);
    return hints.some(hint => name.includes(norm(hint)));
  });
  return matches.length === 1 ? matches[0] : null;
}

const categories = (await listAll('/categoria'))
  .map(normalizeCategory)
  .filter(item => item.nome && item.resource_uri);
const previous = (await fbGet(REFS).catch(() => ({}))) || {};

let products = null;
function existingTypeUri(type) {
  return text(previous?.tipos?.[type]?.resource_uri);
}
function legacyUri(type) {
  const legacyName = TYPE_CONFIG[type].legacyName;
  return text(previous?.categorias?.[legacyName]);
}
function needsProducts(type) {
  if (findByUri(categories, existingTypeUri(type))) return false;
  if (findByUri(categories, legacyUri(type))) return false;
  if (findByName(categories, TYPE_CONFIG[type].legacyName)) return false;
  return true;
}
if (Object.keys(TYPE_CONFIG).some(needsProducts)) {
  products = (await fbGet('produtos').catch(() => ({}))) || {};
}

const tipos = {};
for (const [type, cfg] of Object.entries(TYPE_CONFIG)) {
  let category = findByUri(categories, existingTypeUri(type));
  let origem = category ? 'vinculo_anterior_por_id' : '';

  if (!category) {
    category = findByUri(categories, legacyUri(type));
    if (category) origem = 'referencia_anterior_por_id';
  }
  if (!category && products) {
    const uri = mostCommonProductUri(products, type, categories);
    category = findByUri(categories, uri);
    if (category) origem = 'produtos_existentes_por_id';
  }
  if (!category) {
    category = findByName(categories, cfg.legacyName);
    if (category) origem = 'nome_exato';
  }
  if (!category) {
    category = uniqueHintMatch(categories, cfg.hints);
    if (category) origem = 'heuristica_unica';
  }

  tipos[type] = category ? {
    resolvido: true,
    id: category.id,
    nome: category.nome,
    resource_uri: category.resource_uri,
    origem,
    atualizado_em: now(),
  } : {
    resolvido: false,
    id: '',
    nome: '',
    resource_uri: '',
    origem: 'nao_identificado',
    esperado_anteriormente: cfg.legacyName,
    atualizado_em: now(),
  };
}

const categorias = {};
const categoriasLista = {};
for (const item of categories) {
  categorias[item.nome] = item.resource_uri;
  const key = item.id || `cat_${Object.keys(categoriasLista).length + 1}`;
  categoriasLista[key] = item;
}

const updatedAt = now();
await fbPatch(REFS, {
  categorias,
  categorias_lista: categoriasLista,
  tipos,
  total_categorias: categories.length,
  atualizado_em: updatedAt,
  via: 'github_actions',
  fonte: 'api_loja_integrada',
});

console.log(`CATALOGO LI · categorias=${categories.length} · atualizado=${updatedAt} · via=github_actions`);
for (const [type, mapping] of Object.entries(tipos)) {
  console.log(`TIPO ${type} · ${mapping.resolvido ? `${mapping.nome} -> ${mapping.resource_uri} (${mapping.origem})` : 'NÃO IDENTIFICADO'}`);
}
