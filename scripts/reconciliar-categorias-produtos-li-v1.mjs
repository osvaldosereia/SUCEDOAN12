import { exactSku, text } from './canecafacil-github-ops-core-v1.mjs';

const FIREBASE = (process.env.FIREBASE_BASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/, '');
const LI_BASE = (process.env.LOJA_INTEGRADA_BASE_URL || 'https://api.awsli.com.br/v1').replace(/\/$/, '');
const AUTH = text(process.env.LOJA_INTEGRADA_AUTHORIZATION);
const LIMIT = Math.max(1, Math.min(25, Number(process.env.CATEGORY_RECONCILE_LIMIT || 5) || 5));
const DRY_RUN = !/^(0|false|no)$/i.test(text(process.env.DRY_RUN || 'true'));
const TARGET_SKU = text(process.env.TARGET_SKU);
const SPACING_MS = 850;

if (!AUTH) throw new Error('LOJA_INTEGRADA_AUTHORIZATION ausente.');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const norm = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const pathKey = value => encodeURIComponent(text(value));
const now = () => new Date().toISOString();
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
async function fbGet(path) { return jsonFetch(`${FIREBASE}/${path}.json`, { headers: { Accept: 'application/json' } }); }
async function fbPatch(path, body) {
  return jsonFetch(`${FIREBASE}/${path}.json`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
}
async function li(path, { method = 'GET', body, allow404 = false } = {}) {
  const wait = Math.max(0, SPACING_MS - (Date.now() - lastLi));
  if (wait) await sleep(wait);
  lastLi = Date.now();
  return jsonFetch(`${LI_BASE}${path}`, {
    method,
    headers: { Authorization: AUTH, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), 'User-Agent': 'CanecaFacil-Category-Reconciler/1.0' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }, { allow404 });
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
function categoryId(uri) { return text(uri).match(/\/categoria\/(\d+)/i)?.[1] || ''; }
function sameCategory(a, b) { const x = categoryId(a); const y = categoryId(b); return Boolean(x && y && x === y); }
function productBody(remote = {}, categoryUri = '') {
  const body = {};
  for (const field of ['id_externo','sku','mpn','ncm','gtin','nome','apelido','descricao_completa','ativo','destaque','peso','altura','largura','profundidade','tipo','usado','removido','url_video_youtube']) {
    if (Object.prototype.hasOwnProperty.call(remote, field)) body[field] = remote[field];
  }
  body.categorias = [categoryUri];
  if (Object.prototype.hasOwnProperty.call(remote, 'marca')) body.marca = resourceUri(remote.marca) || null;
  return body;
}
function verificationTimestamp(p = {}) {
  const li = liMeta(p);
  const raw = text(li.categoria_verificada_em || p.loja_integrada_categoria_verificada_em);
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
}

async function resolveRemote(local) {
  const sku = text(local.codigo || local.sku);
  const linkedId = text(liMeta(local).produto_id || local.loja_integrada_product_id);
  if (linkedId) {
    const byId = await li(`/produto/${encodeURIComponent(linkedId)}?descricao_completa=1`, { allow404: true });
    if (byId && (!text(byId.sku) || norm(byId.sku) === norm(sku))) return byId;
  }
  if (!sku) return null;
  const search = await li(`/produto?sku=${encodeURIComponent(sku)}&limit=5`);
  const found = exactSku(Array.isArray(search?.objects) ? search.objects : [], sku);
  if (!found?.id) return null;
  return li(`/produto/${encodeURIComponent(found.id)}?descricao_completa=1`, { allow404: true });
}

const started = Date.now();
const [products, refs] = await Promise.all([
  fbGet('produtos'),
  fbGet('canecas/integracoes/loja_integrada/catalog_refs'),
]);

const candidates = Object.entries(products || {})
  .filter(([, p]) => {
    if (!p || typeof p !== 'object') return false;
    const sku = text(p.codigo || p.sku);
    const linked = text(liMeta(p).produto_id || p.loja_integrada_product_id);
    if (!sku || !linked) return false;
    if (TARGET_SKU && norm(sku) !== norm(TARGET_SKU)) return false;
    return true;
  })
  .sort((a, b) => verificationTimestamp(a[1]) - verificationTimestamp(b[1]) || a[0].localeCompare(b[0]))
  .slice(0, LIMIT);

if (!candidates.length) {
  console.log('CATEGORY RECONCILE · nenhum produto elegível.');
  process.exit(0);
}

let checked = 0;
let correct = 0;
let changed = 0;
let wouldChange = 0;
let skipped = 0;
let failed = 0;

for (const [firebaseKey, local] of candidates) {
  const sku = text(local.codigo || local.sku);
  const type = categoryType(local);
  const mapping = refs?.tipos?.[type];
  if (!mapping || mapping.resolvido === false || !text(mapping.resource_uri) || !categoryId(mapping.resource_uri)) {
    skipped += 1;
    console.log(`SKIP · ${sku} · tipo=${type} sem categoria resolvida no catalog_refs`);
    continue;
  }
  const desiredUri = text(mapping.resource_uri).replace(/\/$/, '');
  const desiredId = categoryId(desiredUri);
  const desiredName = text(mapping.nome);
  try {
    const remote = await resolveRemote(local);
    if (!remote?.id) throw new Error('produto não localizado na Loja Integrada por ID/SKU');
    checked += 1;
    const currentUris = categoryUris(remote).map(uri => uri.replace(/\/$/, ''));
    const hasDesired = currentUris.length === 1 && currentUris.some(uri => sameCategory(uri, desiredUri));
    let confirmedUri = currentUris.find(uri => sameCategory(uri, desiredUri)) || '';

    if (hasDesired) {
      correct += 1;
      console.log(`OK · ${sku} · ${desiredName} · id=${desiredId}`);
    } else if (DRY_RUN) {
      wouldChange += 1;
      console.log(`DRY · ${sku} · atual=${JSON.stringify(currentUris)} -> ${desiredName} ${desiredUri}`);
    } else {
      await li(`/produto/${encodeURIComponent(remote.id)}`, { method: 'PUT', body: productBody(remote, desiredUri) });
      const confirmed = await li(`/produto/${encodeURIComponent(remote.id)}?descricao_completa=1`);
      const afterUris = categoryUris(confirmed).map(uri => uri.replace(/\/$/, ''));
      confirmedUri = afterUris.find(uri => sameCategory(uri, desiredUri)) || '';
      if (afterUris.length !== 1 || !confirmedUri) throw new Error(`categoria não confirmou; recebido=${JSON.stringify(afterUris)}`);
      changed += 1;
      console.log(`FIX · ${sku} · ${desiredName} · id=${desiredId} · ${JSON.stringify(currentUris)} -> ${JSON.stringify(afterUris)}`);
    }

    if (!DRY_RUN) {
      const at = now();
      const currentLi = liMeta(local);
      await fbPatch(`produtos/${pathKey(firebaseKey)}`, {
        loja_integrada_categoria_tipo: type,
        loja_integrada_categoria_nome: desiredName,
        loja_integrada_categoria_uri: desiredUri,
        loja_integrada_categoria_verificada_em: at,
        loja_integrada: {
          ...currentLi,
          categoria_tipo: type,
          categoria_nome: desiredName,
          categoria_uri: desiredUri,
          categoria_id: desiredId,
          categoria_uri_confirmada_li: confirmedUri || desiredUri,
          categoria_verificada_em: at,
          categoria_atualizada_via: 'github_actions',
        },
        updated_at: at,
      });
    }
  } catch (error) {
    failed += 1;
    console.error(`ERRO · ${sku} · ${text(error?.message || error)}`);
  }
}

console.log(`CATEGORY RECONCILE · dry_run=${DRY_RUN} · candidatos=${candidates.length} · verificados=${checked} · corretos=${correct} · corrigidos=${changed} · corrigiria=${wouldChange} · ignorados=${skipped} · erros=${failed} · ${Date.now() - started}ms`);
console.log('CATEGORY RECONCILE · Make não utilizado. Somente categoria é alterada quando necessário.');
if (failed) process.exitCode = 1;
