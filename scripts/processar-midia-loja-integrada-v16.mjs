import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const FIREBASE = (process.env.FIREBASE_BASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/, '');
const RAW_BRANCH = String(process.env.RAW_BRANCH || process.env.GITHUB_REF_NAME || 'canecas-media').trim();
const RAW_BASE = `https://raw.githubusercontent.com/${process.env.GITHUB_REPOSITORY || 'osvaldosereia/SUCEDOAN12'}/${RAW_BRANCH}`;
const PRODUCT_KEY = String(process.env.PRODUCT_KEY || '').trim();
const FORCE = /^(1|true|yes)$/i.test(String(process.env.FORCE || ''));
const CLEANUP_OLD = !/^(0|false|no)$/i.test(String(process.env.CLEANUP_OLD || 'true'));
const LIMIT = Math.max(0, Number(process.env.LIMIT || 0) || 0);
const MODE = String(process.env.MODE || 'build').toLowerCase();
const VERSION = 'github-sharp-v6-li-horizontal-square';
const PENDING = path.join(ROOT, '.canecafacil-li-media-pending.json');
const BACKGROUND = { r:255, g:255, b:255, alpha:1 };
const OUTPUT_SIZE = 1200;
const OUTPUT_QUALITY = 80;

const text = v => String(v ?? '').trim();
const norm = v => text(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const slug = v => norm(v).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'caneca';
const isHttp = v => /^https?:\/\//i.test(text(v));
const safeKey = v => encodeURIComponent(text(v));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function isMug(p = {}) {
  return norm(`${p.tipo_produto || ''} ${p.categoria || ''} ${p.subcategoria || ''} ${p.nome || ''}`).includes('caneca');
}
function artOf(p = {}) {
  return text(p.arte_horizontal || p.arte_personalizacao || p.arte_impressao?.url || p.arte_final_url);
}
function mocksOf(p = {}) {
  return {
    m1:text(p.mockup_1 || p.imagens_site?.[0] || p.imagens?.[0]),
    m2:text(p.mockup_2 || p.imagens_site?.[1] || p.imagens?.[1]),
  };
}
function squareOf(p = {}) {
  return text(
    p.vitrine_horizontal_quadrada ||
    p.vitrine_loja_integrada?.url ||
    p.loja_integrada?.horizontal_quadrada ||
    p.loja_integrada_horizontal_quadrada
  );
}
function squareReady(p = {}) {
  const art = artOf(p);
  const source = text(p.vitrine_loja_integrada?.source_art);
  const version = text(p.vitrine_loja_integrada?.versao || p.vitrine_loja_integrada_processador);
  return Boolean(art && source === art && version === VERSION && isHttp(squareOf(p)));
}
function sourceReady(p = {}) {
  const m = mocksOf(p);
  return isHttp(artOf(p)) && isHttp(m.m1) && isHttp(m.m2);
}

async function fetchJson(url, options = {}) {
  const r = await fetch(url, options);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} · ${url}`);
  const raw = await r.text();
  return raw ? JSON.parse(raw) : null;
}
async function fetchBuffer(url) {
  const r = await fetch(url, { headers:{ 'User-Agent':'CanecaFacil-LI-Media/6.0' } });
  if (!r.ok) throw new Error(`Imagem ${r.status}: ${url}`);
  return Buffer.from(await r.arrayBuffer());
}
async function patchPath(pathName, patch) {
  return fetchJson(`${FIREBASE}/${pathName}.json`, {
    method:'PATCH',
    headers:{ 'Content-Type':'application/json', Accept:'application/json' },
    body:JSON.stringify(patch),
  });
}
async function patchProduct(key, patch) {
  return patchPath(`produtos/${safeKey(key)}`, patch);
}

async function makeSquare(buffer) {
  const source = sharp(buffer, { failOn:'none' }).rotate();
  const meta = await source.metadata();
  const width = Number(meta.width || 0);
  const height = Number(meta.height || 0);
  if (!width || !height) throw new Error('arte horizontal sem dimensões válidas');
  const output = await source
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, {
      fit:'contain',
      position:'centre',
      background:BACKGROUND,
      withoutEnlargement:false,
    })
    .flatten({ background:BACKGROUND })
    .webp({ quality:OUTPUT_QUALITY, effort:5, smartSubsample:true })
    .toBuffer();
  return { output, meta:{ source_width:width, source_height:height, width:OUTPUT_SIZE, height:OUTPUT_SIZE } };
}

async function cleanupLegacyFiles() {
  if (!CLEANUP_OLD) return;
  const legacy = path.join(ROOT, 'canecas', 'vitrine');
  await fs.rm(legacy, { recursive:true, force:true });
  console.log('CLEANUP GitHub · diretório legado canecas/vitrine removido do checkout.');
}

async function build() {
  await cleanupLegacyFiles();
  const products = await fetchJson(`${FIREBASE}/produtos.json`) || {};
  let rows = Object.entries(products).filter(([,p]) => p && isMug(p) && sourceReady(p));
  if (PRODUCT_KEY) rows = rows.filter(([key]) => key === PRODUCT_KEY);
  if (!FORCE) rows = rows.filter(([,p]) => !squareReady(p));
  if (LIMIT) rows = rows.slice(0, LIMIT);

  console.log(`CanecaFácil mídia LI V6 · candidatos=${rows.length} · force=${FORCE} · product=${PRODUCT_KEY || 'todos'}`);
  const pending = [];
  let ok = 0;
  let errors = 0;

  for (const [key,p] of rows) {
    const art = artOf(p);
    const mocks = mocksOf(p);
    const nameSlug = slug(p.seo_slug || p.canecafacil_slug || p.nome || p.codigo || key);
    const keySlug = slug(key).slice(0, 36);
    const dirRel = path.posix.join('canecas', 'imagens', 'loja-integrada', `${nameSlug}-${keySlug}`);
    const dirAbs = path.join(ROOT, ...dirRel.split('/'));
    const file = `${nameSlug}-horizontal-quadrada-li-v1.webp`;
    const url = `${RAW_BASE}/${dirRel}/${file}`;

    await patchProduct(key, {
      vitrine_loja_integrada_status:'processando',
      vitrine_loja_integrada_erro:'',
      vitrine_loja_integrada_processador:VERSION,
      vitrine_loja_integrada_iniciado_em:new Date().toISOString(),
    }).catch(() => {});

    try {
      const square = await makeSquare(await fetchBuffer(art));
      await fs.mkdir(dirAbs, { recursive:true });
      await fs.writeFile(path.join(dirAbs, file), square.output);
      pending.push({ key, art, url, meta:square.meta, nome:text(p.nome), mockup1:mocks.m1, mockup2:mocks.m2 });
      ok += 1;
      console.log(`GERADO ${key} · ${p.nome || ''} · origem=${square.meta.source_width}x${square.meta.source_height} · LI=${OUTPUT_SIZE}x${OUTPUT_SIZE}`);
    } catch (error) {
      errors += 1;
      console.error(`ERRO ${key} · ${p.nome || ''} · ${error?.message || error}`);
      await patchProduct(key, {
        vitrine_loja_integrada_status:'erro',
        vitrine_loja_integrada_erro:String(error?.message || error).slice(0, 500),
        vitrine_loja_integrada_processador:VERSION,
        vitrine_loja_integrada_atualizado_em:new Date().toISOString(),
      }).catch(() => {});
    }
  }

  await fs.writeFile(PENDING, JSON.stringify(pending, null, 2));
  console.log(`BUILD concluído · gerados=${ok} erros=${errors}`);
}

async function urlExists(url) {
  for (let i = 0; i < 8; i += 1) {
    const r = await fetch(url, { method:'HEAD', headers:{ 'User-Agent':'CanecaFacil-LI-Media/6.0' } }).catch(() => null);
    if (r?.ok) return true;
    await sleep(1500 * (i + 1));
  }
  return false;
}

function cleanupPatch() {
  return {
    mockup_3:null,
    vitrine_recorte_esquerda:null,
    vitrine_recorte_centro:null,
    vitrine_recorte_direita:null,
    vitrine_recortes:null,
    vitrine_recortes_status:null,
    vitrine_recortes_erro:null,
    vitrine_recortes_processador:null,
    vitrine_recortes_iniciado_em:null,
    vitrine_recortes_solicitado_em:null,
    vitrine_recortes_atualizado_em:null,
    crop_left_base64:null,
    crop_center_base64:null,
    crop_right_base64:null,
    crop_version:null,
    recorte_esquerdo:null,
    recorte_centro:null,
    recorte_direito:null,
    recorte_1:null,
    recorte_2:null,
    recorte_3:null,
    crop_left_url:null,
    crop_center_url:null,
    crop_right_url:null,
  };
}

async function apply() {
  let pending = [];
  try {
    pending = JSON.parse(await fs.readFile(PENDING, 'utf8'));
  } catch {
    console.log('Sem patches pendentes.');
    return;
  }

  let ok = 0;
  let errors = 0;
  for (const item of pending) {
    try {
      if (!await urlExists(item.url)) throw new Error('imagem quadrada ainda não está pública no GitHub');
      const now = new Date().toISOString();
      const storefront = [item.mockup1, item.mockup2, item.url].filter(isHttp);
      if (storefront.length !== 3) throw new Error('mockup 1, mockup 2 e horizontal quadrada são obrigatórios');

      await patchProduct(item.key, {
        ...cleanupPatch(),
        vitrine_horizontal_quadrada:item.url,
        loja_integrada_horizontal_quadrada:item.url,
        imagens_canecafacil:storefront,
        imagens_site:storefront,
        imagens:storefront,
        vitrine_loja_integrada_status:'pronto',
        vitrine_loja_integrada_erro:'',
        vitrine_loja_integrada_processador:VERSION,
        vitrine_loja_integrada_atualizado_em:now,
        vitrine_loja_integrada:{
          versao:VERSION,
          status:'pronto',
          uso:'loja_integrada',
          canvas_shape:'square',
          fit:'contain',
          background:'#ffffff',
          quality:OUTPUT_QUALITY,
          source_art:item.art,
          url:item.url,
          source_width:item.meta.source_width,
          source_height:item.meta.source_height,
          width:item.meta.width,
          height:item.meta.height,
          atualizado_em:now,
        },
        updated_at:now,
        last_update:Date.now(),
      });

      await patchPath(`produtos/${safeKey(item.key)}/loja_integrada`, {
        horizontal_quadrada:item.url,
        media_version:VERSION,
        sync_status:'pendente',
        sync_error:'',
      }).catch(() => {});

      ok += 1;
      console.log(`FIREBASE OK ${item.key} · ${item.nome} · vitrine=3 imagens`);
    } catch (error) {
      errors += 1;
      console.error(`FIREBASE ERRO ${item.key} · ${error?.message || error}`);
    }
  }

  await fs.rm(PENDING, { force:true });
  console.log(`APPLY concluído · prontos=${ok} erros=${errors}`);
}

if (MODE === 'apply') await apply();
else await build();
