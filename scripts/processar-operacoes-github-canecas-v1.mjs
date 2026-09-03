import {
  buildReadyEmail,
  catalogMaps,
  exactSku,
  nowIso,
  retryableStatus,
  text,
} from './canecafacil-github-ops-core-v1.mjs';

const FIREBASE = (process.env.FIREBASE_BASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/, '');
const LI_BASE = (process.env.LOJA_INTEGRADA_BASE_URL || 'https://api.awsli.com.br/v1').replace(/\/$/, '');
const LI_AUTH = text(process.env.LOJA_INTEGRADA_AUTHORIZATION);
const RESEND_KEY = text(process.env.RESEND_API_KEY);
const EMAIL_FROM = text(process.env.EMAIL_FROM) || 'Caneca Fácil <arte@canecafacil.com.br>';
const MODE = text(process.env.MODE || 'readiness').toLowerCase();
const DRY_RUN = !/^(0|false|no)$/i.test(text(process.env.DRY_RUN || 'true'));
const QUEUE = 'canecas/integracoes/github_ops/fila';
const QUEUE_LIMIT = Math.max(1, Math.min(50, Number(process.env.QUEUE_LIMIT || 10) || 10));
const REQUEST_ID = text(process.env.REQUEST_ID);
const RUN_ID = text(process.env.GITHUB_RUN_ID) || `local-${Date.now()}`;
const LI_SPACING_MS = 750;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const key = value => encodeURIComponent(text(value));

async function jsonFetch(url, options = {}, { allow404 = false } = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (cause) {
    const error = new Error(`Falha de rede: ${cause?.message || cause}`);
    error.network = true;
    throw error;
  }
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
  if (allow404 && response.status === 404) return null;
  if (!response.ok) {
    const message = data?.error_message || data?.detail || data?.message || data?.error || raw || String(response.status);
    const error = new Error(`${response.status} ${message}`);
    error.status = response.status;
    error.data = data;
    const retryAfter = Number(response.headers.get('retry-after'));
    if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfterMs = retryAfter * 1000;
    throw error;
  }
  return data;
}

async function fbGet(path) {
  return jsonFetch(`${FIREBASE}/${path}.json`, { headers: { Accept: 'application/json' } });
}
async function fbPatch(path, value) {
  return jsonFetch(`${FIREBASE}/${path}.json`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(value),
  });
}

let lastLi = 0;
async function li(path, { allow404 = false } = {}) {
  if (!LI_AUTH) throw new Error('LOJA_INTEGRADA_AUTHORIZATION ausente.');
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const wait = Math.max(0, LI_SPACING_MS - (Date.now() - lastLi));
    if (wait) await sleep(wait);
    lastLi = Date.now();
    try {
      return await jsonFetch(`${LI_BASE}${path}`, {
        headers: {
          Authorization: LI_AUTH,
          Accept: 'application/json',
          'User-Agent': 'CanecaFacil-GitHub-Ops/1.0',
        },
      }, { allow404 });
    } catch (error) {
      lastError = error;
      const canRetry = error?.network || retryableStatus(error?.status);
      if (!canRetry || attempt >= 3) throw error;
      const delay = Number(error?.retryAfterMs) > 0
        ? Math.min(30_000, Number(error.retryAfterMs))
        : Math.min(10_000, 1000 * (2 ** attempt));
      console.warn(`GITHUB OPS · retry ${attempt + 2}/4 em ${Math.round(delay / 1000)}s · ${error.message}`);
      await sleep(delay);
    }
  }
  throw lastError;
}

async function listAll(endpoint) {
  let offset = 0;
  const objects = [];
  while (offset < 5000) {
    const data = await li(`${endpoint}?limit=100&offset=${offset}`);
    const batch = Array.isArray(data?.objects) ? data.objects : [];
    objects.push(...batch);
    if (batch.length < 100) break;
    offset += 100;
  }
  return objects;
}

async function catalogSnapshot() {
  const [categories, brands] = await Promise.all([listAll('/categoria'), listAll('/marca')]);
  return catalogMaps(categories, brands);
}

async function findProductBySku(skuValue) {
  const sku = text(skuValue);
  if (!sku) throw new Error('SKU ausente.');
  const data = await li(`/produto?sku=${encodeURIComponent(sku)}&limit=5`);
  const objects = Array.isArray(data?.objects) ? data.objects : [];
  return exactSku(objects, sku);
}

async function getProduct(productId) {
  const id = text(productId);
  if (!id) throw new Error('ID do produto Loja Integrada ausente.');
  return li(`/produto/${encodeURIComponent(id)}?descricao_completa=1`, { allow404: true });
}

async function enqueueProductSync(productKey) {
  const product = text(productKey);
  if (!product) throw new Error('product_key ausente.');
  const at = nowIso();
  await fbPatch(`canecas/integracoes/loja_integrada/fila/${key(product)}`, {
    product_key: product,
    status: 'pendente',
    erro: '',
    atualizado_em: at,
    solicitado_via: 'github_ops',
  });
  const current = (await fbGet(`produtos/${key(product)}`).catch(() => null)) || {};
  const liMeta = current.loja_integrada && typeof current.loja_integrada === 'object' ? current.loja_integrada : {};
  await fbPatch(`produtos/${key(product)}`, {
    loja_integrada: {
      ...liMeta,
      sync_status: 'pendente',
      sync_error: '',
      sync_via: 'github_actions',
    },
    updated_at: at,
  });
  return { product_key: product, status: 'pendente', via: 'github_actions' };
}

async function prepareStorefrontMedia(productKey) {
  const product = text(productKey);
  if (!product) throw new Error('product_key ausente.');
  const at = nowIso();
  await fbPatch(`produtos/${key(product)}`, {
    vitrine_loja_integrada_status: 'pendente_github',
    vitrine_loja_integrada_erro: '',
    vitrine_loja_integrada_solicitado_em: at,
    vitrine_loja_integrada_via: 'github_actions',
    updated_at: at,
  });
  return { product_key: product, status: 'pendente_github', via: 'github_actions' };
}

async function sendReadyEmail(payload = {}) {
  const creationCode = text(payload.creation_code || payload.request_id);
  const customerEmail = text(payload.customer_email);
  const artUrl = text(payload.art_url || payload.art_source_url || payload.arte_url);
  const customerName = text(payload.customer_name);
  const email = buildReadyEmail({
    from: EMAIL_FROM,
    to: customerEmail,
    creationCode,
    artUrl,
    customerName,
  });

  if (DRY_RUN) return { sent: false, dry_run: true, to: customerEmail, creation_code: creationCode };
  if (!RESEND_KEY) throw new Error('RESEND_API_KEY ausente no GitHub Secrets.');

  const result = await jsonFetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(email),
  });

  if (creationCode) {
    await fbPatch(`canecas/personalizadas/${key(creationCode)}`, {
      email_status: 'enviado_github',
      email_enviado_em: nowIso(),
      email_provider: 'resend',
      email_via: 'github_actions',
      email_id: text(result?.id),
    }).catch(error => console.warn(`E-mail enviado, mas falhou registro Firebase: ${error.message}`));
  }
  return { sent: true, dry_run: false, id: text(result?.id), creation_code: creationCode };
}

async function executeAction(action, payload = {}) {
  switch (text(action)) {
    case 'loja_integrada_catalog_refs': {
      const snapshot = await catalogSnapshot();
      return {
        total_categorias: snapshot.total_categorias,
        total_marcas: snapshot.total_marcas,
        categorias: snapshot.categorias,
        marcas: snapshot.marcas,
      };
    }
    case 'loja_integrada_find_product_by_sku':
      return { product: await findProductBySku(payload.sku) };
    case 'loja_integrada_get_product':
      return { product: await getProduct(payload.loja_integrada_product_id || payload.product_id) };
    case 'loja_integrada_sync_product':
      return enqueueProductSync(payload.product_key);
    case 'prepare_mug_storefront_media':
      return prepareStorefrontMedia(payload.product_key);
    case 'email_personalizacao_pronta':
      return sendReadyEmail(payload);
    default:
      throw new Error(`Ação GitHub Ops não suportada: ${text(action) || '(vazia)'}`);
  }
}

async function processQueueItem(requestId, task = {}) {
  const path = `${QUEUE}/${key(requestId)}`;
  const startedAt = nowIso();
  await fbPatch(path, {
    status: 'processando',
    worker: RUN_ID,
    iniciado_em: startedAt,
    atualizado_em: startedAt,
    erro: '',
    via: 'github_actions',
  });
  try {
    const result = await executeAction(task.action, task.payload || task);
    await fbPatch(path, {
      status: 'concluido',
      resultado: result,
      concluido_em: nowIso(),
      atualizado_em: nowIso(),
      erro: '',
      via: 'github_actions',
    });
    console.log(`GITHUB OPS · ${requestId} · ${task.action} · concluído`);
    return true;
  } catch (error) {
    await fbPatch(path, {
      status: 'erro',
      erro: text(error?.message || error),
      atualizado_em: nowIso(),
      via: 'github_actions',
    }).catch(() => {});
    console.error(`GITHUB OPS · ${requestId} · ${task.action} · ERRO · ${error?.message || error}`);
    return false;
  }
}

async function runQueue() {
  const queue = (await fbGet(QUEUE).catch(() => ({}))) || {};
  const items = Object.entries(queue)
    .filter(([id, item]) => (!REQUEST_ID || id === REQUEST_ID) && ['pendente', 'erro', ''].includes(text(item?.status)))
    .slice(0, QUEUE_LIMIT);
  if (!items.length) {
    console.log('GITHUB OPS · fila vazia');
    return;
  }
  let failed = 0;
  for (const [id, item] of items) {
    if (!(await processQueueItem(id, item))) failed += 1;
  }
  if (failed) throw new Error(`${failed} operação(ões) GitHub Ops falharam.`);
}

async function readiness() {
  const started = Date.now();
  const snapshot = await catalogSnapshot();
  const elapsed = Date.now() - started;
  if (!snapshot.total_categorias) throw new Error('Readiness falhou: nenhuma categoria retornada pela Loja Integrada.');
  console.log(`READINESS · Loja Integrada OK · categorias=${snapshot.total_categorias} · marcas=${snapshot.total_marcas} · ${elapsed}ms`);
  console.log(`READINESS · Firebase=${FIREBASE}`);
  console.log(`READINESS · Resend=${RESEND_KEY ? 'secret configurado' : 'secret ainda não configurado/necessário somente no corte'}`);
  console.log('READINESS · Make não foi chamado. Nenhuma escrita foi realizada.');
}

if (MODE === 'queue') await runQueue();
else if (MODE === 'readiness') await readiness();
else if (MODE === 'action') {
  const action = text(process.env.ACTION);
  const payload = process.env.PAYLOAD_JSON ? JSON.parse(process.env.PAYLOAD_JSON) : {};
  console.log(JSON.stringify(await executeAction(action, payload), null, 2));
} else {
  throw new Error(`MODE inválido: ${MODE}`);
}
