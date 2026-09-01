import fs from 'node:fs/promises';
import process from 'node:process';

const FIREBASE_URL = String(process.env.FIREBASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/+$/, '');
const PRODUCTS_NODE = String(process.env.PRODUCTS_NODE || 'produtos').replace(/^\/+|\/+$/g, '');
const FIREBASE_AUTH = String(process.env.FIREBASE_AUTH_TOKEN || '').trim();
const RESULT_FILE = String(process.env.MUG3D_RESULT_FILE || '.mug3d-result.json');
const REPOSITORY = String(process.env.GITHUB_REPOSITORY || 'osvaldosereia/SUCEDOAN12');
const BRANCH = String(process.env.GITHUB_REF_NAME || 'main');

const result = JSON.parse(await fs.readFile(RESULT_FILE, 'utf8'));
if (result.status !== 'generated' || !result.product_key || !result.video_path) {
  console.log(`Nada para publicar: status=${result.status || 'desconhecido'}.`);
  process.exit(0);
}

const videoUrl = `https://raw.githubusercontent.com/${REPOSITORY}/${encodeURIComponent(BRANCH)}/${result.video_path.split('/').map(encodeURIComponent).join('/')}`;
const auth = FIREBASE_AUTH ? `?auth=${encodeURIComponent(FIREBASE_AUTH)}` : '';
const url = `${FIREBASE_URL}/${PRODUCTS_NODE}/${encodeURIComponent(result.product_key)}.json${auth}`;
const patch = {
  video_url: videoUrl,
  video_webm_url: videoUrl,
  video_360_status: 'ready',
  video_360_error: null,
  video_360_finished_at: new Date().toISOString(),
  video_360_engine: 'mug3d-playwright-github-actions-v1',
  video_360_meta: {
    bytes: Number(result.recording?.bytes || 0),
    loop_detected: result.recording?.detected === true,
    loop_ms: Number(result.recording?.elapsedMs || 0),
    placement_fallback: result.placement?.uploadFallback === true,
  },
};
const response = await fetch(url, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify(patch),
});
if (!response.ok) throw new Error(`Firebase PATCH final: HTTP ${response.status} · ${await response.text()}`);
console.log(`Vídeo publicado no produto ${result.product_key}: ${videoUrl}`);
