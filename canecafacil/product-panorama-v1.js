import { FIREBASE_BASE, text, safeKey } from '../shared/mug-commerce-v1.js?v=20260828-1';

const BUILD = '20260901-canecafacil-product-panorama-v1';
const $ = (selector, root = document) => root.querySelector(selector);
const cache = new Map();
let renderToken = 0;

function currentProductKey() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [route = '', arg = ''] = raw.split('/');
  if (route !== 'produto' || !arg) return '';
  try { return decodeURIComponent(arg); } catch { return arg; }
}

async function getProduct(key) {
  if (cache.has(key)) return cache.get(key);
  const promise = fetch(`${FIREBASE_BASE}/produtos/${encodeURIComponent(safeKey(key))}.json?_=${Date.now()}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  }).then(async response => {
    if (!response.ok) throw new Error(`Firebase ${response.status}`);
    return response.json();
  }).catch(() => null);
  cache.set(key, promise);
  return promise;
}

function animationOf(product = {}) {
  const value = text(product.animacao_canecafacil || product.vitrine_animacao?.url);
  return /^https?:\/\//i.test(value) ? value : '';
}

function posterOf(product = {}) {
  const value = text(product.vitrine_recorte_centro || product.vitrine_recortes?.centro || product.mockup_1 || product.mockup_2);
  return /^https?:\/\//i.test(value) ? value : '';
}

function injectStyles() {
  if ($('#cfProductPanoramaStyles')) return;
  const style = document.createElement('style');
  style.id = 'cfProductPanoramaStyles';
  style.textContent = `
    .gallery .cf-product-panorama{grid-column:1/-1;aspect-ratio:auto;background:transparent;display:grid;justify-items:center;overflow:visible;padding:10px 0 2px}
    .gallery .cf-product-panorama-frame{position:relative;width:min(100%,720px);aspect-ratio:1/1;overflow:hidden;background:var(--soft,#f6f5f2)}
    .gallery .cf-product-panorama video{display:block;width:100%;height:100%;object-fit:cover;background:var(--soft,#f6f5f2)}
    .gallery .cf-product-panorama-badge{position:absolute;left:12px;bottom:12px;z-index:2;padding:7px 10px;border-radius:999px;background:rgba(17,17,17,.78);color:#fff;font:800 10px/1 system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;pointer-events:none}
    @media(max-width:780px){.gallery .cf-product-panorama{padding-top:4px}.gallery .cf-product-panorama-frame{width:100%}}
  `;
  document.head.appendChild(style);
}

async function renderPanorama() {
  const token = ++renderToken;
  const key = currentProductKey();
  if (!key) return;
  const gallery = $('.gallery');
  if (!gallery || $('#cfProductPanorama', gallery)) return;

  const product = await getProduct(key);
  if (token !== renderToken || currentProductKey() !== key || !product) return;
  const animation = animationOf(product);
  if (!animation) return;
  const currentGallery = $('.gallery');
  if (!currentGallery || $('#cfProductPanorama', currentGallery)) return;

  injectStyles();
  const figure = document.createElement('figure');
  figure.id = 'cfProductPanorama';
  figure.className = 'cf-product-panorama';
  const frame = document.createElement('div');
  frame.className = 'cf-product-panorama-frame';
  const video = document.createElement('video');
  video.src = animation;
  video.autoplay = true;
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.setAttribute('aria-label', `Arte completa em movimento de ${text(product.nome || 'caneca')}`);
  const poster = posterOf(product);
  if (poster) video.poster = poster;
  video.addEventListener('error', () => figure.remove(), { once: true });
  const badge = document.createElement('span');
  badge.className = 'cf-product-panorama-badge';
  badge.textContent = 'Veja toda a arte · 5 s';
  frame.append(video, badge);
  figure.appendChild(frame);
  currentGallery.appendChild(figure);
  video.play().catch(() => {});
}

let scheduled = 0;
function scheduleRender() {
  clearTimeout(scheduled);
  scheduled = setTimeout(() => renderPanorama().catch(() => {}), 60);
}

window.addEventListener('hashchange', scheduleRender);
window.addEventListener('popstate', scheduleRender);
const app = $('#app');
if (app) new MutationObserver(scheduleRender).observe(app, { childList: true, subtree: true });
scheduleRender();

document.documentElement.dataset.cfProductPanorama = BUILD;
export { BUILD };
