import { exactSku, text } from './canecafacil-github-ops-core-v1.mjs';

const LI_BASE = (process.env.LOJA_INTEGRADA_BASE_URL || 'https://api.awsli.com.br/v1').replace(/\/$/, '');
const AUTH = text(process.env.LOJA_INTEGRADA_AUTHORIZATION);
const SKU = text(process.env.CANARY_SKU || 'CANP-QZ11RD');
const CONFIRM = text(process.env.CANARY_CONFIRM);
const SPACING_MS = 850;

if (!AUTH) throw new Error('LOJA_INTEGRADA_AUTHORIZATION ausente.');
if (CONFIRM !== `WRITE_SAME_VALUES:${SKU}`) {
  throw new Error(`Canário bloqueado. CANARY_CONFIRM deve ser exatamente WRITE_SAME_VALUES:${SKU}`);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const stable = value => JSON.stringify(value, Object.keys(value || {}).sort());
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
      'User-Agent': 'CanecaFacil-GitHub-Canary/1.0',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
  if (allow404 && response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status} ${data?.error_message || data?.detail || data?.message || raw || ''}`.trim());
  }
  return data;
}

function priceBody(value = {}) {
  return {
    cheio: value.cheio ?? null,
    custo: value.custo ?? null,
    sob_consulta: value.sob_consulta === true,
    promocional: value.promocional ?? null,
  };
}

function stockBody(value = {}) {
  return {
    gerenciado: value.gerenciado !== false,
    quantidade: Number(value.quantidade ?? 0),
    situacao_em_estoque: Number(value.situacao_em_estoque ?? 0),
    situacao_sem_estoque: Number(value.situacao_sem_estoque ?? -1),
  };
}

function seoBody(value = {}) {
  return {
    title: text(value.title),
    keyword: text(value.keyword),
    description: text(value.description),
  };
}

function seoId(remote = {}) {
  const raw = text(remote.seo);
  const match = raw.match(/\/seo\/(\d+)/i);
  return match?.[1] || (/^\d+$/.test(raw) ? raw : '');
}

function assertSame(label, before, after) {
  if (stable(before) !== stable(after)) {
    throw new Error(`${label}: valores mudaram após PUT idempotente. antes=${stable(before)} depois=${stable(after)}`);
  }
}

const started = Date.now();
console.log(`CANARY · início · SKU=${SKU} · operação=PUT dos mesmos valores atuais`);

const search = await request(`/produto?sku=${encodeURIComponent(SKU)}&limit=5`);
const found = exactSku(Array.isArray(search?.objects) ? search.objects : [], SKU);
if (!found?.id) throw new Error(`SKU ${SKU} não localizado na Loja Integrada.`);
const productId = String(found.id);
const product = await request(`/produto/${encodeURIComponent(productId)}?descricao_completa=1`);
const seo = seoId(product);
if (!seo) throw new Error(`Produto ${productId} não possui SEO ID.`);

const beforePrice = priceBody(await request(`/produto_preco/${encodeURIComponent(productId)}`));
const beforeStock = stockBody(await request(`/produto_estoque/${encodeURIComponent(productId)}`));
const beforeSeo = seoBody(await request(`/seo/${encodeURIComponent(seo)}`));

console.log(`CANARY · snapshot capturado · produto=${productId} · seo=${seo}`);

await request(`/produto_preco/${encodeURIComponent(productId)}`, { method: 'PUT', body: beforePrice });
const afterPrice = priceBody(await request(`/produto_preco/${encodeURIComponent(productId)}`));
assertSame('PREÇO', beforePrice, afterPrice);
console.log('CANARY · preço · PUT idempotente OK + releitura idêntica');

await request(`/produto_estoque/${encodeURIComponent(productId)}`, { method: 'PUT', body: beforeStock });
const afterStock = stockBody(await request(`/produto_estoque/${encodeURIComponent(productId)}`));
assertSame('ESTOQUE', beforeStock, afterStock);
console.log('CANARY · estoque · PUT idempotente OK + releitura idêntica');

await request(`/seo/${encodeURIComponent(seo)}`, { method: 'PUT', body: beforeSeo });
const afterSeo = seoBody(await request(`/seo/${encodeURIComponent(seo)}`));
assertSame('SEO', beforeSeo, afterSeo);
console.log('CANARY · SEO · PUT idempotente OK + releitura idêntica');

const elapsed = Date.now() - started;
console.log(`CANARY · SUCESSO · SKU=${SKU} · produto=${productId} · ${elapsed}ms · conteúdo preservado`);
console.log('CANARY · Make não foi chamado. Imagens, produto-base, alias e categoria não foram alterados.');
