(() => {
  'use strict';

  const BUILD = '20260901-creation-device-bridge-v1';
  const FIREBASE = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const CREATIONS_NODE = 'canecas/personalizadas';
  const STORE = 'https://www.canecafacil.com.br/';
  const SESSION_EMAIL = 'cf_personalizer_email_v1';

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
    const response = await fetch(`${FIREBASE}/${CREATIONS_NODE}/${safeKey(code)}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload)
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
      type: 'canecafacil:minha-arte',
      code,
      status,
      modelId: text(new URLSearchParams(location.search).get('model')),
      resumeUrl: storeResumeUrl(code),
      build: BUILD
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
    if (!code) return;
    const email = text(document.getElementById('customerEmail')?.value || sessionStorage.getItem(SESSION_EMAIL));
    const emailHash = await sha256(email);
    const resumeUrl = storeResumeUrl(code);
    const patch = {
      resume_store_url: resumeUrl,
      dispositivo_registrado: true,
      atualizado_em: new Date().toISOString()
    };
    if (emailHash) patch.cliente_email_hash = emailHash;
    await patchCreation(code, patch).catch(error => console.debug('[CanecaFácil] vínculo da criação:', error?.message || error));
    const resume = document.getElementById('resumeLink');
    if (resume) resume.href = resumeUrl;
    postToParent(code, status);
  }

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
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
    tick();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  console.info(`CanecaFácil · dispositivo/criação ${BUILD}`);
})();
