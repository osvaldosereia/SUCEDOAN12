import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';

const BUILD = '20260831-mug-video-result-player-v5-youtube';
const POLL_INTERVAL = 2500;
const POLL_TIMEOUT = 12 * 60 * 1000;
let refreshTimer = 0;
const polling = new Map();

function text(value) {
  return String(value ?? '').trim();
}

function loadConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}') };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function firebaseContext() {
  const config = loadConfig();
  const base = text(config.firebaseUrl || DEFAULT_CONFIG.firebaseUrl).replace(/\/+$/, '');
  const node = text(config.productsNode || DEFAULT_CONFIG.productsNode || 'produtos')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.json$/i, '') || 'produtos';
  return { base, node };
}

function cardKey(card) {
  return text(
    card?.dataset.mugKey
    || card?.querySelector('[data-github-mug-video]')?.dataset.githubMugVideo
    || card?.querySelector('[data-gallery-generate-mug-video]')?.dataset.galleryGenerateMugVideo
    || card?.querySelector('[data-edit-mug]')?.dataset.editMug
  );
}

function productVideoUrl(product = {}) {
  return text(
    product.url_video_youtube
    || product.video_youtube
    || product.youtube_url
    || product.youtube_short_url
    || product.video_url
    || product.video_webm_url
    || product.video_mp4_url
    || product.video_ia_url
    || product.video
  );
}

function youtubeId(value) {
  const raw = text(value);
  if (!raw) return '';
  if (/^[A-Za-z0-9_-]{6,20}$/.test(raw) && !raw.includes('/')) return raw;
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') return text(url.pathname.split('/').filter(Boolean)[0]);
    if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      const queryId = text(url.searchParams.get('v'));
      if (queryId) return queryId;
      const parts = url.pathname.split('/').filter(Boolean);
      const marker = parts.findIndex(part => ['shorts', 'embed', 'live'].includes(part.toLowerCase()));
      if (marker >= 0) return text(parts[marker + 1]);
    }
  } catch {}
  return '';
}

function youtubeEmbedUrl(url) {
  const id = youtubeId(url);
  return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?playsinline=1&rel=0` : '';
}

async function fetchProduct(key) {
  const { base, node } = firebaseContext();
  if (!base || !key) return null;
  const response = await fetch(`${base}/${node}/${encodeURIComponent(key)}.json?_=${Date.now()}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Firebase retornou ${response.status}.`);
  return response.json();
}

function ensureDialog() {
  let dialog = document.getElementById('mugVideoResultDialogV5');
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.id = 'mugVideoResultDialogV5';
  dialog.className = 'mug-video-result-dialog-v5';
  dialog.innerHTML = `
    <div class="mug-video-result-shell">
      <div class="mug-video-result-head"><strong>Vídeo 360° da caneca</strong><button type="button" data-close-mug-video aria-label="Fechar">×</button></div>
      <iframe data-mug-youtube-frame title="Vídeo 360° da caneca" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen hidden></iframe>
      <video data-mug-direct-video controls playsinline preload="metadata" hidden></video>
      <a class="button secondary compact" data-open-mug-video target="_blank" rel="noopener">Abrir vídeo no YouTube</a>
    </div>`;
  document.body.appendChild(dialog);
  dialog.addEventListener('click', event => {
    if (event.target === dialog || event.target.closest('[data-close-mug-video]')) dialog.close();
  });
  dialog.addEventListener('close', () => {
    const video = dialog.querySelector('[data-mug-direct-video]');
    const frame = dialog.querySelector('[data-mug-youtube-frame]');
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); video.hidden = true; }
    if (frame) { frame.removeAttribute('src'); frame.hidden = true; }
  });
  return dialog;
}

function openVideo(url) {
  if (!/^https?:\/\//i.test(text(url))) return;
  const dialog = ensureDialog();
  const video = dialog.querySelector('[data-mug-direct-video]');
  const frame = dialog.querySelector('[data-mug-youtube-frame]');
  const link = dialog.querySelector('[data-open-mug-video]');
  const embed = youtubeEmbedUrl(url);
  if (embed) {
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); video.hidden = true; }
    frame.src = embed;
    frame.hidden = false;
    link.textContent = 'Abrir Short no YouTube';
  } else {
    if (frame) { frame.removeAttribute('src'); frame.hidden = true; }
    video.src = url;
    video.hidden = false;
    link.textContent = 'Abrir vídeo em nova aba';
  }
  link.href = url;
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else window.open(url, '_blank', 'noopener');
}

function ensureViewButton(card, key, url) {
  const actions = card?.querySelector('.mug-created-card-actions');
  if (!actions || !/^https?:\/\//i.test(url)) return;
  let button = actions.querySelector('[data-view-mug-video]');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'button secondary compact mug-view-video-button-v5';
    button.dataset.viewMugVideo = key;
    actions.prepend(button);
  }
  button.textContent = youtubeId(url) ? '▶ Ver Short 360°' : '▶ Ver vídeo';
  button.dataset.videoUrl = url;
  const generate = actions.querySelector('[data-github-mug-video]') || actions.querySelector('[data-gallery-generate-mug-video]');
  if (generate && generate.dataset.videoBusy !== '1' && generate.dataset.busy !== '1') generate.textContent = '🎥 Gerar novo 360°';
}

async function hydrateCard(card) {
  const key = cardKey(card);
  if (!key) return;
  try {
    const product = await fetchProduct(key);
    const url = productVideoUrl(product || {});
    if (url) ensureViewButton(card, key, url);
  } catch (error) {
    console.warn('[Canecas] não foi possível consultar vídeo salvo:', key, error);
  }
}

function hydrateCards() {
  if (window.adminV2CurrentRoute?.() !== 'mug-studio') return;
  document.querySelectorAll('#mugCreatedCards .mug-created-card').forEach(card => hydrateCard(card));
}

function scheduleHydrate(delay = 80) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(hydrateCards, delay);
}

async function pollForVideo(key, card) {
  if (!key || polling.has(key)) return;
  const started = Date.now();
  const promise = (async () => {
    while (Date.now() - started < POLL_TIMEOUT) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      try {
        const product = await fetchProduct(key);
        const url = productVideoUrl(product || {});
        if (url) {
          ensureViewButton(card, key, url);
          const status = document.querySelector('#mugCreatedStatus') || document.querySelector('#mugAutomationStatus');
          if (status) status.textContent = youtubeId(url) ? 'Short 360° publicado no YouTube e vinculado à caneca.' : 'Vídeo pronto e salvo · clique em “Ver vídeo”.';
          return url;
        }
        if (text(product?.video_360_status).toLowerCase() === 'error') return '';
      } catch {}
    }
    return '';
  })().finally(() => polling.delete(key));
  polling.set(key, promise);
  return promise;
}

function installStyles() {
  if (document.getElementById('mugVideoResultPlayerV5Style')) return;
  const style = document.createElement('style');
  style.id = 'mugVideoResultPlayerV5Style';
  style.textContent = `
    #mugStudioCreatedGrid .mug-view-video-button-v5{grid-column:1/-1!important;width:100%!important}
    .mug-video-result-dialog-v5{border:0;border-radius:18px;padding:0;max-width:min(92vw,520px);background:#111;color:#fff;box-shadow:0 24px 80px #0008}
    .mug-video-result-dialog-v5::backdrop{background:#000a}
    .mug-video-result-shell{padding:14px;display:grid;gap:12px}
    .mug-video-result-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
    .mug-video-result-head strong{font-size:16px}
    .mug-video-result-head button{width:34px;height:34px;border:0;border-radius:50%;font-size:24px;line-height:1;background:#ffffff1a;color:#fff;cursor:pointer}
    .mug-video-result-shell video,.mug-video-result-shell iframe{display:block;width:min(82vw,360px);aspect-ratio:9/16;max-height:72vh;margin:auto;border:0;border-radius:14px;background:#000}
    .mug-video-result-shell video[hidden],.mug-video-result-shell iframe[hidden]{display:none!important}
    .mug-video-result-shell a{text-align:center;text-decoration:none}
  `;
  document.head.appendChild(style);
}

function install() {
  installStyles();
  ensureDialog();
  scheduleHydrate(0);
}

document.addEventListener('click', event => {
  const view = event.target.closest('[data-view-mug-video]');
  if (view) {
    event.preventDefault();
    event.stopPropagation();
    openVideo(text(view.dataset.videoUrl));
    return;
  }
  const generate = event.target.closest('[data-github-mug-video], [data-gallery-generate-mug-video]');
  if (generate) {
    const card = generate.closest('.mug-created-card');
    const key = text(generate.dataset.githubMugVideo || generate.dataset.galleryGenerateMugVideo || cardKey(card));
    if (key && card) pollForVideo(key, card);
  }
}, true);

window.addEventListener('admin-v2-route-ready', event => {
  if (event.detail?.route === 'mug-studio') scheduleHydrate(50);
});
window.addEventListener('admin-v2-route', event => {
  if (event.detail?.route === 'mug-studio') scheduleHydrate(50);
});
window.addEventListener('admin-v2-products-invalidated', () => scheduleHydrate(100));
window.addEventListener('da:mug-created', () => scheduleHydrate(120));

const root = document.querySelector('.view[data-view="mug-studio"]') || document.body;
new MutationObserver(() => scheduleHydrate(120)).observe(root, { childList: true, subtree: true });

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();

export { BUILD, productVideoUrl, youtubeId, youtubeEmbedUrl, hydrateCards, openVideo };
