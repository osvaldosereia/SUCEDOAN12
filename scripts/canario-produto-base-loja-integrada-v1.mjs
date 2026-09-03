import { exactSku, text } from './canecafacil-github-ops-core-v1.mjs';

const LI_BASE = (process.env.LOJA_INTEGRADA_BASE_URL || 'https://api.awsli.com.br/v1').replace(/\/$/, '');
const AUTH = text(process.env.LOJA_INTEGRADA_AUTHORIZATION);
const SKU = text(process.env.CANARY_SKU || 'CANP-QZ11RD');
const CONFIRM = text(process.env.CANARY_CONFIRM);
const SPACING_MS = 850;

if (!AUTH) throw new Error('LOJA_INTEGRADA_AUTHORIZATION ausente.');
if (CONFIRM !== `WRITE_SAME_PRODUCT:${SKU}`) throw new Error(`Canário bloqueado. CANARY_CONFIRM deve ser exatamente WRITE_SAME_PRODUCT:${SKU}`);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let lastRequest = 0;
async function request(path, { method = 'GET', body } = {}) {
  const wait = Math.max(0, SPACING_MS - (Date.now() - lastRequest));
  if (wait) await sleep(wait);
  lastRequest = Date.now();
  const response = await fetch(`${LI_BASE}${path}`, {
    method,
    headers: { Authorization: AUTH, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), 'User-Agent': 'CanecaFacil-GitHub-Product-Canary/1.3' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${data?.error_message || data?.detail || data?.message || raw || ''}`.trim());
  return data;
}

function resourceUri(value) { return typeof value === 'string' ? text(value) : text(value?.resource_uri || value?.uri); }
function categoryUris(remote = {}) {
  const raw = Array.isArray(remote.categorias) ? remote.categorias : [];
  return [...new Set(raw.map(resourceUri).filter(Boolean))];
}
function productBody(remote = {}) {
  const body = {};
  for (const field of ['id_externo','sku','mpn','ncm','gtin','nome','apelido','descricao_completa','ativo','destaque','peso','altura','largura','profundidade','tipo','usado','removido','url_video_youtube']) {
    if (Object.prototype.hasOwnProperty.call(remote, field)) body[field] = remote[field];
  }
  if (Object.prototype.hasOwnProperty.call(remote, 'categorias')) body.categorias = categoryUris(remote);
  if (Object.prototype.hasOwnProperty.call(remote, 'marca')) body.marca = resourceUri(remote.marca) || null;
  return body;
}
function comparable(remote = {}) {
  const body = productBody(remote);
  const out = {};
  for (const [key, value] of Object.entries(body)) {
    if (Array.isArray(value)) out[key] = [...value].map(text).sort();
    else if (typeof value === 'string') out[key] = value.trim();
    else out[key] = value === undefined ? null : value;
  }
  return out;
}
function diff(before = {}, after = {}) {
  const problems = [];
  for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) problems.push(`${key}: ${JSON.stringify(before[key])} -> ${JSON.stringify(after[key])}`);
  }
  return problems;
}

const started = Date.now();
console.log(`PRODUCT CANARY · início · SKU=${SKU} · PUT do próprio estado remoto`);
const search = await request(`/produto?sku=${encodeURIComponent(SKU)}&limit=5`);
const found = exactSku(Array.isArray(search?.objects) ? search.objects : [], SKU);
if (!found?.id) throw new Error(`SKU ${SKU} não localizado na Loja Integrada.`);
const productId = String(found.id);
const beforeRemote = await request(`/produto/${encodeURIComponent(productId)}?descricao_completa=1`);
const before = comparable(beforeRemote);
if (!text(before.sku) || !text(before.nome)) throw new Error('Snapshot remoto sem SKU/nome; canário abortado.');
console.log(`PRODUCT CANARY · snapshot · produto=${productId} · categorias=${JSON.stringify(before.categorias || [])} · marca=${JSON.stringify(before.marca ?? null)} · alias=${text(before.apelido) || '(vazio)'}`);

await request(`/produto/${encodeURIComponent(productId)}`, { method: 'PUT', body: productBody(beforeRemote) });
const afterRemote = await request(`/produto/${encodeURIComponent(productId)}?descricao_completa=1`);
const after = comparable(afterRemote);
const changes = diff(before, after);
if (changes.length) throw new Error(`Produto-base mudou após PUT idempotente: ${changes.join(' | ')}`);
console.log('PRODUCT CANARY · produto-base · PUT idempotente OK + releitura idêntica');

const alias = text(afterRemote.apelido);
if (alias) {
  await request(`/produto/${encodeURIComponent(productId)}/alias?replace_main=true`, { method: 'PUT', body: { absolute_path: `/${alias.replace(/^\/+/, '')}` } });
  const finalRemote = await request(`/produto/${encodeURIComponent(productId)}?descricao_completa=1`);
  if (text(finalRemote.apelido) !== alias) throw new Error(`Alias mudou após PUT idempotente: ${alias} -> ${text(finalRemote.apelido)}`);
  console.log('PRODUCT CANARY · alias · PUT idempotente OK + releitura idêntica');
} else console.log('PRODUCT CANARY · alias vazio · teste de alias ignorado');

console.log(`PRODUCT CANARY · SUCESSO · SKU=${SKU} · produto=${productId} · ${Date.now() - started}ms · conteúdo preservado`);
console.log('PRODUCT CANARY · Make não foi chamado. Preço, estoque, SEO e imagens não foram alterados neste teste.');
