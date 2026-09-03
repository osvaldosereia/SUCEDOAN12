const FIREBASE = (process.env.FIREBASE_BASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/, '');
const LI_BASE = (process.env.LOJA_INTEGRADA_BASE_URL || 'https://api.awsli.com.br/v1').replace(/\/$/, '');
const AUTH = String(process.env.LOJA_INTEGRADA_AUTHORIZATION || '').trim();
const PRODUCT_KEY = String(process.env.PRODUCT_KEY || '').trim();
const FORCE = /^(1|true|yes)$/i.test(String(process.env.FORCE || ''));
const LIMIT = Math.max(0, Number(process.env.LIMIT || 0) || 0);
const VERSION = 'li-gallery-v3-two-mockups-horizontal-square';
const REQUEST_SPACING_MS = 850;

const text = v => String(v ?? '').trim();
const norm = v => text(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const isHttp = v => /^https?:\/\//i.test(text(v));
const safeKey = v => encodeURIComponent(text(v));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const now = () => new Date().toISOString();

if (!AUTH) throw new Error('LOJA_INTEGRADA_AUTHORIZATION não configurado.');

async function request(url, options = {}) {
  const r = await fetch(url, options);
  const raw = await r.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
  if (!r.ok) {
    const e = new Error(`${r.status} ${data?.error_message || data?.detail || data?.message || raw || r.statusText}`);
    e.status = r.status;
    const retry = Number(r.headers.get('retry-after'));
    if (retry > 0) e.retryAfterMs = retry * 1000;
    throw e;
  }
  return data;
}

async function fbGet(path) {
  return request(`${FIREBASE}/${path}.json`, { headers:{ Accept:'application/json' } });
}
async function fbPatch(path, data) {
  return request(`${FIREBASE}/${path}.json`, {
    method:'PATCH',
    headers:{ 'Content-Type':'application/json', Accept:'application/json' },
    body:JSON.stringify(data),
  });
}

let lastLi = 0;
async function li(path, { method='GET', body } = {}) {
  const max = ['GET','PUT','DELETE','PATCH'].includes(method) ? 4 : 2;
  let lastError;
  for (let attempt = 0; attempt < max; attempt += 1) {
    const gap = REQUEST_SPACING_MS - (Date.now() - lastLi);
    if (gap > 0) await sleep(gap);
    lastLi = Date.now();
    try {
      return await request(`${LI_BASE}${path}`, {
        method,
        headers:{
          Authorization:AUTH,
          Accept:'application/json',
          ...(body === undefined ? {} : { 'Content-Type':'application/json' }),
          'User-Agent':'CanecaFacil-LI-Gallery-Migration/3.0',
        },
        ...(body === undefined ? {} : { body:JSON.stringify(body) }),
      });
    } catch (error) {
      lastError = error;
      if (![408,425,429,500,502,503,504].includes(Number(error.status)) || attempt === max - 1) throw error;
      await sleep(error.retryAfterMs || Math.min(12000, 1400 * (2 ** attempt)));
    }
  }
  throw lastError;
}

function isMug(p = {}) {
  return norm(`${p.tipo_produto || ''} ${p.categoria || ''} ${p.subcategoria || ''} ${p.nome || ''}`).includes('caneca');
}
function mocks(p = {}) {
  return [
    text(p.mockup_1 || p.imagens_site?.[0] || p.imagens?.[0]),
    text(p.mockup_2 || p.imagens_site?.[1] || p.imagens?.[1]),
  ];
}
function square(p = {}) {
  return text(p.vitrine_horizontal_quadrada || p.vitrine_loja_integrada?.url || p.loja_integrada?.horizontal_quadrada || p.loja_integrada_horizontal_quadrada);
}
function desired(p = {}) {
  return [...mocks(p), square(p)];
}
function same(a, b) {
  return Array.isArray(a) && a.length === b.length && a.every((v, i) => text(v) === text(b[i]));
}

async function migrateOne(key, p) {
  const liMeta = p.loja_integrada && typeof p.loja_integrada === 'object' ? p.loja_integrada : {};
  const productId = text(liMeta.produto_id || p.loja_integrada_product_id);
  const images = desired(p);
  if (!productId) return { status:'skip', reason:'sem produto_id' };
  if (!images.every(isHttp)) return { status:'skip', reason:'mídia 3 imagens incompleta' };
  if (!FORCE && same(liMeta.synced_storefront_images, images) && Array.isArray(liMeta.image_ids) && liMeta.image_ids.length === 3 && liMeta.media_version === VERSION) {
    return { status:'skip', reason:'já sincronizado' };
  }

  await fbPatch(`produtos/${safeKey(key)}/loja_integrada`, {
    sync_status:'enviando_imagens',
    sync_error:'',
    media_version:VERSION,
    horizontal_quadrada:images[2],
  }).catch(() => {});

  const remote = await li(`/produto/${encodeURIComponent(productId)}?descricao_completa=1`);
  const oldIds = (Array.isArray(remote?.imagens) ? remote.imagens : []).map(item => text(item?.id)).filter(Boolean);
  for (const id of oldIds) {
    try { await li(`/produto_imagem/${encodeURIComponent(id)}`, { method:'DELETE' }); }
    catch (error) { if (Number(error.status) !== 404) throw error; }
  }

  const ids = [];
  for (const url of images) {
    const created = await li('/produto_imagem', {
      method:'POST',
      body:{ produto:`/api/v1/produto/${productId}`, imagem_url:url },
    });
    if (created?.id) ids.push(String(created.id));
  }
  if (ids.length !== 3) throw new Error(`Loja Integrada retornou ${ids.length}/3 IDs de imagem.`);

  const at = now();
  await fbPatch(`produtos/${safeKey(key)}/loja_integrada`, {
    image_ids:ids,
    synced_storefront_images:images,
    horizontal_quadrada:images[2],
    media_version:VERSION,
    media_sync_at:at,
    sync_status:'sincronizado',
    sync_error:'',
  });
  return { status:'ok', productId, removed:oldIds.length, ids };
}

const all = await fbGet('produtos') || {};
let rows = Object.entries(all).filter(([,p]) => p && isMug(p));
if (PRODUCT_KEY) rows = rows.filter(([key]) => key === PRODUCT_KEY);
if (LIMIT) rows = rows.slice(0, LIMIT);

console.log(`CanecaFácil · migrar galeria LI para 3 imagens · candidatos=${rows.length} · force=${FORCE}`);
let ok = 0, skipped = 0, errors = 0;
for (const [key,p] of rows) {
  try {
    const result = await migrateOne(key,p);
    if (result.status === 'ok') {
      ok += 1;
      console.log(`LI OK ${key} · produto=${result.productId} · removidas=${result.removed} · novas=3`);
    } else {
      skipped += 1;
      console.log(`SKIP ${key} · ${result.reason}`);
    }
  } catch (error) {
    errors += 1;
    console.error(`LI ERRO ${key} · ${error?.message || error}`);
    await fbPatch(`produtos/${safeKey(key)}/loja_integrada`, {
      sync_status:'erro',
      sync_error:String(error?.message || error).slice(0,700),
      media_version:VERSION,
      media_sync_at:now(),
    }).catch(() => {});
  }
}
console.log(`RESUMO · sincronizados=${ok} · ignorados=${skipped} · erros=${errors}`);
if (errors) process.exitCode = 2;
