import crypto from 'node:crypto';

const FIREBASE = (process.env.FIREBASE_BASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/, '');
const LI_BASE = (process.env.LOJA_INTEGRADA_BASE_URL || 'https://api.awsli.com.br/v1').replace(/\/$/, '');
const AUTH = String(process.env.LOJA_INTEGRADA_AUTHORIZATION || '').trim();
const LIMIT = Math.max(1, Math.min(200, Number(process.env.LIMIT || 30) || 30));
const PRODUCT_KEY = String(process.env.PRODUCT_KEY || '').trim();
const FORCE = /^(1|true|yes)$/i.test(String(process.env.FORCE || ''));
const RUN_ID = String(process.env.GITHUB_RUN_ID || `local-${Date.now()}`);
const QUEUE = 'canecas/integracoes/loja_integrada/fila';
const REFS = 'canecas/integracoes/loja_integrada/catalog_refs';
const DEFAULTS = Object.freeze({
  brandName: 'Caneca Fácil',
  categoryPersonal: 'Canecas Personalizáveis',
  categoryStandard: 'Canecas Padronizadas',
  categoryBusiness: 'Canecas para Empresas',
  ncm: '69111090',
  personalizerBase: 'https://canecafacil.com.br/personalizar/',
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = v => String(v ?? '').trim();
const norm = v => text(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const num = v => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const digits = v => text(v).replace(/\D+/g, '');
const slug = v => norm(v).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 140) || `caneca-${Date.now()}`;
const esc = v => text(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const pathKey = v => encodeURIComponent(text(v));
const parseResourceId = (uri, type) => text(uri).replace(`/api/v1/${type}/`, '').replaceAll('/', '');
const now = () => new Date().toISOString();

if (!AUTH) throw new Error('Secret LOJA_INTEGRADA_AUTHORIZATION não configurado no GitHub Actions.');

async function jsonFetch(url, options = {}, { allow404 = false } = {}) {
  const response = await fetch(url, options);
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
  if (allow404 && response.status === 404) return null;
  if (!response.ok) {
    const message = data?.error_message || data?.detail || data?.message || data?.error || raw || `${response.status}`;
    const error = new Error(`${response.status} ${message}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}
async function fbGet(path) { return jsonFetch(`${FIREBASE}/${path}.json`, { headers: { Accept: 'application/json' } }); }
async function fbPatch(path, value) { return jsonFetch(`${FIREBASE}/${path}.json`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(value) }); }
async function fbPut(path, value) { return jsonFetch(`${FIREBASE}/${path}.json`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(value) }); }

let lastLi = 0;
async function li(path, { method = 'GET', body = undefined, allow404 = false } = {}) {
  const wait = Math.max(0, 360 - (Date.now() - lastLi));
  if (wait) await sleep(wait);
  lastLi = Date.now();
  return jsonFetch(`${LI_BASE}${path}`, {
    method,
    headers: { Authorization: AUTH, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), 'User-Agent': 'CanecaFacil-GitHub-Sync/1.0' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }, { allow404 });
}

function isPersonalizable(p = {}) { return p.personalizavel === true || p.loja_integrada_personalizavel === true || p.canecafacil_personalizavel === true || p.personalizacao_publica === true; }
function liActive(p = {}) { if (p.loja_integrada_ativo === true) return true; if (p.loja_integrada_ativo === false) return false; return p.canecafacil_ativo === true; }
function liMeta(p = {}) { return p.loja_integrada && typeof p.loja_integrada === 'object' ? p.loja_integrada : {}; }
function categoryType(p = {}) { return text(p.loja_integrada_categoria_tipo || liMeta(p).categoria_tipo || p.canecafacil_categoria_tipo) || (isPersonalizable(p) ? 'personalizaveis' : 'padronizadas'); }
function categoryName(type) { if (type === 'empresas') return DEFAULTS.categoryBusiness; if (type === 'personalizaveis') return DEFAULTS.categoryPersonal; return DEFAULTS.categoryStandard; }
function storefrontImages(p = {}) { return [p.mockup_1, p.mockup_2, p.vitrine_recorte_esquerda || p.vitrine_recortes?.esquerda, p.vitrine_recorte_centro || p.vitrine_recortes?.centro, p.vitrine_recorte_direita || p.vitrine_recortes?.direita].map(text); }
function baseDescription(p = {}) { return text(p.descricao_completa || p.descricao || '').replace(/<div[^>]*class=["'][^"']*cf-personalizer-box[^"']*["'][\s\S]*?<\/div>/gi, '').replace(/<a[^>]*>PERSONALIZAR ESTA CANECA<\/a>/gi, '').trim(); }
function description(p, key) {
  const base = baseDescription(p);
  if (!isPersonalizable(p)) return base;
  const link = `${DEFAULTS.personalizerBase}?model=${encodeURIComponent(key)}&return=${encodeURIComponent('https://canecafacil.com.br/')}`;
  return `${base}\n<div class="cf-personalizer-box" style="margin:18px 0;padding:16px;border:1px solid #e8e8e3;border-radius:12px;text-align:center">\n<strong style="display:block;margin-bottom:8px">Personalize esta caneca</strong>\n<a class="cf-personalize-link" href="${esc(link)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:9px;font-weight:700">PERSONALIZAR ESTA CANECA</a>\n</div>`.trim();
}
function aliasOf(p = {}, key = '') { const li = liMeta(p); const current = slug(p.loja_integrada_alias || li.alias); if (current) return current; const base = slug(p.nome || 'caneca'); const suffix = slug(p.codigo || p.sku || key).slice(-30); return slug(`${base}-${suffix}`); }
function productBody(p, key, refs) { return { id_externo: null, sku: text(p.codigo || p.sku), mpn: text(p.mpn) || null, ncm: digits(p.ncm || DEFAULTS.ncm) || null, gtin: digits(p.gtin || p.ean || p.codigo_barras) || null, nome: text(p.nome), apelido: aliasOf(p, key), descricao_completa: description(p, key), ativo: liActive(p), destaque: p.destaque === true, peso: num(p.peso_embalado_kg || p.peso) || null, altura: Math.ceil(num(p.altura_embalada_cm || p.altura)) || null, largura: Math.ceil(num(p.largura_embalada_cm || p.largura)) || null, profundidade: Math.ceil(num(p.comprimento_embalado_cm || p.comprimento)) || null, tipo: 'normal', usado: p.usado === true, categorias: [refs.categoryUri], marca: refs.brandUri, removido: false, url_video_youtube: text(p.url_video_youtube || p.video_youtube || p.youtube_url) || null }; }
function priceBody(p = {}) { return { cheio: num(p.preco), custo: num(p.preco_custo || p.custo), sob_consulta: p.preco_sob_consulta === true, promocional: num(p.preco_oferta || p.preco_promocional) }; }
function stockBody(p = {}) { return { gerenciado: p.estoque_gerenciado !== false, quantidade: Math.max(0, Math.floor(num(p.estoque))), situacao_em_estoque: Math.min(90, Math.max(0, Math.floor(num(p.estoque_situacao_em_estoque)))), situacao_sem_estoque: Number(p.estoque_situacao_sem_estoque ?? -1) }; }
function seoBody(p = {}) { return { title: text(p.seo_title || p.seo_tag_title || p.nome).slice(0, 70), keyword: text(p.seo_keywords || (Array.isArray(p.tags) ? p.tags.join(', ') : p.tags || '')), description: text(p.seo_description || p.seo_tag_description || p.meta_description || `${p.nome || 'Caneca'} em porcelana. Compre na CanecaFácil.`).slice(0, 250) }; }
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
  if (storefrontImages(p).some(x => !/^https?:\/\//i.test(x))) missing.push('5 imagens da vitrine');
  return missing;
}
async function listAll(endpoint) { let offset = 0; const limit = 100; const objects = []; while (offset < 1000) { const data = await li(`${endpoint}?limit=${limit}&offset=${offset}`); const batch = Array.isArray(data?.objects) ? data.objects : []; objects.push(...batch); if (batch.length < limit) break; offset += limit; } return objects; }
let cachedRefs = null;
async function resolveRefs(p) {
  if (!cachedRefs) {
    const brands = await listAll('/marca');
    const categories = await listAll('/categoria');
    cachedRefs = { brands, categories };
    const brandMap = {}, categoryMap = {};
    for (const item of brands) if (item?.nome && item?.resource_uri) brandMap[item.nome] = item.resource_uri;
    for (const item of categories) if (item?.nome && item?.resource_uri) categoryMap[item.nome] = item.resource_uri;
    await fbPut(REFS, { marcas: brandMap, categorias: categoryMap, atualizado_em: now(), via: 'github_actions' });
  }
  const cName = categoryName(categoryType(p));
  const brand = cachedRefs.brands.find(x => norm(x?.nome) === norm(DEFAULTS.brandName));
  const category = cachedRefs.categories.find(x => norm(x?.nome) === norm(cName));
  if (!brand?.resource_uri) throw new Error(`Marca "${DEFAULTS.brandName}" não encontrada na Loja Integrada.`);
  if (!category?.resource_uri) throw new Error(`Categoria "${cName}" não encontrada na Loja Integrada.`);
  return { brandUri: brand.resource_uri, categoryUri: category.resource_uri, brandName: DEFAULTS.brandName, categoryName: cName };
}
async function findBySku(sku) { const data = await li(`/produto?sku=${encodeURIComponent(sku)}&limit=5`); const objects = Array.isArray(data?.objects) ? data.objects : []; const exact = objects.filter(x => norm(x?.sku) === norm(sku)); if (exact.length > 1) throw new Error(`SKU ${sku} retornou ${exact.length} produtos na Loja Integrada.`); return exact[0] || null; }
async function fetchProduct(id) { return li(`/produto/${encodeURIComponent(id)}?descricao_completa=1`, { allow404: true }); }
async function resolveRemoteProduct(p) {
  const sku = text(p.codigo || p.sku);
  const found = await findBySku(sku);
  if (found) return { id: String(found.id), existing: true, data: found };
  const linkedId = text(liMeta(p).produto_id);
  if (linkedId) {
    const byId = await fetchProduct(linkedId);
    if (byId) {
      if (text(byId.sku) && norm(byId.sku) !== norm(sku)) throw new Error(`ID ${linkedId} pertence ao SKU ${byId.sku}, não ao SKU ${sku}.`);
      return { id: linkedId, existing: true, data: byId };
    }
  }
  return { id: '', existing: false, data: null };
}
function imageIds(remote = {}) { return (Array.isArray(remote?.imagens) ? remote.imagens : []).map(item => text(item?.id)).filter(Boolean); }
async function replaceImages(productId, urls, remote) {
  for (const id of imageIds(remote)) { try { await li(`/produto_imagem/${encodeURIComponent(id)}`, { method: 'DELETE' }); } catch (error) { if (error.status !== 404) throw error; } }
  const ids = [];
  for (const url of urls) { const created = await li('/produto_imagem', { method: 'POST', body: { produto: `/api/v1/produto/${productId}`, imagem_url: url } }); if (created?.id) ids.push(String(created.id)); }
  return ids;
}
function syncFingerprint(p, refs) { return crypto.createHash('sha256').update(JSON.stringify({ product: productBody(p, text(p.firebaseKey || p.id || ''), refs), price: priceBody(p), stock: stockBody(p), seo: seoBody(p), images: storefrontImages(p) })).digest('hex'); }
async function markQueue(queueKey, patch) { return fbPatch(`${QUEUE}/${pathKey(queueKey)}`, patch); }
async function markProduct(key, patch) { return fbPatch(`produtos/${pathKey(key)}`, patch); }

async function syncOne(queueKey, item) {
  const key = text(item.product_key || queueKey);
  await markQueue(queueKey, { status: 'processando', worker: RUN_ID, iniciado_em: now(), erro: '' });
  let p = null;
  try {
    p = await fbGet(`produtos/${pathKey(key)}`);
    if (!p) throw new Error('Produto não encontrado no Firebase.');
    p.firebaseKey = key;
    const missing = validation(p);
    if (missing.length) {
      if (missing.length === 1 && missing[0] === '5 imagens da vitrine') {
        await markQueue(queueKey, { status: 'aguardando_imagens', erro: 'Aguardando GitHub Actions concluir as 5 imagens da vitrine.', tentativas: Number(item.tentativas || 0), atualizado_em: now() });
        await markProduct(key, { loja_integrada: { ...liMeta(p), sync_status: 'pendente', sync_error: 'Aguardando 5 imagens da vitrine.', sync_via: 'github_actions' } });
        return { status: 'waiting' };
      }
      throw new Error(`Cadastro incompleto: ${missing.join(', ')}.`);
    }
    const refs = await resolveRefs(p);
    const remoteRef = await resolveRemoteProduct(p);
    let productId = remoteRef.id;
    let product = remoteRef.data;
    const body = productBody(p, key, refs);
    if (remoteRef.existing) product = await li(`/produto/${productId}`, { method: 'PUT', body });
    else {
      product = await li('/produto', { method: 'POST', body });
      productId = String(product?.id || '');
      if (!productId) throw new Error('Loja Integrada criou o produto sem retornar ID.');
      await markProduct(key, { loja_integrada: { ...liMeta(p), produto_id: productId, resource_uri: product?.resource_uri || '', sync_status: 'enviando', sync_error: '', checkpoint_at: now(), sync_via: 'github_actions' } });
    }
    const fresh = await fetchProduct(productId) || product || {};
    const seoId = parseResourceId(fresh?.seo || product?.seo || liMeta(p).seo_id, 'seo') || text(liMeta(p).seo_id);
    await li(`/produto_preco/${productId}`, { method: 'PUT', body: priceBody(p) });
    await li(`/produto_estoque/${productId}`, { method: 'PUT', body: stockBody(p) });
    const ids = await replaceImages(productId, storefrontImages(p), fresh);
    if (seoId) await li(`/seo/${seoId}`, { method: 'PUT', body: seoBody(p) });
    const alias = aliasOf(p, key);
    await li(`/produto/${productId}/alias?replace_main=true`, { method: 'PUT', body: { absolute_path: `/${alias}` } });
    const confirmed = await fetchProduct(productId) || {};
    const at = now();
    const nextLi = { ...liMeta(p), produto_id: productId, seo_id: seoId, resource_uri: text(confirmed.resource_uri || product?.resource_uri), url: text(confirmed.url || product?.url), alias, marca_uri: refs.brandUri, marca_nome: refs.brandName, categoria_uri: refs.categoryUri, categoria_nome: refs.categoryName, categoria_tipo: categoryType(p), image_ids: ids, sync_status: 'sincronizado', sync_error: '', sync_at: at, sync_via: 'github_actions', sync_worker: RUN_ID, sync_fingerprint: syncFingerprint(p, refs), ativo: liActive(p), personalizavel: isPersonalizable(p), synced_storefront_images: storefrontImages(p), synced_arte_horizontal: text(p.arte_horizontal || p.arte_personalizacao || p.arte_impressao?.url), tipo_producao: 'revenda', origem_mercadoria: '0' };
    await markProduct(key, { loja_integrada: nextLi, loja_integrada_alias: alias, loja_integrada_marca_uri: refs.brandUri, loja_integrada_categoria_uri: refs.categoryUri, updated_at: at, last_update: Date.now() });
    await markQueue(queueKey, { status: 'concluido', produto_id: productId, seo_id: seoId, atualizado_em: at, concluido_em: at, erro: '', worker: RUN_ID, tentativas: Number(item.tentativas || 0) + 1 });
    console.log(`OK ${key} · SKU ${body.sku} · ${remoteRef.existing ? 'UPDATE' : 'CREATE'} · ID ${productId}`);
    return { status: 'ok' };
  } catch (error) {
    const message = String(error?.message || error).slice(0, 800);
    const attempts = Number(item.tentativas || 0) + 1;
    const at = now();
    await markQueue(queueKey, { status: attempts >= 3 ? 'erro_final' : 'erro', erro: message, atualizado_em: at, tentativas: attempts, worker: RUN_ID }).catch(() => {});
    if (p) await markProduct(key, { loja_integrada: { ...liMeta(p), sync_status: 'erro', sync_error: message, sync_at: at, sync_via: 'github_actions' } }).catch(() => {});
    console.error(`ERRO ${key} · ${message}`);
    return { status: 'error', error: message };
  }
}

const queue = await fbGet(`${QUEUE}`) || {};
let items = Object.entries(queue).map(([queueKey, item]) => ({ queueKey, item: item || {} }));
if (PRODUCT_KEY) items = items.filter(({ item }) => text(item.product_key) === PRODUCT_KEY);
items = items.filter(({ item }) => { const status = text(item.status); if (FORCE) return status !== 'processando'; if (status === 'erro') return Number(item.tentativas || 0) < 3; return ['pendente', 'aguardando_imagens', ''].includes(status); });
items.sort((a, b) => text(a.item.solicitado_em).localeCompare(text(b.item.solicitado_em)));
items = items.slice(0, LIMIT);
console.log(`CanecaFácil LI Sync · fila=${items.length} · limit=${LIMIT} · product=${PRODUCT_KEY || 'todos'} · force=${FORCE}`);
let ok = 0, waiting = 0, errors = 0;
for (const { queueKey, item } of items) { const result = await syncOne(queueKey, item); if (result.status === 'ok') ok += 1; else if (result.status === 'waiting') waiting += 1; else errors += 1; }
console.log(`RESUMO · sincronizados=${ok} · aguardando_imagens=${waiting} · erros=${errors}`);
if (errors) process.exitCode = 2;
