import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { callMake } from './mug-personalizer-v15-clean.js';

const BUILD = '20260828-mug-video-generator-v1';
const DEFAULT_MAKE_WEBHOOK = 'https://hook.eu1.make.com/cl3r1f56r9txezvltkkwlsspmnja6sw4';
const WEBHOOK_KEY = 'da_admin_v2_mug_make_webhook';
const VIDEO_PROMPT = `Crie um vídeo de exatamente 5 segundos. A imagem de referência é a ARTE PLANA de impressão de uma caneca. Mostre uma única caneca branca de cerâmica/porcelana 350 ml, ultra-realista, em estúdio claro e neutro. A caneca permanece parada no centro. A câmera executa exatamente UMA órbita horizontal completa de 360 graus ao redor da caneca durante os 5 segundos, com velocidade uniforme, retornando ao enquadramento inicial no último frame. Aplique a arte de referência na superfície externa da caneca preservando rigorosamente textos, ilustrações, cores e proporções. Não redesenhe, não traduza, não recorte, não substitua e não invente nenhum elemento da estampa. Não faça mais de um giro. Não use mãos, pessoas, vapor, líquido, objetos extras, troca de cenário ou zoom agressivo. Sem áudio.`;

let lastCreatedKey = '';
let installing = false;

function text(value) {
  return String(value ?? '').trim();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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

function artFromProduct(product = {}) {
  return text(
    product.arte_horizontal
    || product.arte_personalizacao
    || product.arte_impressao?.url
    || product.art_url
    || product.arte_url
  );
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(text(value));
}

function currentWebhook() {
  return text(document.querySelector('#mugArtWebhook')?.value)
    || text(localStorage.getItem(WEBHOOK_KEY))
    || DEFAULT_MAKE_WEBHOOK;
}

async function loadProduct(key) {
  const { base, node } = firebaseContext();
  const response = await fetch(`${base}/${node}/${encodeURIComponent(key)}.json?_=${Date.now()}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Firebase retornou ${response.status}.`);
  const product = await response.json();
  if (!product || typeof product !== 'object') throw new Error('Caneca não encontrada no Firebase.');
  return { product, base, node };
}

function statusTarget(button) {
  return button?.closest('#mugStudioCreatedGrid')?.querySelector('#mugCreatedStatus')
    || document.querySelector('#mugAutomationStatus');
}

function setStatus(button, message) {
  const target = statusTarget(button);
  if (target) target.textContent = message;
}

async function generateVideo(key, button) {
  key = text(key);
  if (!key || !button || button.dataset.videoBusy === '1') return;
  const oldText = button.textContent;
  button.dataset.videoBusy = '1';
  button.disabled = true;
  button.textContent = 'Gerando vídeo…';
  try {
    setStatus(button, 'Vídeo IA · preparando a arte da caneca…');
    const { product, base, node } = await loadProduct(key);
    const art = artFromProduct(product);
    if (!isHttpUrl(art)) throw new Error('Esta caneca ainda não possui arte horizontal em URL pública.');

    const requestId = `mug-video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setStatus(button, 'Vídeo IA · Gemini criando 5 segundos com 1 giro de 360°…');
    const result = await callMake(currentWebhook(), {
      action: 'generate_mug_video',
      request_id: requestId,
      product_id: key,
      art_url: art,
      prompt_video: VIDEO_PROMPT,
      firebase_url: base,
      products_node: node,
      origin: BUILD,
    }, { timeout: 180000 });

    const interaction = text(result?.interaction_id || result?.id);
    const state = text(result?.status || 'completed');
    button.textContent = 'Vídeo gerado ✓';
    setStatus(button, `Vídeo IA concluído · 5s · 1 giro 360°${interaction ? ` · interação ${interaction}` : ''}${state && state !== 'completed' ? ` · ${state}` : ''}.`);
    window.dispatchEvent(new CustomEvent('da:mug-video-generated', {
      detail: { key, requestId, interactionId: interaction, status: state, source: BUILD },
    }));
  } catch (error) {
    console.error('Falha ao gerar vídeo da caneca:', error);
    button.textContent = oldText || 'Gerar vídeo 5s';
    setStatus(button, `Erro ao gerar vídeo: ${error?.message || error}`);
  } finally {
    button.dataset.videoBusy = '0';
    button.disabled = false;
  }
}

function makeButton(key, className = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `button secondary compact mug-video-button ${className}`.trim();
  button.dataset.generateMugVideo = key;
  button.title = 'Gerar vídeo IA de 5 segundos com um único giro de 360°';
  button.textContent = 'Gerar vídeo 5s';
  return button;
}

function installRecentButtons() {
  document.querySelectorAll('.mug-created-card').forEach(card => {
    if (card.querySelector('[data-generate-mug-video]')) return;
    const key = text(card.querySelector('[data-edit-mug]')?.dataset.editMug
      || card.querySelector('[data-delete-mug]')?.dataset.deleteMug);
    if (!key) return;
    const actions = card.querySelector('.mug-created-card-actions');
    if (!actions) return;
    actions.prepend(makeButton(key));
  });
}

function installCurrentResultButton(key = lastCreatedKey) {
  key = text(key);
  const result = document.querySelector('#mugArtResult .mug-art-result');
  if (!result || !key || result.querySelector('[data-generate-mug-video]')) return;
  const box = document.createElement('div');
  box.className = 'mug-video-current-actions';
  box.appendChild(makeButton(key, 'mug-video-current-button'));
  const hint = document.createElement('small');
  hint.innerHTML = `Teste: <strong>5 segundos</strong>, exatamente <strong>1 giro 360°</strong>, sem áudio.`;
  box.appendChild(hint);
  result.appendChild(box);
}

function installStyles() {
  if (document.getElementById('mugVideoGeneratorStyle')) return;
  const style = document.createElement('style');
  style.id = 'mugVideoGeneratorStyle';
  style.textContent = `
    .mug-video-button{white-space:nowrap}.mug-video-current-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;border:1px solid #e1e4dc;border-radius:12px;background:#fbfcf9}.mug-video-current-actions small{color:#666}.mug-created-card-actions .mug-video-button{grid-column:1/-1;width:100%}
  `;
  document.head.appendChild(style);
}

function install() {
  if (installing) return;
  installing = true;
  installStyles();
  installRecentButtons();
  installCurrentResultButton();
  installing = false;
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-generate-mug-video]');
  if (!button) return;
  event.preventDefault();
  generateVideo(button.dataset.generateMugVideo, button);
});

window.addEventListener('da:mug-created', event => {
  lastCreatedKey = text(event.detail?.key);
  setTimeout(() => {
    installCurrentResultButton(lastCreatedKey);
    installRecentButtons();
  }, 80);
});
window.addEventListener('admin-v2-route-ready', event => {
  if (event.detail?.route === 'mug-studio') setTimeout(install, 100);
});
window.addEventListener('admin-v2-route', event => {
  if (event.detail?.route === 'mug-studio') setTimeout(install, 100);
});
window.addEventListener('admin-v2-products-invalidated', () => setTimeout(installRecentButtons, 350));

const observer = new MutationObserver(() => {
  if (window.adminV2CurrentRoute?.() !== 'mug-studio') return;
  installRecentButtons();
  installCurrentResultButton();
});
const root = document.querySelector('.view[data-view="mug-studio"]') || document.body;
observer.observe(root, { childList: true, subtree: true });

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(install, 0), { once: true });
else setTimeout(install, 0);

export { BUILD, VIDEO_PROMPT, generateVideo, installRecentButtons, installCurrentResultButton };
