(() => {
  'use strict';

  const BUILD = '20260902-generation-guard-v1';
  const STORAGE = 'cf_generation_guard_v1';
  const PER_MODEL = 2;
  const PER_DEVICE = 6;
  const MAKE_HOST_RE = /^hook\.[a-z0-9-]+\.make\.com$/i;
  const innerFetch = window.fetch.bind(window);

  if (window.__CF_GENERATION_GUARD__ === BUILD) return;
  window.__CF_GENERATION_GUARD__ = BUILD;

  const text = value => String(value ?? '').trim();
  const dayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };

  function read() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE) || '{}');
      if (raw.day !== dayKey()) return { day:dayKey(), total:0, models:{} };
      return { day:raw.day, total:Number(raw.total)||0, models:raw.models && typeof raw.models === 'object' ? raw.models : {} };
    } catch { return { day:dayKey(), total:0, models:{} }; }
  }
  function save(state) { try { localStorage.setItem(STORAGE, JSON.stringify(state)); } catch {} }

  function inspect(input, init = {}) {
    try {
      const url = new URL(String(input), location.href);
      if (!MAKE_HOST_RE.test(url.hostname) || typeof init?.body !== 'string') return null;
      const wrapper = JSON.parse(init.body);
      const payload = wrapper && typeof wrapper.payload === 'string' ? JSON.parse(wrapper.payload) : null;
      if (payload?.action !== 'personalize_mug_model') return null;
      return { model:text(payload.model_id) || 'sem-modelo', code:text(payload.creation_code) };
    } catch { return null; }
  }

  window.fetch = async function cfGenerationGuard(input, init = {}) {
    const generation = inspect(input, init);
    if (!generation) return innerFetch(input, init);

    const state = read();
    const modelCount = Number(state.models[generation.model] || 0);
    if (modelCount >= PER_MODEL) {
      throw new Error(`Você já criou ${PER_MODEL} artes deste modelo hoje. Elas continuam salvas em Minhas Artes para você ver e comprar. Tente uma nova criação amanhã.`);
    }
    if (state.total >= PER_DEVICE) {
      throw new Error(`Este aparelho já utilizou as ${PER_DEVICE} gerações gratuitas de hoje. Suas artes continuam disponíveis em Minhas Artes.`);
    }

    const response = await innerFetch(input, init);
    if (response.ok) {
      const latest = read();
      latest.total = Number(latest.total || 0) + 1;
      latest.models[generation.model] = Number(latest.models[generation.model] || 0) + 1;
      save(latest);
    }
    return response;
  };

  window.CFGenerationGuard = { perModel:PER_MODEL, perDevice:PER_DEVICE, status:read };
  console.info(`CanecaFácil · limite de geração ${BUILD}`);
})();