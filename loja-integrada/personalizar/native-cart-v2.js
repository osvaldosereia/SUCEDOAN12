(() => {
  'use strict';

  const BUILD = '20260902-native-cart-v2.4-quantity';
  const FIREBASE = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const STOREFRONT = 'https://www.canecafacil.com.br/';
  const CREATIONS_NODE = 'canecas/personalizadas';
  const PENDING_NODE = 'canecas/encomendas_pendentes';
  const MAKE_WEBHOOK_HOST = 'hook.eu1.make.com';
  const innerFetch = window.fetch.bind(window);

  if (window.__CF_NATIVE_CART_V2__ === BUILD) return;
  window.__CF_NATIVE_CART_V2__ = BUILD;
  window.__CF_PERSONALIZED_PRODUCT_MODE__ = 'original-product-only';

  const text = value => String(value ?? '').trim();
  const safeKey = value => text(value).replace(/[.#$\[\]/]/g, '_');
  const quantity = value => Math.max(1, Math.min(20, Number.parseInt(value, 10) || 1));

  /* Proteção definitiva: o fluxo público nunca cria produto temporário. */
  window.fetch = async function cfNoTemporaryProductFetch(input, init = {}) {
    try {
      const url = new URL(String(input), location.href);
      if (url.hostname === MAKE_WEBHOOK_HOST && typeof init?.body === 'string') {
        const wrapper = JSON.parse(init.body);
        const payload = wrapper && typeof wrapper.payload === 'string' ? JSON.parse(wrapper.payload) : null;
        if (payload?.action === 'loja_integrada_create_personalized_product') {
          throw new Error('Fluxo antigo bloqueado: personalizações compram somente o produto original da Loja Integrada.');
        }
      }
    } catch (error) {
      if (/Fluxo antigo bloqueado/i.test(error?.message || '')) return Promise.reject(error);
    }
    return innerFetch(input, init);
  };

  async function fetchJson(path) {
    const response = await innerFetch(`${FIREBASE}/${path}.json?_=${Date.now()}`, { cache:'no-store', headers:{ Accept:'application/json' } });
    if (!response.ok) throw new Error(`Firebase ${response.status}`);
    return response.json();
  }

  async function writeJson(path, data, method = 'PATCH') {
    const response = await innerFetch(`${FIREBASE}/${path}.json`, {
      method,
      headers:{ 'Content-Type':'application/json', Accept:'application/json' },
      body:JSON.stringify(data)
    });
    if (!response.ok) throw new Error(`Firebase ${response.status}`);
    return response.json().catch(() => null);
  }

  async function sha256(value) {
    const raw = text(value).toLowerCase();
    if (!raw || !globalThis.crypto?.subtle) return '';
    const bytes = new TextEncoder().encode(raw);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function liProductId(product = {}) {
    const li = product.loja_integrada && typeof product.loja_integrada === 'object' ? product.loja_integrada : {};
    return text(li.produto_id || li.product_id || product.loja_integrada_produto_id || product.loja_integrada_product_id || product.canecafacil_product_id || product.li_product_id);
  }

  function sku(product = {}) { return text(product.codigo || product.sku || product.codigo_produto || product.referencia); }
  function art(creation = {}) { return text(creation?.arte_aprovada?.url || creation.arte_aprovada_url || creation.arte_horizontal || creation.arte_personalizacao || creation.arte_impressao?.url || creation.arte_final_url); }
  function codeFromPage() { return text(document.getElementById('previewCode')?.textContent) || text(new URLSearchParams(location.search).get('creation')); }
  function quantityFromPage() { return quantity(document.getElementById('personalizedQuantity')?.value || 1); }

  function setProgress(title, message) {
    for (const id of ['previewBox','errorBox','successBox','pendingBox']) { const node = document.getElementById(id); if (node) node.hidden = true; }
    const progress = document.getElementById('progressBox');
    if (progress) progress.hidden = false;
    const titleNode = document.getElementById('progressTitle');
    const textNode = document.getElementById('progressText');
    if (titleNode) titleNode.textContent = title;
    if (textNode) textNode.textContent = message;
  }

  function showError(message) {
    const progress = document.getElementById('progressBox'); if (progress) progress.hidden = true;
    const preview = document.getElementById('previewBox'); if (preview) preview.hidden = false;
    const error = document.getElementById('errorBox'); if (error) error.hidden = false;
    const node = document.getElementById('errorText'); if (node) node.textContent = message;
  }

  function handoffUrl(code, productId, modelKey, qty) {
    const url = new URL('/', STOREFRONT);
    url.searchParams.set('cf_add_personalizada', '1');
    url.searchParams.set('cf_criacao', code);
    url.searchParams.set('cf_produto', productId);
    url.searchParams.set('cf_qtd', String(quantity(qty)));
    if (modelKey) url.searchParams.set('cf_modelo', modelKey);
    return url.href;
  }

  async function approve(button) {
    if (button.dataset.cfNativeBusy === '1') return;
    button.dataset.cfNativeBusy = '1';
    button.disabled = true;
    const qty = quantityFromPage();
    setProgress('Abrindo o carrinho', `Ligando sua arte ao modelo original · ${qty} ${qty === 1 ? 'unidade' : 'unidades'}…`);

    try {
      const code = codeFromPage();
      if (!code) throw new Error('Não consegui identificar o código desta arte.');
      const creation = await fetchJson(`${CREATIONS_NODE}/${safeKey(code)}`);
      if (!creation) throw new Error('Esta arte não foi localizada.');

      const modelKey = text(creation.modelo_key || creation.produto_key || creation.model_id);
      if (!modelKey) throw new Error('Esta arte não está vinculada ao produto original.');
      const product = await fetchJson(`produtos/${safeKey(modelKey)}`);
      if (!product) throw new Error('O produto original desta caneca não foi localizado.');

      const productId = liProductId(product);
      if (!productId) throw new Error('O modelo original ainda não está sincronizado com a Loja Integrada.');
      const source = art(creation);
      if (!source) throw new Error('A arte personalizada ainda não está pronta.');

      const now = new Date().toISOString();
      const fallbackEmail = text(document.getElementById('customerEmail')?.value || sessionStorage.getItem('cf_personalizer_email_v1'));
      const emailHash = text(creation.cliente_email_hash) || await sha256(fallbackEmail);
      const pending = {
        id:code,
        criacao_id:code,
        status:'carrinho',
        quantidade:qty,
        produto_key:modelKey,
        modelo_nome:text(creation.modelo_nome || product.nome),
        loja_integrada_produto_id:productId,
        sku:sku(product),
        cliente_email_hash:emailHash,
        aprovado_em:now,
        atualizado_em:now,
        origem:'produto_original_loja_integrada',
        versao:BUILD
      };

      await Promise.all([
        writeJson(`${CREATIONS_NODE}/${safeKey(code)}`, {
          aprovada:true,
          arte_aprovada:{ url:source, versao:text(creation.arte_versao || 'v1') || 'v1', aprovado_em:now },
          arte_versao_aprovada:text(creation.arte_versao || 'v1') || 'v1',
          cliente_email_hash:emailHash || null,
          quantidade_encomendada:qty,
          status:'aguardando_pedido',
          atendimento_status:'encomendando',
          encomenda:{
            status:'carrinho', codigo_arte:code, produto_key:modelKey, quantidade:qty,
            loja_integrada_produto_id:productId, sku:sku(product),
            iniciado_em:now, atualizado_em:now, origem:'produto_original_loja_integrada'
          },
          atualizado_em:now
        }),
        writeJson(`${PENDING_NODE}/${safeKey(code)}`, pending, 'PUT')
      ]);

      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type:'canecafacil:carrinho-personalizado', code, productId, modelKey, quantity:qty, build:BUILD }, '*');
        }
      } catch {}

      const url = handoffUrl(code, productId, modelKey, qty);
      const fallback = document.getElementById('cartFallback'); if (fallback) fallback.href = url;
      if (window.top && window.top !== window) window.top.location.href = url;
      else location.href = url;
    } catch (error) {
      console.error('[CanecaFácil native cart v2]', error);
      button.dataset.cfNativeBusy = '';
      button.disabled = false;
      showError(error?.message || String(error));
    }
  }

  document.addEventListener('click', event => {
    const button = event.target?.closest?.('#approveButton');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    approve(button);
  }, true);

  console.info(`CanecaFácil · produto original no carrinho ${BUILD}`);
})();