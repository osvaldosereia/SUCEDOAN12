import { exactSku, norm, text } from './canecafacil-github-ops-core-v1.mjs';

const FIREBASE = (process.env.FIREBASE_BASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/, '');
const LI_BASE = (process.env.LOJA_INTEGRADA_BASE_URL || 'https://api.awsli.com.br/v1').replace(/\/$/, '');
const LI_AUTH = text(process.env.LOJA_INTEGRADA_AUTHORIZATION);
const LIMIT = Math.max(1, Math.min(25, Number(process.env.SHADOW_LIMIT || 5) || 5));
const STRICT = /^(1|true|yes)$/i.test(text(process.env.SHADOW_STRICT || 'false'));
const LI_SPACING_MS = 750;

if (!LI_AUTH) throw new Error('LOJA_INTEGRADA_AUTHORIZATION ausente.');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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

let lastLi = 0;
async function li(path, { allow404 = false } = {}) {
  const wait = Math.max(0, LI_SPACING_MS - (Date.now() - lastLi));
  if (wait) await sleep(wait);
  lastLi = Date.now();
  return jsonFetch(`${LI_BASE}${path}`, {
    headers: {
      Authorization: LI_AUTH,
      Accept: 'application/json',
      'User-Agent': 'CanecaFacil-Shadow-Audit/1.0',
    },
  }, { allow404 });
}

function liMeta(product = {}) {
  return product.loja_integrada && typeof product.loja_integrada === 'object' ? product.loja_integrada : {};
}

function expectedImages(product = {}) {
  return [
    product.mockup_1,
    product.mockup_2,
    product.vitrine_horizontal_quadrada || product.vitrine_loja_integrada?.url || product.loja_integrada_horizontal_quadrada || liMeta(product).horizontal_quadrada,
  ].map(text).filter(Boolean);
}

function remoteImages(remote = {}) {
  return (Array.isArray(remote?.imagens) ? remote.imagens : [])
    .map(item => text(item?.imagem || item?.imagem_url || item?.url || item?.resource_uri))
    .filter(Boolean);
}

function localCategoryUri(product = {}) {
  return text(product.loja_integrada_categoria_uri || liMeta(product).categoria_uri);
}

function remoteCategoryUris(remote = {}) {
  const raw = Array.isArray(remote?.categorias) ? remote.categorias : [];
  return raw.map(item => text(typeof item === 'string' ? item : item?.resource_uri || item?.uri)).filter(Boolean);
}

function compareProduct(local, remote, foundBySku) {
  const issues = [];
  const sku = text(local.codigo || local.sku);
  const linkedId = text(liMeta(local).produto_id || local.loja_integrada_product_id);
  const remoteId = text(remote?.id || foundBySku?.id);
  if (linkedId && remoteId && linkedId !== remoteId) issues.push(`ID Firebase ${linkedId} != LI ${remoteId}`);
  if (sku && norm(remote?.sku) !== norm(sku)) issues.push(`SKU Firebase ${sku} != LI ${text(remote?.sku)}`);
  if (text(local.nome) && text(remote?.nome) !== text(local.nome)) issues.push('nome divergente');

  const categoryUri = localCategoryUri(local).replace(/\/$/, '');
  const remoteCats = remoteCategoryUris(remote).map(uri => uri.replace(/\/$/, ''));
  if (categoryUri && remoteCats.length && !remoteCats.includes(categoryUri)) issues.push('categoria divergente');

  const expected = expectedImages(local);
  const actual = remoteImages(remote);
  if (expected.length === 3 && actual.length !== 3) issues.push(`galeria LI tem ${actual.length} imagem(ns), esperado 3`);

  return {
    sku,
    product_id_firebase: linkedId,
    product_id_li: remoteId,
    nome: text(local.nome),
    categoria_uri: categoryUri,
    imagens_esperadas: expected.length,
    imagens_li: actual.length,
    ok: issues.length === 0,
    issues,
  };
}

const startedAt = Date.now();
const products = (await fbGet('produtos')) || {};
const candidates = Object.entries(products)
  .filter(([, product]) => {
    if (!product || typeof product !== 'object') return false;
    const sku = text(product.codigo || product.sku);
    const id = text(liMeta(product).produto_id || product.loja_integrada_product_id);
    return Boolean(sku && id);
  })
  .slice(0, LIMIT);

if (!candidates.length) throw new Error('Shadow audit: nenhum produto com SKU + produto_id da Loja Integrada encontrado no Firebase.');

const rows = [];
for (const [firebaseKey, local] of candidates) {
  const sku = text(local.codigo || local.sku);
  const itemStart = Date.now();
  let result;
  try {
    const search = await li(`/produto?sku=${encodeURIComponent(sku)}&limit=5`);
    const found = exactSku(Array.isArray(search?.objects) ? search.objects : [], sku);
    if (!found?.id) throw new Error(`SKU ${sku} não localizado na Loja Integrada.`);
    const remote = await li(`/produto/${encodeURIComponent(found.id)}?descricao_completa=1`, { allow404: true });
    if (!remote) throw new Error(`Produto ${found.id} não localizado por ID.`);
    result = compareProduct(local, remote, found);
  } catch (error) {
    result = {
      sku,
      product_id_firebase: text(liMeta(local).produto_id || local.loja_integrada_product_id),
      product_id_li: '',
      nome: text(local.nome),
      categoria_uri: localCategoryUri(local),
      imagens_esperadas: expectedImages(local).length,
      imagens_li: 0,
      ok: false,
      issues: [text(error?.message || error)],
    };
  }
  rows.push({ firebase_key: firebaseKey, ms: Date.now() - itemStart, ...result });
}

const elapsed = Date.now() - startedAt;
const ok = rows.filter(row => row.ok).length;
const failed = rows.length - ok;
const avg = Math.round(rows.reduce((sum, row) => sum + row.ms, 0) / rows.length);
const sorted = rows.map(row => row.ms).sort((a, b) => a - b);
const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] || 0;

console.log(`SHADOW · amostra=${rows.length} · ok=${ok} · divergencias=${failed} · total=${elapsed}ms · media=${avg}ms · p95=${p95}ms · strict=${STRICT}`);
for (const row of rows) {
  console.log(`${row.ok ? 'OK' : 'ATENCAO'} · ${row.sku} · ${row.ms}ms${row.issues.length ? ` · ${row.issues.join(' | ')}` : ''}`);
}
console.log('SHADOW · somente leitura · nenhuma escrita no Firebase, Loja Integrada ou Make.');

if (STRICT && failed) process.exitCode = 2;
