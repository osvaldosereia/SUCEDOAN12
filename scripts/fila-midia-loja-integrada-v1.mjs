const FIREBASE = (process.env.FIREBASE_BASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/, '');
const QUEUE = 'canecas/integracoes/loja_integrada/midia_fila';
const MODE = String(process.env.MODE || 'claim').trim().toLowerCase();
const PRODUCT_KEY = String(process.env.PRODUCT_KEY || '').trim();
const QUEUE_KEY = String(process.env.QUEUE_KEY || '').trim();
const FORCE = /^(1|true|yes)$/i.test(String(process.env.FORCE || 'false'));
const SOURCE = String(process.env.SOURCE || 'github_actions').trim() || 'github_actions';

const text = value => String(value ?? '').trim();
const now = () => new Date().toISOString();
const safe = value => encodeURIComponent(text(value));
const b64url = value => Buffer.from(text(value), 'utf8').toString('base64url');
const isHttp = value => /^https?:\/\//i.test(text(value));

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
  if (!response.ok) throw new Error(`${response.status} ${data?.error || data?.message || raw || response.statusText}`.trim());
  return data;
}
async function fbGet(path) {
  return jsonFetch(`${FIREBASE}/${path}.json`, { headers: { Accept: 'application/json' } });
}
async function fbPut(path, body) {
  return jsonFetch(`${FIREBASE}/${path}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
}
async function fbPatch(path, body) {
  return jsonFetch(`${FIREBASE}/${path}.json`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
}
function liMeta(p = {}) { return p.loja_integrada && typeof p.loja_integrada === 'object' ? p.loja_integrada : {}; }
function artOf(p = {}) { return text(p.arte_horizontal || p.arte_personalizacao || p.arte_impressao?.url || p.arte_final_url); }
function squareOf(p = {}) { return text(p.vitrine_horizontal_quadrada || p.vitrine_loja_integrada?.url || liMeta(p).horizontal_quadrada || p.loja_integrada_horizontal_quadrada); }
function mediaReady(p = {}) {
  const art = artOf(p);
  const source = text(p.vitrine_loja_integrada?.source_art);
  return Boolean(art && source === art && isHttp(squareOf(p)));
}
async function output(name, value) {
  const file = text(process.env.GITHUB_OUTPUT);
  if (!file) return;
  const fs = await import('node:fs/promises');
  await fs.appendFile(file, `${name}=${String(value).replace(/\r?\n/g, ' ')}\n`);
}

async function enqueue() {
  if (!PRODUCT_KEY) throw new Error('PRODUCT_KEY obrigatório em MODE=enqueue.');
  const key = b64url(PRODUCT_KEY);
  const at = now();
  const old = await fbGet(`${QUEUE}/${safe(key)}`).catch(() => ({})) || {};
  const body = {
    ...old,
    product_key: PRODUCT_KEY,
    status: 'pendente',
    force: FORCE,
    solicitado_em: old.solicitado_em || at,
    atualizado_em: at,
    solicitado_por: SOURCE,
    tentativas: Number(old.tentativas || 0),
    erro: '',
  };
  await fbPut(`${QUEUE}/${safe(key)}`, body);
  await fbPatch(`produtos/${safe(PRODUCT_KEY)}`, {
    vitrine_loja_integrada_status: 'pendente_github',
    vitrine_loja_integrada_erro: '',
    vitrine_loja_integrada_solicitado_em: at,
    vitrine_loja_integrada_via: 'github_actions',
  }).catch(() => {});
  console.log(`MEDIA QUEUE · ENQUEUE · ${PRODUCT_KEY} · force=${FORCE} · via=github_actions`);
  await output('queue_key', key);
  await output('product_key', PRODUCT_KEY);
}

function eligible(item = {}) {
  return ['pendente', 'erro', ''].includes(text(item.status));
}
async function claim() {
  const queue = await fbGet(QUEUE).catch(() => ({})) || {};
  let entries = Object.entries(queue).filter(([, item]) => item && eligible(item));
  if (PRODUCT_KEY) entries = entries.filter(([, item]) => text(item.product_key) === PRODUCT_KEY);
  entries.sort((a, b) => text(a[1].solicitado_em || a[1].atualizado_em).localeCompare(text(b[1].solicitado_em || b[1].atualizado_em)));
  const [key, item] = entries[0] || [];
  if (!key || !item) {
    console.log('MEDIA QUEUE · CLAIM · nenhuma solicitação pendente.');
    await output('has_work', 'false');
    return;
  }
  const at = now();
  await fbPatch(`${QUEUE}/${safe(key)}`, {
    status: 'processando',
    atualizado_em: at,
    iniciado_em: at,
    worker: text(process.env.GITHUB_RUN_ID || 'local'),
    tentativas: Number(item.tentativas || 0) + 1,
    erro: '',
  });
  await output('has_work', 'true');
  await output('queue_key', key);
  await output('product_key', text(item.product_key));
  await output('force', item.force === true ? 'true' : 'false');
  console.log(`MEDIA QUEUE · CLAIM · ${text(item.product_key)} · queue=${key} · force=${item.force === true}`);
}

async function finalize() {
  let key = QUEUE_KEY;
  let productKey = PRODUCT_KEY;
  if (!key && productKey) key = b64url(productKey);
  if (!key) throw new Error('QUEUE_KEY ou PRODUCT_KEY obrigatório em MODE=finalize.');
  const item = await fbGet(`${QUEUE}/${safe(key)}`).catch(() => null);
  if (!productKey) productKey = text(item?.product_key);
  if (!productKey) throw new Error('product_key ausente na solicitação de mídia.');
  const product = await fbGet(`produtos/${safe(productKey)}`).catch(() => null);
  if (!product) throw new Error(`Produto ${productKey} não encontrado no Firebase.`);
  const at = now();
  const productStatus = text(product.vitrine_loja_integrada_status || product.vitrine_loja_integrada?.status);
  if (mediaReady(product)) {
    await Promise.all([
      fbPatch(`${QUEUE}/${safe(key)}`, {
        status: 'concluido',
        atualizado_em: at,
        concluido_em: at,
        erro: '',
        via: 'github_actions',
        media_url: squareOf(product),
      }),
      fbPatch(`produtos/${safe(productKey)}`, {
        vitrine_loja_integrada_status: 'pronto',
        vitrine_loja_integrada_erro: '',
        vitrine_loja_integrada_atualizado_em: at,
        vitrine_loja_integrada_via: 'github_actions',
      }).catch(() => {}),
    ]);
    console.log(`MEDIA QUEUE · FINALIZE OK · ${productKey} · ${squareOf(product)}`);
    return;
  }
  const error = text(product.vitrine_loja_integrada_erro) || (productStatus === 'erro' ? 'processador de mídia informou erro' : 'mídia ainda não confirmada');
  await fbPatch(`${QUEUE}/${safe(key)}`, {
    status: productStatus === 'erro' ? 'erro' : 'pendente',
    atualizado_em: at,
    erro: error,
    via: 'github_actions',
  });
  console.log(`MEDIA QUEUE · FINALIZE PENDENTE · ${productKey} · status=${productStatus || 'sem_status'} · ${error}`);
  if (productStatus === 'erro') process.exitCode = 2;
}

if (MODE === 'enqueue') await enqueue();
else if (MODE === 'finalize') await finalize();
else if (MODE === 'claim') await claim();
else throw new Error(`MODE inválido: ${MODE}`);
