import crypto from 'node:crypto';

const FIREBASE = (process.env.FIREBASE_BASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/, '');
const LI_BASE = (process.env.LOJA_INTEGRADA_BASE_URL || 'https://api.awsli.com.br/v1').replace(/\/$/, '');
const AUTH = String(process.env.LOJA_INTEGRADA_AUTHORIZATION || '').trim();
const LIMIT = Math.max(1, Math.min(100, Number(process.env.LIMIT || 10) || 10));
const PRODUCT_KEY = String(process.env.PRODUCT_KEY || '').trim();
const FORCE = /^(1|true|yes)$/i.test(String(process.env.FORCE || ''));
const RUN_ID = String(process.env.GITHUB_RUN_ID || `local-${Date.now()}`);
const QUEUE = 'canecas/integracoes/loja_integrada/fila';
const REFS = 'canecas/integracoes/loja_integrada/catalog_refs';
const REQUEST_SPACING_MS = 800;
const STALE_PROCESSING_MS = 20 * 60 * 1000;
const DEFAULTS = Object.freeze({
  categoryPersonal: 'Canecas Personalizáveis',
  categoryStandard: 'Canecas Padronizadas',
  categoryBusiness: 'Canecas para Empresas',
  ncm: '69111090',
  personalizerBase: 'https://donaantonia.com.br/loja-integrada/personalizar/',
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const text = value => String(value ?? '').trim();
const norm = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const num = value => { const n = Number(String(value ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const digits = value => text(value).replace(/\D+/g, '');
const slug = value => norm(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 140) || `caneca-${Date.now()}`;
const esc = value => text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pathKey = value => encodeURIComponent(text(value));
const parseResourceId = (uri, type) => text(uri).replace(`/api/v1/${type}/`, '').replaceAll('/', '');
const now = () => new Date().toISOString();
const isoAfterMinutes = minutes => new Date(Date.now() + Math.max(1, minutes) * 60_000).toISOString();

if (!AUTH) throw new Error('Secret LOJA_INTEGRADA_AUTHORIZATION não configurado no GitHub Actions.');

async function jsonFetch(url, options = {}, { allow404 = false } = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (cause) {
    const error = new Error(`Falha de rede: ${cause?.message || cause}`);
    error.network = true;
    error.cause = cause;
    throw error;
  }
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
  if (allow404 && response.status === 404) return null;
  if (!response.ok) {
    const message = data?.error_message || data?.detail || data?.message || data?.error || raw || `${response.status}`;
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
async function fbPut(path, value) {
  return jsonFetch(`${FIREBASE}/${path}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(value),
  });
}

function retryableHttp(error) {
  const status = Number(error?.status || 0);
  return Boolean(error?.network || [408, 425, 429, 500, 502, 503, 504].includes(status));
}
function requestRetryDelay(error, attempt) {
  if (Number(error?.retryAfterMs) > 0) return Math.min(30_000, Number(error.retryAfterMs));
  return Math.min(12_000, 1200 * (2 ** attempt));
}

let lastLi = 0;
async function li(path, { method = 'GET', body = undefined, allow404 = false } = {}) {
  const idempotent = ['GET', 'PUT', 'DELETE', 'PATCH'].includes(method);
  const maxAttempts = idempotent ? 4 : 1;
  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const wait = Math.max(0, REQUEST_SPACING_MS - (Date.now() - lastLi));
    if (wait) await sleep(wait);
    lastLi = Date.now();
    try {
      return await jsonFetch(`${LI_BASE}${path}`, {
        method,
        headers: {
          Authorization: AUTH,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          'User-Agent': 'CanecaFacil-GitHub-Sync/2.0',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }, { allow404 });
    } catch (error) {
      lastError = error;
      if (!idempotent || !retryableHttp(error) || attempt >= maxAttempts - 1) throw error;
      const delay = requestRetryDelay(error, attempt);
      console.warn(`RETRY HTTP ${method} ${path} · tentativa ${attempt + 2}/${maxAttempts} em ${Math.round(delay / 1000)}s · ${error.message}`);
      await sleep(delay);
    }
  }
  throw lastError;
}

function isPersonalizable(p = {}) {
  return p.personalizavel === true || p.loja_integrada_personalizavel === true || p.canecafacil_personalizavel === true || p.personalizacao_publica === true;
}
function liActive(p = {}) {
  if (p.loja_integrada_ativo === true) return true;
  if (p.loja_integrada_ativo === false) return false;
  return p.canecafacil_ativo === true;
}
function liMeta(p = {}) { return p.loja_integrada && typeof p.loja_integrada === 'object' ? p.loja_integrada : {}; }
function categoryType(p = {}) {
  return text(p.loja_integrada_categoria_tipo || liMeta(p).categoria_tipo || p.canecafacil_categoria_tipo) || (isPersonalizable(p) ? 'personalizaveis' : 'padronizadas');
}
function categoryName(type) {
  if (type === 'empresas') return DEFAULTS.categoryBusiness;
  if (type === 'personalizaveis') return DEFAULTS.categoryPersonal;
  return DEFAULTS.categoryStandard;
}
function storefrontImages(p = {}) {
  return [
    p.vitrine_recorte_esquerda || p.vitrine_recortes?.esquerda,
    p.vitrine_recorte_direita || p.vitrine_recortes?.direita,
  ].map(text);
}
function baseDescription(p = {}) {
  return text(p.descricao_completa || p.descricao || '')
    .replace(/<div[^>]*class=["'][^"']*cf-personalizer-box[^"']*["'][\s\S]*?<\/div>/gi, '')
    .replace(/<a[^>]*>PERSONALIZAR ESTA CANECA<\/a>/gi, '')
    .trim();
}
function description(p, key) {
  const base = baseDescription(p);
  if (!isPersonalizable(p)) return base;
  const model = encodeURIComponent(key);
  const returnUrl = encodeURIComponent('https://www.canecafacil.com.br/');
  const frameUrl = `https://donaantonia.com.br/loja-integrada/personalizar/?model=${model}&embed=1&return=${returnUrl}`;
  const fields = Object.values(p.personalizacao?.campos || {}).filter(item => item?.ativo === true).length;
  const frameHeight = Math.min(520, Math.max(235, 190 + fields * 48));
  return `${base}
<div class="cf-personalizer-box" style="margin:14px 0 18px;padding:0;border:1px solid #ece8e4;border-radius:12px;overflow:hidden;background:#fff;text-align:left">
<iframe title="Personalizar esta caneca" src="${esc(frameUrl)}" loading="eager" style="display:block;width:100%;height:${frameHeight}px;margin:0;border:0;background:#fff" allow="clipboard-write"></iframe>
</div>`.trim();
}
function stableAlias(p = {}, key = '') {
  const base = slug(p.nome || 'caneca').slice(0, 82);
  const skuPart = slug(p.codigo || p.sku || 'sku').slice(-24);
  const hash = crypto.createHash('sha1').update(text(key) || `${p.nome || ''}|${p.codigo || p.sku || ''}`).digest('hex').slice(0, 8);
  return slug(`${base}-${skuPart}-${hash}`);
}
function aliasOf(p = {}, key = '') {
  const current = slug(p.loja_integrada_alias || liMeta(p).alias);
  return current || stableAlias(p, key);
}
function aliasCandidates(p = {}, key = '', remote = {}) {
  const values = [
    slug(remote?.apelido || remote?.alias || ''),
    aliasOf(p, key),
    stableAlias(p, key),
    slug(`${stableAlias(p, key)}-2`),
    slug(`${stableAlias(p, key)}-3`),
  ].filter(Boolean);
  return [...new Set(values)];
}
function productBody(p, key, refs, alias = aliasOf(p, key)) {
  return {
    id_externo: null,
    sku: text(p.codigo || p.sku),
    mpn: text(p.mpn) || null,
    ncm: digits(p.ncm || DEFAULTS.ncm) || null,
    gtin: digits(p.gtin || p.ean || p.codigo_barras) || null,
    nome: text(p.nome),
    apelido: alias,
    descricao_completa: description(p, key),
    ativo: liActive(p),
    destaque: p.destaque === true,
    peso: num(p.peso_embalado_kg || p.peso) || null,
    altura: Math.ceil(num(p.altura_embalada_cm || p.altura)) || null,
    largura: Math.ceil(num(p.largura_embalada_cm || p.largura)) || null,
    profundidade: Math.ceil(num(p.comprimento_embalado_cm || p.comprimento)) || null,
    tipo: 'normal',
    usado: p.usado === true,
    categorias: [refs.categoryUri],
    removido: false,
    url_video_youtube: text(p.url_video_youtube || p.video_youtube || p.youtube_url) || null,
  };
}
function priceBody(p = {}) {
  return { cheio: num(p.preco), custo: num(p.preco_custo || p.custo), sob_consulta: p.preco_sob_consulta === true, promocional: num(p.preco_oferta || p.preco_promocional) };
}
function stockBody(p = {}) {
  return {
    gerenciado: p.estoque_gerenciado !== false,
    quantidade: Math.max(0, Math.floor(num(p.estoque))),
    situacao_em_estoque: Math.min(90, Math.max(0, Math.floor(num(p.estoque_situacao_em_estoque)))),
    situacao_sem_estoque: Number(p.estoque_situacao_sem_estoque ?? -1),
  };
}
function seoBody(p = {}) {
  return {
    title: text(p.seo_title || p.seo_tag_title || p.nome).slice(0, 70),
    keyword: text(p.seo_keywords || (Array.isArray(p.tags) ? p.tags.join(', ') : p.tags || '')),
    description: text(p.seo_description || p.seo_tag_description || p.meta_description || `${p.nome || 'Caneca'} em porcelana. Compre na CanecaFácil.`).slice(0, 250),
  };
}
function validation(p = {}) {
  const missing = [];
  if (!text(p.nome)) missing.push('nome');
  if (!text(p.codigo || p.sku)) missing.push('SKU');
  if (!(num(p.preco) > 0) && p.preco_sob_consulta !== true) missing.push('preço');
  if (digits(p.ncm || DEFAULTS.ncm).length !== 8) missing.push('NCM');
  if (!(num(p.peso_embalado_kg || p.peso) > 0)) missing.push('peso');
  if (!(num(p.altura_embalada_cm || p.altura) > 0)) missing.push('altura');
  if (!(num(p.largura_embalada_cm || p.largura) > 0)) missing.push('largura');
  if (!(num(p.comprimento_embalado_cm || p.comprimento) > 0)) missing.push('comprimento');
  if (storefrontImages(p).some(url => !/^https?:\/\//i.test(url))) missing.push('2 recortes da vitrine');
  return missing;
}
function validationError(message) {
  const error = new Error(message);
  error.code = 'VALIDATION';
  error.permanent = true;
  return error;
}
function isSlugConflict(error) {
  return Number(error?.status) === 409 && /slug\s+already\s+in\s+use|slug.*uso|apelido|alias/i.test(text(error?.message));
}

async function listAll(endpoint) {
  let offset = 0;
  const limit = 100;
  const objects = [];
  while (offset < 1000) {
    const data = await li(`${endpoint}?limit=${limit}&offset=${offset}`);
    const batch = Array.isArray(data?.objects) ? data.objects : [];
    objects.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  return objects;
}
let cachedRefs = null;
async function resolveRefs(p) {
  if (!cachedRefs) {
    const categories = await listAll('/categoria');
    cachedRefs = { categories };
    const categoryMap = {};
    for (const item of categories) if (item?.nome && item?.resource_uri) categoryMap[item.nome] = item.resource_uri;
    await fbPut(REFS, { marcas: {}, categorias: categoryMap, atualizado_em: now(), via: 'github_actions' });
  }
  const cName = categoryName(categoryType(p));
  const category = cachedRefs.categories.find(item => norm(item?.nome) === norm(cName));
  if (!category?.resource_uri) throw new Error(`Categoria \"${cName}\" não encontrada na Loja Integrada.`);
  return { brandUri: '', categoryUri: category.resource_uri, brandName: '', categoryName: cName };
}
async function findBySku(skuValue) {
  const sku = text(skuValue);
  const data = await li(`/produto?sku=${encodeURIComponent(sku)}&limit=5`);
  const objects = Array.isArray(data?.objects) ? data.objects : [];
  const exact = objects.filter(item => norm(item?.sku) === norm(sku));
  if (exact.length > 1) throw validationError(`SKU ${sku} retornou ${exact.length} produtos na Loja Integrada.`);
  return exact[0] || null;
}
async function fetchProduct(id) {
  return li(`/produto/${encodeURIComponent(id)}?descricao_completa=1`, { allow404: true });
}
async function resolveRemoteProduct(p) {
  const sku = text(p.codigo || p.sku);
  const found = await findBySku(sku);
  if (found) return { id: String(found.id), existing: true, data: found };
  const linkedId = text(liMeta(p).produto_id);
  if (linkedId) {
    const byId = await fetchProduct(linkedId);
    if (byId) {
      if (text(byId.sku) && norm(byId.sku) !== norm(sku)) throw validationError(`ID ${linkedId} pertence ao SKU ${byId.sku}, não ao SKU ${sku}.`);
      return { id: linkedId, existing: true, data: byId };
    }
  }
  return { id: '', existing: false, data: null };
}
function imageIds(remote = {}) {
  return (Array.isArray(remote?.imagens) ? remote.imagens : []).map(item => text(item?.id)).filter(Boolean);
}
async function replaceImages(productId, urls, remote) {
  for (const id of imageIds(remote)) {
    try { await li(`/produto_imagem/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
    catch (error) { if (error.status !== 404) throw error; }
  }
  const ids = [];
  for (const url of urls) {
    const created = await li('/produto_imagem', { method: 'POST', body: { produto: `/api/v1/produto/${productId}`, imagem_url: url } });
    if (created?.id) ids.push(String(created.id));
  }
  return ids;
}
async function writeBaseProduct(remoteRef, p, key, refs) {
  const aliases = aliasCandidates(p, key, remoteRef.data || {});
  let lastError;
  for (const alias of aliases) {
    const body = productBody(p, key, refs, alias);
    try {
      const product = remoteRef.existing
        ? await li(`/produto/${remoteRef.id}`, { method: 'PUT', body })
        : await li('/produto', { method: 'POST', body });
      return { product, alias, body };
    } catch (error) {
      lastError = error;
      if (!isSlugConflict(error)) throw error;
      console.warn(`SLUG ocupado · ${alias} · tentando alternativa segura.`);
    }
  }
  throw lastError || new Error('Não foi possível definir um slug único para o produto.');
}
async function ensureMainAlias(productId, p, key, preferredAlias) {
  const candidates = [...new Set([preferredAlias, ...aliasCandidates(p, key, {})].filter(Boolean))];
  let lastError;
  for (const alias of candidates) {
    try {
      await li(`/produto/${productId}/alias?replace_main=true`, { method: 'PUT', body: { absolute_path: `/${alias}` } });
      return alias;
    } catch (error) {
      lastError = error;
      if (!isSlugConflict(error)) throw error;
      console.warn(`ALIAS ocupado · ${alias} · tentando alternativa segura.`);
    }
  }
  throw lastError || new Error('Não foi possível aplicar um alias único ao produto.');
}
function syncFingerprint(p, refs, alias) {
  return crypto.createHash('sha256').update(JSON.stringify({
    product: productBody(p, text(p.firebaseKey || p.id || ''), refs, alias),
    price: priceBody(p),
    stock: stockBody(p),
    seo: seoBody(p),
    images: storefrontImages(p),
  })).digest('hex');
}
async function markQueue(queueKey, patch) { return fbPatch(`${QUEUE}/${pathKey(queueKey)}`, patch); }
async function markProduct(key, patch) { return fbPatch(`produtos/${pathKey(key)}`, patch); }
async function phase(queueKey, name) {
  return markQueue(queueKey, { etapa: name, etapa_em: now(), worker: RUN_ID });
}

function classifyError(error) {
  const status = Number(error?.status || 0);
  const message = text(error?.message);
  if (error?.permanent || error?.code === 'VALIDATION') return { kind: 'dados', retriable: false, system: false };
  if (status === 401 || status === 403) return { kind: 'autenticacao', retriable: true, system: true, delayMinutes: 60 };
  if (isSlugConflict(error)) return { kind: 'slug', retriable: true, system: false, delayMinutes: 5 };
  if (retryableHttp(error)) return { kind: 'temporario', retriable: true, system: false };
  if ([404, 409].includes(status)) return { kind: 'conflito', retriable: true, system: false, delayMinutes: 15 };
  if ([400, 405, 422].includes(status)) return { kind: 'dados', retriable: false, system: false };
  if (!status && /categoria .*não encontrada/i.test(message)) return { kind: 'catalogo', retriable: true, system: false, delayMinutes: 60 };
  if (!status) return { kind: 'temporario', retriable: true, system: false };
  return { kind: 'dados', retriable: false, system: false };
}
function queueRetryMinutes(attempts, classification) {
  if (classification.delayMinutes) return classification.delayMinutes;
  const schedule = [5, 10, 20, 40, 60, 120, 240, 360];
  return schedule[Math.min(Math.max(0, attempts - 1), schedule.length - 1)];
}
function dueForRetry(item = {}) {
  const at = Date.parse(text(item.proxima_tentativa_em));
  return !Number.isFinite(at) || at <= Date.now();
}
function processingIsStale(item = {}) {
  const at = Date.parse(text(item.iniciado_em || item.atualizado_em));
  return !Number.isFinite(at) || Date.now() - at > STALE_PROCESSING_MS;
}
function eligibleItem(item = {}) {
  const status = text(item.status);
  if (FORCE) return status !== 'processando' || processingIsStale(item);
  if (status === 'concluido' || status === 'bloqueado') return false;
  if (status === 'processando') return processingIsStale(item);
  if (['pendente', 'aguardando_imagens', 'erro', 'erro_final', ''].includes(status)) return dueForRetry(item);
  return false;
}

async function syncOne(queueKey, item) {
  const key = text(item.product_key || queueKey);
  const attempt = Number(item.tentativas || 0) + 1;
  const startedAt = now();
  await markQueue(queueKey, {
    status: 'processando',
    worker: RUN_ID,
    iniciado_em: startedAt,
    atualizado_em: startedAt,
    erro: '',
    etapa: 'inicio',
    tentativa_atual: attempt,
    proxima_tentativa_em: '',
  });

  let p = null;
  try {
    p = await fbGet(`produtos/${pathKey(key)}`);
    if (!p) throw validationError('Produto não encontrado no Firebase.');
    p.firebaseKey = key;

    const missing = validation(p);
    if (missing.length) {
      if (missing.length === 1 && missing[0] === '5 imagens da vitrine') {
        const nextRetry = isoAfterMinutes(5);
        await markQueue(queueKey, {
          status: 'aguardando_imagens',
          erro: 'Aguardando GitHub Actions concluir as 5 imagens da vitrine.',
          tentativas: Number(item.tentativas || 0),
          atualizado_em: now(),
          proxima_tentativa_em: nextRetry,
          etapa: 'aguardando_imagens',
        });
        await markProduct(key, {
          loja_integrada: {
            ...liMeta(p),
            sync_status: 'pendente',
            sync_error: 'Aguardando 5 imagens da vitrine.',
            sync_via: 'github_actions',
            proxima_tentativa_em: nextRetry,
          },
        });
        return { status: 'waiting' };
      }
      throw validationError(`Cadastro incompleto: ${missing.join(', ')}.`);
    }

    await phase(queueKey, 'referencias');
    const refs = await resolveRefs(p);

    await phase(queueKey, 'reconciliar_sku');
    const remoteRef = await resolveRemoteProduct(p);

    await phase(queueKey, remoteRef.existing ? 'atualizar_produto' : 'criar_produto');
    const write = await writeBaseProduct(remoteRef, p, key, refs);
    const productId = remoteRef.id || String(write.product?.id || '');
    if (!productId) throw new Error('Loja Integrada não retornou o ID do produto.');

    await markProduct(key, {
      loja_integrada: {
        ...liMeta(p),
        produto_id: productId,
        resource_uri: write.product?.resource_uri || liMeta(p).resource_uri || '',
        alias: write.alias,
        sync_status: 'enviando',
        sync_error: '',
        checkpoint_at: now(),
        sync_via: 'github_actions',
        sync_etapa: 'produto_salvo',
      },
      loja_integrada_alias: write.alias,
    });
    p = { ...p, loja_integrada: { ...liMeta(p), produto_id: productId, alias: write.alias }, loja_integrada_alias: write.alias };

    await phase(queueKey, 'confirmar_produto');
    const fresh = await fetchProduct(productId) || write.product || {};
    const seoId = parseResourceId(fresh?.seo || write.product?.seo || liMeta(p).seo_id, 'seo') || text(liMeta(p).seo_id);

    await phase(queueKey, 'preco');
    await li(`/produto_preco/${productId}`, { method: 'PUT', body: priceBody(p) });

    await phase(queueKey, 'estoque');
    await li(`/produto_estoque/${productId}`, { method: 'PUT', body: stockBody(p) });

    await phase(queueKey, 'imagens');
    const ids = await replaceImages(productId, storefrontImages(p), fresh);

    if (seoId) {
      await phase(queueKey, 'seo');
      await li(`/seo/${seoId}`, { method: 'PUT', body: seoBody(p) });
    }

    await phase(queueKey, 'alias');
    const finalAlias = await ensureMainAlias(productId, p, key, write.alias);

    await phase(queueKey, 'confirmacao_final');
    const confirmed = await fetchProduct(productId) || {};
    const at = now();
    const nextLi = {
      ...liMeta(p),
      produto_id: productId,
      seo_id: seoId,
      resource_uri: text(confirmed.resource_uri || write.product?.resource_uri),
      url: text(confirmed.url || write.product?.url),
      alias: finalAlias,
      marca_uri: refs.brandUri,
      marca_nome: refs.brandName,
      categoria_uri: refs.categoryUri,
      categoria_nome: refs.categoryName,
      categoria_tipo: categoryType(p),
      image_ids: ids,
      sync_status: 'sincronizado',
      sync_error: '',
      sync_at: at,
      sync_via: 'github_actions',
      sync_worker: RUN_ID,
      sync_fingerprint: syncFingerprint(p, refs, finalAlias),
      sync_etapa: 'concluido',
      ativo: liActive(p),
      personalizavel: isPersonalizable(p),
      synced_storefront_images: storefrontImages(p),
      synced_arte_horizontal: text(p.arte_horizontal || p.arte_personalizacao || p.arte_impressao?.url),
      tipo_producao: 'revenda',
      origem_mercadoria: '0',
      proxima_tentativa_em: '',
    };
    await markProduct(key, {
      loja_integrada: nextLi,
      loja_integrada_alias: finalAlias,
      loja_integrada_marca_uri: refs.brandUri,
      loja_integrada_categoria_uri: refs.categoryUri,
      updated_at: at,
      last_update: Date.now(),
    });
    await markQueue(queueKey, {
      status: 'concluido',
      produto_id: productId,
      seo_id: seoId,
      atualizado_em: at,
      concluido_em: at,
      erro: '',
      worker: RUN_ID,
      tentativas: attempt,
      etapa: 'concluido',
      proxima_tentativa_em: '',
    });
    console.log(`OK ${key} · SKU ${write.body.sku} · ${remoteRef.existing ? 'UPDATE' : 'CREATE'} · ID ${productId} · alias ${finalAlias}`);
    return { status: 'ok' };
  } catch (error) {
    const message = String(error?.message || error).slice(0, 800);
    const classification = classifyError(error);
    const at = now();

    if (classification.retriable) {
      const delayMinutes = queueRetryMinutes(attempt, classification);
      const nextRetry = isoAfterMinutes(delayMinutes);
      await markQueue(queueKey, {
        status: 'pendente',
        erro: message,
        erro_tipo: classification.kind,
        atualizado_em: at,
        tentativas: attempt,
        worker: RUN_ID,
        proxima_tentativa_em: nextRetry,
        etapa: 'aguardando_retry',
      }).catch(() => {});
      if (p) {
        await markProduct(key, {
          loja_integrada: {
            ...liMeta(p),
            sync_status: classification.system ? 'erro_sistema' : 'pendente',
            sync_error: message,
            sync_at: at,
            sync_via: 'github_actions',
            sync_etapa: 'aguardando_retry',
            proxima_tentativa_em: nextRetry,
            tentativas: attempt,
          },
        }).catch(() => {});
      }
      console.warn(`AGENDADO RETRY ${key} · tipo=${classification.kind} · tentativa=${attempt} · próxima=${nextRetry} · ${message}`);
      return { status: classification.system ? 'system_error' : 'retry', error: message };
    }

    await markQueue(queueKey, {
      status: 'bloqueado',
      erro: message,
      erro_tipo: classification.kind,
      atualizado_em: at,
      tentativas: attempt,
      worker: RUN_ID,
      etapa: 'bloqueado',
      proxima_tentativa_em: '',
    }).catch(() => {});
    if (p) {
      await markProduct(key, {
        loja_integrada: {
          ...liMeta(p),
          sync_status: 'erro',
          sync_error: message,
          sync_at: at,
          sync_via: 'github_actions',
          sync_etapa: 'bloqueado',
          tentativas: attempt,
        },
      }).catch(() => {});
    }
    console.error(`BLOQUEADO ${key} · tipo=${classification.kind} · ${message}`);
    return { status: 'blocked', error: message };
  }
}

const queue = await fbGet(QUEUE) || {};
let items = Object.entries(queue).map(([queueKey, item]) => ({ queueKey, item: item || {} }));
if (PRODUCT_KEY) items = items.filter(({ item }) => text(item.product_key) === PRODUCT_KEY);
items = items.filter(({ item }) => eligibleItem(item));
items.sort((a, b) => {
  const aDue = text(a.item.proxima_tentativa_em || a.item.solicitado_em || a.item.atualizado_em);
  const bDue = text(b.item.proxima_tentativa_em || b.item.solicitado_em || b.item.atualizado_em);
  return aDue.localeCompare(bDue);
});
items = items.slice(0, LIMIT);

console.log(`CanecaFácil LI Sync v2 · fila=${items.length} · limit=${LIMIT} · product=${PRODUCT_KEY || 'todos'} · force=${FORCE} · intervalo=${REQUEST_SPACING_MS}ms`);
let ok = 0;
let waiting = 0;
let retries = 0;
let blocked = 0;
let systemErrors = 0;
for (const { queueKey, item } of items) {
  const result = await syncOne(queueKey, item);
  if (result.status === 'ok') ok += 1;
  else if (result.status === 'waiting') waiting += 1;
  else if (result.status === 'retry') retries += 1;
  else if (result.status === 'blocked') blocked += 1;
  else if (result.status === 'system_error') systemErrors += 1;
}
console.log(`RESUMO · sincronizados=${ok} · aguardando_imagens=${waiting} · retries_agendados=${retries} · bloqueados=${blocked} · erros_sistema=${systemErrors}`);

// Erros de produto tratados não derrubam o workflow: a fila já sabe quando tentar novamente.
// Falha de autenticação continua em vermelho para chamar atenção, mas os produtos ficam agendados para nova tentativa automática.
if (systemErrors) process.exitCode = 3;
