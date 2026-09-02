(() => {
  'use strict';

  const BUILD = '20260901-creation-device-bridge-v1.1-early-code';
  const FIREBASE = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const CREATIONS_NODE = 'canecas/personalizadas';
  const STORE = 'https://www.canecafacil.com.br/';
  const SESSION_EMAIL = 'cf_personalizer_email_v1';
  const MAKE_HOST_RE = /^hook\.[a-z0-9-]+\.make\.com$/i;
  const innerFetch = window.fetch.bind(window);

  if (window.__CF_CREATION_DEVICE_BRIDGE__ === BUILD) return;
  window.__CF_CREATION_DEVICE_BRIDGE__ = BUILD;

  const text = value => String(value ?? '').trim();
  const safeKey = value => text(value).replace(/[.#$\[\]/]/g, '_');
  let lastCode = '';
  let lastStatus = '';

  async function sha256(value) {
    const raw = text(value).toLowerCase();
    if (!raw || !globalThis.crypto?.subtle) return '';
    const bytes = new TextEncoder().encode(raw);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function patchCreation(code, payload) {
    const response = await innerFetch(`${FIREBASE}/${CREATIONS_NODE}/${safeKey(code)}.json`, {
      method:'PATCH',
      headers:{ 'Content-Type':'application/json', Accept:'application/json' },
      body:JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`Firebase ${response.status}`);
    return response.json().catch(() => null);
  }

  function storeResumeUrl(code) {
    const url = new URL(STORE);
    url.searchParams.set('cf_arte', code);
    return url.href;
  }

  function postToParent(code, status = 'arte_pronta') {
    if (!code || !window.parent || window.parent === window) return;
    const payload = {
      type:'canecafacil:minha-arte',
      code,
      status,
      modelId:text(new URLSearchParams(location.search).get('model')),
      resumeUrl:storeResumeUrl(code),
      build:BUILD
    };
    try { window.parent.postMessage(payload, '*'); } catch {}
  }

  function currentCode() {
    return text(document.getElementById('previewCode')?.textContent)
      || text(new URLSearchParams(location.search).get('creation'));
  }

  function currentStatus() {
    const preview = document.getElementById('previewBox');
    const pending = document.getElementById('pendingBox');
    const progress = document.getElementById('progressBox');
    const success = document.getElementById('successBox');
    if (success && !success.hidden) return 'carrinho';
    if (preview && !preview.hidden) return 'arte_pronta';
    if (pending && !pending.hidden) return 'gerando';
    if (progress && !progress.hidden) return 'gerando';
    return 'salva';
  }

  async function register(code, status) {
    code = text(code).toUpperCase();
    if (!/^CF-/i.test(code)) return;
    const email = text(document.getElementById('customerEmail')?.value || sessionStorage.getItem(SESSION_EMAIL));
    const emailHash = await sha256(email);
    const resumeUrl = storeResumeUrl(code);
    const patch = {
      resume_store_url:resumeUrl,
      dispositivo_registrado:true,
      atualizado_em:new Date().toISOString()
    };
    if (emailHash) patch.cliente_email_hash = emailHash;
    await patchCreation(code, patch).catch(error => console.debug('[CanecaFácil] vínculo da criação:', error?.message || error));
    const resume = document.getElementById('resumeLink');
    if (resume) resume.href = resumeUrl;
    postToParent(code, status);
  }

  function inspectMakeRequest(input, init = {}) {
    try {
      const url = new URL(String(input), location.href);
      if (!MAKE_HOST_RE.test(url.hostname) || typeof init?.body !== 'string') return;
      const wrapper = JSON.parse(init.body);
      const payload = wrapper && typeof wrapper.payload === 'string' ? JSON.parse(wrapper.payload) : null;
      const code = text(payload?.creation_code).toUpperCase();
      if (payload?.action !== 'personalize_mug_model' || !/^CF-/i.test(code)) return;
      lastCode = code;
      lastStatus = 'gerando';
      setTimeout(() => register(code, 'gerando'), 0);
    } catch {}
  }

  // Captura o CF-ID no instante em que a geração é enviada ao Make.
  // O native-cart carrega depois e encadeia este fetch, sem quebrar o fluxo.
  window.fetch = function cfCreationDeviceFetch(input, init = {}) {
    inspectMakeRequest(input, init);
    return innerFetch(input, init);
  };

  document.addEventListener('submit', event => {
    if (event.target?.id !== 'personalizerForm') return;
    const email = text(document.getElementById('customerEmail')?.value).toLowerCase();
    if (email) sessionStorage.setItem(SESSION_EMAIL, email);
  }, true);

  async function tick() {
    const code = currentCode();
    const status = currentStatus();
    if (code && (code !== lastCode || status !== lastStatus)) {
      lastCode = code;
      lastStatus = status;
      await register(code, status);
    }
  }

  const initialCode = text(new URLSearchParams(location.search).get('creation'));
  if (initialCode) {
    lastCode = initialCode;
    lastStatus = 'salva';
    register(initialCode, 'salva');
  }

  const observer = new MutationObserver(() => { tick(); });
  const start = () => {
    observer.observe(document.documentElement, { subtree:true, childList:true, attributes:true, attributeFilter:['hidden'] });
    tick();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();

  console.info(`CanecaFácil · dispositivo/criação ${BUILD}`);
})();
