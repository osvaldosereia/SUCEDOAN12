import { exactSku, norm, text } from './canecafacil-github-ops-core-v1.mjs';

const FIREBASE = (process.env.FIREBASE_BASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/, '');
const LI_BASE = (process.env.LOJA_INTEGRADA_BASE_URL || 'https://api.awsli.com.br/v1').replace(/\/$/, '');
const AUTH = text(process.env.LOJA_INTEGRADA_AUTHORIZATION);
const SKU = text(process.env.GALLERY_AUDIT_SKU || 'CANP-WTM83S');
const SPACING_MS = 750;
if (!AUTH) throw new Error('LOJA_INTEGRADA_AUTHORIZATION ausente.');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const pathKey = value => encodeURIComponent(text(value));
let lastLi = 0;

async function jsonFetch(url, options = {}, { allow404 = false } = {}) {
  const response = await fetch(url, options);
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
  if (allow404 && response.status === 404) return null;
  if (!response.ok) throw new Error(`${response.status} ${data?.error_message || data?.detail || data?.message || raw || ''}`.trim());
  return data;
}
async function fbGet(path) {
  return jsonFetch(`${FIREBASE}/${path}.json`, { headers: { Accept: 'application/json' } });
}
async function li(path, { allow404 = false } = {}) {
  const wait = Math.max(0, SPACING_MS - (Date.now() - lastLi));
  if (wait) await sleep(wait);
  lastLi = Date.now();
  return jsonFetch(`${LI_BASE}${path}`, {
    headers: { Authorization: AUTH, Accept: 'application/json', 'User-Agent': 'CanecaFacil-Gallery-Audit/1.0' },
  }, { allow404 });
}
function liMeta(p = {}) { return p.loja_integrada && typeof p.loja_integrada === 'object' ? p.loja_integrada : {}; }
function expectedImages(p = {}) {
  return [
    p.mockup_1,
    p.mockup_2,
    p.vitrine_horizontal_quadrada || p.vitrine_loja_integrada?.url || p.loja_integrada_horizontal_quadrada || liMeta(p).horizontal_quadrada,
  ].map(text).filter(Boolean);
}
function imageId(value) {
  const direct = text(value?.id);
  if (direct) return direct;
  const raw = typeof value === 'string' ? value : text(value?.resource_uri || value?.uri);
  return raw.match(/\/produto_imagem\/(\d+)/i)?.[1] || '';
}
function imageResource(value) {
  if (typeof value === 'string') return text(value);
  return text(value?.resource_uri || value?.uri);
}
function sourceCandidate(value = {}) {
  if (typeof value === 'string') return '';
  return text(value.imagem_url || value.source_url || value.url_origem || value.original_url);
}
function renderedCandidate(value = {}) {
  if (typeof value === 'string') return '';
  return text(value.imagem || value.url || value.src);
}
async function sourceProbe(url) {
  const started = Date.now();
  let response;
  try {
    response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (!response.ok || response.status === 405) response = await fetch(url, { method: 'GET', redirect: 'follow', headers: { Range: 'bytes=0-0' } });
  } catch (error) {
    return { ok: false, status: 0, ms: Date.now() - started, type: '', error: text(error?.message || error) };
  }
  return {
    ok: response.ok,
    status: response.status,
    ms: Date.now() - started,
    type: text(response.headers.get('content-type')),
    bytes: text(response.headers.get('content-length')),
  };
}

const started = Date.now();
const products = (await fbGet('produtos')) || {};
const matches = Object.entries(products).filter(([, p]) => p && norm(p.codigo || p.sku) === norm(SKU));
if (matches.length !== 1) throw new Error(`SKU ${SKU}: esperado 1 produto no Firebase; encontrado(s) ${matches.length}.`);
const [firebaseKey, local] = matches[0];
const liLocal = liMeta(local);
const expected = expectedImages(local);
if (expected.length !== 3 || new Set(expected).size !== 3) throw new Error(`Firebase: esperado 3 URLs oficiais únicas; recebido=${expected.length}, unicas=${new Set(expected).size}.`);

const probes = [];
for (let i = 0; i < expected.length; i += 1) probes.push(await sourceProbe(expected[i]));
if (probes.some(p => !p.ok)) throw new Error(`Uma ou mais fontes de imagem não estão acessíveis: ${JSON.stringify(probes)}`);

let productId = text(liLocal.produto_id || local.loja_integrada_product_id);
if (!productId) {
  const search = await li(`/produto?sku=${encodeURIComponent(SKU)}&limit=5`);
  const found = exactSku(Array.isArray(search?.objects) ? search.objects : [], SKU);
  productId = text(found?.id);
}
if (!productId) throw new Error(`SKU ${SKU} não localizado na Loja Integrada.`);
const remote = await li(`/produto/${pathKey(productId)}?descricao_completa=1`);
if (text(remote?.sku) && norm(remote.sku) !== norm(SKU)) throw new Error(`Vínculo inseguro: produto ${productId} pertence ao SKU ${remote.sku}.`);
const remoteRaw = Array.isArray(remote?.imagens) ? remote.imagens : [];
if (remoteRaw.length !== 3) throw new Error(`Galeria LI tem ${remoteRaw.length} imagem(ns); esperado=3.`);

const details = [];
for (const item of remoteRaw) {
  let detail = item;
  const resource = imageResource(item);
  const id = imageId(item);
  if ((typeof item === 'string' || !sourceCandidate(item) && !renderedCandidate(item)) && (resource || id)) {
    const path = resource ? resource.replace(/^\/api/, '').replace(/^\/v1/, '/produto_imagem/').replace(/^\/produto_imagem\/produto_imagem\//, '/produto_imagem/') : `/produto_imagem/${id}`;
    detail = await li(path.startsWith('/v1/') ? path.slice(3) : path, { allow404: true }) || item;
  }
  details.push({
    id: imageId(detail) || id,
    resource_uri: imageResource(detail) || resource,
    source: sourceCandidate(detail),
    rendered: renderedCandidate(detail),
  });
}
const remoteIds = details.map(x => text(x.id)).filter(Boolean);
const storedIds = (Array.isArray(liLocal.image_ids) ? liLocal.image_ids : []).map(text).filter(Boolean);
const synced = (Array.isArray(liLocal.synced_storefront_images) ? liLocal.synced_storefront_images : []).map(text).filter(Boolean);
const idsMatch = storedIds.length === 3 && remoteIds.length === 3 && [...storedIds].sort().join('|') === [...remoteIds].sort().join('|');
const syncedMatch = synced.length === 3 && synced.every((url, i) => url === expected[i]);

console.log(`GALLERY AUDIT · SKU=${SKU} · firebase=${firebaseKey} · produto=${productId} · esperado=3 · LI=${remoteRaw.length}`);
console.log(`GALLERY AUDIT · fontes acessíveis · ${probes.map((p, i) => `${i + 1}:${p.status}/${p.type || 'sem-tipo'}/${p.ms}ms`).join(' · ')}`);
console.log(`GALLERY AUDIT · image_ids Firebase=${storedIds.length} · LI=${remoteIds.length} · correspondem=${idsMatch}`);
console.log(`GALLERY AUDIT · synced_storefront_images=${synced.length} · corresponde_ao_oficial=${syncedMatch}`);
console.log(`GALLERY AUDIT · detalhes LI=${JSON.stringify(details.map(x => ({ id: x.id, resource_uri: x.resource_uri, tem_source: Boolean(x.source), tem_rendered: Boolean(x.rendered) })))}`);
if (!idsMatch) throw new Error(`IDs da galeria não correspondem ao Firebase. Firebase=${JSON.stringify(storedIds)} LI=${JSON.stringify(remoteIds)}`);
if (!syncedMatch) throw new Error('Firebase não registra exatamente as 3 imagens oficiais sincronizadas na ordem esperada.');
console.log(`GALLERY AUDIT · SUCESSO · ${Date.now() - started}ms · somente leitura · Make não utilizado.`);
