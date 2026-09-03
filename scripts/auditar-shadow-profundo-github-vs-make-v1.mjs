import { exactSku, norm, text } from './canecafacil-github-ops-core-v1.mjs';

const FIREBASE = (process.env.FIREBASE_BASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/, '');
const LI_BASE = (process.env.LOJA_INTEGRADA_BASE_URL || 'https://api.awsli.com.br/v1').replace(/\/$/, '');
const LI_AUTH = text(process.env.LOJA_INTEGRADA_AUTHORIZATION);
const LIMIT = Math.max(1, Math.min(10, Number(process.env.SHADOW_DEEP_LIMIT || 3) || 3));
const STRICT = /^(1|true|yes)$/i.test(text(process.env.SHADOW_STRICT || 'false'));
const LI_SPACING_MS = 750;

if (!LI_AUTH) throw new Error('LOJA_INTEGRADA_AUTHORIZATION ausente.');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const num = value => { const n = Number(String(value ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const bool = value => value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
const sameNum = (a, b) => Math.abs(num(a) - num(b)) < 0.005;
const normalizeString = value => text(value).replace(/\s+/g, ' ');

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
    headers: { Authorization: LI_AUTH, Accept: 'application/json', 'User-Agent': 'CanecaFacil-Deep-Shadow/1.0' },
  }, { allow404 });
}

function liMeta(p = {}) {
  return p.loja_integrada && typeof p.loja_integrada === 'object' ? p.loja_integrada : {};
}

function expectedPrice(p = {}) {
  return {
    cheio: num(p.preco),
    custo: num(p.preco_custo || p.custo),
    sob_consulta: p.preco_sob_consulta === true,
    promocional: num(p.preco_oferta || p.preco_promocional),
  };
}

function expectedStock(p = {}) {
  return {
    gerenciado: p.estoque_gerenciado !== false,
    quantidade: Math.max(0, Math.floor(num(p.estoque))),
    situacao_em_estoque: Math.min(90, Math.max(0, Math.floor(num(p.estoque_situacao_em_estoque)))),
    situacao_sem_estoque: Number(p.estoque_situacao_sem_estoque ?? -1),
  };
}

function expectedSeo(p = {}) {
  return {
    title: text(p.seo_title || p.seo_tag_title || p.nome).slice(0, 70),
    keyword: text(p.seo_keywords || (Array.isArray(p.tags) ? p.tags.join(', ') : p.tags || '')),
    description: text(p.seo_description || p.seo_tag_description || p.meta_description || `${p.nome || 'Caneca'} em porcelana. Compre na CanecaFácil.`).slice(0, 250),
  };
}

function seoIdOf(remote = {}, local = {}) {
  const raw = text(remote.seo || liMeta(local).seo_id || local.loja_integrada_seo_id);
  const match = raw.match(/\/seo\/(\d+)/i);
  return match?.[1] || (/^\d+$/.test(raw) ? raw : '');
}

function comparePrice(expected, actual = {}) {
  const issues = [];
  if (!sameNum(expected.cheio, actual.cheio)) issues.push(`preço cheio ${expected.cheio} != ${num(actual.cheio)}`);
  if (!sameNum(expected.custo, actual.custo)) issues.push(`custo ${expected.custo} != ${num(actual.custo)}`);
  if (!sameNum(expected.promocional, actual.promocional)) issues.push(`promocional ${expected.promocional} != ${num(actual.promocional)}`);
  if (bool(expected.sob_consulta) !== bool(actual.sob_consulta)) issues.push('preço sob consulta divergente');
  return issues;
}

function compareStock(expected, actual = {}) {
  const issues = [];
  if (bool(expected.gerenciado) !== bool(actual.gerenciado)) issues.push('estoque gerenciado divergente');
  if (Number(expected.quantidade) !== Number(actual.quantidade)) issues.push(`estoque ${expected.quantidade} != ${actual.quantidade}`);
  if (Number(expected.situacao_em_estoque) !== Number(actual.situacao_em_estoque)) issues.push('prazo em estoque divergente');
  if (Number(expected.situacao_sem_estoque) !== Number(actual.situacao_sem_estoque)) issues.push('prazo sem estoque divergente');
  return issues;
}

function seoDiff(expected, actual = {}) {
  const issues = [];
  const details = {};
  if (normalizeString(expected.title) !== normalizeString(actual.title)) {
    issues.push('SEO title divergente');
    details.title = { firebase: expected.title, loja_integrada: text(actual.title) };
  }
  if (normalizeString(expected.keyword) !== normalizeString(actual.keyword)) {
    issues.push('SEO keywords divergentes');
    details.keyword = { firebase: expected.keyword, loja_integrada: text(actual.keyword) };
  }
  if (normalizeString(expected.description) !== normalizeString(actual.description)) {
    issues.push('SEO description divergente');
    details.description = { firebase: expected.description, loja_integrada: text(actual.description) };
  }
  return { issues, details };
}

const startedAt = Date.now();
const products = (await fbGet('produtos')) || {};
const candidates = Object.entries(products)
  .filter(([, p]) => p && text(p.codigo || p.sku) && text(liMeta(p).produto_id || p.loja_integrada_product_id))
  .slice(0, LIMIT);

if (!candidates.length) throw new Error('Deep shadow: nenhum produto elegível encontrado.');

const results = [];
for (const [firebaseKey, local] of candidates) {
  const start = Date.now();
  const sku = text(local.codigo || local.sku);
  const issues = [];
  const checks = { produto: false, preco: false, estoque: false, seo: false };
  let seo_details = {};
  try {
    const search = await li(`/produto?sku=${encodeURIComponent(sku)}&limit=5`);
    const found = exactSku(Array.isArray(search?.objects) ? search.objects : [], sku);
    if (!found?.id) throw new Error(`SKU ${sku} não localizado.`);
    const remote = await li(`/produto/${encodeURIComponent(found.id)}?descricao_completa=1`);
    checks.produto = true;

    const linkedId = text(liMeta(local).produto_id || local.loja_integrada_product_id);
    if (linkedId && linkedId !== text(found.id)) issues.push(`ID Firebase ${linkedId} != LI ${found.id}`);
    if (norm(remote.sku) !== norm(sku)) issues.push('SKU divergente');
    if (text(remote.nome) !== text(local.nome)) issues.push('nome divergente');

    const remotePrice = await li(`/produto_preco/${encodeURIComponent(found.id)}`, { allow404: true });
    if (remotePrice) {
      checks.preco = true;
      issues.push(...comparePrice(expectedPrice(local), remotePrice));
    } else issues.push('endpoint produto_preco não retornou dados');

    const remoteStock = await li(`/produto_estoque/${encodeURIComponent(found.id)}`, { allow404: true });
    if (remoteStock) {
      checks.estoque = true;
      issues.push(...compareStock(expectedStock(local), remoteStock));
    } else issues.push('endpoint produto_estoque não retornou dados');

    const seoId = seoIdOf(remote, local);
    if (seoId) {
      const remoteSeo = await li(`/seo/${encodeURIComponent(seoId)}`, { allow404: true });
      if (remoteSeo) {
        checks.seo = true;
        const diff = seoDiff(expectedSeo(local), remoteSeo);
        issues.push(...diff.issues);
        seo_details = diff.details;
      } else issues.push('endpoint SEO não retornou dados');
    } else issues.push('produto sem SEO ID para auditoria');
  } catch (error) {
    issues.push(text(error?.message || error));
  }
  results.push({ firebaseKey, sku, ms: Date.now() - start, issues, checks, seo_details, ok: issues.length === 0 });
}

const elapsed = Date.now() - startedAt;
const perfect = results.filter(r => r.ok).length;
const avg = Math.round(results.reduce((s, r) => s + r.ms, 0) / results.length);
const sorted = results.map(r => r.ms).sort((a, b) => a - b);
const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] || 0;

console.log(`DEEP SHADOW · amostra=${results.length} · perfeitos=${perfect} · divergencias=${results.length - perfect} · total=${elapsed}ms · media=${avg}ms · p95=${p95}ms · strict=${STRICT}`);
for (const row of results) {
  console.log(`${row.ok ? 'OK' : 'ATENCAO'} · ${row.sku} · ${row.ms}ms · checks=${JSON.stringify(row.checks)}${row.issues.length ? ` · ${row.issues.join(' | ')}` : ''}`);
  for (const [field, values] of Object.entries(row.seo_details || {})) {
    console.log(`SEO DIFF · ${row.sku} · ${field} · Firebase=${JSON.stringify(values.firebase)} · LojaIntegrada=${JSON.stringify(values.loja_integrada)}`);
  }
}
console.log('DEEP SHADOW · somente leitura · nenhum PUT/PATCH/POST/DELETE foi enviado à Loja Integrada.');
if (STRICT && perfect !== results.length) process.exitCode = 2;
