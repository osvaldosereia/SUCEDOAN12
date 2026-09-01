(() => {
  'use strict';

  const BUILD = '20260901-native-cart-v1';
  const FIREBASE = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const STOREFRONT = 'https://canecafacil.com.br/';
  const CREATIONS_NODE = 'canecas/personalizadas';
  const PENDING_NODE = 'canecas/encomendas_pendentes';

  if (window.__CF_NATIVE_CART__ === BUILD) return;
  window.__CF_NATIVE_CART__ = BUILD;

  const text = value => String(value ?? '').trim();
  const safeKey = value => text(value).replace(/[.#$\[\]/]/g, '_');

  async function fetchJson(path) {
    const response = await fetch(`${FIREBASE}/${path}.json?_=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`Firebase ${response.status}`);
    return response.json();
  }

  async function writeJson(path, data, method = 'PATCH') {
    const response = await fetch(`${FIREBASE}/${path}.json`, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error(`Firebase ${response.status}`);
    return response.json().catch(() => null);
  }

  function productLiId(product = {}) {
    const li = product.loja_integrada && typeof product.loja_integrada === 'object' ? product.loja_integrada : {};
    return text(
      li.produto_id || li.product_id || product.loja_integrada_produto_id ||
      product.loja_integrada_product_id || product.canecafacil_product_id || product.li_product_id
    );
  }

  function productSku(product = {}) {
    return text(product.codigo || product.sku || product.codigo_produto || product.referencia);
  }

  function artSource(creation = {}) {
    return text(
      creation?.arte_aprovada?.url || creation.arte_aprovada_url || creation.arte_horizontal ||
      creation.arte_personalizacao || creation.arte_impressao?.url || creation.arte_final_url
    );
  }

  function currentCode() {
    const shown = text(document.getElementById('previewCode')?.textContent);
    if (shown) return shown;
    return text(new URLSearchParams(location.search).get('creation'));
  }

  function setProgress(title, message) {
    const preview = document.getElementById('previewBox');
    const error = document.getElementById('errorBox');
    const success = document.getElementById('successBox');
    const pending = document.getElementById('pendingBox');
    const progress = document.getElementById('progressBox');
    if (preview) preview.hidden = true;
    if (error) error.hidden = true;
    if (success) success.hidden = true;
    if (pending) pending.hidden = true;
    if (progress) progress.hidden = false;
    const titleNode = document.getElementById('progressTitle');
    const textNode = document.getElementById('progressText');
    if (titleNode) titleNode.textContent = title;
    if (textNode) textNode.textContent = message;
  }

  function showError(message) {
    const progress = document.getElementById('progressBox');
    const preview = document.getElementById('previewBox');
    const error = document.getElementById('errorBox');
    if (progress) progress.hidden = true;
    if (preview) preview.hidden = false;
    if (error) error.hidden = false;
    const node = document.getElementById('errorText');
    if (node) node.textContent = message;
  }

  async function sha256(value) {
    const raw = text(value).toLowerCase();
    if (!raw || !globalThis.crypto?.subtle) return '';
    const data = new TextEncoder().encode(raw);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function handoffUrl(code, productId, modelKey) {
    const url = new URL(STOREFRONT);
    url.searchParams.set('cf_add_personalizada', '1');
    url.searchParams.set('cf_criacao', code);
    url.searchParams.set('cf_produto', productId);
    if (modelKey) url.searchParams.set('cf_modelo', modelKey);
    return url.href;
  }

  async function approveNative(button) {
    if (button.dataset.cfNativeBusy === '1') return;
    button.dataset.cfNativeBusy = '1';
    button.disabled = true;
    setProgress('Abrindo o carrinho', 'Vinculando sua arte ao produto original da loja…');

    try {
      const code = currentCode();
      if (!code) throw new Error('Não consegui identificar o código desta arte.');

      const creation = await fetchJson(`${CREATIONS_NODE}/${safeKey(code)}`);
      if (!creation) throw new Error('Esta arte não foi localizada. Gere a personalização novamente.');

      const modelKey = text(creation.modelo_key || creation.produto_key || creation.model_id);
      if (!modelKey) throw new Error('Esta arte não está vinculada ao modelo original.');

      const product = await fetchJson(`produtos/${safeKey(modelKey)}`);
      if (!product) throw new Error('O produto original desta caneca não foi localizado.');

      const productId = productLiId(product);
      if (!productId) {
        throw new Error('A arte está salva, mas o produto original ainda não está vinculado à Loja Integrada. Sincronize este modelo no Admin Caneca e tente novamente.');
      }

      const source = artSource(creation);
      if (!source) throw new Error('A arte personalizada ainda não está pronta para a encomenda.');

      const now = new Date().toISOString();
      const emailHash = await sha256(document.getElementById('customerEmail')?.value || '');
      const pending = {
        id: code,
        criacao_id: code,
        status: 'carrinho',
        produto_key: modelKey,
        modelo_nome: text(creation.modelo_nome || product.nome),
        loja_integrada_produto_id: productId,
        sku: productSku(product),
        cliente_email_hash: emailHash,
        aprovado_em: now,
        atualizado_em: now,
        origem: 'personalizador_produto_original',
        versao: BUILD
      };

      await Promise.all([
        writeJson(`${CREATIONS_NODE}/${safeKey(code)}`, {
          aprovada: true,
          arte_aprovada: { url: source, versao: text(creation.arte_versao || 'v1') || 'v1', aprovado_em: now },
          arte_versao_aprovada: text(creation.arte_versao || 'v1') || 'v1',
          status: 'aguardando_pedido',
          atendimento_status: 'encomendando',
          encomenda: {
            status: 'carrinho',
            codigo_arte: code,
            produto_key: modelKey,
            loja_integrada_produto_id: productId,
            sku: productSku(product),
            iniciado_em: now,
            atualizado_em: now,
            origem: 'produto_original_loja_integrada'
          },
          atualizado_em: now
        }),
        writeJson(`${PENDING_NODE}/${safeKey(code)}`, pending, 'PUT')
      ]);

      const url = handoffUrl(code, productId, modelKey);
      const fallback = document.getElementById('cartFallback');
      if (fallback) fallback.href = url;
      try {
        if (window.top && window.top !== window) window.top.location.href = url;
        else location.href = url;
      } catch {
        location.href = url;
      }
    } catch (error) {
      console.error('[CanecaFácil native cart]', error);
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
    approveNative(button);
  }, true);

  console.info(`CanecaFácil · carrinho nativo ${BUILD}`);
})();
