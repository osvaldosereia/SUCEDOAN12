const LI_BASE = (process.env.LOJA_INTEGRADA_BASE_URL || 'https://api.awsli.com.br/v1').replace(/\/$/, '');
const AUTH = String(process.env.LOJA_INTEGRADA_AUTHORIZATION || '').trim();
const FIREBASE = (process.env.FIREBASE_BASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/, '');

if (!AUTH) throw new Error('Token Loja Integrada ausente.');

const text = value => String(value ?? '').trim();
const safeKey = value => text(value).replace(/[.#$\[\]/]/g, '_');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
  if (!response.ok) throw new Error(`${response.status} ${text(data?.error_message || data?.detail || data?.message || data?.error || raw).slice(0,300)}`);
  return data;
}

async function fb(path, { method='GET', body } = {}) {
  return jsonFetch(`${FIREBASE}/${path}.json`, {
    method,
    headers:{ Accept:'application/json', ...(body === undefined ? {} : { 'Content-Type':'application/json' }) },
    body:body === undefined ? undefined : JSON.stringify(body)
  });
}

let lastLi = 0;
async function li(path, { method='GET', body } = {}) {
  const wait = Math.max(0, 900 - (Date.now() - lastLi));
  if (wait) await sleep(wait);
  lastLi = Date.now();
  return jsonFetch(`${LI_BASE}${path}`, {
    method,
    headers:{ Authorization:AUTH, Accept:'application/json', ...(body === undefined ? {} : { 'Content-Type':'application/json' }), 'User-Agent':'CanecaFacil-Cleanup/1.0' },
    body:body === undefined ? undefined : JSON.stringify(body)
  });
}

function candidateIds(creations = {}) {
  const out = [];
  for (const [code, creation] of Object.entries(creations || {})) {
    const temp = creation?.loja_integrada_temporario && typeof creation.loja_integrada_temporario === 'object' ? creation.loja_integrada_temporario : {};
    const id = text(temp.produto_id || temp.product_id);
    if (/^\d+$/.test(id)) out.push({ code, id, temp });
  }
  return out;
}

function inactiveBody(remote = {}) {
  return {
    id_externo: remote.id_externo ?? null,
    sku: text(remote.sku),
    mpn: remote.mpn ?? null,
    ncm: text(remote.ncm) || null,
    gtin: text(remote.gtin) || null,
    nome: text(remote.nome || 'Caneca personalizada'),
    apelido: text(remote.apelido) || null,
    descricao_completa: text(remote.descricao_completa),
    ativo: false,
    destaque: false,
    peso: remote.peso ?? null,
    altura: remote.altura ?? null,
    largura: remote.largura ?? null,
    profundidade: remote.profundidade ?? null,
    tipo: text(remote.tipo || 'normal') || 'normal',
    usado: remote.usado === true,
    categorias: [],
    marca: null,
    removido: false,
    url_video_youtube: remote.url_video_youtube ?? null
  };
}

const creations = await fb('canecas/personalizadas').catch(() => ({})) || {};
const rows = candidateIds(creations);
let deactivated = 0;
let skipped = 0;
let errors = 0;
console.log(`Produtos temporários registrados: ${rows.length}`);

for (const row of rows) {
  try {
    const remote = await li(`/produto/${encodeURIComponent(row.id)}`);
    const sku = text(remote?.sku).toUpperCase();
    const name = text(remote?.nome).toLowerCase();
    const legacy = sku.startsWith('CFP-') || name.startsWith('caneca personalizada');
    if (!legacy) {
      skipped += 1;
      console.log(`IGNORADO ${row.id} · não parece produto temporário · ${remote?.sku || ''}`);
      continue;
    }
    if (remote?.ativo !== false) await li(`/produto/${encodeURIComponent(row.id)}`, { method:'PUT', body:inactiveBody(remote) });
    const now = new Date().toISOString();
    await fb(`canecas/personalizadas/${safeKey(row.code)}/loja_integrada_temporario`, {
      method:'PATCH',
      body:{ status:'desativado_legado', ativo:false, desativado_em:now, atualizado_em:now, motivo:'fluxo_novo_usa_produto_original' }
    });
    deactivated += 1;
    console.log(`DESATIVADO ${row.id} · ${remote?.sku || ''} · ${row.code}`);
  } catch (error) {
    errors += 1;
    console.error(`ERRO ${row.id} · ${row.code} · ${error?.message || error}`);
  }
}

console.log(`RESUMO desativados=${deactivated} ignorados=${skipped} erros=${errors}`);
if (errors) process.exitCode = 1;