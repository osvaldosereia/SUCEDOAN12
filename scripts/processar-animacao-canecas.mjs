import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const FIREBASE = (process.env.FIREBASE_BASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/, '');
const RAW_BRANCH = String(process.env.RAW_BRANCH || process.env.GITHUB_REF_NAME || 'canecas-media').trim();
const RAW_BASE = `https://raw.githubusercontent.com/${process.env.GITHUB_REPOSITORY || 'osvaldosereia/SUCEDOAN12'}/${RAW_BRANCH}`;
const PRODUCT_KEY = String(process.env.PRODUCT_KEY || '').trim();
const FORCE = /^(1|true|yes)$/i.test(String(process.env.FORCE || ''));
const LIMIT = Math.max(0, Number(process.env.LIMIT || 0) || 0);
const MODE = String(process.env.MODE || 'build').toLowerCase();
const VERSION = 'github-ffmpeg-panorama-v1';
const PENDING = path.join(ROOT, '.canecafacil-animacao-pending.json');
const SIZE = 640;
const FPS = 18;
const DURATION = 5;

const text = value => String(value ?? '').trim();
const norm = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const slug = value => norm(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'caneca';
const isHttp = value => /^https?:\/\//i.test(text(value));
const safeKey = value => encodeURIComponent(text(value));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function isMug(product = {}) {
  return norm(`${product.tipo_produto || ''} ${product.categoria || ''} ${product.subcategoria || ''} ${product.nome || ''}`).includes('caneca');
}
function artOf(product = {}) {
  return text(product.arte_horizontal || product.arte_personalizacao || product.arte_impressao?.url || product.arte_final_url);
}
function animationUrlOf(product = {}) {
  return text(product.animacao_canecafacil || product.vitrine_animacao?.url);
}
function animationReady(product = {}) {
  const art = artOf(product);
  const source = text(product.animacao_canecafacil_source_art || product.vitrine_animacao?.source_art);
  return Boolean(art && source === art && isHttp(animationUrlOf(product)) && text(product.animacao_canecafacil_status || product.vitrine_animacao?.status) === 'pronto');
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} · ${url}`);
  const raw = await response.text();
  return raw ? JSON.parse(raw) : null;
}
async function fetchBuffer(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'CanecaFacil-GitHub-Panorama/1.0' } });
  if (!response.ok) throw new Error(`Arte ${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}
async function patchProduct(key, patch) {
  return fetchJson(`${FIREBASE}/produtos/${safeKey(key)}.json`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(patch),
  });
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`${command} terminou com código ${code}: ${stderr.slice(-1200)}`));
    });
  });
}

async function makeAnimation(buffer, outputPath) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'canecafacil-pan-'));
  const inputPath = path.join(tmpDir, 'arte-horizontal');
  try {
    await fs.writeFile(inputPath, buffer);
    const filter = [
      `scale=-2:${SIZE}`,
      `crop=${SIZE}:${SIZE}:x='(in_w-out_w)*if(lt(t,0.30),0,if(gt(t,4.70),1,(t-0.30)/4.40))':y='(in_h-out_h)/2'`,
      `fps=${FPS}`,
      'format=yuv420p',
    ].join(',');
    await run('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-loop', '1', '-framerate', String(FPS), '-i', inputPath,
      '-vf', filter,
      '-t', String(DURATION), '-an',
      '-c:v', 'libvpx-vp9', '-crf', '40', '-b:v', '0',
      '-deadline', 'good', '-cpu-used', '3', '-row-mt', '1',
      outputPath,
    ]);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function build() {
  const products = await fetchJson(`${FIREBASE}/produtos.json`) || {};
  let rows = Object.entries(products).filter(([, product]) => product && isMug(product) && isHttp(artOf(product)));
  if (PRODUCT_KEY) rows = rows.filter(([key]) => key === PRODUCT_KEY);
  if (!FORCE) rows = rows.filter(([, product]) => !animationReady(product));
  if (LIMIT) rows = rows.slice(0, LIMIT);

  console.log(`CanecaFácil panorama · candidatos=${rows.length} · force=${FORCE} · product=${PRODUCT_KEY || 'todos'}`);
  const pending = [];
  let ok = 0;
  let errors = 0;

  for (const [key, product] of rows) {
    const art = artOf(product);
    const nameSlug = slug(product.seo_slug || product.canecafacil_slug || product.nome || product.codigo || key);
    const keySlug = slug(key).slice(0, 36);
    const dirRel = path.posix.join('canecas', 'vitrine', `${nameSlug}-${keySlug}`);
    const dirAbs = path.join(ROOT, ...dirRel.split('/'));
    const file = `${nameSlug}-arte-panorama-5s.webm`;
    const fileAbs = path.join(dirAbs, file);
    const url = `${RAW_BASE}/${dirRel}/${file}`;

    await patchProduct(key, {
      animacao_canecafacil_status: 'processando',
      animacao_canecafacil_erro: '',
      animacao_canecafacil_processador: VERSION,
      animacao_canecafacil_iniciado_em: new Date().toISOString(),
    }).catch(() => {});

    try {
      await fs.mkdir(dirAbs, { recursive: true });
      await makeAnimation(await fetchBuffer(art), fileAbs);
      const stat = await fs.stat(fileAbs);
      pending.push({ key, art, url, bytes: stat.size, nome: text(product.nome) });
      ok += 1;
      console.log(`GERADO ${key} · ${product.nome || ''} · ${Math.round(stat.size / 1024)} KB`);
    } catch (error) {
      errors += 1;
      console.error(`ERRO ${key} · ${product.nome || ''} · ${error?.message || error}`);
      await patchProduct(key, {
        animacao_canecafacil_status: 'erro',
        animacao_canecafacil_erro: String(error?.message || error).slice(0, 700),
        animacao_canecafacil_processador: VERSION,
        animacao_canecafacil_atualizado_em: new Date().toISOString(),
      }).catch(() => {});
    }
  }

  await fs.writeFile(PENDING, JSON.stringify(pending, null, 2));
  console.log(`BUILD animação concluído · gerados=${ok} erros=${errors}`);
}

async function urlExists(url) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': 'CanecaFacil-GitHub-Panorama/1.0' } }).catch(() => null);
    if (response?.ok) return true;
    await sleep(1500 * (attempt + 1));
  }
  return false;
}

async function apply() {
  let pending = [];
  try { pending = JSON.parse(await fs.readFile(PENDING, 'utf8')); }
  catch { console.log('Sem animações pendentes.'); return; }

  let ok = 0;
  let errors = 0;
  for (const item of pending) {
    try {
      if (!await urlExists(item.url)) throw new Error('animação ainda não está pública no GitHub');
      const now = new Date().toISOString();
      await patchProduct(item.key, {
        animacao_canecafacil: item.url,
        animacao_canecafacil_status: 'pronto',
        animacao_canecafacil_erro: '',
        animacao_canecafacil_source_art: item.art,
        animacao_canecafacil_processador: VERSION,
        animacao_canecafacil_bytes: item.bytes,
        animacao_canecafacil_atualizado_em: now,
        vitrine_animacao: {
          versao: VERSION,
          status: 'pronto',
          url: item.url,
          source_art: item.art,
          duracao_segundos: DURATION,
          largura: SIZE,
          altura: SIZE,
          fps: FPS,
          bytes: item.bytes,
          atualizado_em: now,
        },
        updated_at: now,
        last_update: Date.now(),
      });
      ok += 1;
      console.log(`FIREBASE OK ${item.key} · ${item.nome} · ${Math.round(item.bytes / 1024)} KB`);
    } catch (error) {
      errors += 1;
      console.error(`FIREBASE ERRO ${item.key} · ${error?.message || error}`);
    }
  }

  await fs.rm(PENDING, { force: true });
  console.log(`APPLY animação concluído · prontos=${ok} erros=${errors}`);
}

if (MODE === 'apply') await apply(); else await build();
