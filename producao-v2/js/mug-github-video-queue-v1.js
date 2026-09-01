import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';

const BUILD = '20260831-mug-github-video-queue-v1';
const WORKFLOW_FILE = 'gerar-video-360-mug3d.yml';
const POLL_INTERVAL = 3000;
const POLL_TIMEOUT = 12 * 60 * 1000;
const pollers = new Map();
let refreshTimer = 0;

const text = value => String(value ?? '').trim();

function config() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}') }; }
  catch { return { ...DEFAULT_CONFIG }; }
}

function firebaseContext() {
  const cfg = config();
  const base = text(cfg.firebaseUrl || DEFAULT_CONFIG.firebaseUrl).replace(/\/+$/, '');
  const node = text(cfg.productsNode || DEFAULT_CONFIG.productsNode || 'produtos').replace(/^\/+|\/+$/g, '').replace(/\.json$/i, '') || 'produtos';
  return { base, node };
}

function cardKey(card) {
  return text(card?.dataset.mugKey || card?.querySelector('[data-edit-mug]')?.dataset.editMug || card?.querySelector('[data-delete-mug]')?.dataset.deleteMug);
}

function horizontalArt(product = {}) {
  return text(product.arte_horizontal || product.arte_impressao?.url || product.arte_personalizacao || product.art_url || product.arte_url);
}

function productVideoUrl(product = {}) {
  return text(product.video_url || product.video_webm_url || product.video_mp4_url || product.video_ia_url || product.video);
}

async function fetchProduct(key) {
  const { base, node } = firebaseContext();
  const response = await fetch(`${base}/${node}/${encodeURIComponent(key)}.json?_=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Firebase retornou ${response.status}.`);
  return response.json();
}

async function patchProduct(key, patch) {
  const { base, node } = firebaseContext();
  const response = await fetch(`${base}/${node}/${encodeURIComponent(key)}.json`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error(`Firebase recusou a fila do vídeo (${response.status}).`);
  return response.json();
}

function statusTarget(button) {
  return button?.closest('#mugStudioCreatedGrid')?.querySelector('#mugCreatedStatus') || document.querySelector('#mugAutomationStatus');
}

function setStatus(button, message) {
  const target = statusTarget(button);
  if (target) target.textContent = message;
}

async function dispatchWorkflow(productKey) {
  const cfg = config();
  const token = text(cfg.githubToken);
  if (!token) return { dispatched: false, reason: 'token_missing' };
  const owner = text(cfg.githubOwner || DEFAULT_CONFIG.githubOwner);
  const repo = text(cfg.githubRepo || DEFAULT_CONFIG.githubRepo);
  const ref = text(cfg.githubBranch || 'main') || 'main';
  if (!owner || !repo) return { dispatched: false, reason: 'repo_missing' };
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(WORKFLOW_FILE)}/dispatches`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ ref, inputs: { product_key: productKey } }),
  });
  if (response.status === 204) return { dispatched: true };
  const detail = await response.text();
  throw new Error(`GitHub Actions respondeu ${response.status}${detail ? ` · ${detail.slice(0, 240)}` : ''}.`);
}

function ensureButton(card, key, product = null) {
  const actions = card?.querySelector('.mug-created-card-actions');
  if (!actions || actions.querySelector('[data-github-mug-video]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button primary compact mug-github-video-button';
  button.dataset.githubMugVideo = key;
  button.textContent = productVideoUrl(product || {}) ? '🎥 Gerar novo 360°' : '🎥 Gerar vídeo 360°';
  button.title = 'Gerar o giro 360° no Mug3D usando GitHub Actions';
  actions.prepend(button);
}

function updateButtonState(card, product = {}) {
  const button = card?.querySelector('[data-github-mug-video]');
  if (!button) return;
  const state = text(product.video_360_status).toLowerCase();
  if (state === 'processing') button.textContent = 'GitHub gerando 360°…';
  else if (['pending', 'queued'].includes(state)) button.textContent = 'Vídeo 360° na fila…';
  else if (state === 'error') button.textContent = '⚠ Tentar vídeo 360° novamente';
  else if (productVideoUrl(product)) button.textContent = '🎥 Gerar novo 360°';
  else button.textContent = '🎥 Gerar vídeo 360°';
  button.disabled = ['pending', 'queued', 'processing'].includes(state);
}

async function hydrateCard(card) {
  const key = cardKey(card);
  if (!key) return;
  card.dataset.mugKey = key;
  try {
    const product = await fetchProduct(key);
    ensureButton(card, key, product || {});
    updateButtonState(card, product || {});
  } catch (error) {
    console.warn('[Canecas] vídeo 360°: falha ao hidratar card', key, error);
    ensureButton(card, key);
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

async function pollProduct(key, card, button) {
  if (pollers.has(key)) return pollers.get(key);
  const started = Date.now();
  const task = (async () => {
    while (Date.now() - started < POLL_TIMEOUT) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      const product = await fetchProduct(key).catch(() => null);
      if (!product) continue;
      updateButtonState(card, product);
      const state = text(product.video_360_status).toLowerCase();
      if (state === 'ready' && productVideoUrl(product)) {
        setStatus(button, 'Vídeo 360° pronto e salvo no produto · clique em “Ver vídeo”.');
        window.dispatchEvent(new CustomEvent('admin-v2-products-invalidated', { detail: { source: BUILD, key } }));
        return product;
      }
      if (state === 'error') {
        setStatus(button, `Erro no vídeo 360°: ${text(product.video_360_error) || 'consulte a execução do GitHub Actions.'}`);
        return product;
      }
    }
    setStatus(button, 'O GitHub continua processando o vídeo. Você pode sair desta tela; o card será atualizado quando retornar.');
    return null;
  })().finally(() => pollers.delete(key));
  pollers.set(key, task);
  return task;
}

async function queueVideo(key, button) {
  if (!key || !button || button.dataset.busy === '1') return;
  const card = button.closest('.mug-created-card');
  button.dataset.busy = '1';
  button.disabled = true;
  button.textContent = 'Preparando vídeo 360°…';
  try {
    const product = await fetchProduct(key);
    const art = horizontalArt(product || {});
    if (!/^https?:\/\//i.test(art)) throw new Error('Esta caneca ainda não possui arte horizontal pública.');
    await patchProduct(key, {
      video_360_status: 'pending',
      video_360_requested_at: new Date().toISOString(),
      video_360_error: null,
      video_360_engine: 'mug3d-playwright-github-actions-v1',
    });
    setStatus(button, 'Vídeo 360° · enviado para a fila do GitHub Actions…');
    let dispatch = { dispatched: false };
    try { dispatch = await dispatchWorkflow(key); }
    catch (error) { console.warn('[Canecas] dispatch imediato falhou; o cron assumirá a fila.', error); }
    if (dispatch.dispatched) {
      await patchProduct(key, { video_360_status: 'queued', video_360_dispatched_at: new Date().toISOString() });
      setStatus(button, 'GitHub Actions iniciado · abrindo Mug3D e preparando o giro 360°…');
    } else {
      setStatus(button, 'Vídeo ficou na fila. O GitHub Actions automático buscará a solicitação em até alguns minutos.');
    }
    if (card) pollProduct(key, card, button);
  } catch (error) {
    console.error('[Canecas] falha ao enfileirar vídeo 360°:', error);
    button.disabled = false;
    button.textContent = '⚠ Tentar vídeo 360° novamente';
    setStatus(button, `Erro ao solicitar vídeo 360°: ${error?.message || error}`);
  } finally {
    button.dataset.busy = '0';
    if (!['Vídeo 360° na fila…', 'GitHub gerando 360°…'].includes(button.textContent)) button.disabled = false;
  }
}

function installStyles() {
  if (document.getElementById('mugGithubVideoQueueStyle')) return;
  const style = document.createElement('style');
  style.id = 'mugGithubVideoQueueStyle';
  style.textContent = '#mugStudioCreatedGrid .mug-github-video-button{grid-column:1/-1!important;width:100%!important;min-height:34px!important;white-space:nowrap}';
  document.head.appendChild(style);
}

function install() { installStyles(); scheduleHydrate(0); }

document.addEventListener('click', event => {
  const button = event.target.closest('[data-github-mug-video]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  queueVideo(text(button.dataset.githubMugVideo), button);
}, true);

window.addEventListener('admin-v2-route-ready', event => { if (event.detail?.route === 'mug-studio') scheduleHydrate(40); });
window.addEventListener('admin-v2-route', event => { if (event.detail?.route === 'mug-studio') scheduleHydrate(40); });
window.addEventListener('admin-v2-products-invalidated', () => scheduleHydrate(120));
window.addEventListener('da:mug-created', () => scheduleHydrate(150));

const root = document.querySelector('.view[data-view="mug-studio"]') || document.body;
new MutationObserver(() => scheduleHydrate(100)).observe(root, { childList: true, subtree: true });

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();

export { BUILD, WORKFLOW_FILE, queueVideo, hydrateCards };
