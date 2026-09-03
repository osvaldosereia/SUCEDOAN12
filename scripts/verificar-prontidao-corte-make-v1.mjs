const FIREBASE = (process.env.FIREBASE_BASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/, '');
const LI_BASE = (process.env.LOJA_INTEGRADA_BASE_URL || 'https://api.awsli.com.br/v1').replace(/\/$/, '');
const AUTH = String(process.env.LOJA_INTEGRADA_AUTHORIZATION || '').trim();
const HAS_RESEND = Boolean(String(process.env.RESEND_API_KEY || '').trim());
const SKU = String(process.env.READINESS_SKU || 'CANP-WTM83S').trim();
const PUBLISH = /^(1|true|yes)$/i.test(String(process.env.PUBLISH_READINESS || 'true'));
const STATUS_PATH = 'canecas/integracoes/github_ops/prontidao_corte_make';
const EXPECTED_IMAGES = 3;
const SPACING_MS = 650;
if (!AUTH) throw new Error('LOJA_INTEGRADA_AUTHORIZATION ausente.');

const text = value => String(value ?? '').trim();
const norm = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const num = value => { const n = Number(String(value ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const categoryId = value => text(value).match(/\/categoria\/(\d+)/i)?.[1] || '';
const liMeta = p => p?.loja_integrada && typeof p.loja_integrada === 'object' ? p.loja_integrada : {};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
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
async function fbPut(path, value) {
  return jsonFetch(`${FIREBASE}/${path}.json`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(value) });
}
async function li(path) {
  const wait = Math.max(0, SPACING_MS - (Date.now() - lastLi));
  if (wait) await sleep(wait);
  lastLi = Date.now();
  return jsonFetch(`${LI_BASE}${path}`, { headers: { Authorization: AUTH, Accept: 'application/json', 'User-Agent': 'CanecaFacil-Cutover-Readiness/1.1' } });
}
function expectedImages(p = {}) {
  return [p.mockup_1, p.mockup_2, p.vitrine_horizontal_quadrada || p.vitrine_loja_integrada?.url || p.loja_integrada_horizontal_quadrada || liMeta(p).horizontal_quadrada].map(text).filter(Boolean);
}
function exactSku(objects = [], sku = '') { return objects.filter(item => norm(item?.sku) === norm(sku)); }
function almost(a, b) { return Math.abs(num(a) - num(b)) < 0.011; }

const started = Date.now();
const [products, catalog, opsQueue] = await Promise.all([
  fbGet('produtos'),
  fbGet('canecas/integracoes/loja_integrada/catalog_refs'),
  fbGet('canecas/integracoes/github_ops/fila').catch(() => ({})),
]);
const matches = Object.entries(products || {}).filter(([, p]) => p && norm(p.codigo || p.sku) === norm(SKU));
if (matches.length !== 1) throw new Error(`Produto canário ${SKU}: esperado 1 registro no Firebase, encontrado(s) ${matches.length}.`);
const [firebaseKey, local] = matches[0];
const localLi = liMeta(local);
const catalogCount = Number(catalog?.total_categorias || Object.keys(catalog?.categorias_lista || {}).length || 0);

const searchStart = Date.now();
const search = await li(`/produto?sku=${encodeURIComponent(SKU)}&limit=5`);
const exact = exactSku(Array.isArray(search?.objects) ? search.objects : [], SKU);
const searchMs = Date.now() - searchStart;
if (exact.length !== 1) throw new Error(`Busca SKU ${SKU}: esperado 1 resultado exato, encontrado(s) ${exact.length}.`);
const productId = String(exact[0].id || '');
const getStart = Date.now();
const remote = await li(`/produto/${encodeURIComponent(productId)}?descricao_completa=1`);
const getMs = Date.now() - getStart;

const localProductId = text(localLi.produto_id || local.loja_integrada_product_id);
const localCategoryUri = text(local.loja_integrada_categoria_uri || localLi.categoria_uri);
const remoteCategories = (Array.isArray(remote?.categorias) ? remote.categorias : []).map(item => typeof item === 'string' ? item : item?.resource_uri || item?.uri).map(text).filter(Boolean);
const localCatId = categoryId(localCategoryUri);
const remoteCatIds = remoteCategories.map(categoryId).filter(Boolean);
const images = expectedImages(local);
const syncedImages = (Array.isArray(localLi.synced_storefront_images) ? localLi.synced_storefront_images : []).map(text).filter(Boolean);
const remoteImages = Array.isArray(remote?.imagens) ? remote.imagens : [];
const genericQueueRows = Object.values(opsQueue || {}).filter(Boolean);
const genericPending = genericQueueRows.filter(item => ['pendente','erro',''].includes(text(item?.status))).length;

const checks = [
  ['catalogo_categorias', catalogCount > 0 && catalog?.via === 'github_actions', `${catalogCount} categorias · via=${text(catalog?.via) || '?'}`],
  ['buscar_produto_por_sku', Boolean(exact.length === 1 && productId), `ID ${productId} · ${searchMs}ms`],
  ['ler_produto_por_id', norm(remote?.sku) === norm(SKU), `${getMs}ms`],
  ['vinculo_firebase_li', localProductId === productId, `Firebase=${localProductId || '?'} · LI=${productId}`],
  ['sincronizacao_produto_v4', text(localLi.sync_via) === 'github_actions' && text(localLi.sync_status) === 'sincronizado', `via=${text(localLi.sync_via) || '?'} · status=${text(localLi.sync_status) || '?'}`],
  ['categoria', Boolean(localCatId) && remoteCatIds.includes(localCatId), `Firebase=${localCatId || '?'} · LI=${remoteCatIds.join(',') || 'vazia'}`],
  ['preco', almost(local.preco, remote?.preco_cheio), `Firebase=${num(local.preco)} · LI=${num(remote?.preco_cheio)}`],
  ['estoque', Math.floor(num(local.estoque)) === Math.floor(num(remote?.estoque_quantidade)), `Firebase=${Math.floor(num(local.estoque))} · LI=${Math.floor(num(remote?.estoque_quantidade))}`],
  ['seo', Boolean(text(remote?.seo_title)) && Boolean(text(remote?.seo_description)), `title=${Boolean(text(remote?.seo_title))} · description=${Boolean(text(remote?.seo_description))}`],
  ['galeria_3_imagens', images.length === EXPECTED_IMAGES && new Set(images).size === EXPECTED_IMAGES && remoteImages.length === EXPECTED_IMAGES && syncedImages.length === EXPECTED_IMAGES, `origem=${images.length} · LI=${remoteImages.length} · synced=${syncedImages.length}`],
  ['fila_github_ops', genericPending === 0, `total=${genericQueueRows.length} · pendentes=${genericPending}`],
];

let coreFailed = 0;
const checkObject = {};
console.log('CUTOVER READINESS · GitHub → Loja Integrada');
for (const [name, ok, detail] of checks) {
  if (!ok) coreFailed += 1;
  checkObject[name] = { pronto: Boolean(ok), detalhe: detail };
  console.log(`${ok ? 'PRONTA' : 'BLOQUEADA'} · ${name} · ${detail}`);
}
const elapsedMs = Date.now() - started;
const report = {
  atualizado_em: new Date().toISOString(),
  via: 'github_actions',
  sku_canario: SKU,
  firebase_key: firebaseKey,
  produto_id_li: productId,
  nucleo: { total: checks.length, prontas: checks.length - coreFailed, bloqueadas: coreFailed, status: coreFailed ? 'bloqueado' : 'pronto' },
  email_resend: { status: HAS_RESEND ? 'pronto_para_canario' : 'bloqueado_secret_ausente', secret_configurado: HAS_RESEND },
  openai: { status: 'manter_make' },
  make_cenario: { status: 'nao_alterado' },
  desempenho_ms: { buscar_sku: searchMs, ler_produto: getMs, verificacao_total: elapsedMs },
  checks: checkObject,
};
if (PUBLISH) {
  await fbPut(STATUS_PATH, report);
  console.log(`STATUS · publicado no Firebase · ${STATUS_PATH}`);
}
console.log(`${HAS_RESEND ? 'PRONTA_PARA_CANARIO' : 'BLOQUEADA'} · email_resend · ${HAS_RESEND ? 'secret configurado; falta canário de envio controlado' : 'RESEND_API_KEY ausente; NÃO cortar e-mail do Make'}`);
console.log('NAO_CORTAR_AINDA · make_openai · geração/personalização por OpenAI permanece no Make');
console.log('NAO_ALTERADO · make_cenario · nenhum módulo Make foi removido nesta fase');
console.log(`CUTOVER READINESS · SKU=${SKU} · core_bloqueios=${coreFailed} · ${elapsedMs}ms`);
if (coreFailed) process.exitCode = 2;
