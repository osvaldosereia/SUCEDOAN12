(() => {
  'use strict';

  const BUILD = '20260903-native-personalizer-inline-v1.0';
  const BASE = 'https://donaantonia.com.br/loja-integrada/';
  const APP = `${BASE}personalizar/app-v15.js?v=20260903-native-1`;
  const CSS = `${BASE}native-personalizer-inline-v1.css?v=20260903-1`;
  const FUN_CSS = `${BASE}personalizar/fun-loader-v1.css?v=20260901-1`;
  const STORE = 'cf_minhas_artes_v1';

  if (window.__CF_NATIVE_PERSONALIZER_INLINE__ === BUILD) return;
  window.__CF_NATIVE_PERSONALIZER_INLINE__ = BUILD;

  const text = value => String(value ?? '').trim();

  function addStyle(href, marker) {
    if ([...document.styleSheets].some(sheet => String(sheet.href || '').includes(marker))) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.cfNativeStyle = marker;
    document.head.appendChild(link);
  }

  function hasScript(part) {
    return [...document.scripts].some(script => String(script.src || '').includes(part));
  }

  function loadClassic(src, marker) {
    if (hasScript(marker)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.dataset.cfNativeModule = marker;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Falha ao carregar ${marker}`));
      document.head.appendChild(script);
    });
  }

  function loadModule(src, marker) {
    if (hasScript(marker)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = src;
      script.dataset.cfNativeModule = marker;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Falha ao carregar ${marker}`));
      document.head.appendChild(script);
    });
  }

  function statusFromHost(host) {
    const visible = id => {
      const node = host.querySelector(`#${id}`);
      return node && !node.hidden;
    };
    if (visible('successBox')) return 'carrinho';
    if (visible('previewBox')) return 'arte_pronta';
    if (visible('pendingBox') || visible('progressBox')) return 'gerando';
    return 'salva';
  }

  function localRows() {
    try {
      const rows = JSON.parse(localStorage.getItem(STORE) || '[]');
      return Array.isArray(rows) ? rows : [];
    } catch { return []; }
  }

  function refreshMyMugsCount() {
    const rows = localRows().filter(row => row && /^CF-/i.test(text(row.code)));
    const trigger = document.getElementById('cfMyArtsTrigger');
    if (!trigger) return;
    const count = trigger.querySelector('.cf-count');
    if (count) count.textContent = String(rows.length);
    if (rows.length) trigger.hidden = false;
  }

  function remember(code, status, modelId) {
    code = text(code).toUpperCase();
    if (!/^CF-/i.test(code)) return;
    const rows = localRows().filter(row => text(row?.code).toUpperCase() !== code);
    rows.unshift({ code, savedAt:Date.now(), status:text(status), modelId:text(modelId) });
    try { localStorage.setItem(STORE, JSON.stringify(rows.slice(0, 80))); } catch {}
    refreshMyMugsCount();
  }

  function installGenerationObserver(modelId) {
    if (window.__CF_NATIVE_GENERATION_FETCH_OBSERVER__) return;
    window.__CF_NATIVE_GENERATION_FETCH_OBSERVER__ = BUILD;
    const innerFetch = window.fetch.bind(window);
    window.fetch = function cfNativeGenerationObserver(input, init = {}) {
      try {
        const url = new URL(String(input), location.href);
        if (/^hook\.[a-z0-9-]+\.make\.com$/i.test(url.hostname) && typeof init?.body === 'string') {
          const wrapper = JSON.parse(init.body);
          const payload = wrapper && typeof wrapper.payload === 'string' ? JSON.parse(wrapper.payload) : null;
          const code = text(payload?.creation_code).toUpperCase();
          if (payload?.action === 'personalize_mug_model' && /^CF-/i.test(code)) {
            remember(code, 'gerando', payload?.model_id || modelId);
          }
        }
      } catch {}
      return innerFetch(input, init);
    };
  }

  function markup() {
    return `
      <div class="cf-native-personalizer-inner">
        <button type="button" id="backButton" hidden>Voltar à loja</button>
        <section class="product" id="productBox" hidden aria-live="polite"></section>

        <form class="form-card" id="personalizerForm" hidden>
          <div class="form-head"><div><p class="eyebrow">PERSONALIZE</p><h2>Personalize esta caneca</h2><p class="form-subtitle">Preencha os dados abaixo para criar sua versão.</p></div></div>
          <div class="grid">
            <label class="cf-field cf-wide">Seu e-mail *
              <input id="customerEmail" type="email" autocomplete="email" maxlength="160" placeholder="voce@email.com" required>
            </label>
          </div>
          <div class="grid" id="dynamicFields"></div>
          <button class="primary generate-cta" id="generateButton" type="submit">GERAR MINHA ARTE</button>
          <p class="native-note">Seu e-mail será usado apenas para esta personalização. Promoções exigem autorização separada.</p>
        </form>

        <section class="preview-card" id="previewBox" hidden aria-live="polite">
          <div class="preview-head"><div><strong>Sua arte ficou pronta ✨</strong><p>Confira os dois lados antes de aprovar.</p></div><small id="previewCode"></small></div>
          <div class="preview-stage"><img id="previewImage" alt="Prévia da arte personalizada"></div>
          <div class="preview-controls" aria-label="Controles da prévia">
            <button type="button" class="preview-arrow" id="prevPreview" aria-label="Imagem anterior">‹</button>
            <div class="preview-dots" id="previewDots" aria-hidden="true"><span class="active"></span><span></span></div>
            <button type="button" class="preview-arrow" id="nextPreview" aria-label="Próxima imagem">›</button>
          </div>
          <div class="preview-meta"><span id="previewCounter">1 de 2</span><span>Prévia da arte real</span></div>
          <label class="cf-field cf-wide quantity-art">Quantidade desta mesma arte
            <input id="personalizedQuantity" type="number" inputmode="numeric" min="1" max="20" step="1" value="1" aria-label="Quantidade desta arte personalizada">
            <small>Para nomes ou artes diferentes, gere outra personalização.</small>
          </label>
          <button class="primary approve-cta" id="approveButton" type="button">APROVAR E COMPRAR</button>
          <button class="secondary preview-edit" id="editCreation" type="button" hidden>CORRIGIR DADOS</button>
          <p class="native-note">Ao aprovar, sua arte ficará vinculada ao pedido desta caneca.</p>
        </section>

        <section class="pending-card" id="pendingBox" hidden aria-live="polite">
          <strong>Sua arte continua sendo preparada</strong><p id="pendingText">Você pode sair desta página e voltar depois.</p>
          <a class="secondary" id="resumeLink" href="#">ACOMPANHAR MINHA ARTE</a>
        </section>

        <section class="progress-card" id="progressBox" hidden aria-live="polite">
          <div class="cf-mug-maker" aria-hidden="true"><i class="cf-spark cf-spark-a"></i><i class="cf-spark cf-spark-b"></i><i class="cf-spark cf-spark-c"></i><div class="cf-mug-loader"><span class="cf-mug-art"></span><span class="cf-mug-handle"></span></div><span class="cf-mug-shadow"></span></div>
          <div class="cf-progress-copy"><strong id="progressTitle">Gerando sua arte</strong><p id="progressText">Aguarde alguns instantes.</p><div class="cf-wait-messages" aria-hidden="true"><span>Preparando a tinta digital…</span></div></div>
        </section>

        <section class="success-card" id="successBox" hidden><strong>Compra preparada</strong><p id="successText">Abrindo o carrinho com o produto original…</p><a class="primary approve-cta" id="cartFallback" href="https://www.canecafacil.com.br/carrinho/index">IR PARA O CARRINHO</a></section>
        <section class="error-card" id="errorBox" hidden><strong>Não foi possível concluir</strong><p id="errorText"></p><button type="button" class="secondary" id="tryAgain">Tentar novamente</button></section>
      </div>`;
  }

  function observeCreation(host, modelId) {
    let last = '';
    const tick = () => {
      const code = text(host.querySelector('#previewCode')?.textContent).toUpperCase();
      if (!/^CF-/i.test(code)) return;
      const status = statusFromHost(host);
      const key = `${code}|${status}`;
      if (key === last) return;
      last = key;
      remember(code, status, modelId);
    };
    const observer = new MutationObserver(tick);
    observer.observe(host, { subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['hidden'] });
    tick();
  }

  async function mount(host, options = {}) {
    if (!host || host.dataset.cfNativeMounted === BUILD) return;
    const modelId = text(options.modelId || host.dataset.modelId);
    if (!modelId) throw new Error('Modelo da personalização não informado.');
    const returnUrl = text(options.returnUrl || location.href.split('#')[0]);

    host.dataset.cfNativeMounted = BUILD;
    host.dataset.cfNativePersonalizer = '1';
    host.classList.add('cf-native-personalizer');
    host.innerHTML = markup();

    addStyle(CSS, 'native-personalizer-inline-v1.css');
    addStyle(FUN_CSS, 'fun-loader-v1.css');
    installGenerationObserver(modelId);

    const originalUrl = location.href;
    const bootstrapUrl = new URL(location.href);
    bootstrapUrl.searchParams.set('model', modelId);
    bootstrapUrl.searchParams.set('return', returnUrl);
    try { history.replaceState(history.state, '', bootstrapUrl.href); } catch {}

    window.__CF_NATIVE_PERSONALIZER_CONTEXT__ = { modelId, returnUrl, host, build:BUILD };

    try {
      const P = `${BASE}personalizar/`;
      await loadClassic(`${P}creation-device-bridge-v1.js?v=20260901-3`, 'creation-device-bridge-v1.js');
      await loadClassic(`${P}native-cart-v2.js?v=20260902-5`, 'native-cart-v2.js');
      await loadClassic(`${P}generation-guard-v1.js?v=20260902-3`, 'generation-guard-v1.js');
      await loadClassic(`${P}correction-policy-v1.js?v=20260902-1`, 'correction-policy-v1.js');
      await loadClassic(`${P}mobile-fetch-compat-v1.js?v=20260903-2`, 'mobile-fetch-compat-v1.js');
      await loadClassic(`${P}image-upload-stability-v1.js?v=20260902-1`, 'image-upload-stability-v1.js');
      await loadModule(APP, 'app-v15.js');
      observeCreation(host, modelId);
    } catch (error) {
      const errorBox = host.querySelector('#errorBox');
      const errorText = host.querySelector('#errorText');
      if (errorText) errorText.textContent = 'Não foi possível carregar o personalizador. Atualize a página e tente novamente.';
      if (errorBox) errorBox.hidden = false;
      console.error('[CanecaFácil] personalizador nativo:', error);
    } finally {
      try { history.replaceState(history.state, '', originalUrl); } catch {}
    }
  }

  window.CanecaFacilNativePersonalizer = { mount, build:BUILD };
  document.dispatchEvent(new CustomEvent('canecafacil:native-personalizer-ready', { detail:{ build:BUILD } }));
  console.info(`CanecaFácil · personalizador nativo ${BUILD}`);
})();