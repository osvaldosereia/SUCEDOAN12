// V5: processa retiradas da Loja Integrada antes do sincronizador V4 normal.
// A retirada é idempotente: marca ativo=false/removido=true, confirma remotamente e só então apaga o produto local.
const FIREBASE = (process.env.FIREBASE_BASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/, '');
const LI_BASE = (process.env.LOJA_INTEGRADA_BASE_URL || 'https://api.awsli.com.br/v1').replace(/\/$/, '');
const AUTH = String(process.env.LOJA_INTEGRADA_AUTHORIZATION || '').trim();
const LIMIT = Math.max(1, Math.min(100, Number(process.env.LIMIT || 10) || 10));
const PRODUCT_KEY = String(process.env.PRODUCT_KEY || '').trim();
const RUN_ID = String(process.env.GITHUB_RUN_ID || `local-${Date.now()}`);
const QUEUE = 'canecas/integracoes/loja_integrada/fila';
const REQUEST_SPACING_MS = 800;
const STALE_MS = 20 * 60 * 1000;

const text = v => String(v ?? '').trim();
const pathKey = v => encodeURIComponent(text(v));
const now = () => new Date().toISOString();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

if (!AUTH) throw new Error('Secret LOJA_INTEGRADA_AUTHORIZATION não configurado no GitHub Actions.');

async function jsonFetch(url, options = {}, { allow404 = false } = {}) {
  let response;
  try { response = await fetch(url, options); }
  catch (cause) { const error = new Error(`Falha de rede: ${cause?.message || cause}`); error.network = true; throw error; }
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
  if (allow404 && response.status === 404) return null;
  if (!response.ok) {
    const error = new Error(`${response.status} ${data?.error_message || data?.detail || data?.message || data?.error || raw || response.status}`);
    error.status = response.status;
    const retryAfter = Number(response.headers.get('retry-after'));
    if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfterMs = retryAfter * 1000;
    throw error;
  }
  return data;
}

async function fbGet(path) { return jsonFetch(`${FIREBASE}/${path}.json`, { headers:{ Accept:'application/json' } }); }
async function fbPatch(path, value) { return jsonFetch(`${FIREBASE}/${path}.json`, { method:'PATCH', headers:{ 'Content-Type':'application/json', Accept:'application/json' }, body:JSON.stringify(value) }); }
async function fbDelete(path) { return jsonFetch(`${FIREBASE}/${path}.json`, { method:'DELETE', headers:{ Accept:'application/json' } }); }

function retryable(error) { return Boolean(error?.network || [408,425,429,500,502,503,504].includes(Number(error?.status || 0))); }
let lastLi = 0;
async function li(path, { method='GET', body, allow404=false } = {}) {
  let lastError;
  for (let attempt=0; attempt<4; attempt+=1) {
    const wait = Math.max(0, REQUEST_SPACING_MS - (Date.now() - lastLi));
    if (wait) await sleep(wait);
    lastLi = Date.now();
    try {
      return await jsonFetch(`${LI_BASE}${path}`, {
        method,
        headers:{ Authorization:AUTH, Accept:'application/json', ...(body === undefined ? {} : { 'Content-Type':'application/json' }), 'User-Agent':'CanecaFacil-GitHub-Remove/1.0' },
        ...(body === undefined ? {} : { body:JSON.stringify(body) }),
      }, { allow404 });
    } catch (error) {
      lastError = error;
      if (!retryable(error) || attempt === 3) throw error;
      const delay = Number(error.retryAfterMs) > 0 ? Math.min(30000,error.retryAfterMs) : Math.min(12000,1200*(2**attempt));
      console.warn(`RETRY retirada ${method} ${path} · ${attempt+2}/4 · ${error.message}`);
      await sleep(delay);
    }
  }
  throw lastError;
}

function productIdFrom(product={}, item={}) {
  const liMeta = product?.loja_integrada && typeof product.loja_integrada === 'object' ? product.loja_integrada : {};
  return text(item.loja_integrada_produto_id || item.produto_id || liMeta.produto_id || product.loja_integrada_product_id);
}
function uriOf(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return text(value.resource_uri || value.uri) || null;
}
function removalBody(remote={}) {
  return {
    id_externo: remote.id_externo ?? null,
    sku: text(remote.sku),
    mpn: text(remote.mpn) || null,
    ncm: text(remote.ncm) || null,
    gtin: text(remote.gtin) || null,
    nome: text(remote.nome),
    apelido: text(remote.apelido),
    descricao_completa: remote.descricao_completa ?? null,
    ativo: false,
    bloqueado: remote.bloqueado === true,
    destaque: remote.destaque === true,
    peso: remote.peso ?? null,
    altura: remote.altura ?? null,
    largura: remote.largura ?? null,
    profundidade: remote.profundidade ?? null,
    tipo: text(remote.tipo) || 'normal',
    usado: remote.usado === true,
    categorias: (Array.isArray(remote.categorias) ? remote.categorias : []).map(uriOf).filter(Boolean),
    marca: uriOf(remote.marca),
    removido: true,
    url_video_youtube: text(remote.url_video_youtube) || null,
  };
}
function stale(item={}) {
  const at = Date.parse(text(item.iniciado_em || item.atualizado_em));
  return !Number.isFinite(at) || Date.now()-at > STALE_MS;
}
function eligible(item={}) {
  if (text(item.acao) !== 'remover') return false;
  if (item.status === 'concluido' || item.status === 'bloqueado') return false;
  if (item.status === 'processando') return stale(item);
  return ['pendente','erro','erro_final',''].includes(text(item.status));
}

async function processRemoval(queueKey, item) {
  const key = text(item.product_key || queueKey);
  const started = now();
  await fbPatch(`${QUEUE}/${pathKey(queueKey)}`, { status:'processando', etapa:'retirar_loja_integrada', iniciado_em:started, atualizado_em:started, worker:RUN_ID, erro:'' });
  try {
    const product = await fbGet(`produtos/${pathKey(key)}`).catch(() => null);
    const productId = productIdFrom(product || {}, item);
    if (!productId) throw new Error('Retirada bloqueada: produto da Loja Integrada sem ID confirmado.');

    const remote = await li(`/produto/${encodeURIComponent(productId)}`, { allow404:true });
    if (remote) {
      await li(`/produto/${encodeURIComponent(productId)}`, { method:'PUT', body:removalBody(remote) });
      const confirmed = await li(`/produto/${encodeURIComponent(productId)}`, { allow404:true });
      if (confirmed && confirmed.removido !== true && confirmed.ativo !== false) {
        throw new Error(`Loja Integrada não confirmou a retirada do produto ${productId}.`);
      }
    }

    // Somente após a confirmação remota (ou 404 remoto) o cadastro local é removido.
    if (product) await fbDelete(`produtos/${pathKey(key)}`);
    const at = now();
    await fbPatch(`${QUEUE}/${pathKey(queueKey)}`, {
      status:'concluido', etapa:'removido', produto_id:productId, atualizado_em:at, concluido_em:at,
      removido_loja_integrada:true, removido_firebase:Boolean(product), worker:RUN_ID, erro:'',
    });
    console.log(`REMOVIDO ${key} · LI ${productId} · Firebase ${product ? 'apagado' : 'já ausente'}`);
    return true;
  } catch (error) {
    const at = now();
    const attempts = Number(item.tentativas || 0) + 1;
    const canRetry = retryable(error) || Number(error?.status) === 409;
    await fbPatch(`${QUEUE}/${pathKey(queueKey)}`, {
      status:canRetry ? 'pendente' : 'bloqueado', etapa:canRetry ? 'aguardando_retry_remocao' : 'bloqueado_remocao',
      erro:String(error?.message || error).slice(0,800), atualizado_em:at, tentativas:attempts, worker:RUN_ID,
    }).catch(()=>{});
    console.error(`ERRO REMOÇÃO ${key} · ${error?.message || error}`);
    return false;
  }
}

const queue = (await fbGet(QUEUE).catch(()=>({}))) || {};
let removals = Object.entries(queue).map(([queueKey,item])=>({queueKey,item:item||{}})).filter(({item})=>eligible(item));
if (PRODUCT_KEY) removals = removals.filter(({item})=>text(item.product_key)===PRODUCT_KEY);
removals = removals.slice(0,LIMIT);
console.log(`CanecaFácil LI V5 · retiradas pendentes=${removals.length}`);
for (const {queueKey,item} of removals) await processRemoval(queueKey,item);

// O fluxo normal permanece integralmente no V4/V3/V2.
await import('./sincronizar-loja-integrada-v4.mjs');