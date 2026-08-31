import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const FIREBASE = (process.env.FIREBASE_BASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/, '');
const OUT_ROOT = path.join(ROOT, 'canecas', 'vitrine');
const RAW_BASE = `https://raw.githubusercontent.com/${process.env.GITHUB_REPOSITORY || 'osvaldosereia/SUCEDOAN12'}/${process.env.GITHUB_REF_NAME || 'main'}`;
const PRODUCT_KEY = String(process.env.PRODUCT_KEY || '').trim();
const FORCE = /^(1|true|yes)$/i.test(String(process.env.FORCE || ''));
const LIMIT = Math.max(0, Number(process.env.LIMIT || 0) || 0);
const VERSION = 'github-sharp-v1';

const text = v => String(v ?? '').trim();
const norm = v => text(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const slug = v => norm(v).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'caneca';
const isHttp = v => /^https?:\/\//i.test(text(v));
const safeKey = v => encodeURIComponent(text(v));

function isMug(p = {}) {
  return norm(`${p.tipo_produto || ''} ${p.categoria || ''} ${p.subcategoria || ''} ${p.nome || ''}`).includes('caneca');
}
function artOf(p = {}) {
  return text(p.arte_horizontal || p.arte_personalizacao || p.arte_impressao?.url || p.arte_final_url);
}
function cropsOf(p = {}) {
  return {
    left: text(p.vitrine_recorte_esquerda || p.vitrine_recortes?.esquerda),
    center: text(p.vitrine_recorte_centro || p.vitrine_recortes?.centro),
    right: text(p.vitrine_recorte_direita || p.vitrine_recortes?.direita),
  };
}
function cropReady(p = {}) {
  const c = cropsOf(p);
  const art = artOf(p);
  const source = text(p.vitrine_recortes?.source_art || p.vitrine_recortes?.arte_origem);
  return Boolean(art && source === art && isHttp(c.left) && isHttp(c.center) && isHttp(c.right));
}
function sourceReady(p = {}) {
  return isHttp(p.mockup_1) && isHttp(p.mockup_2) && isHttp(artOf(p));
}

async function fetchJson(url, options = {}) {
  const r = await fetch(url, options);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} · ${url}`);
  const raw = await r.text();
  return raw ? JSON.parse(raw) : null;
}
async function fetchBuffer(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'CanecaFacil-GitHub-Crops/1.0' } });
  if (!r.ok) throw new Error(`Imagem ${r.status}: ${url}`);
  return Buffer.from(await r.arrayBuffer());
}
async function patchProduct(key, patch) {
  return fetchJson(`${FIREBASE}/produtos/${safeKey(key)}.json`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(patch),
  });
}

async function makeCrops(buffer) {
  const base = sharp(buffer, { failOn: 'none' }).rotate();
  const meta = await base.metadata();
  const width = Number(meta.width || 0), height = Number(meta.height || 0);
  if (!width || !height) throw new Error('arte horizontal sem dimensões válidas');
  const leftW = Math.floor(width / 2);
  const rightW = width - leftW;
  const square = Math.min(height, width);
  const centerX = Math.max(0, Math.floor((width - square) / 2));
  const opts = { quality: 88, effort: 5, smartSubsample: true };
  const left = await sharp(buffer, { failOn: 'none' }).rotate().extract({ left: 0, top: 0, width: leftW, height }).webp(opts).toBuffer();
  const center = await sharp(buffer, { failOn: 'none' }).rotate().extract({ left: centerX, top: 0, width: square, height: square }).webp(opts).toBuffer();
  const right = await sharp(buffer, { failOn: 'none' }).rotate().extract({ left: leftW, top: 0, width: rightW, height }).webp(opts).toBuffer();
  return { left, center, right, meta: { width, height, leftW, rightW, square, centerX } };
}

async function processOne(key, p) {
  const art = artOf(p);
  const nameSlug = slug(p.seo_slug || p.canecafacil_slug || p.nome || p.codigo || key);
  const keySlug = slug(key).slice(0, 36);
  const dirRel = path.posix.join('canecas', 'vitrine', `${nameSlug}-${keySlug}`);
  const dirAbs = path.join(ROOT, ...dirRel.split('/'));
  const files = {
    left: `${nameSlug}-vista-esquerda.webp`,
    center: `${nameSlug}-vista-centro.webp`,
    right: `${nameSlug}-vista-direita.webp`,
  };
  const urls = Object.fromEntries(Object.entries(files).map(([k, f]) => [k, `${RAW_BASE}/${dirRel}/${f}`]));
  await patchProduct(key, {
    vitrine_recortes_status: 'processando',
    vitrine_recortes_erro: '',
    vitrine_recortes_processador: VERSION,
    vitrine_recortes_iniciado_em: new Date().toISOString(),
  });
  try {
    const source = await fetchBuffer(art);
    const crops = await makeCrops(source);
    await fs.mkdir(dirAbs, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(dirAbs, files.left), crops.left),
      fs.writeFile(path.join(dirAbs, files.center), crops.center),
      fs.writeFile(path.join(dirAbs, files.right), crops.right),
    ]);
    const patch = {
      vitrine_recorte_esquerda: urls.left,
      vitrine_recorte_centro: urls.center,
      vitrine_recorte_direita: urls.right,
      imagens_canecafacil: [text(p.mockup_1), text(p.mockup_2), urls.left, urls.center, urls.right],
      vitrine_recortes_status: 'pronto',
      vitrine_recortes_erro: '',
      vitrine_recortes_processador: VERSION,
      vitrine_recortes_atualizado_em: new Date().toISOString(),
      vitrine_recortes: {
        versao: VERSION,
        status: 'pronto',
        source_art: art,
        esquerda: urls.left,
        centro: urls.center,
        direita: urls.right,
        source_width: crops.meta.width,
        source_height: crops.meta.height,
        left_width: crops.meta.leftW,
        center_width: crops.meta.square,
        right_width: crops.meta.rightW,
        atualizado_em: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
      last_update: Date.now(),
    };
    await patchProduct(key, patch);
    console.log(`OK ${key} · ${p.nome || ''} · ${crops.meta.width}x${crops.meta.height}`);
    return true;
  } catch (error) {
    await patchProduct(key, {
      vitrine_recortes_status: 'erro',
      vitrine_recortes_erro: String(error?.message || error).slice(0, 500),
      vitrine_recortes_processador: VERSION,
      vitrine_recortes_atualizado_em: new Date().toISOString(),
    }).catch(() => {});
    console.error(`ERRO ${key} · ${p.nome || ''} · ${error?.message || error}`);
    return false;
  }
}

const products = await fetchJson(`${FIREBASE}/produtos.json`) || {};
let rows = Object.entries(products).filter(([key, p]) => p && isMug(p));
if (PRODUCT_KEY) rows = rows.filter(([key]) => key === PRODUCT_KEY);
rows = rows.filter(([, p]) => sourceReady(p));
if (!FORCE) rows = rows.filter(([, p]) => !cropReady(p));
if (LIMIT) rows = rows.slice(0, LIMIT);

console.log(`CanecaFácil recortes GitHub · candidatos=${rows.length} · force=${FORCE} · product=${PRODUCT_KEY || 'todos'}`);
let ok = 0, errors = 0;
for (const [key, product] of rows) {
  if (await processOne(key, product)) ok += 1;
  else errors += 1;
}
console.log(`RESUMO processados=${ok} erros=${errors}`);
if (errors) process.exitCode = 2;
