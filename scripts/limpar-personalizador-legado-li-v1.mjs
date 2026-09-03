const FIREBASE = (process.env.FIREBASE_BASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/, '');
const LI_BASE = (process.env.LOJA_INTEGRADA_BASE_URL || 'https://api.awsli.com.br/v1').replace(/\/$/, '');
const AUTH = String(process.env.LOJA_INTEGRADA_AUTHORIZATION || '').trim();
const REQUEST_SPACING_MS = Math.max(450, Number(process.env.REQUEST_SPACING_MS || 850) || 850);
const FULL_AUDIT = !/^(0|false|no)$/i.test(String(process.env.CLEAN_ALL || 'true'));

if (!AUTH) throw new Error('LOJA_INTEGRADA_AUTHORIZATION ausente.');

const text = value => String(value ?? '').trim();
const digits = value => text(value).replace(/\D+/g, '');
const num = value => {
  const n = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const now = () => new Date().toISOString();

function hasLegacy(value = '') {
  const raw = String(value || '');
  return /cf-personalizer-box|cf-personalize-link|\/loja-integrada\/personalizar\//i.test(raw);
}

function stripDivByClass(html, className) {
  let source = String(html || '');
  const wanted = new RegExp(`\\b${className.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'i');
  let cursor = 0;
  let output = '';

  while (cursor < source.length) {
    const openRe = /<div\b[^>]*>/ig;
    openRe.lastIndex = cursor;
    let match = null;
    while ((match = openRe.exec(source))) {
      const tag = match[0];
      const classMatch = tag.match(/\bclass\s*=\s*(["'])([\s\S]*?)\1/i);
      if (classMatch && wanted.test(classMatch[2])) break;
    }
    if (!match) {
      output += source.slice(cursor);
      break;
    }

    output += source.slice(cursor, match.index);
    let depth = 1;
    let end = openRe.lastIndex;
    const divRe = /<\/?div\b[^>]*>/ig;
    divRe.lastIndex = end;
    let tagMatch = null;
    while (depth > 0 && (tagMatch = divRe.exec(source))) {
      if (/^<\/div/i.test(tagMatch[0])) depth -= 1;
      else depth += 1;
      end = divRe.lastIndex;
    }
    cursor = depth === 0 ? end : source.length;
  }

  return output;
}

function stripLegacy(value = '') {
  let clean = stripDivByClass(String(value || ''), 'cf-personalizer-box');
  clean = clean
    .replace(/<a\b[^>]*class\s*=\s*(["'])[^"']*\bcf-personalize-link\b[^"']*\1[^>]*>[\s\S]*?<\/a>/gi, '')
    .replace(/<iframe\b[^>]*(?:\/loja-integrada\/personalizar\/|title\s*=\s*(["'])Personalizar esta caneca\1)[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<iframe\b[^>]*(?:\/loja-integrada\/personalizar\/|title\s*=\s*(["'])Personalizar esta caneca\1)[^>]*\/?>/gi, '')
    .replace(/<a\b[^>]*>\s*PERSONALIZAR ESTA CANECA\s*<\/a>/gi, '')
    .replace(/(?:\r?\n\s*){3,}/g, '\n\n')
    .trim();
  return clean;
}

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
    const retryAfter = Number(response.headers.get('retry-after'));
    if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfterMs = retryAfter * 1000;
    throw error;
  }
  return data;
}

const fbGet = path => jsonFetch(`${FIREBASE}/${path}.json?_=${Date.now()}`, { cache:'no-store', headers:{ Accept:'application/json' } });
const fbPatch = (path, body) => jsonFetch(`${FIREBASE}/${path}.json`, {
  method:'PATCH', headers:{ 'Content-Type':'application/json', Accept:'application/json' }, body:JSON.stringify(body)
});

let lastLi = 0;
async function li(path, { method = 'GET', body, allow404 = false } = {}) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const wait = Math.max(0, REQUEST_SPACING_MS - (Date.now() - lastLi));
    if (wait) await sleep(wait);
    lastLi = Date.now();
    try {
      return await jsonFetch(`${LI_BASE}${path}`, {
        method,
        headers:{ Authorization:AUTH, Accept:'application/json', ...(body === undefined ? {} : { 'Content-Type':'application/json' }), 'User-Agent':'CanecaFacil-Legacy-Cleanup/1.0' },
        ...(body === undefined ? {} : { body:JSON.stringify(body) }),
      }, { allow404 });
    } catch (error) {
      lastError = error;
      const retryable = error.network || [408,425,429,500,502,503,504].includes(Number(error.status || 0));
      if (!retryable || attempt >= 3) throw error;
      const delay = Number(error.retryAfterMs) > 0 ? Math.min(30000, error.retryAfterMs) : Math.min(12000, 1200 * (2 ** attempt));
      console.warn(`RETRY LI ${method} ${path} · ${attempt + 2}/4 em ${Math.round(delay/1000)}s`);
      await sleep(delay);
    }
  }
  throw lastError;
}

function resourceUri(value) {
  if (typeof value === 'string') return text(value);
  return text(value?.resource_uri || value?.uri);
}

function productId(remote = {}) {
  const direct = text(remote.id);
  if (/^\d+$/.test(direct)) return direct;
  return resourceUri(remote).match(/\/produto\/(\d+)/i)?.[1]
    || text(remote.resource_uri).match(/\/produto\/(\d+)/i)?.[1]
    || '';
}

function writeBody(remote = {}, description = '') {
  const categories = Array.isArray(remote.categorias) ? remote.categorias.map(resourceUri).filter(Boolean) : [];
  return {
    id_externo: remote.id_externo ?? null,
    sku: text(remote.sku),
    mpn: text(remote.mpn) || null,
    ncm: digits(remote.ncm) || null,
    gtin: digits(remote.gtin) || null,
    nome: text(remote.nome),
    apelido: text(remote.apelido || remote.alias),
    descricao_completa: description,
    ativo: remote.ativo !== false,
    destaque: remote.destaque === true,
    peso: num(remote.peso) || null,
    altura: Math.ceil(num(remote.altura)) || null,
    largura: Math.ceil(num(remote.largura)) || null,
    profundidade: Math.ceil(num(remote.profundidade)) || null,
    tipo: text(remote.tipo || 'normal'),
    usado: remote.usado === true,
    categorias,
    marca: resourceUri(remote.marca) || null,
    removido: remote.removido === true,
    url_video_youtube: text(remote.url_video_youtube) || null,
  };
}

async function cleanRemoteById(id, label = '') {
  if (!/^\d+$/.test(text(id))) return false;
  const remote = await li(`/produto/${id}`, { allow404:true });
  if (!remote) return false;
  const before = String(remote.descricao_completa || '');
  if (!hasLegacy(before)) return false;
  const after = stripLegacy(before);
  await li(`/produto/${id}`, { method:'PUT', body:writeBody(remote, after) });
  console.log(`LIMPO LI · ${id} · ${label || text(remote.sku) || text(remote.nome)}`);
  return true;
}

async function resolveRemoteId(product = {}) {
  const liMeta = product.loja_integrada && typeof product.loja_integrada === 'object' ? product.loja_integrada : {};
  const linked = text(liMeta.produto_id || liMeta.product_id || product.loja_integrada_produto_id || product.li_product_id);
  if (/^\d+$/.test(linked)) return linked;
  const sku = text(product.codigo || product.sku);
  if (!sku) return '';
  const result = await li(`/produto?sku=${encodeURIComponent(sku)}&limit=5`);
  const objects = Array.isArray(result?.objects) ? result.objects : [];
  const exact = objects.find(item => text(item?.sku).toLowerCase() === sku.toLowerCase()) || objects[0];
  return productId(exact || {});
}

async function cleanFirebaseProducts() {
  const products = await fbGet('produtos') || {};
  let localCleaned = 0;
  let remoteCleaned = 0;
  let targets = 0;
  const seenRemote = new Set();

  for (const [key, product] of Object.entries(products)) {
    if (!product || typeof product !== 'object') continue;
    const personalizable = product.personalizavel === true || product.loja_integrada_personalizavel === true || product.canecafacil_personalizavel === true || product.personalizacao_publica === true || product.personalizacao?.ativa === true;
    const localHasLegacy = hasLegacy(product.descricao_completa) || hasLegacy(product.descricao);
    if (!personalizable && !localHasLegacy) continue;
    targets += 1;

    const patch = {};
    if (hasLegacy(product.descricao_completa)) patch.descricao_completa = stripLegacy(product.descricao_completa);
    if (hasLegacy(product.descricao)) patch.descricao = stripLegacy(product.descricao);
    if (Object.keys(patch).length) {
      patch.updated_at = now();
      patch.last_update = Date.now();
      patch.personalizador_legado_removido = true;
      await fbPatch(`produtos/${encodeURIComponent(key)}`, patch);
      localCleaned += 1;
      console.log(`LIMPO FIREBASE · ${key}`);
    }

    try {
      const id = await resolveRemoteId(product);
      if (id && !seenRemote.has(id)) {
        seenRemote.add(id);
        if (await cleanRemoteById(id, text(product.codigo || product.nome || key))) remoteCleaned += 1;
      }
    } catch (error) {
      console.warn(`AVISO produto ${key}: ${error.message}`);
    }
  }
  return { targets, localCleaned, remoteCleaned, seenRemote };
}

async function fullRemoteAudit(seenRemote) {
  if (!FULL_AUDIT) return { scanned:0, cleaned:0 };
  let offset = 0;
  const limit = 100;
  let scanned = 0;
  let cleaned = 0;

  while (true) {
    const page = await li(`/produto?limit=${limit}&offset=${offset}`);
    const objects = Array.isArray(page?.objects) ? page.objects : [];
    if (!objects.length) break;
    for (const item of objects) {
      const id = productId(item);
      if (!id || seenRemote.has(id)) continue;
      seenRemote.add(id);
      scanned += 1;
      try {
        if (await cleanRemoteById(id, text(item.sku || item.nome))) cleaned += 1;
      } catch (error) {
        console.warn(`AVISO auditoria LI ${id}: ${error.message}`);
      }
    }
    if (objects.length < limit) break;
    offset += limit;
  }
  return { scanned, cleaned };
}

console.log('CanecaFácil · iniciando retirada definitiva do personalizador legado nas descrições');
await fbPatch('canecas/configuracoes/conteudo_produto/personalizavel_padrao', {
  enabled:false,
  legacy_personalizer_retired:true,
  legacy_personalizer_retired_at:now(),
  note:'Personalizador passou a ser nativo na página do produto; não inserir bloco/iframe na descrição.',
}).catch(error => console.warn(`AVISO configuração: ${error.message}`));

const local = await cleanFirebaseProducts();
const audit = await fullRemoteAudit(local.seenRemote);
const totalRemote = local.remoteCleaned + audit.cleaned;
console.log(JSON.stringify({
  ok:true,
  firebase_targets:local.targets,
  firebase_descriptions_cleaned:local.localCleaned,
  loja_integrada_cleaned:totalRemote,
  loja_integrada_extra_audited:audit.scanned,
  full_audit:FULL_AUDIT,
  finished_at:now(),
}, null, 2));