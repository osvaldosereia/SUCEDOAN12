import { exactSku, text } from './canecafacil-github-ops-core-v1.mjs';

const LI_BASE = (process.env.LOJA_INTEGRADA_BASE_URL || 'https://api.awsli.com.br/v1').replace(/\/$/, '');
const AUTH = text(process.env.LOJA_INTEGRADA_AUTHORIZATION);
const SKU = text(process.env.CANARY_SKU || 'CANP-QZ11RD');
const CONFIRM = text(process.env.CANARY_CONFIRM);
const SPACING_MS = 850;

if (!AUTH) throw new Error('LOJA_INTEGRADA_AUTHORIZATION ausente.');
if (CONFIRM !== `WRITE_SAME_PRODUCT:${SKU}`) {
  throw new Error(`Canário bloqueado. CANARY_CONFIRM deve ser exatamente WRITE_SAME_PRODUCT:${SKU}`);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const norm = value => value === undefined ? null : value;
let lastRequest = 0;

async function request(path, { method = 'GET', body, allow404 = false } = {}) {
  const wait = Math.max(0, SPACING_MS - (Date.now() - lastRequest));
  if (wait) await sleep(wait);
  lastRequest = Date.now();
  const response = await fetch(`${LI_BASE}${path}`, {
    method,
    headers: {
      Authorization: AUTH,
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      'User-Agent': 'CanecaFacil-GitHub-Product-Canary/1.2',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
  if (allow404 && response.status === 404) return null;
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${data?.error_message || data?.detail || data?.message || raw || ''}`.trim());
  return data;
}

function resourceUri(value) {
  if (typeof value === 'string') return text(value);
  return text(value?.resource_uri || value?.uri);
}

function categoryUris(remote = {}) {
  const values = [];
  if (Array.isArray(remote.categorias)) values.push(...remote.categorias);
  if (remote.categoria) values.push(remote.categoria);
  if (remote.categoria_principal) values.push(remote.categoria_principal);
  return [...new Set(values.map(resourceUri).filter(Boolean))];
}

function productBody(remote = {}, fallback = {}) {
  const body = {};
  const fields = [
    'id_externo', 'sku', 'mpn', 'ncm', 'gtin', 'nome', 'apelido',
    'descricao_completa', 'ativo', 'destaque', 'peso', 'altura', 'largura',
    'profundidade', 'tipo', 'usado', 'removido', 'url_video_youtube',
  ];
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(remote, field)) body[field] = remote[field];
    else if (Object.prototype.hasOwnProperty.call(fallback, field)) body[field] = fallback[field];
  }
  const cats = categoryUris(remote).length ? categoryUris(remote) : categoryUris(fallback);
  if (cats.length) body.categorias = cats;
  const brand = resourceUri(remote.marca) || resourceUri(fallback.marca);
  if (brand) body.marca = brand;
  return body;
}

function comparable(remote = {}, fallback = {}) {
  const body = productBody(remote, fallback);
  const out = {};
  for (const [key, value] of Object.entries(body)) {
    if (Array.isArray(value)) out[key] = [...value].map(text).sort();
    else if (typeof value === 'string') out[key] = value.trim();
    else out[key] = norm(value);
  }
  return out;
}

function diff(before = {}, after = {}) {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const problems = [];
  for (const key of keys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) problems.push(`${key}: ${JSON.stringify(before[key])} -> ${JSON.stringify(after[key])}`);
  }
  return problems;
}

function safeShape(label, value) {
  const type = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
  let sample = '';
  if (typeof value === 'string') sample = value.slice(0, 300);
  else if (Array.isArray(value)) sample = JSON.stringify(value.slice(0, 3)).slice(0, 600);
  else if (value && typeof value === 'object') sample = JSON.stringify(value).slice(0, 600);
  console.log(`PRODUCT CANARY · shape ${label} · tipo=${type} · valor=${sample || '(vazio)'}`);
}

const started = Date.now();
console.log(`PRODUCT CANARY · início · SKU=${SKU} · PUT do próprio estado remoto`);
const search = await request(`/produto?sku=${encodeURIComponent(SKU)}&limit=5`);
const found = exactSku(Array.isArray(search?.objects) ? search.objects : [], SKU);
if (!found?.id) throw new Error(`SKU ${SKU} não localizado na Loja Integrada.`);
const productId = String(found.id);

const beforeRemote = await request(`/produto/${encodeURIComponent(productId)}?descricao_completa=1`);
const before = comparable(beforeRemote, found);
if (!text(before.sku) || !text(before.nome)) throw new Error('Snapshot remoto sem SKU/nome; canário abortado.');
if (!Array.isArray(before.categorias) || !before.categorias.length) {
  const categoryKeys = [...new Set([...Object.keys(found || {}), ...Object.keys(beforeRemote || {})])].filter(k => /categ|marca/i.test(k));
  console.log(`PRODUCT CANARY · diagnóstico categoria · campos relacionados=${categoryKeys.join(',') || '(nenhum)'}`);
  safeShape('busca.categorias', found?.categorias);
  safeShape('detalhe.categorias', beforeRemote?.categorias);
  safeShape('busca.marca', found?.marca);
  safeShape('detalhe.marca', beforeRemote?.marca);
  throw new Error('Snapshot remoto e resultado por SKU sem categoria utilizável; canário abortado antes do PUT.');
}
console.log(`PRODUCT CANARY · snapshot · produto=${productId} · categoria=${before.categorias.join(',')} · alias=${text(before.apelido) || '(vazio)'}`);

await request(`/produto/${encodeURIComponent(productId)}`, { method: 'PUT', body: productBody(beforeRemote, found) });
const afterRemote = await request(`/produto/${encodeURIComponent(productId)}?descricao_completa=1`);
const after = comparable(afterRemote, found);
const changes = diff(before, after);
if (changes.length) throw new Error(`Produto-base mudou após PUT idempotente: ${changes.join(' | ')}`);
console.log('PRODUCT CANARY · produto-base · PUT idempotente OK + releitura equivalente');

const alias = text(afterRemote.apelido || found.apelido);
if (alias) {
  await request(`/produto/${encodeURIComponent(productId)}/alias?replace_main=true`, {
    method: 'PUT',
    body: { absolute_path: `/${alias.replace(/^\/+/, '')}` },
  });
  const finalRemote = await request(`/produto/${encodeURIComponent(productId)}?descricao_completa=1`);
  if (text(finalRemote.apelido || found.apelido) !== alias) throw new Error(`Alias mudou após PUT idempotente: ${alias} -> ${text(finalRemote.apelido)}`);
  console.log('PRODUCT CANARY · alias · PUT idempotente OK + releitura equivalente');
} else {
  console.log('PRODUCT CANARY · alias vazio · teste de alias ignorado com segurança');
}

console.log(`PRODUCT CANARY · SUCESSO · SKU=${SKU} · produto=${productId} · ${Date.now() - started}ms · conteúdo preservado`);
console.log('PRODUCT CANARY · Make não foi chamado. Preço, estoque, SEO e imagens não foram alterados neste teste.');
