import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const FIREBASE_URL = String(process.env.FIREBASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/+$/, '');
const PRODUCTS_NODE = String(process.env.PRODUCTS_NODE || 'produtos').replace(/^\/+|\/+$/g, '');
const FIREBASE_AUTH = String(process.env.FIREBASE_AUTH_TOKEN || '').trim();
const RESULT_FILE = String(process.env.MUG3D_RESULT_FILE || '.mug3d-result.json');
const VIDEO_PATH = String(process.env.YOUTUBE_VIDEO_PATH || '').trim();
const MAKE_WEBHOOK = String(process.env.MAKE_YOUTUBE_WEBHOOK_URL || '').trim();
const MAX_UPLOAD_BYTES = Math.max(1_000_000, Number(process.env.MAKE_YOUTUBE_MAX_BYTES || 4_800_000));

const text = value => String(value ?? '').trim();
const safeName = value => text(value).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 110) || `caneca-${Date.now()}`;

function authQuery() {
  return FIREBASE_AUTH ? `?auth=${encodeURIComponent(FIREBASE_AUTH)}` : '';
}

async function patchProduct(key, patch) {
  const url = `${FIREBASE_URL}/${PRODUCTS_NODE}/${encodeURIComponent(key)}.json${authQuery()}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error(`Firebase PATCH final: HTTP ${response.status} · ${await response.text()}`);
  return response.json();
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

function normalizeYouTubeResult(data) {
  const explicitUrl = deepValue(data, [
    'url_video_youtube', 'youtube_url', 'youtubeUrl', 'short_url', 'shortUrl', 'url', 'link',
    'data.url_video_youtube', 'data.youtube_url', 'data.short_url', 'data.url', 'result.url',
  ]);
  const explicitId = deepValue(data, [
    'youtube_id', 'youtubeId', 'video_id', 'videoId', 'id',
    'data.youtube_id', 'data.video_id', 'data.videoId', 'data.id', 'result.id',
  ]);
  const id = youtubeIdFrom(explicitId) || youtubeIdFrom(explicitUrl);
  if (!id) throw new Error(`O Make publicou o vídeo, mas não devolveu um ID/link do YouTube reconhecível. Resposta: ${JSON.stringify(data).slice(0, 900)}`);
  return {
    id,
    watchUrl: `https://www.youtube.com/watch?v=${id}`,
    shortUrl: `https://www.youtube.com/shorts/${id}`,
  };
}

async function uploadToMake(result, mp4Path) {
  if (!/^https:\/\/hook\.[^/]+\.make\.com\//i.test(MAKE_WEBHOOK) && !/^https:\/\/[^/]*make\.com\//i.test(MAKE_WEBHOOK)) {
    throw new Error('MAKE_YOUTUBE_WEBHOOK_URL não está configurado com uma URL de webhook do Make.');
  }
  const video = await fs.readFile(mp4Path);
  if (!video.length) throw new Error('O MP4 temporário está vazio.');
  if (video.length > MAX_UPLOAD_BYTES) throw new Error(`O MP4 temporário ficou com ${(video.length / 1024 / 1024).toFixed(2)} MB; limite configurado ${(MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(2)} MB.`);
  const productName = text(result.product_name) || 'Caneca personalizada';
  const title = `${productName} | Caneca 360° #Shorts`.slice(0, 100);
  const description = `${productName}\n\nVisualização 360° da caneca personalizada.\n#Shorts #CanecaPersonalizada #CanecaFacil`;
  const filename = `${safeName(result.product_key)}-360-short.mp4`;
  const form = new FormData();
  form.append('product_key', result.product_key);
  form.append('title', title);
  form.append('description', description);
  form.append('privacy_status', 'public');
  form.append('embeddable', 'true');
  form.append('notify_subscribers', 'false');
  form.append('video', new Blob([video], { type: 'video/mp4' }), filename);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6 * 60 * 1000);
  try {
    const response = await fetch(MAKE_WEBHOOK, { method: 'POST', body: form, signal: controller.signal });
    const raw = await response.text();
    let parsed = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch {}
    if (!response.ok) throw new Error(`Make/YouTube respondeu HTTP ${response.status}: ${raw.slice(0, 900)}`);
    if (!parsed) throw new Error(`Make não devolveu JSON após o upload do YouTube. Resposta: ${raw.slice(0, 900)}`);
    if (parsed.ok === false) throw new Error(text(parsed.error || parsed.erro || parsed.message) || 'Make recusou o upload para o YouTube.');
    return { youtube: normalizeYouTubeResult(parsed), response: parsed, bytes: video.length, filename };
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('O upload/publicação no YouTube ultrapassou 6 minutos.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

const result = JSON.parse(await fs.readFile(RESULT_FILE, 'utf8'));
if (result.status !== 'generated' || !result.product_key) {
  console.log(`Nada para publicar: status=${result.status || 'desconhecido'}.`);
  process.exit(0);
}

const mp4Path = VIDEO_PATH || path.resolve('.tmp-mug3d', `${safeName(result.product_key)}-360-short.mp4`);
try {
  const upload = await uploadToMake(result, mp4Path);
  await patchProduct(result.product_key, {
    url_video_youtube: upload.youtube.watchUrl,
    video_youtube: upload.youtube.watchUrl,
    youtube_url: upload.youtube.watchUrl,
    youtube_short_url: upload.youtube.shortUrl,
    youtube_video_id: upload.youtube.id,
    video_url: null,
    video_webm_url: null,
    video_mp4_url: null,
    video_ia_url: null,
    video_360_status: 'ready',
    video_360_error: null,
    video_360_finished_at: new Date().toISOString(),
    video_360_engine: 'mug3d-playwright-github-actions-make-youtube-v2',
    video_360_meta: {
      source_webm_bytes: Number(result.recording?.bytes || 0),
      youtube_upload_bytes: upload.bytes,
      youtube_id: upload.youtube.id,
      loop_detected: result.recording?.detected === true,
      loop_ms: Number(result.recording?.elapsedMs || 0),
      placement_fallback: result.placement?.uploadFallback === true,
      storage: 'youtube',
    },
  });
  console.log(`YouTube Short publicado e vinculado ao produto ${result.product_key}: ${upload.youtube.watchUrl}`);
} catch (error) {
  const message = error?.stack || error?.message || String(error);
  await patchProduct(result.product_key, {
    video_360_status: 'error',
    video_360_error: message.slice(0, 1800),
    video_360_finished_at: new Date().toISOString(),
    video_360_engine: 'mug3d-playwright-github-actions-make-youtube-v2',
  }).catch(() => {});
  throw error;
}
