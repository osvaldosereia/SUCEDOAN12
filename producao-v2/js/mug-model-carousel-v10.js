import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { text } from './core/utils.js';

const BUILD = '20260825-mug-model-carousel-v10';
const MODELS_NODE = 'canecas/modelos_criacao';
const MODEL_LIMIT = 12;
const PLACEHOLDER = '../site/img/logoantonia5.png';

let loading = false;
let models = [];
let timer = null;
let shelfObserver = null;

function loadConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}') };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function firebaseBase() {
  return text(loadConfig().firebaseUrl || DEFAULT_CONFIG.firebaseUrl).replace(/\/+$/, '');
}

function productsNode() {
  return text(loadConfig().productsNode || DEFAULT_CONFIG.productsNode || 'produtos')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.json$/i, '') || 'produtos';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(text(value));
}

function uniqueUrls(values = []) {
  const result = [];
  for (const value of values.flat(Infinity)) {
    const url = text(value);
    if (!isHttpUrl(url) || result.includes(url)) continue;
    result.push(url);
  }
  return result;
}

function productMockups(product = {}) {
  const site = Array.isArray(product.imagens_site) ? product.imagens_site : [];
  const images = Array.isArray(product.imagens) ? product.imagens : [];
  const admin = Array.isArray(product.midias_admin) ? product.midias_admin : [];
  return uniqueUrls([
    product.mockup_1,
    product.mockup_2,
    product.mockup_3,
    site.slice(0, 3),
    images.slice(0, 3),
    admin.slice(0, 3),
    product.url_imagem,
    product.imagem_url,
    product.imagem,
  ]).slice(0, 3);
}

function normalizeModels(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  return Object.entries(data)
    .filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value))
    .map(([key, value]) => ({
      product_key: text(value.product_key || value.firebaseKey || value.id || key),
      mockups: uniqueUrls([
        value.mockup_1,
        value.mockup_2,
        value.mockup_3,
        Array.isArray(value.mockups) ? value.mockups : [],
        value.imagem,
      ]).slice(0, 3),
      atualizado_em: text(value.atualizado_em),
    }))
    .filter(model => model.product_key)
    .sort((a, b) => Date.parse(b.atualizado_em || '') - Date.parse(a.atualizado_em || ''))
    .slice(0, MODEL_LIMIT);
}

async function fetchProduct(key) {
  const base = firebaseBase();
  if (!base || !key) return null;
  const response = await fetch(`${base}/${productsNode()}/${encodeURIComponent(key)}.json`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) return null;
  const product = await response.json();
  return product && typeof product === 'object' ? product : null;
}

async function persistMockups(key, mockups) {
  if (!key || mockups.length < 3) return;
  const base = firebaseBase();
  if (!base) return;
  try {
    await fetch(`${base}/${MODELS_NODE}/${encodeURIComponent(key)}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        imagem: mockups[0],
        mockup_1: mockups[0],
        mockup_2: mockups[1],
        mockup_3: mockups[2],
      }),
    });
  } catch (error) {
    console.warn('Modelo carregado, mas os três mockups não puderam ser persistidos:', error);
  }
}

async function hydrateModel(model) {
  if (model.mockups.length >= 3) return model;
  const product = await fetchProduct(model.product_key).catch(() => null);
  const mockups = productMockups(product || {});
  if (mockups.length >= 3) persistMockups(model.product_key, mockups);
  return { ...model, mockups: mockups.length ? mockups : model.mockups };
}

async function fetchModels() {
  const base = firebaseBase();
  if (!base) return [];
  const response = await fetch(`${base}/${MODELS_NODE}.json`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Firebase retornou ${response.status} ao carregar os modelos.`);
  const baseModels = normalizeModels(await response.json());
  return Promise.all(baseModels.map(hydrateModel));
}

function installStyles() {
  if (document.getElementById('mugModelCarouselV10Styles')) return;
  const style = document.createElement('style');
  style.id = 'mugModelCarouselV10Styles';
  style.textContent = `
    #mugQuickModels.mug-quick-models{display:grid!important;gap:10px!important;padding:12px!important;border:1px solid #dedfd9!important;border-radius:14px!important;background:#fbfbf8!important;overflow:hidden!important}
    #mugQuickModels .mug-model-carousel-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
    #mugQuickModels .mug-model-carousel-title{display:flex;align-items:center;gap:8px;min-width:0}
    #mugQuickModels .mug-model-carousel-title strong{font-size:13px;color:#252722}
    #mugQuickModels .mug-model-carousel-count{min-width:27px;text-align:center;padding:3px 7px;border-radius:999px;background:#eceee7;font-size:10px;font-weight:800;color:#5c6157}
    #mugQuickModels .mug-model-carousel-nav{display:flex;gap:6px}
    #mugQuickModels .mug-model-carousel-nav button{width:32px;height:32px;border:1px solid #d5d8cf;border-radius:9px;background:#fff;font-size:20px;line-height:1;cursor:pointer;color:#3c4038}
    #mugQuickModels .mug-model-carousel-track{display:flex;gap:12px;overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x mandatory;scroll-behavior:smooth;padding:2px 2px 8px;scrollbar-width:thin}
    #mugQuickModels .mug-model-visual-card{position:relative;flex:0 0 clamp(220px,28%,270px);min-width:220px;scroll-snap-align:start;border:1px solid #dfe1da;border-radius:15px;background:#fff;overflow:hidden;box-shadow:0 5px 18px rgba(30,34,27,.07)}
    #mugQuickModels .mug-model-viewport{position:relative;aspect-ratio:1/1;background:#f3f4f0;overflow:hidden}
    #mugQuickModels .mug-model-slides{height:100%;display:flex;transition:transform .24s ease;will-change:transform}
    #mugQuickModels .mug-model-slide{min-width:100%;height:100%;margin:0;display:grid;place-items:center;background:#f5f6f2}
    #mugQuickModels .mug-model-slide img{width:100%;height:100%;display:block;object-fit:contain;background:#f7f7f4}
    #mugQuickModels .mug-model-slide-arrow{position:absolute;top:50%;transform:translateY(-50%);z-index:3;width:34px;height:42px;border:0;border-radius:10px;background:rgba(20,22,19,.64);color:#fff;font-size:24px;line-height:1;cursor:pointer;display:grid;place-items:center}
    #mugQuickModels .mug-model-slide-arrow.prev{left:8px}.mug-model-slide-arrow.next{right:8px}
    #mugQuickModels .mug-model-remove-visual{position:absolute;right:8px;top:8px;z-index:4;width:28px;height:28px;border:0;border-radius:50%;background:rgba(20,22,19,.72);color:#fff;font-size:18px;line-height:1;cursor:pointer}
    #mugQuickModels .mug-model-card-foot{height:46px;padding:7px 9px;display:flex;align-items:center;justify-content:space-between;gap:8px;border-top:1px solid #eceee8;background:#fff}
    #mugQuickModels .mug-model-dots{display:flex;align-items:center;gap:5px}
    #mugQuickModels .mug-model-dot{width:8px;height:8px;padding:0;border:0;border-radius:50%;background:#c7cbc1;cursor:pointer}
    #mugQuickModels .mug-model-dot.is-active{background:#252822;transform:scale(1.15)}
    #mugQuickModels .mug-model-use-visual{min-height:30px!important;padding:5px 11px!important;font-size:10px!important;border-radius:9px!important}
    #mugQuickModels .mug-model-carousel-empty{padding:18px;border:1px dashed #d6d9d0;border-radius:12px;text-align:center;color:#747970;font-size:11px;background:#fff}
    @media(min-width:1500px){#mugQuickModels .mug-model-visual-card{flex-basis:250px}}
    @media(max-width:900px){#mugQuickModels .mug-model-visual-card{flex-basis:210px;min-width:210px}}
  `;
  document.head.appendChild(style);
}

function setSlide(card, nextIndex) {
  if (!card) return;
  const slides = [...card.querySelectorAll('.mug-model-slide')];
  if (!slides.length) return;
  const count = slides.length;
  const normalizedIndex = ((Number(nextIndex) % count) + count) % count;
  card.dataset.slideIndex = String(normalizedIndex);
  const strip = card.querySelector('.mug-model-slides');
  if (strip) strip.style.transform = `translateX(-${normalizedIndex * 100}%)`;
  card.querySelectorAll('.mug-model-dot').forEach((dot, index) => {
    dot.classList.toggle('is-active', index === normalizedIndex);
    dot.setAttribute('aria-current', index === normalizedIndex ? 'true' : 'false');
  });
}

function modelCard(model) {
  const key = escapeHtml(model.product_key);
  const mockups = model.mockups.slice(0, 3);
  if (!mockups.length) return '';
  const slides = mockups.map((url, index) => `
    <figure class="mug-model-slide"><img loading="lazy" decoding="async" src="${escapeHtml(url || PLACEHOLDER)}" alt="Mockup ${index + 1} do modelo salvo"></figure>`).join('');
  const dots = mockups.map((_, index) => `
    <button class="mug-model-dot ${index === 0 ? 'is-active' : ''}" type="button" data-model-slide-dot="${index}" aria-label="Ver mockup ${index + 1}" aria-current="${index === 0 ? 'true' : 'false'}"></button>`).join('');
  return `
    <article class="mug-model-visual-card" data-model-card="${key}" data-slide-index="0">
      <div class="mug-model-viewport">
        <div class="mug-model-slides">${slides}</div>
        ${mockups.length > 1 ? `<button class="mug-model-slide-arrow prev" type="button" data-model-slide-prev aria-label="Mockup anterior">‹</button><button class="mug-model-slide-arrow next" type="button" data-model-slide-next aria-label="Próximo mockup">›</button>` : ''}
        <button class="mug-model-remove-visual" type="button" title="Remover dos modelos" aria-label="Remover dos modelos" data-quick-model-remove="${key}">×</button>
      </div>
      <div class="mug-model-card-foot">
        <div class="mug-model-dots">${dots}</div>
        <button class="button primary compact mug-model-use-visual" type="button" data-quick-model-use="${key}">Usar modelo</button>
      </div>
    </article>`;
}

function render() {
  const shelf = document.getElementById('mugQuickModels');
  if (!shelf) return false;
  bindShelf(shelf);
  const visible = models.filter(model => model.mockups.length).slice(0, MODEL_LIMIT);
  shelf.dataset.modelCarousel = BUILD;
  shelf.innerHTML = `
    <div class="mug-model-carousel-head">
      <div class="mug-model-carousel-title"><strong>Modelos salvos</strong><span class="mug-model-carousel-count">${visible.length}</span></div>
      <div class="mug-model-carousel-nav"><button type="button" data-model-carousel-prev aria-label="Modelos anteriores">‹</button><button type="button" data-model-carousel-next aria-label="Próximos modelos">›</button></div>
    </div>
    ${visible.length ? `<div class="mug-model-carousel-track">${visible.map(modelCard).join('')}</div>` : '<div class="mug-model-carousel-empty">Marque uma caneca recente como Modelo para ela aparecer aqui.</div>'}`;
  return true;
}

function bindShelf(shelf) {
  if (shelf.dataset.modelCarouselBound === BUILD) return;
  shelf.dataset.modelCarouselBound = BUILD;
  shelf.addEventListener('click', event => {
    const prevCarousel = event.target.closest('[data-model-carousel-prev]');
    const nextCarousel = event.target.closest('[data-model-carousel-next]');
    if (prevCarousel || nextCarousel) {
      const track = shelf.querySelector('.mug-model-carousel-track');
      if (!track) return;
      const distance = Math.max(220, Math.round(track.clientWidth * 0.82));
      track.scrollBy({ left: prevCarousel ? -distance : distance, behavior: 'smooth' });
      return;
    }

    const card = event.target.closest('[data-model-card]');
    if (!card) return;
    const current = Number(card.dataset.slideIndex || 0);
    if (event.target.closest('[data-model-slide-prev]')) {
      setSlide(card, current - 1);
      return;
    }
    if (event.target.closest('[data-model-slide-next]')) {
      setSlide(card, current + 1);
      return;
    }
    const dot = event.target.closest('[data-model-slide-dot]');
    if (dot) setSlide(card, Number(dot.dataset.modelSlideDot || 0));
  });

  shelfObserver?.disconnect();
  shelfObserver = new MutationObserver(() => {
    if (window.adminV2CurrentRoute?.() !== 'mug-studio') return;
    if (shelf.querySelector('.mug-model-carousel-track') || shelf.querySelector('.mug-model-carousel-empty')) return;
    schedule(140, true);
  });
  shelfObserver.observe(shelf, { childList: true });
}

async function refresh(force = false) {
  if (loading) return;
  if (!force && window.adminV2CurrentRoute?.() !== 'mug-studio') return;
  const shelf = document.getElementById('mugQuickModels');
  if (!shelf) {
    schedule(140, force);
    return;
  }
  loading = true;
  try {
    models = await fetchModels();
    render();
  } catch (error) {
    console.error('Falha ao carregar o carrossel visual de modelos:', error);
  } finally {
    loading = false;
  }
}

function schedule(delay = 120, force = false) {
  clearTimeout(timer);
  timer = setTimeout(() => refresh(force), delay);
}

installStyles();
window.addEventListener('admin-v2-route-ready', event => {
  if (event.detail?.route === 'mug-studio') schedule(160, true);
});
window.addEventListener('admin-v2-route', event => {
  if (event.detail?.route === 'mug-studio') schedule(160, true);
});
window.addEventListener('admin-v2-products-invalidated', () => schedule(950, true));
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => schedule(220, true), { once: true });
else schedule(220, true);

export { refresh, render, setSlide };
