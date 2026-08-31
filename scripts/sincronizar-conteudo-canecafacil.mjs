import crypto from 'node:crypto';

const FIREBASE = (process.env.FIREBASE_BASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/, '');
const LI_BASE = (process.env.LOJA_INTEGRADA_BASE_URL || 'https://api.awsli.com.br/v1').replace(/\/$/, '');
const AUTH = String(process.env.LOJA_INTEGRADA_AUTHORIZATION || '').trim();
const LIMIT = Math.max(1, Math.min(20, Number(process.env.CONTENT_LIMIT || 8) || 8));
const VERIFY_TTL_MS = Math.max(30, Number(process.env.CONTENT_VERIFY_TTL_MINUTES || 360) || 360) * 60_000;
const REQUEST_SPACING_MS = 900;
const CONFIG_PATH = 'canecas/configuracoes/conteudo_produto/personalizavel_padrao';
const QUEUE_PATH = 'canecas/integracoes/conteudo_produto/fila';

if (!AUTH) throw new Error('LOJA_INTEGRADA_AUTHORIZATION ausente.');

const text = v => String(v ?? '').trim();
const norm = v => text(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const num = v => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const digits = v => text(v).replace(/\D+/g, '');
const esc = v => text(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const pathKey = v => encodeURIComponent(text(v));
const now = () => new Date().toISOString();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha = value => crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
const due = value => { const at = Date.parse(text(value)); return !Number.isFinite(at) || at <= Date.now(); };
const olderThan = (value, ttl) => { const at = Date.parse(text(value)); return !Number.isFinite(at) || Date.now() - at >= ttl; };
const queueKey = key => Buffer.from(text(key), 'utf8').toString('base64url');

async function jsonFetch(url, options = {}, allow404 = false) {
  let r;
  try { r = await fetch(url, options); }
  catch (cause) { const e = new Error(`Falha de rede: ${cause?.message || cause}`); e.network = true; throw e; }
  const raw = await r.text(); let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
  if (allow404 && r.status === 404) return null;
  if (!r.ok) {
    const msg = data?.error_message || data?.detail || data?.message || data?.error || raw || String(r.status);
    const e = new Error(`${r.status} ${msg}`); e.status = r.status; e.data = data;
    const retryAfter = Number(r.headers.get('retry-after')); if (Number.isFinite(retryAfter) && retryAfter > 0) e.retryAfterMs = retryAfter * 1000;
    throw e;
  }
  return data;
}
const fbGet = path => jsonFetch(`${FIREBASE}/${path}.json`, { headers: { Accept: 'application/json' } });
const fbPut = (path, body) => jsonFetch(`${FIREBASE}/${path}.json`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
const fbPatch = (path, body) => jsonFetch(`${FIREBASE}/${path}.json`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });

let lastLi = 0;
async function li(path, { method = 'GET', body, allow404 = false } = {}) {
  const retryableMethod = ['GET', 'PUT'].includes(method); const max = retryableMethod ? 4 : 1; let last;
  for (let attempt = 0; attempt < max; attempt += 1) {
    const wait = Math.max(0, REQUEST_SPACING_MS - (Date.now() - lastLi)); if (wait) await sleep(wait); lastLi = Date.now();
    try {
      return await jsonFetch(`${LI_BASE}${path}`, {
        method,
        headers: { Authorization: AUTH, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), 'User-Agent': 'CanecaFacil-Content-Sync/1.0' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }, allow404);
    } catch (e) {
      last = e; const retriable = e.network || [408, 425, 429, 500, 502, 503, 504].includes(Number(e.status || 0));
      if (!retryableMethod || !retriable || attempt >= max - 1) throw e;
      const delay = Number(e.retryAfterMs) > 0 ? Math.min(30000, e.retryAfterMs) : Math.min(12000, 1400 * (2 ** attempt));
      console.warn(`RETRY conteúdo ${method} ${path} · ${attempt + 2}/${max} em ${Math.round(delay/1000)}s · ${e.message}`); await sleep(delay);
    }
  }
  throw last;
}

function isPersonalizable(p = {}) { return p.personalizavel === true || p.loja_integrada_personalizavel === true || p.canecafacil_personalizavel === true || p.personalizacao_publica === true; }
function liMeta(p = {}) { return p.loja_integrada && typeof p.loja_integrada === 'object' ? p.loja_integrada : {}; }
function normalizeTemplate(raw = {}) {
  return {
    id: 'personalizavel_padrao', version: Math.max(0, Number(raw.version || 0)), mode: raw.mode === 'html' ? 'html' : 'visual', enabled: raw.enabled !== false,
    title: text(raw.title || 'Personalize esta caneca').slice(0,120), text: text(raw.text).slice(0,500), button_text: text(raw.button_text || 'PERSONALIZAR ESTA CANECA').slice(0,100), benefits: text(raw.benefits).slice(0,500), note: text(raw.note).slice(0,500),
    align: ['left','center','right'].includes(raw.align) ? raw.align : 'center',
    background: /^#[0-9a-f]{6}$/i.test(text(raw.background)) ? text(raw.background) : '#ffffff', border_color: /^#[0-9a-f]{6}$/i.test(text(raw.border_color)) ? text(raw.border_color) : '#e8e8e3', text_color: /^#[0-9a-f]{6}$/i.test(text(raw.text_color)) ? text(raw.text_color) : '#252821', button_background: /^#[0-9a-f]{6}$/i.test(text(raw.button_background)) ? text(raw.button_background) : '#111111', button_color: /^#[0-9a-f]{6}$/i.test(text(raw.button_color)) ? text(raw.button_color) : '#ffffff',
    border_radius: Math.min(32, Math.max(0, num(raw.border_radius || 14))), button_radius: Math.min(32, Math.max(0, num(raw.button_radius || 10))), padding: Math.min(32, Math.max(8, num(raw.padding || 16))), button_full_mobile: raw.button_full_mobile !== false,
    personalizer_base: /^https:\/\//i.test(text(raw.personalizer_base)) ? text(raw.personalizer_base) : 'https://canecafacil.com.br/personalizar/', return_url: /^https:\/\//i.test(text(raw.return_url)) ? text(raw.return_url) : 'https://canecafacil.com.br/', open_new_tab: raw.open_new_tab === true, custom_html: String(raw.custom_html || '').slice(0,15000),
    draft_revision: Number(raw.draft_revision || 0), published_at: text(raw.published_at),
  };
}
function stripOldBlock(value) {
  return text(value)
    .replace(/<div[^>]*class=["'][^"']*cf-personalizer-box[^"']*["'][\s\S]*?<\/div>/gi, '')
    .replace(/<a[^>]*class=["'][^"']*cf-personalize-link[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, '')
    .replace(/<a[^>]*>PERSONALIZAR ESTA CANECA<\/a>/gi, '')
    .trim();
}
function sanitizeHtml(value) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/?(?:iframe|object|embed|form|input|textarea|select|meta|link)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/data\s*:\s*text\/html/gi, '');
}
function variables(p, key, t) {
  const base = t.personalizer_base; const ret = t.return_url;
  const url = `${base}${base.includes('?') ? '&' : '?'}model=${encodeURIComponent(key)}&return=${encodeURIComponent(ret)}`;
  return {
    '{{nome}}': text(p.nome || 'Caneca Personalizável'), '{{sku}}': text(p.codigo || p.sku), '{{modelo_id}}': key,
    '{{preco}}': num(p.preco).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), '{{url_personalizador}}': url,
    '{{titulo}}': t.title, '{{texto}}': t.text, '{{botao}}': t.button_text, '{{beneficios}}': t.benefits, '{{aviso}}': t.note,
  };
}
function replaceVars(value, vars) { let out = String(value || ''); for (const [token, raw] of Object.entries(vars)) out = out.split(token).join(esc(raw)); return out; }
function blockWithoutHash(t, p, key) {
  if (!t.enabled) return '';
  const vars = variables(p, key, t); const version = Number(t.version || 0);
  if (t.mode === 'html' && text(t.custom_html)) {
    let custom = sanitizeHtml(replaceVars(t.custom_html, vars));
    if (/class=["'][^"']*cf-personalizer-box/i.test(custom)) {
      custom = custom.replace(/<([a-z0-9]+)([^>]*class=["'][^"']*cf-personalizer-box[^"']*["'][^>]*)>/i, `<$1$2 data-cf-template-version="${version}">`);
      return custom;
    }
    return `<div class="cf-personalizer-box" data-cf-template-version="${version}">${custom}</div>`;
  }
  const benefits = t.benefits ? `<div style="margin-top:10px;font-size:12px;line-height:1.45;opacity:.78">${replaceVars(t.benefits, vars).replace(/\n/g,'<br>')}</div>` : '';
  const note = t.note ? `<div style="margin-top:9px;font-size:11px;line-height:1.45;opacity:.68">${replaceVars(t.note, vars).replace(/\n/g,'<br>')}</div>` : '';
  const tx = t.text ? `<div style="margin:0 0 12px;font-size:13px;line-height:1.45">${replaceVars(t.text, vars).replace(/\n/g,'<br>')}</div>` : '';
  const target = t.open_new_tab ? ' target="_blank" rel="noopener"' : '';
  return `<div class="cf-personalizer-box" data-cf-template-version="${version}" style="margin:16px 0;padding:${t.padding}px;border:1px solid ${t.border_color};border-radius:${t.border_radius}px;background:${t.background};color:${t.text_color};text-align:${t.align};box-sizing:border-box"><strong style="display:block;margin:0 0 7px;font-size:15px;line-height:1.3">${replaceVars(t.title, vars)}</strong>${tx}<a class="cf-personalize-link" href="${esc(vars['{{url_personalizador}}'])}"${target} style="display:inline-flex;align-items:center;justify-content:center;min-height:46px;width:${t.button_full_mobile ? '100%' : 'auto'};max-width:340px;box-sizing:border-box;background:${t.button_background};color:${t.button_color};text-decoration:none;padding:12px 18px;border-radius:${t.button_radius}px;font-weight:800;font-size:13px;line-height:1.2;text-align:center">${replaceVars(t.button_text, vars)}</a>${benefits}${note}</div>`;
}
function compileDescription(t, p, key) {
  const base = stripOldBlock(p.descricao_completa || p.descricao || ''); if (!t.enabled) return { description: base, hash: sha(`disabled|${t.version}|${key}`) };
  let block = blockWithoutHash(t, p, key); const hash = sha(block);
  block = block.replace(/data-cf-template-version="([^"]*)"/i, `data-cf-template-version="$1" data-cf-template-hash="${hash}"`);
  return { description: `${base}${base ? '\n' : ''}${block}`.trim(), hash };
}
function markerMatches(remoteDescription, version, hash) {
  const raw = String(remoteDescription || '');
  return raw.includes(`data-cf-template-version="${version}"`) && raw.includes(`data-cf-template-hash="${hash}"`);
}
function resourceUri(value) {
  if (typeof value === 'string') return text(value);
  return text(value?.resource_uri || value?.uri);
}
function writeBody(remote = {}, p = {}, description = '') {
  const li = liMeta(p);
  const categories = (Array.isArray(remote.categorias) ? remote.categorias.map(resourceUri).filter(Boolean) : []).length
    ? remote.categorias.map(resourceUri).filter(Boolean)
    : [text(li.categoria_uri || p.loja_integrada_categoria_uri)].filter(Boolean);
  const brand = resourceUri(remote.marca) || text(li.marca_uri || p.loja_integrada_marca_uri) || null;
  return {
    id_externo: remote.id_externo ?? null,
    sku: text(remote.sku || p.codigo || p.sku),
    mpn: text(remote.mpn || p.mpn) || null,
    ncm: digits(remote.ncm || p.ncm || '69111090') || null,
    gtin: digits(remote.gtin || p.gtin || p.ean || p.codigo_barras) || null,
    nome: text(remote.nome || p.nome),
    apelido: text(remote.apelido || remote.alias || li.alias || p.loja_integrada_alias),
    descricao_completa: description,
    ativo: remote.ativo ?? (p.loja_integrada_ativo === true || p.canecafacil_ativo === true),
    destaque: remote.destaque === true,
    peso: num(remote.peso || p.peso_embalado_kg || p.peso) || null,
    altura: Math.ceil(num(remote.altura || p.altura_embalada_cm || p.altura)) || null,
    largura: Math.ceil(num(remote.largura || p.largura_embalada_cm || p.largura)) || null,
    profundidade: Math.ceil(num(remote.profundidade || p.comprimento_embalado_cm || p.comprimento)) || null,
    tipo: text(remote.tipo || 'normal'),
    usado: remote.usado === true,
    categorias,
    marca: brand,
    removido: remote.removido === true,
    url_video_youtube: text(remote.url_video_youtube || p.url_video_youtube || p.video_youtube || p.youtube_url) || null,
  };
}
async function findBySku(sku) {
  if (!text(sku)) return null;
  const data = await li(`/produto?sku=${encodeURIComponent(text(sku))}&limit=5`); const objects = Array.isArray(data?.objects) ? data.objects : [];
  return objects.find(x => norm(x?.sku) === norm(sku)) || null;
}
async function remoteProduct(p) {
  const liM = liMeta(p); const linked = text(liM.produto_id);
  if (linked) {
    const byId = await li(`/produto/${encodeURIComponent(linked)}?descricao_completa=1`, { allow404: true });
    if (byId) return byId;
  }
  const found = await findBySku(p.codigo || p.sku); if (!found) return null;
  const full = await li(`/produto/${encodeURIComponent(found.id)}?descricao_completa=1`, { allow404: true }); return full || found;
}
function classify(e) {
  const status = Number(e?.status || 0); const retryable = e?.network || [408,425,429,500,502,503,504].includes(status);
  if ([401,403].includes(status)) return { retry: true, system: true, minutes: 60 };
  if (retryable) return { retry: true, system: false, minutes: 10 };
  if ([404,409].includes(status)) return { retry: true, system: false, minutes: 20 };
  return { retry: false, system: false, minutes: 0 };
}
async function markQueue(qKey, patch) { return fbPatch(`${QUEUE_PATH}/${pathKey(qKey)}`, patch); }
async function markProduct(key, p, patch) { return fbPatch(`produtos/${pathKey(key)}`, { loja_integrada: { ...liMeta(p), ...patch }, updated_at: now(), last_update: Date.now() }); }

async function syncItem(entry, published, draft) {
  const qKey = entry.queueKey || queueKey(entry.key); const item = entry.item || {}; const key = text(entry.key || item.product_key); const p = entry.product; const explicit = entry.explicit === true;
  const source = item.source === 'draft' ? 'draft' : 'published'; const template = normalizeTemplate(source === 'draft' ? draft : published);
  if (!key || !p) return { status: 'skip' };
  const attempt = Number(item.tentativas || 0) + 1; const started = now();
  if (explicit) await markQueue(qKey, { ...item, status: 'processando', atualizado_em: started, iniciado_em: started, tentativa_atual: attempt, erro: '' });
  try {
    const remote = await remoteProduct(p);
    if (!remote?.id) throw Object.assign(new Error('Produto não encontrado na Loja Integrada; a sincronização principal precisa reconciliar o cadastro.'), { status: 404 });
    const { description, hash } = compileDescription(template, p, key);
    const version = Number(template.version || 0);
    const currentDescription = text(remote.descricao_completa || remote.descricao || '');
    let changed = false;
    if (!markerMatches(currentDescription, version, hash) || source === 'draft') {
      const body = writeBody(remote, p, description);
      await li(`/produto/${encodeURIComponent(remote.id)}`, { method: 'PUT', body }); changed = true;
      const confirm = await li(`/produto/${encodeURIComponent(remote.id)}?descricao_completa=1`);
      if (!markerMatches(confirm?.descricao_completa || '', version, hash)) throw new Error('A Loja Integrada respondeu, mas o bloco não foi confirmado na descrição final.');
    }
    const at = now();
    if (source === 'draft') {
      await markProduct(key, p, { produto_id: String(remote.id), content_template_preview: true, content_template_preview_at: at, content_template_preview_hash: hash, content_template_preview_draft_revision: Number(template.draft_revision || 0), content_template_preview_base_version: Number(published?.version || 0), content_template_audited_at: at, content_template_status: 'teste_aplicado' });
    } else {
      await markProduct(key, p, { produto_id: String(remote.id), content_template_version: version, content_template_hash: hash, content_template_applied_at: at, content_template_audited_at: at, content_template_status: 'sincronizado', content_template_preview: false, content_template_preview_at: '', content_template_preview_hash: '', content_template_error: '' });
    }
    if (explicit) await markQueue(qKey, { status: 'concluido', atualizado_em: at, concluido_em: at, tentativas: attempt, erro: '', produto_id: String(remote.id), template_source: source, template_version: version });
    console.log(`${changed ? 'ATUALIZADO' : 'CONFIRMADO'} conteúdo ${key} · ID ${remote.id} · ${source} v${version} · hash ${hash}`);
    return { status: 'ok', changed };
  } catch (e) {
    const at = now(); const c = classify(e); const message = String(e?.message || e).slice(0,600);
    if (c.retry) {
      const next = new Date(Date.now() + c.minutes * 60000).toISOString();
      if (explicit) await markQueue(qKey, { status: 'pendente', atualizado_em: at, tentativas: attempt, erro: message, proxima_tentativa_em: next }).catch(()=>{});
      await markProduct(key, p, { content_template_status: 'pendente', content_template_error: message, content_template_retry_at: next }).catch(()=>{});
      console.warn(`RETRY conteúdo ${key} · ${next} · ${message}`); return { status: c.system ? 'system' : 'retry' };
    }
    if (explicit) await markQueue(qKey, { status: 'bloqueado', atualizado_em: at, tentativas: attempt, erro: message }).catch(()=>{});
    await markProduct(key, p, { content_template_status: 'erro', content_template_error: message }).catch(()=>{});
    console.error(`BLOQUEADO conteúdo ${key} · ${message}`); return { status: 'blocked' };
  }
}

const [config, productsRaw, queueRaw] = await Promise.all([fbGet(CONFIG_PATH).catch(()=>({})), fbGet('produtos').catch(()=>({})), fbGet(QUEUE_PATH).catch(()=>({}))]);
const published = config?.published ? normalizeTemplate(config.published) : null; const draft = config?.draft ? normalizeTemplate(config.draft) : null;
const products = Object.entries(productsRaw || {}).map(([key,p]) => ({ key, product: p || {} })); const byKey = new Map(products.map(x => [x.key, x.product]));
let entries = [];
for (const [qKey, itemRaw] of Object.entries(queueRaw || {})) {
  const item = itemRaw || {}; const key = text(item.product_key); if (!key || !byKey.has(key)) continue;
  if (['concluido','bloqueado','processando'].includes(text(item.status))) continue; if (!due(item.proxima_tentativa_em)) continue;
  entries.push({ queueKey: qKey, key, item, product: byKey.get(key), explicit: true, priority: 0 });
}
if (published?.version > 0) {
  for (const { key, product } of products) {
    if (!isPersonalizable(product) || !text(liMeta(product).produto_id)) continue;
    if (entries.some(e => e.key === key)) continue;
    const liM = liMeta(product); const preview = liM.content_template_preview === true; const previewBase = Number(liM.content_template_preview_base_version || 0);
    if (preview && Number(published.version) <= previewBase) continue;
    const appliedVersion = Number(liM.content_template_version || 0); const appliedAt = Date.parse(text(liM.content_template_applied_at)); const syncAt = Date.parse(text(liM.sync_at));
    const versionStale = appliedVersion !== Number(published.version);
    const productChangedAfterContent = Number.isFinite(syncAt) && (!Number.isFinite(appliedAt) || syncAt > appliedAt + 1000);
    const auditDue = olderThan(liM.content_template_audited_at, VERIFY_TTL_MS);
    if (!versionStale && !productChangedAfterContent && !auditDue) continue;
    entries.push({ queueKey: queueKey(key), key, item: { source: 'published', status: 'auto' }, product, explicit: false, priority: versionStale ? 1 : productChangedAfterContent ? 2 : 3 });
  }
}
entries.sort((a,b) => a.priority - b.priority || text(a.item.solicitado_em).localeCompare(text(b.item.solicitado_em)));
entries = entries.slice(0, LIMIT);
console.log(`CanecaFácil Conteúdo v1 · publicados=${published?.version || 0} · fila=${entries.length} · limite=${LIMIT}`);
let ok=0, changed=0, retry=0, blocked=0, system=0;
for (const entry of entries) {
  const result = await syncItem(entry, published, draft);
  if (result.status === 'ok') { ok += 1; if (result.changed) changed += 1; }
  else if (result.status === 'retry') retry += 1; else if (result.status === 'blocked') blocked += 1; else if (result.status === 'system') system += 1;
}
console.log(`RESUMO CONTEÚDO · confirmados=${ok} · alterados=${changed} · retries=${retry} · bloqueados=${blocked} · erros_sistema=${system}`);
if (system) process.exitCode = 3;
