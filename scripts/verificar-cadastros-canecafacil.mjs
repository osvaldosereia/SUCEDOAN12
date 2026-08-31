const FIREBASE = (process.env.FIREBASE_BASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/, '');
const LI_BASE = (process.env.LOJA_INTEGRADA_BASE_URL || 'https://api.awsli.com.br/v1').replace(/\/$/, '');
const AUTH = String(process.env.LOJA_INTEGRADA_AUTHORIZATION || '').trim();
const LIMIT = Math.max(1, Math.min(25, Number(process.env.VERIFY_LIMIT || 10) || 10));
const VERIFY_TTL_MS = Math.max(60, Number(process.env.VERIFY_TTL_MINUTES || 360) || 360) * 60_000;
const REQUEST_SPACING_MS = 800;
const QUEUE = 'canecas/integracoes/loja_integrada/fila';

if (!AUTH) throw new Error('LOJA_INTEGRADA_AUTHORIZATION ausente.');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const text = value => String(value ?? '').trim();
const norm = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const now = () => new Date().toISOString();
const safe = value => encodeURIComponent(text(value));
const queueKey = key => Buffer.from(text(key), 'utf8').toString('base64url');

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
  return { response, data, raw };
}
async function fbGet(path) {
  const { response, data, raw } = await jsonFetch(`${FIREBASE}/${path}.json`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Firebase ${response.status}: ${raw.slice(0, 180)}`);
  return data;
}
async function fbPatch(path, patch) {
  const { response, data, raw } = await jsonFetch(`${FIREBASE}/${path}.json`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error(`Firebase ${response.status}: ${raw.slice(0, 180)}`);
  return data;
}
async function liGetProduct(id) {
  const { response, data, raw } = await jsonFetch(`${LI_BASE}/produto/${encodeURIComponent(id)}`, {
    headers: { Authorization: AUTH, Accept: 'application/json', 'User-Agent': 'CanecaFacil-GitHub-Verify/1.0' },
  });
  if (response.status === 404) return { found: false, status: 404, data: null };
  if (!response.ok) {
    const message = data?.error_message || data?.detail || data?.message || data?.error || raw || String(response.status);
    const error = new Error(`${response.status} ${message}`);
    error.status = response.status;
    throw error;
  }
  return { found: true, status: response.status, data: data || {} };
}
function isMug(product = {}) {
  return norm(`${product.tipo_produto || ''} ${product.categoria || ''} ${product.subcategoria || ''} ${product.nome || ''}`).includes('caneca');
}
function candidate(key, product = {}) {
  if (!isMug(product)) return null;
  const li = product.loja_integrada && typeof product.loja_integrada === 'object' ? product.loja_integrada : {};
  const id = text(li.produto_id);
  if (!id) return null;
  const verifiedAt = Date.parse(text(li.cadastro_confirmado_em));
  if (Number.isFinite(verifiedAt) && Date.now() - verifiedAt < VERIFY_TTL_MS) return null;
  return { key, product, li, id, verifiedAt: Number.isFinite(verifiedAt) ? verifiedAt : 0 };
}
async function enqueueRepair(item, reason) {
  const at = now();
  await fbPatch(`${QUEUE}/${safe(queueKey(item.key))}`, {
    product_key: item.key,
    sku: text(item.product.codigo || item.product.sku),
    nome: text(item.product.nome),
    acao: 'sincronizar',
    status: 'pendente',
    solicitado_em: at,
    atualizado_em: at,
    solicitado_por: 'github_auditoria_loja_integrada',
    erro: reason,
    erro_tipo: 'auditoria',
    proxima_tentativa_em: '',
    etapa: 'reconciliar_cadastro',
  });
}
async function verifyOne(item) {
  const at = now();
  const expectedSku = text(item.product.codigo || item.product.sku);
  const result = await liGetProduct(item.id);
  if (!result.found) {
    const reason = `Produto ID ${item.id} não foi encontrado na Loja Integrada durante a auditoria.`;
    await fbPatch(`produtos/${safe(item.key)}/loja_integrada`, {
      cadastro_confirmado: false,
      cadastro_confirmado_em: at,
      verificacao_erro: reason,
      sync_status: 'pendente',
      sync_error: reason,
      proxima_tentativa_em: '',
    });
    await enqueueRepair(item, reason);
    console.warn(`REPARO AGENDADO ${item.key} · ID ${item.id} ausente.`);
    return 'repair';
  }

  const remoteSku = text(result.data?.sku || result.data?.codigo);
  if (expectedSku && remoteSku && norm(expectedSku) !== norm(remoteSku)) {
    const reason = `ID ${item.id} retornou SKU ${remoteSku}, mas o Firebase espera ${expectedSku}.`;
    await fbPatch(`produtos/${safe(item.key)}/loja_integrada`, {
      cadastro_confirmado: false,
      cadastro_confirmado_em: at,
      verificacao_erro: reason,
      sync_status: 'pendente',
      sync_error: reason,
      proxima_tentativa_em: '',
    });
    await enqueueRepair(item, reason);
    console.warn(`REPARO AGENDADO ${item.key} · divergência de SKU.`);
    return 'repair';
  }

  await fbPatch(`produtos/${safe(item.key)}/loja_integrada`, {
    cadastro_confirmado: true,
    cadastro_confirmado_em: at,
    cadastro_confirmado_produto_id: item.id,
    cadastro_confirmado_sku: remoteSku || expectedSku,
    verificacao_erro: '',
  });
  console.log(`CONFIRMADO ${item.key} · ID ${item.id} · SKU ${remoteSku || expectedSku || '-'}`);
  return 'ok';
}

const products = await fbGet('produtos') || {};
const candidates = Object.entries(products)
  .map(([key, product]) => candidate(key, product || {}))
  .filter(Boolean)
  .sort((a, b) => a.verifiedAt - b.verifiedAt)
  .slice(0, LIMIT);

console.log(`CanecaFácil cadastro audit · candidatos=${candidates.length} · limite=${LIMIT} · validade=${Math.round(VERIFY_TTL_MS / 60_000)}min`);
let ok = 0;
let repair = 0;
let errors = 0;
let authError = false;
for (let i = 0; i < candidates.length; i += 1) {
  if (i) await sleep(REQUEST_SPACING_MS);
  const item = candidates[i];
  try {
    const result = await verifyOne(item);
    if (result === 'ok') ok += 1;
    else if (result === 'repair') repair += 1;
  } catch (error) {
    errors += 1;
    if ([401, 403].includes(Number(error?.status))) authError = true;
    console.error(`ERRO AUDITORIA ${item.key} · ${error?.message || error}`);
  }
}
console.log(`RESUMO AUDITORIA · confirmados=${ok} · reparos_agendados=${repair} · erros=${errors}`);
if (authError) process.exitCode = 3;
