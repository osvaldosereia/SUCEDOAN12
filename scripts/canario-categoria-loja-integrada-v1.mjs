import { exactSku, text } from './canecafacil-github-ops-core-v1.mjs';

const FIREBASE = (process.env.FIREBASE_BASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/, '');
const LI_BASE = (process.env.LOJA_INTEGRADA_BASE_URL || 'https://api.awsli.com.br/v1').replace(/\/$/, '');
const AUTH = text(process.env.LOJA_INTEGRADA_AUTHORIZATION);
const SKU = text(process.env.CANARY_SKU || 'CANP-QZ11RD');
const CONFIRM = text(process.env.CANARY_CONFIRM);
const SPACING_MS = 850;

if (!AUTH) throw new Error('LOJA_INTEGRADA_AUTHORIZATION ausente.');
if (CONFIRM !== `SET_RESOLVED_CATEGORY:${SKU}`) throw new Error(`Canário bloqueado. CANARY_CONFIRM deve ser SET_RESOLVED_CATEGORY:${SKU}`);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const norm = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
let lastLi = 0;

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
  if (!response.ok) throw new Error(`${response.status} ${data?.error_message || data?.detail || data?.message || raw || ''}`.trim());
  return data;
}
async function fbGet(path) { return jsonFetch(`${FIREBASE}/${path}.json`, { headers: { Accept: 'application/json' } }); }
async function fbPatch(path, body) {
  return jsonFetch(`${FIREBASE}/${path}.json`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
}
async function li(path, { method = 'GET', body } = {}) {
  const wait = Math.max(0, SPACING_MS - (Date.now() - lastLi));
  if (wait) await sleep(wait);
  lastLi = Date.now();
  return jsonFetch(`${LI_BASE}${path}`, {
    method,
    headers: { Authorization: AUTH, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), 'User-Agent': 'CanecaFacil-GitHub-Category-Canary/1.0' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
function liMeta(p = {}) { return p.loja_integrada && typeof p.loja_integrada === 'object' ? p.loja_integrada : {}; }
function categoryType(p = {}) {
  const direct = text(p.loja_integrada_categoria_tipo || liMeta(p).categoria_tipo || p.canecafacil_categoria_tipo);
  if (['padronizadas','personalizaveis','empresas'].includes(direct)) return direct;
  const personal = p.personalizavel === true || p.loja_integrada_personalizavel === true || p.canecafacil_personalizavel === true || p.personalizacao_publica === true;
  return personal ? 'personalizaveis' : 'padronizadas';
}
function resourceUri(value) { return typeof value === 'string' ? text(value) : text(value?.resource_uri || value?.uri); }
function categoryUris(remote = {}) { return (Array.isArray(remote.categorias) ? remote.categorias : []).map(resourceUri).filter(Boolean); }
function productBody(remote = {}, categoryUri = '') {
  const body = {};
  for (const field of ['id_externo','sku','mpn','ncm','gtin','nome','apelido','descricao_completa','ativo','destaque','peso','altura','largura','profundidade','tipo','usado','removido','url_video_youtube']) {
    if (Object.prototype.hasOwnProperty.call(remote, field)) body[field] = remote[field];
  }
  body.categorias = [categoryUri];
  if (Object.prototype.hasOwnProperty.call(remote, 'marca')) body.marca = resourceUri(remote.marca) || null;
  return body;
}
function pathKey(value) { return encodeURIComponent(text(value)); }

const started = Date.now();
const [products, refs] = await Promise.all([
  fbGet('produtos'),
  fbGet('canecas/integracoes/loja_integrada/catalog_refs'),
]);
const matches = Object.entries(products || {}).filter(([, p]) => p && norm(p.codigo || p.sku) === norm(SKU));
if (matches.length !== 1) throw new Error(`SKU ${SKU}: esperado 1 produto no Firebase; encontrado(s) ${matches.length}.`);
const [firebaseKey, local] = matches[0];
const type = categoryType(local);
const mapping = refs?.tipos?.[type];
if (!mapping || mapping.resolvido === false || !text(mapping.resource_uri) || !text(mapping.nome)) throw new Error(`Categoria ${type} não resolvida no catalog_refs.`);
const desiredUri = text(mapping.resource_uri).replace(/\/$/, '');
const desiredName = text(mapping.nome);

const search = await li(`/produto?sku=${encodeURIComponent(SKU)}&limit=5`);
const found = exactSku(Array.isArray(search?.objects) ? search.objects : [], SKU);
if (!found?.id) throw new Error(`SKU ${SKU} não localizado na Loja Integrada.`);
const linkedId = text(liMeta(local).produto_id || local.loja_integrada_product_id);
if (linkedId && linkedId !== String(found.id)) throw new Error(`Vínculo inseguro: Firebase=${linkedId}, LI por SKU=${found.id}.`);
const productId = String(found.id);
const before = await li(`/produto/${encodeURIComponent(productId)}?descricao_completa=1`);
const beforeCats = categoryUris(before).map(uri => uri.replace(/\/$/, ''));
console.log(`CATEGORY CANARY · SKU=${SKU} · produto=${productId} · tipo=${type} · antes=${JSON.stringify(beforeCats)} · desejada=${desiredName} ${desiredUri}`);

if (beforeCats.length === 1 && beforeCats[0] === desiredUri) {
  console.log('CATEGORY CANARY · categoria já correta; nenhum PUT necessário.');
} else {
  await li(`/produto/${encodeURIComponent(productId)}`, { method: 'PUT', body: productBody(before, desiredUri) });
  const after = await li(`/produto/${encodeURIComponent(productId)}?descricao_completa=1`);
  const afterCats = categoryUris(after).map(uri => uri.replace(/\/$/, ''));
  if (afterCats.length !== 1 || afterCats[0] !== desiredUri) throw new Error(`Categoria não confirmou após PUT. Esperado=${desiredUri}, recebido=${JSON.stringify(afterCats)}`);
  console.log(`CATEGORY CANARY · PUT OK · depois=${JSON.stringify(afterCats)}`);
}

const liCurrent = liMeta(local);
await fbPatch(`produtos/${pathKey(firebaseKey)}`, {
  loja_integrada_categoria_tipo: type,
  loja_integrada_categoria_nome: desiredName,
  loja_integrada_categoria_uri: desiredUri,
  loja_integrada: {
    ...liCurrent,
    categoria_tipo: type,
    categoria_nome: desiredName,
    categoria_uri: desiredUri,
    categoria_atualizada_via: 'github_actions',
  },
  updated_at: new Date().toISOString(),
});
console.log('CATEGORY CANARY · Firebase atualizado com URI/nome confirmados da categoria.');
console.log(`CATEGORY CANARY · SUCESSO · ${Date.now() - started}ms · Make não utilizado · demais áreas do produto não alteradas.`);
