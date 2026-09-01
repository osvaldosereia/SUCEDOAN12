import { FIREBASE_BASE, text, safeKey, mugArt } from '../shared/mug-commerce-v1.js?v=20260828-1';

const BUILD = '20260901-admin-canecas-art-panorama-v1';
const PRODUCTS_NODE = 'produtos';
const DURATION_MS = 5000;
const EXPORT_SIZE = 720;
const EXPORT_FPS = 24;
const EXPORT_BITRATE = 520000;
const $ = (selector, root = document) => root.querySelector(selector);

function toast(message, error = false) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast${error ? ' error' : ''}`;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, error ? 7000 : 3600);
}

async function fbGet(path) {
  const response = await fetch(`${FIREBASE_BASE}/${path}.json?_=${Date.now()}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Firebase ${response.status}`);
  return response.json();
}

function slug(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'arte-caneca';
}

function injectStyles() {
  if ($('#cfArtPanoramaStyles')) return;
  const style = document.createElement('style');
  style.id = 'cfArtPanoramaStyles';
  style.textContent = `
    .cf-art-panorama-grid{display:grid;grid-template-columns:minmax(220px,320px) 1fr;gap:16px;align-items:start}
    .cf-art-panorama-stage{position:relative;width:100%;aspect-ratio:1/1;overflow:hidden;border-radius:14px;background:#f2f1ed;border:1px solid rgba(17,19,21,.12)}
    .cf-art-panorama-stage img{position:absolute;left:0;top:0;max-width:none!important;max-height:none!important;will-change:transform;user-select:none;pointer-events:none}
    .cf-art-panorama-stage:after{content:'5 s';position:absolute;right:9px;bottom:9px;padding:4px 7px;border-radius:999px;background:rgba(17,19,21,.72);color:#fff;font:700 11px/1 system-ui,sans-serif}
    .cf-art-panorama-copy{display:grid;gap:9px;align-content:start}
    .cf-art-panorama-copy p{margin:0;color:#6e756d;font-size:13px;line-height:1.45}
    .cf-art-panorama-copy .mini-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:3px}
    .cf-art-panorama-status{min-height:18px;color:#6e756d;font-size:12px}
    @media(max-width:720px){.cf-art-panorama-grid{grid-template-columns:1fr}.cf-art-panorama-stage{max-width:320px}}
  `;
  document.head.appendChild(style);
}

function displayMetrics(image, viewport) {
  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;
  const vw = viewport.clientWidth || 300;
  const vh = viewport.clientHeight || vw;
  if (!iw || !ih) return null;
  const scale = Math.max(vw / iw, vh / ih);
  const width = iw * scale;
  const height = ih * scale;
  return {
    width,
    height,
    overflowX: Math.max(0, width - vw),
    overflowY: Math.max(0, height - vh),
  };
}

function startPreview(image, viewport) {
  if (image.__cfPanoramaAnimation) image.__cfPanoramaAnimation.cancel();
  const metrics = displayMetrics(image, viewport);
  if (!metrics) return;

  image.style.width = `${metrics.width}px`;
  image.style.height = `${metrics.height}px`;
  const y = -metrics.overflowY / 2;
  const start = `translate3d(0px, ${y}px, 0)`;
  const end = `translate3d(${-metrics.overflowX}px, ${y}px, 0)`;

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    image.style.transform = `translate3d(${-metrics.overflowX / 2}px, ${y}px, 0)`;
    return;
  }

  image.__cfPanoramaAnimation = image.animate([
    { transform: start, offset: 0 },
    { transform: start, offset: 0.08 },
    { transform: end, offset: 0.92 },
    { transform: end, offset: 1 },
  ], {
    duration: DURATION_MS,
    iterations: Infinity,
    easing: 'ease-in-out',
  });
}

function preferredWebmType() {
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return '';
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return candidates.find(type => MediaRecorder.isTypeSupported(type)) || '';
}

function loadImageForCanvas(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('A prévia funciona, mas esta origem de imagem não liberou a exportação pelo navegador.'));
    image.src = source;
  });
}

function easedPan(progress) {
  if (progress <= 0.08) return 0;
  if (progress >= 0.92) return 1;
  const p = (progress - 0.08) / 0.84;
  return p * p * (3 - 2 * p);
}

function drawExportFrame(ctx, image, progress) {
  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;
  const scale = Math.max(EXPORT_SIZE / iw, EXPORT_SIZE / ih);
  const width = iw * scale;
  const height = ih * scale;
  const overflowX = Math.max(0, width - EXPORT_SIZE);
  const x = -overflowX * easedPan(progress);
  const y = (EXPORT_SIZE - height) / 2;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, EXPORT_SIZE, EXPORT_SIZE);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, x, y, width, height);
}

async function makeWebm(source) {
  const mimeType = preferredWebmType();
  if (!mimeType) throw new Error('Este navegador não oferece exportação WebM por canvas. A prévia leve continua funcionando normalmente.');

  const image = await loadImageForCanvas(source);
  const canvas = document.createElement('canvas');
  canvas.width = EXPORT_SIZE;
  canvas.height = EXPORT_SIZE;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas indisponível para exportar o vídeo.');

  drawExportFrame(ctx, image, 0);
  const stream = canvas.captureStream(EXPORT_FPS);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: EXPORT_BITRATE });
  const chunks = [];
  recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };

  const stopped = new Promise((resolve, reject) => {
    recorder.onerror = event => reject(event.error || new Error('Falha ao gravar o WebM.'));
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  recorder.start(250);
  const startedAt = performance.now();
  await new Promise(resolve => {
    const frame = now => {
      const elapsed = Math.min(DURATION_MS, now - startedAt);
      drawExportFrame(ctx, image, elapsed / DURATION_MS);
      if (elapsed < DURATION_MS) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
  await new Promise(resolve => setTimeout(resolve, 70));
  recorder.stop();
  stream.getTracks().forEach(track => track.stop());
  return stopped;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function renderPanorama() {
  injectStyles();
  const content = $('#drawerContent');
  const key = text(content?.dataset.productKey);
  if (!content || !key || $('#cfArtPanorama', content)) return;

  const product = await fbGet(`${PRODUCTS_NODE}/${safeKey(key)}`).catch(() => null);
  if (!product || content.dataset.productKey !== key) return;
  const art = mugArt(product);
  if (!/^https?:\/\//i.test(art) && !/^data:image\//i.test(art)) return;

  const anchor = $('.drawer-actions', content);
  if (!anchor) return;
  const section = document.createElement('div');
  section.id = 'cfArtPanorama';
  section.className = 'form-section';
  section.innerHTML = `
    <h3>Arte em movimento · 5 segundos</h3>
    <div class="cf-art-panorama-grid">
      <div class="cf-art-panorama-stage" id="cfArtPanoramaStage" aria-label="Prévia quadrada da arte horizontal em movimento">
        <img id="cfArtPanoramaImage" src="${art.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" alt="Arte horizontal em movimento">
      </div>
      <div class="cf-art-panorama-copy">
        <div class="notice"><b>Prévia ultraleve</b><br>Usa a própria arte horizontal e apenas a movimenta da direita para a esquerda. Não cria arquivo, não duplica imagem e não ocupa armazenamento extra.</div>
        <p>Formato visual 1:1. O percurso completo dura 5 segundos e preserva exatamente a arte original.</p>
        <div class="mini-actions">
          <button type="button" class="secondary" id="cfArtPanoramaReplay">Reiniciar prévia</button>
          <button type="button" class="secondary" id="cfArtPanoramaDownload">Baixar WebM 720×720</button>
        </div>
        <div class="cf-art-panorama-status" id="cfArtPanoramaStatus">WebM é opcional e só é criado quando você clicar em baixar.</div>
      </div>
    </div>`;
  anchor.insertAdjacentElement('beforebegin', section);

  const image = $('#cfArtPanoramaImage', section);
  const stage = $('#cfArtPanoramaStage', section);
  const replay = $('#cfArtPanoramaReplay', section);
  const download = $('#cfArtPanoramaDownload', section);
  const status = $('#cfArtPanoramaStatus', section);

  const play = () => {
    if (image.complete && image.naturalWidth) startPreview(image, stage);
  };
  image.addEventListener('load', play, { once: true });
  play();
  replay.addEventListener('click', play);

  if (!preferredWebmType()) {
    download.disabled = true;
    download.title = 'Exportação WebM não suportada neste navegador';
    status.textContent = 'Seu navegador pode exibir a animação, mas não oferece exportação WebM por canvas.';
  } else {
    download.addEventListener('click', async () => {
      download.disabled = true;
      download.textContent = 'Gerando 5 s…';
      status.textContent = 'Gerando localmente no navegador, sem IA e sem enviar a arte para outro serviço…';
      try {
        const blob = await makeWebm(art);
        downloadBlob(blob, `${slug(product.nome || product.codigo || key)}-arte-5s.webm`);
        const kb = Math.max(1, Math.round(blob.size / 1024));
        status.textContent = `WebM gerado: aproximadamente ${kb} KB. Nenhuma cópia foi salva no servidor.`;
        toast(`Vídeo WebM gerado · ${kb} KB`);
      } catch (error) {
        status.textContent = text(error?.message || error);
        toast(error?.message || error, true);
      } finally {
        download.disabled = false;
        download.textContent = 'Baixar WebM 720×720';
      }
    });
  }
}

window.addEventListener('admin-canecas:drawer', event => {
  if (event.detail?.kind === 'mug') setTimeout(() => renderPanorama().catch(() => {}), 100);
});

window.addEventListener('resize', () => {
  const section = $('#cfArtPanorama');
  if (!section) return;
  const image = $('#cfArtPanoramaImage', section);
  const stage = $('#cfArtPanoramaStage', section);
  if (image && stage && image.complete) startPreview(image, stage);
});

document.documentElement.dataset.cfArtPanorama = BUILD;
export { BUILD, DURATION_MS, EXPORT_SIZE, makeWebm };
