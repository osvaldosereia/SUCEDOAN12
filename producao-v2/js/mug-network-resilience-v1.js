const BUILD = '20260824-mug-network-resilience-v1-1';
const originalFetch = window.fetch.bind(window);
const FALLBACK_DELAY_MS = 900;
const HARD_TIMEOUT_MS = 10000;

const COMMANDS_SNAPSHOT_URL = new URL('../site/canecas-comandos.json', window.location.href).href;
const GALLERY_SNAPSHOT_URL = new URL('../site/canecas-galeria.json', window.location.href).href;
const ADMIN_PRODUCTS_URL = new URL('../site/produtos-admin.json', window.location.href).href;

function text(value) {
  return String(value ?? '').trim();
}

function methodOf(init = {}) {
  return text(init?.method || 'GET').toUpperCase() || 'GET';
}

function requestUrl(input) {
  try {
    if (typeof input === 'string') return new URL(input, window.location.href);
    if (input instanceof URL) return input;
    if (input?.url) return new URL(input.url, window.location.href);
  } catch {}
  return null;
}

function isFirebaseHost(url) {
  return Boolean(url && /(?:firebaseio\.com|firebasedatabase\.app)$/i.test(url.hostname));
}

function isCommandsRead(input, init) {
  if (methodOf(init) !== 'GET') return false;
  const url = requestUrl(input);
  return isFirebaseHost(url) && /\/canecas\/comandos_criacao\.json$/i.test(url.pathname);
}

function isGalleryRead(input, init) {
  if (methodOf(init) !== 'GET') return false;
  const url = requestUrl(input);
  if (!isFirebaseHost(url) || !/\/produtos\.json$/i.test(url.pathname)) return false;
  const orderBy = text(url.searchParams.get('orderBy')).replace(/^"|"$/g, '');
  const equalTo = text(url.searchParams.get('equalTo')).replace(/^"|"$/g, '');
  return orderBy === 'categoria' && equalTo.toLowerCase() === 'canecas';
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data ?? {}), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Dona-Antonia-Fallback': BUILD,
    },
  });
}

async function snapshotJson(url) {
  const response = await originalFetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Snapshot retornou ${response.status}.`);
  return await response.json();
}

function normalizeMugs(data) {
  const entries = Array.isArray(data)
    ? data.map((value, index) => [String(value?.firebaseKey || value?.id || value?.codigo || index), value])
    : (data && typeof data === 'object' ? Object.entries(data) : []);
  const normalized = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return Object.fromEntries(entries.filter(([, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return normalized(value.categoria) === 'canecas'
      || normalized(value.tipo_produto).includes('caneca')
      || normalized(value.origem_cadastro).includes('caneca');
  }));
}

async function galleryFallback() {
  try {
    const snapshot = await snapshotJson(GALLERY_SNAPSHOT_URL);
    const mugs = normalizeMugs(snapshot);
    if (Object.keys(mugs).length) return jsonResponse(mugs);
  } catch (error) {
    console.warn('Snapshot leve das canecas indisponível:', error);
  }

  try {
    const products = await snapshotJson(ADMIN_PRODUCTS_URL);
    return jsonResponse(normalizeMugs(products));
  } catch (error) {
    console.warn('Índice administrativo indisponível para contingência das canecas:', error);
    return jsonResponse({}, 504);
  }
}

async function commandsFallback() {
  try {
    const snapshot = await snapshotJson(COMMANDS_SNAPSHOT_URL);
    return jsonResponse(snapshot && typeof snapshot === 'object' ? snapshot : {});
  } catch (error) {
    console.warn('Snapshot dos comandos indisponível:', error);
    return jsonResponse({}, 504);
  }
}

function resilientRead(input, init, fallbackFactory) {
  return new Promise(resolve => {
    let done = false;
    const controller = new AbortController();
    const upstreamSignal = init?.signal;
    let signal = controller.signal;
    if (upstreamSignal && typeof AbortSignal?.any === 'function') {
      signal = AbortSignal.any([upstreamSignal, controller.signal]);
    }

    let fallbackTimer = 0;
    let hardTimer = 0;
    const finish = response => {
      if (done || !response) return;
      done = true;
      clearTimeout(fallbackTimer);
      clearTimeout(hardTimer);
      controller.abort();
      resolve(response);
    };

    originalFetch(input, { ...(init || {}), signal })
      .then(response => {
        if (response?.ok) finish(response);
      })
      .catch(error => {
        if (error?.name !== 'AbortError') console.warn('Firebase lento/indisponível no Criador:', error);
      });

    fallbackTimer = setTimeout(() => {
      fallbackFactory().then(response => finish(response)).catch(() => {});
    }, FALLBACK_DELAY_MS);

    hardTimer = setTimeout(() => {
      fallbackFactory()
        .then(response => finish(response))
        .catch(() => finish(jsonResponse({}, 504)));
    }, HARD_TIMEOUT_MS);
  });
}

if (!window.__daMugResilientFetchInstalled) {
  window.__daMugResilientFetchInstalled = BUILD;
  window.fetch = function donaAntoniaResilientFetch(input, init = {}) {
    if (isCommandsRead(input, init)) return resilientRead(input, init, commandsFallback);
    if (isGalleryRead(input, init)) return resilientRead(input, init, galleryFallback);
    return originalFetch(input, init);
  };
}

export { BUILD, commandsFallback, galleryFallback };
