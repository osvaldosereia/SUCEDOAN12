import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const FIREBASE = (process.env.FIREBASE_BASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/, '');
const RAW_BRANCH = String(process.env.RAW_BRANCH || process.env.GITHUB_REF_NAME || 'canecas-media').trim();
const RAW_BASE = `https://raw.githubusercontent.com/${process.env.GITHUB_REPOSITORY || 'osvaldosereia/SUCEDOAN12'}/${RAW_BRANCH}`;
const PRODUCT_KEY = String(process.env.PRODUCT_KEY || '').trim();
const FORCE = /^(1|true|yes)$/i.test(String(process.env.FORCE || ''));
const LIMIT = Math.max(0, Number(process.env.LIMIT || 0) || 0);
const MODE = String(process.env.MODE || 'build').toLowerCase();
const VERSION = 'github-sharp-v5-two-crops-square-contain';
const PENDING = path.join(ROOT, '.canecafacil-vitrine-pending.json');
const BACKGROUND = { r:255, g:255, b:255, alpha:1 };

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
function cropsOf(p = {}) {
  return {
    left:text(p.vitrine_recorte_esquerda || p.vitrine_recortes?.esquerda),
    right:text(p.vitrine_recorte_direita || p.vitrine_recortes?.direita),
  };
}
function cropReady(p = {}) {
  const c = cropsOf(p);
  const art = artOf(p);
  const source = text(p.vitrine_recortes?.source_art || p.vitrine_recortes?.arte_origem);
  const version = text(p.vitrine_recortes?.versao || p.vitrine_recortes_processador);
  const shape = text(p.vitrine_recortes?.canvas_shape);
  return Boolean(
    art &&
    source === art &&
    version === VERSION &&
    shape === 'square' &&
    isHttp(c.left) &&
    isHttp(c.right)
  );
}
function sourceReady(p = {}) { return isHttp(artOf(p)); }

async function fetchJson(url, options = {}) {
  const r = await fetch(url, options);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} · ${url}`);
  const raw = await r.text();
  return raw ? JSON.parse(raw) : null;
}
async function fetchBuffer(url) {
  const r = await fetch(url, { headers:{ 'User-Agent':'CanecaFacil-GitHub-Crops/5.0' } });
  if (!r.ok) throw new Error(`Imagem ${r.status}: ${url}`);
  return Buffer.from(await r.arrayBuffer());
}
async function patchProduct(key, patch) {
  return fetchJson(`${FIREBASE}/produtos/${safeKey(key)}.json`, {
    method:'PATCH',
    headers:{ 'Content-Type':'application/json', Accept:'application/json' },
    body:JSON.stringify(patch),
  });
}

function squarePadding(width, height) {
  const size = Math.max(width, height);
  const x = size - width;
  const y = size - height;
  return {
    size,
    left:Math.floor(x / 2),
    right:x - Math.floor(x / 2),
    top:Math.floor(y / 2),
    bottom:y - Math.floor(y / 2),
  };
}

async function squareView(buffer, region, opts) {
  const pad = squarePadding(region.width, region.height);
  const output = await sharp(buffer, { failOn:'none' })
    .rotate()
    .extract(region)
    .extend({
      top:pad.top,
      bottom:pad.bottom,
      left:pad.left,
      right:pad.right,
      background:BACKGROUND,
    })
    .webp(opts)
    .toBuffer();
  return { output, size:pad.size, padding:pad };
}

async function makeCrops(buffer) {
  const meta = await sharp(buffer, { failOn:'none' }).rotate().metadata();
  const width = Number(meta.width || 0);
  const height = Number(meta.height || 0);
  if (!width || !height) throw new Error('arte horizontal sem dimensões válidas');

  const leftW = Math.floor(width / 2);
  const rightW = width - leftW;
  const opts = { quality:90, effort:5, smartSubsample:true };

  const leftView = await squareView(buffer, { left:0, top:0, width:leftW, height }, opts);
  const rightView = await squareView(buffer, { left:leftW, top:0, width:rightW, height }, opts);

  return {
    left:leftView.output,
    right:rightView.output,
    meta:{
      width,
      height,
      leftW,
      rightW,
      leftSquare:leftView.size,
      rightSquare:rightView.size,
      leftPadding:leftView.padding,
      rightPadding:rightView.padding,
    },
  };
}

async function build() {
  const products = await fetchJson(`${FIREBASE}/produtos.json`) || {};
  let rows = Object.entries(products).filter(([,p]) => p && isMug(p));
  if (PRODUCT_KEY) rows = rows.filter(([key]) => key === PRODUCT_KEY);
  rows = rows.filter(([,p]) => sourceReady(p));
  if (!FORCE) rows = rows.filter(([,p]) => !cropReady(p));
  if (LIMIT) rows = rows.slice(0, LIMIT);

  console.log(`CanecaFácil GitHub crops quadrados · candidatos=${rows.length} · force=${FORCE} · product=${PRODUCT_KEY || 'todos'}`);
  const pending = [];
  let ok = 0;
  let errors = 0;

  for (const [key,p] of rows) {
    const art = artOf(p);
    const mocks = mocksOf(p);
    const nameSlug = slug(p.seo_slug || p.canecafacil_slug || p.nome || p.codigo || key);
    const keySlug = slug(key).slice(0, 36);
    const dirRel = path.posix.join('canecas', 'vitrine', `${nameSlug}-${keySlug}`);
    const dirAbs = path.join(ROOT, ...dirRel.split('/'));
    const files = {
      left:`${nameSlug}-vista-esquerda-quadrada-v1.webp`,
      right:`${nameSlug}-vista-direita-quadrada-v1.webp`,
    };
    const urls = Object.fromEntries(
      Object.entries(files).map(([k,f]) => [k, `${RAW_BASE}/${dirRel}/${f}`])
    );

    await patchProduct(key, {
      vitrine_recortes_status:'processando',
      vitrine_recortes_erro:'',
      vitrine_recortes_processador:VERSION,
      vitrine_recortes_iniciado_em:new Date().toISOString(),
    }).catch(() => {});

    try {
      const crops = await makeCrops(await fetchBuffer(art));
      await fs.mkdir(dirAbs, { recursive:true });
      await Promise.all([
        fs.writeFile(path.join(dirAbs, files.left), crops.left),
        fs.writeFile(path.join(dirAbs, files.right), crops.right),
      ]);
      pending.push({
        key,
        art,
        urls,
        meta:crops.meta,
        nome:text(p.nome),
        mockup1:mocks.m1,
        mockup2:mocks.m2,
      });
      ok += 1;
      console.log(`GERADO ${key} · ${p.nome || ''} · origem=${crops.meta.width}x${crops.meta.height} · quadrados=${crops.meta.leftSquare}/${crops.meta.rightSquare}`);
    } catch (error) {
      errors += 1;
      console.error(`ERRO ${key} · ${p.nome || ''} · ${error?.message || error}`);
      await patchProduct(key, {
        vitrine_recortes_status:'erro',
        vitrine_recortes_erro:String(error?.message || error).slice(0, 500),
        vitrine_recortes_processador:VERSION,
        vitrine_recortes_atualizado_em:new Date().toISOString(),
      }).catch(() => {});
    }
  }

  await fs.writeFile(PENDING, JSON.stringify(pending, null, 2));
  console.log(`BUILD concluído · gerados=${ok} erros=${errors}`);
}

async function urlExists(url) {
  for (let i = 0; i < 8; i += 1) {
    const r = await fetch(url, { method:'HEAD', headers:{ 'User-Agent':'CanecaFacil-GitHub-Crops/5.0' } }).catch(() => null);
    if (r?.ok) return true;
    await sleep(1500 * (i + 1));
  }
  return false;
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
      const checks = await Promise.all([
        urlExists(item.urls.left),
        urlExists(item.urls.right),
      ]);
      if (!checks.every(Boolean)) throw new Error('arquivos ainda não estão públicos no GitHub');

      const now = new Date().toISOString();
      const storefront = [item.mockup1, item.mockup2, item.urls.left, item.urls.right].filter(isHttp);
      await patchProduct(item.key, {
        vitrine_recorte_esquerda:item.urls.left,
        vitrine_recorte_direita:item.urls.right,
        vitrine_recorte_centro:null,
        imagens_canecafacil:storefront,
        vitrine_recortes_status:'pronto',
        vitrine_recortes_erro:'',
        vitrine_recortes_processador:VERSION,
        vitrine_recortes_atualizado_em:now,
        vitrine_recortes:{
          versao:VERSION,
          status:'pronto',
          canvas_shape:'square',
          fit:'contain',
          background:'#ffffff',
          source_art:item.art,
          esquerda:item.urls.left,
          direita:item.urls.right,
          source_width:item.meta.width,
          source_height:item.meta.height,
          left_width:item.meta.leftW,
          right_width:item.meta.rightW,
          left_square_size:item.meta.leftSquare,
          right_square_size:item.meta.rightSquare,
          atualizado_em:now,
        },
        updated_at:now,
        last_update:Date.now(),
      });
      ok += 1;
      console.log(`FIREBASE OK ${item.key} · ${item.nome} · vitrine=${storefront.length} imagens`);
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
