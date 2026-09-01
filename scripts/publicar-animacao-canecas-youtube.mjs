import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const FIREBASE = (process.env.FIREBASE_BASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/, '');
const MAKE_WEBHOOK = String(process.env.MAKE_YOUTUBE_WEBHOOK_URL || '').trim();
const REQUESTED_PRODUCT_KEY = String(process.env.REQUESTED_PRODUCT_KEY || '').trim();
const MAX_UPLOAD_BYTES = Math.max(1_000_000, Number(process.env.MAKE_YOUTUBE_MAX_BYTES || 4_800_000));
const QUEUE = 'canecas/integracoes/loja_integrada/fila';
const VERSION = 'github-panorama-youtube-v1';

const text = value => String(value ?? '').trim();
const norm = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const pathKey = value => encodeURIComponent(text(value));
const safeName = value => text(value).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'caneca';
const now = () => new Date().toISOString();

function liActive(product = {}) {
  if (product.loja_integrada_ativo === true) return true;
  if (product.loja_integrada_ativo === false) return false;
  return product.canecafacil_ativo === true;
}
function animationOf(product = {}) {
  return text(product.animacao_canecafacil || product.vitrine_animacao?.url);
}
function animationReady(product = {}) {
  return /^https?:\/\//i.test(animationOf(product))
    && text(product.animacao_canecafacil_status || product.vitrine_animacao?.status) === 'pronto';
}
function alreadyPublished(product = {}) {
  const animation = animationOf(product);
  return Boolean(animation
    && text(product.video_panorama_youtube_status) === 'ready'
    && text(product.video_panorama_youtube_source) === animation
    && /^https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(text(product.url_video_youtube || product.video_youtube)));
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
  if (!response.ok) throw new Error(`${response.status} ${raw.slice(0, 700)}`);
  return data;
}
async function fbGet(pathName) {
  return jsonFetch(`${FIREBASE}/${pathName}.json`, { headers: { Accept: 'application/json' } });
}
async function fbPatch(pathName, value) {
  return jsonFetch(`${FIREBASE}/${pathName}.json`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(value),
  });
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`${command} código ${code}: ${stderr.slice(-1200)}`)));
  });
}

function deepValue(source, keys) {
  if (!source || typeof source !== 'object') return '';
  for (const key of keys) {
    const parts = key.split('.');
    let value = source;
    for (const part of parts) value = value && typeof value === 'object' ? value[part] : undefined;
    if (text(value)) return text(value);
  }
  return '';
}
function youtubeIdFrom(value) {
  const raw = text(value);
  if (!raw) return '';
  if (/^[A-Za-z0-9_-]{6,20}$/.test(raw) && !raw.includes('/')) return raw;
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') return text(url.pathname.split('/').filter(Boolean)[0]);
    if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      const query = text(url.searchParams.get('v'));
      if (query) return query;
      const parts = url.pathname.split('/').filter(Boolean);
      const marker = parts.findIndex(part => ['shorts', 'embed', 'live'].includes(part.toLowerCase()));
      if (marker >= 0) return text(parts[marker + 1]);
    }
  } catch {}
  return '';
}
function normalizeYoutube(data) {
  const explicitUrl = deepValue(data, [
    'url_video_youtube', 'youtube_url', 'youtubeUrl', 'short_url', 'shortUrl', 'url', 'link',
    'data.url_video_youtube', 'data.youtube_url', 'data.short_url', 'data.url', 'result.url',
  ]);
  const explicitId = deepValue(data, [
    'youtube_id', 'youtubeId', 'video_id', 'videoId', 'id',
    'data.youtube_id', 'data.video_id', 'data.videoId', 'data.id', 'result.id',
  ]);
  const id = youtubeIdFrom(explicitId) || youtubeIdFrom(explicitUrl);
  if (!id) throw new Error(`Make publicou, mas não devolveu ID/link do YouTube: ${JSON.stringify(data).slice(0, 900)}`);
  return { id, watchUrl: `https://www.youtube.com/watch?v=${id}` };
}

async function selectProduct() {
  if (REQUESTED_PRODUCT_KEY) {
    const product = await fbGet(`produtos/${pathKey(REQUESTED_PRODUCT_KEY)}`);
    if (!product) throw new Error('Caneca solicitada não encontrada.');
    return [REQUESTED_PRODUCT_KEY, product];
  }
  const products = await fbGet('produtos') || {};
  const rows = Object.entries(products)
    .filter(([, product]) => product && liActive(product) && animationReady(product) && !alreadyPublished(product))
    .filter(([, product]) => !['processing'].includes(text(product.video_panorama_youtube_status)))
    .sort((a, b) => Date.parse(a[1].animacao_canecafacil_atualizado_em || a[1].updated_at || 0) - Date.parse(b[1].animacao_canecafacil_atualizado_em || b[1].updated_at || 0));
  return rows[0] || null;
}

async function downloadTo(url, destination) {
  const response = await fetch(url, { headers: { 'User-Agent': 'CanecaFacil-Panorama-Youtube/1.0' } });
  if (!response.ok) throw new Error(`Download da animação: HTTP ${response.status}`);
  await fs.writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

async function convertToMp4(webmPath, mp4Path) {
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', webmPath,
    '-vf', 'scale=640:640:force_original_aspect_ratio=decrease,pad=640:640:(ow-iw)/2:(oh-ih)/2:color=white,fps=18',
    '-t', '5', '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4Path,
  ]);
}

async function uploadToMake(key, product, mp4Path) {
  if (!/^https:\/\/hook\.[^/]+\.make\.com\//i.test(MAKE_WEBHOOK) && !/^https:\/\/[^/]*make\.com\//i.test(MAKE_WEBHOOK)) {
    throw new Error('Secret MAKE_YOUTUBE_WEBHOOK_URL não configurado.');
  }
  const video = await fs.readFile(mp4Path);
  if (!video.length) throw new Error('MP4 panorâmico vazio.');
  if (video.length > MAX_UPLOAD_BYTES) throw new Error(`MP4 panorâmico ficou grande demais: ${(video.length / 1024 / 1024).toFixed(2)} MB.`);

  const productName = text(product.nome) || 'Caneca personalizada';
  const form = new FormData();
  form.append('product_key', key);
  form.append('title', `${productName} | Veja toda a arte`.slice(0, 100));
  form.append('description', `${productName}\n\nArte da caneca em movimento por 5 segundos.\n#CanecaFacil #CanecaPersonalizada`);
  form.append('privacy_status', 'unlisted');
  form.append('embeddable', 'true');
  form.append('notify_subscribers', 'false');
  form.append('video', new Blob([video], { type: 'video/mp4' }), `${safeName(key)}-arte-5s.mp4`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6 * 60 * 1000);
  try {
    const response = await fetch(MAKE_WEBHOOK, { method: 'POST', body: form, signal: controller.signal });
    const raw = await response.text();
    let parsed = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch {}
    if (!response.ok) throw new Error(`Make/YouTube HTTP ${response.status}: ${raw.slice(0, 900)}`);
    if (!parsed) throw new Error(`Make não devolveu JSON: ${raw.slice(0, 900)}`);
    if (parsed.ok === false) throw new Error(text(parsed.error || parsed.erro || parsed.message) || 'Make recusou o upload.');
    return { youtube: normalizeYoutube(parsed), bytes: video.length };
  } finally {
    clearTimeout(timer);
  }
}

const selected = await selectProduct();
if (!selected) {
  console.log('Nenhuma caneca com animação pendente de publicação no YouTube.');
  process.exit(0);
}

const [key, initialProduct] = selected;
const animationUrl = animationOf(initialProduct);
const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'canecafacil-youtube-'));
const webmPath = path.join(tmpDir, 'panorama.webm');
const mp4Path = path.join(tmpDir, 'panorama.mp4');

await fbPatch(`produtos/${pathKey(key)}`, {
  video_panorama_youtube_status: 'processing',
  video_panorama_youtube_error: '',
  video_panorama_youtube_started_at: now(),
  video_panorama_youtube_engine: VERSION,
}).catch(() => {});

try {
  await downloadTo(animationUrl, webmPath);
  await convertToMp4(webmPath, mp4Path);
  const upload = await uploadToMake(key, initialProduct, mp4Path);
  const freshProduct = await fbGet(`produtos/${pathKey(key)}`) || initialProduct;
  const liMeta = freshProduct.loja_integrada && typeof freshProduct.loja_integrada === 'object' ? freshProduct.loja_integrada : {};
  const at = now();

  await fbPatch(`produtos/${pathKey(key)}`, {
    url_video_youtube: upload.youtube.watchUrl,
    video_youtube: upload.youtube.watchUrl,
    youtube_url: upload.youtube.watchUrl,
    youtube_video_id: upload.youtube.id,
    video_panorama_youtube_status: 'ready',
    video_panorama_youtube_error: '',
    video_panorama_youtube_source: animationUrl,
    video_panorama_youtube_finished_at: at,
    video_panorama_youtube_engine: VERSION,
    video_panorama_youtube_bytes: upload.bytes,
    loja_integrada: {
      ...liMeta,
      sync_status: 'pendente',
      sync_error: '',
      sync_solicitado_em: at,
      sync_motivo: 'video_panorama',
    },
    updated_at: at,
    last_update: Date.now(),
  });

  await fbPatch(`${QUEUE}/${pathKey(key)}`, {
    product_key: key,
    status: 'pendente',
    erro: '',
    tentativas: 0,
    proxima_tentativa_em: '',
    solicitado_em: at,
    atualizado_em: at,
    motivo: 'video_panorama',
  });

  console.log(`Animação publicada e enfileirada para Loja Integrada: ${key} · ${upload.youtube.watchUrl} · ${Math.round(upload.bytes / 1024)} KB`);
} catch (error) {
  const message = error?.stack || error?.message || String(error);
  await fbPatch(`produtos/${pathKey(key)}`, {
    video_panorama_youtube_status: 'error',
    video_panorama_youtube_error: message.slice(0, 1800),
    video_panorama_youtube_finished_at: now(),
    video_panorama_youtube_engine: VERSION,
  }).catch(() => {});
  throw error;
} finally {
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
}
