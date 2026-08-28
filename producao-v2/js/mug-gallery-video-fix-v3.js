import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';

const BUILD = '20260828-mug-gallery-video-fix-v3';
const DEFAULT_MAKE_WEBHOOK = 'https://hook.eu1.make.com/cl3r1f56r9txezvltkkwlsspmnja6sw4';
const WEBHOOK_KEY = 'da_admin_v2_mug_make_webhook';
const VIDEO_PROMPT = `Crie um vídeo de exatamente 5 segundos. A imagem de referência é a ARTE PLANA de impressão de uma caneca. Mostre uma única caneca branca de cerâmica/porcelana 350 ml, ultra-realista, em estúdio claro e neutro. A caneca permanece parada no centro. A câmera executa exatamente UMA órbita horizontal completa de 360 graus ao redor da caneca durante os 5 segundos, com velocidade uniforme, retornando ao enquadramento inicial no último frame. Aplique a arte de referência na superfície externa da caneca preservando rigorosamente textos, ilustrações, cores e proporções. Não redesenhe, não traduza, não recorte, não substitua e não invente nenhum elemento da estampa. Não faça mais de um giro. Não use mãos, pessoas, vapor, líquido, objetos extras, troca de cenário ou zoom agressivo. Sem áudio.`;

const productCache = new Map();
let refreshTimer = 0;

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
  if (!base) throw new Error('Firebase não está configurado.');
  return { base, node };
}

function currentWebhook() {
  return text(document.querySelector('#mugArtWebhook')?.value)
    || text(document.querySelector('#mugv7Webhook')?.value)
    || text(localStorage.getItem(WEBHOOK_KEY))
    || DEFAULT_MAKE_WEBHOOK;
}

function cardKey(card) {
  return text(
    card?.querySelector('[data-edit-mug]')?.dataset.editMug
    || card?.querySelector('[data-delete-mug]')?.dataset.deleteMug
    || card?.dataset.mugKey
  );
}

function horizontalArt(product = {}) {
  return text(
    product.arte_horizontal
    || product.arte_impressao?.url
    || product.arte_personalizacao
    || product.art_url
    || product.arte_url
  );
}

async function loadProduct(key, { force = false } = {}) {
  if (!force && productCache.has(key)) return productCache.get(key);
  const { base, node } = firebaseContext();
  const response = await fetch(`${base}/${node}/${encodeURIComponent(key)}.json?_=${Date.now()}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Firebase retornou ${response.status}.`);
  const product = await response.json();
  if (!product || typeof product !== 'object') throw new Error('Caneca não encontrada no Firebase.');
  const entry = { product, base, node };
  productCache.set(key, entry);
  return entry;
}

function setCardArt(card, art) {
  const frame = card.querySelector('.mug-created-image');
  const img = frame?.querySelector('img');
  if (!frame || !img) return;
  frame.classList.toggle('mug-horizontal-missing', !/^https?:\/\//i.test(art));
  if (/^https?:\/\//i.test(art)) {
    img.hidden = false;
    img.alt = 'Arte horizontal da caneca';
    if (img.src !== art) img.src = art;
  } else {
    img.hidden = true;
    img.removeAttribute('src');
    img.alt = '';
  }
}

function ensureVideoButton(card, key) {
  const actions = card.querySelector('.mug-created-card-actions');
  if (!actions || actions.querySelector('[data-gallery-generate-mug-video]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button primary compact mug-gallery-video-button';
  button.dataset.galleryGenerateMugVideo = key;
  button.title = 'Gerar vídeo IA de 5 segundos com um único giro de 360°';
  button.textContent = '🎥 Gerar vídeo 5s';
  actions.prepend(button);
}

function statusTarget(button) {
  return button.closest('#mugStudioCreatedGrid')?.querySelector('#mugCreatedStatus')
    || document.querySelector('#mugAutomationStatus');
}

function setStatus(button, message) {
  const target = statusTarget(button);
  if (target) target.textContent = message;
}

async function callVideoMake(payload) {
  const hook = currentWebhook();
  if (!/^https?:\/\//i.test(hook)) throw new Error('Configure o webhook do Make.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180000);
  try {
    const response = await fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ payload: JSON.stringify({ ...payload, client_contract: BUILD }) }),
      signal: controller.signal,
    });
    const raw = await response.text();
    let parsed = null;
    if (raw) {
      try { parsed = JSON.parse(raw); } catch {}
    }
    if (!response.ok) throw new Error(parsed?.error || parsed?.message || `Make respondeu HTTP ${response.status}.`);
    if (!parsed) throw new Error('O Make não devolveu JSON para a geração do vídeo.');
    if (parsed.ok === false) throw new Error(parsed.error || parsed.message || 'O Make recusou a geração do vídeo.');
    return parsed;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('A geração ultrapassou 3 minutos.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function generateVideo(key, button) {
  if (!key || !button || button.dataset.videoBusy === '1') return;
  const old = button.textContent;
  button.dataset.videoBusy = '1';
  button.disabled = true;
  button.textContent = 'Gerando vídeo…';
  try {
    setStatus(button, 'Vídeo IA · carregando a arte horizontal…');
    const { product, base, node } = await loadProduct(key, { force: true });
    const art = horizontalArt(product);
    if (!/^https?:\/\//i.test(art)) throw new Error('Esta caneca não possui arte horizontal pública.');
    setCardArt(button.closest('.mug-created-card'), art);
    setStatus(button, 'Vídeo IA · Gemini criando 5 segundos com 1 giro de 360°…');
    const result = await callVideoMake({
      action: 'generate_mug_video',
      request_id: `mug-video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      product_id: key,
      art_url: art,
      prompt_video: VIDEO_PROMPT,
      firebase_url: base,
      products_node: node,
      origin: BUILD,
    });
    const interaction = text(result.interaction_id || result.id);
    button.textContent = 'Vídeo gerado ✓';
    setStatus(button, `Vídeo IA enviado com sucesso · 5s · 1 giro 360°${interaction ? ` · ${interaction}` : ''}.`);
  } catch (error) {
    console.error('[Canecas] falha ao gerar vídeo:', error);
    button.textContent = old || '🎥 Gerar vídeo 5s';
    setStatus(button, `Erro ao gerar vídeo: ${error?.message || error}`);
  } finally {
    button.dataset.videoBusy = '0';
    button.disabled = false;
  }
}

async function enhanceCard(card) {
  const key = cardKey(card);
  if (!key) return;
  card.dataset.mugKey = key;
  ensureVideoButton(card, key);
  if (card.dataset.horizontalArtHydrated === '1') return;
  card.dataset.horizontalArtHydrated = '1';
  try {
    const { product } = await loadProduct(key);
    setCardArt(card, horizontalArt(product));
  } catch (error) {
    card.dataset.horizontalArtHydrated = '0';
    console.warn('[Canecas] não foi possível carregar arte horizontal do card:', key, error);
    setCardArt(card, '');
  }
}

function enhanceCards() {
  if (window.adminV2CurrentRoute?.() !== 'mug-studio') return;
  document.querySelectorAll('#mugCreatedCards .mug-created-card').forEach(card => enhanceCard(card));
}

function scheduleEnhance(delay = 40) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(enhanceCards, delay);
}

function installStyles() {
  if (document.getElementById('mugGalleryVideoFixV3Style')) return;
  const style = document.createElement('style');
  style.id = 'mugGalleryVideoFixV3Style';
  style.textContent = `
    #mugStudioCreatedGrid .mug-created-image{aspect-ratio:5/2!important;min-height:0!important;background:#f7f7f4!important;display:grid!important;place-items:center!important}
    #mugStudioCreatedGrid .mug-created-image img{width:100%!important;height:100%!important;object-fit:contain!important;background:#fff!important}
    #mugStudioCreatedGrid .mug-created-image.mug-horizontal-missing::after{content:'Arte horizontal indisponível';font-size:11px;color:#777;padding:12px;text-align:center}
    #mugStudioCreatedGrid .mug-created-card-actions{display:grid!important;grid-template-columns:1fr 1fr!important;gap:6px!important}
    #mugStudioCreatedGrid .mug-gallery-video-button{grid-column:1/-1!important;width:100%!important;min-height:34px!important;white-space:nowrap}
  `;
  document.head.appendChild(style);
}

function install() {
  installStyles();
  scheduleEnhance(0);
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-gallery-generate-mug-video]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  generateVideo(text(button.dataset.galleryGenerateMugVideo), button);
}, true);

window.addEventListener('admin-v2-route-ready', event => {
  if (event.detail?.route === 'mug-studio') scheduleEnhance(20);
});
window.addEventListener('admin-v2-route', event => {
  if (event.detail?.route === 'mug-studio') scheduleEnhance(20);
});
window.addEventListener('admin-v2-products-invalidated', () => {
  productCache.clear();
  scheduleEnhance(120);
});
window.addEventListener('da:mug-created', event => {
  const key = text(event.detail?.key);
  if (key) productCache.delete(key);
  scheduleEnhance(120);
});

const root = document.querySelector('.view[data-view="mug-studio"]') || document.body;
new MutationObserver(() => scheduleEnhance(60)).observe(root, { childList: true, subtree: true });

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();

export { BUILD, VIDEO_PROMPT, horizontalArt, generateVideo, enhanceCards };
