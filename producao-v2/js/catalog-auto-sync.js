import './product-editor-enhancements.js?admin_build=20260727-products-inline-v1';
import './mug-products-enhancement.js?admin_build=20260821-canecas-studio-v2';
import './mug-make-native-openai-bridge.js?admin_build=20260821-canecas-openai-native-v4';
import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';

const ORIGINAL_FETCH_KEY = '__daAdminV2OriginalFetch';
const INSTALLED_KEY = '__daAdminV2CatalogSyncInstalled';
let timer = null;
let pending = false;

function loadConfig() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || '{}') }; }
  catch { return { ...DEFAULT_CONFIG }; }
}

function isProductMutation(input, init = {}) {
  const url = typeof input === 'string' ? input : String(input?.url || '');
  const method = String(init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
  return ['PUT', 'PATCH', 'DELETE', 'POST'].includes(method)
    && /\/produtos(?:\/[^/?#]+)?\.json(?:[?#]|$)/i.test(url);
}

async function dispatchSync() {
  if (pending) return;
  pending = true;
  try {
    const config = loadConfig();
    if (!config.githubToken || !config.githubOwner || !config.githubRepo) return;
    const originalFetch = window[ORIGINAL_FETCH_KEY] || window.fetch.bind(window);
    await originalFetch(`https://api.github.com/repos/${encodeURIComponent(config.githubOwner)}/${encodeURIComponent(config.githubRepo)}/dispatches`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${config.githubToken}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        event_type: 'sincronizar_produtos_home',
        client_payload: { origem: 'admin-v2-auto-sync', solicitado_em: new Date().toISOString() },
      }),
    });
  } catch (error) {
    console.warn('A sincronização imediata do catálogo não pôde ser solicitada; o agendamento de 5 minutos continuará ativo.', error);
  } finally {
    pending = false;
  }
}

function scheduleSync() {
  clearTimeout(timer);
  timer = setTimeout(dispatchSync, 1200);
}

function install() {
  if (window[INSTALLED_KEY]) return;
  window[INSTALLED_KEY] = true;
  const original = window.fetch.bind(window);
  window[ORIGINAL_FETCH_KEY] = original;
  window.fetch = async function adminV2Fetch(input, init = {}) {
    const mutation = isProductMutation(input, init);
    const response = await original(input, init);
    if (mutation && response.ok) scheduleSync();
    return response;
  };
}

install();

export { dispatchSync, scheduleSync };
