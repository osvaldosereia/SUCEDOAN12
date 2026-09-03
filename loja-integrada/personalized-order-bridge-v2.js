(() => {
  'use strict';

  const BUILD = '20260903-personalized-order-bridge-v2.5-cart-only';
  const FIREBASE = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const CREATIONS_NODE = 'canecas/personalizadas';
  const STORAGE_KEY = 'cf_personalized_cart_v2';
  const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
  const CART_URL = '/carrinho/index';
  const creationCache = new Map();
  let annotateBusy = false;

  if (window.__CF_PERSONALIZED_ORDER_BRIDGE_V2__ === BUILD) return;
  window.__CF_PERSONALIZED_ORDER_BRIDGE_V2__ = BUILD;

  const text = value => String(value ?? '').trim();
  const safeKey = value => text(value).replace(/[.#$\[\]/]/g, '_');
  const quantity = value => Math.max(1, Math.min(20, Number.parseInt(value, 10) || 1));
  const isCartPage = () => /^\/carrinho(?:\/|$)/i.test(location.pathname) || document.body?.classList?.contains('pagina-carrinho');

  function readQueue() {
    try {
      const rows = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      const cutoff = Date.now() - MAX_AGE_MS;
      return (Array.isArray(rows) ? rows : []).filter(row => row && text(row.code) && Number(row.addedAt || 0) >= cutoff);
    } catch { return []; }
  }

  function saveQueue(rows) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(-50))); } catch {} }
  function upsert(entry) {
    const rows = readQueue().filter(row => text(row.code) !== text(entry.code));
    rows.push({ ...entry, quantity:quantity(entry.quantity) });
    saveQueue(rows);
  }

  async function fetchCreation(code) {
    const key = text(code).toUpperCase();
    if (!key) return null;
    if (creationCache.has(key)) return creationCache.get(key);
    try {
      const response = await fetch(`${FIREBASE}/${CREATIONS_NODE}/${safeKey(key)}.json?_=${Date.now()}`, {
        cache:'no-store', headers:{ Accept:'application/json' }
      });
      if (!response.ok) return null;
      const data = await response.json();
      if (data) creationCache.set(key, data);
      return data || null;
    } catch { return null; }
  }

  function creationArt(creation = {}) {
    return text(creation?.arte_aprovada?.url || creation.arte_aprovada_url || creation.arte_horizontal || creation.arte_personalizacao || creation.arte_impressao?.url || creation.arte_final_url);
  }

  function installStyle() {
    if (document.getElementById('cfPersonalizedOrderStyleV2')) return;
    const style = document.createElement('style');
    style.id = 'cfPersonalizedOrderStyleV2';
    style.textContent = `
      .cf-personalized-meta{display:block;margin:7px 0 0;max-width:430px}
      .cf-personalized-tag{display:inline-flex;align-items:center;gap:3px;max-width:100%;margin:0;padding:6px 9px;border-radius:9px;background:#fff8f2;border:1px solid #f0dfd2;color:#61402d;font-size:10px;font-weight:700;line-height:1.2;white-space:normal}
      .cf-personalized-tag span{font-weight:500;color:#765b4a}.cf-personalized-art-link{display:inline-block;margin:5px 0 0 7px;color:#c45410!important;font:600 10px/1.2 Arial,sans-serif;text-decoration:underline!important}
      img.cf-personalized-thumb{width:112px!important;height:112px!important;max-width:112px!important;object-fit:cover!important;object-position:left center!important;border:1px solid #ece7e2!important;border-radius:10px!important;background:#fff!important;box-shadow:0 2px 9px rgba(0,0,0,.05)}
      .cf-cart-handoff{position:fixed;inset:0;z-index:9999999;background:rgba(255,255,255,.96);display:grid;place-items:center;text-align:center;padding:22px;font-family:Arial,sans-serif;color:#171717}
      .cf-cart-handoff strong{display:block;font-size:18px;margin-bottom:6px}.cf-cart-handoff span{font-size:12px;color:#777}
      @media(max-width:767px){img.cf-personalized-thumb{width:88px!important;height:88px!important;max-width:88px!important}.cf-personalized-meta{max-width:100%}}
    `;
    document.head.appendChild(style);
  }

  function showHandoff(qty) {
    installStyle();
    if (document.getElementById('cfCartHandoff')) return;
    const node = document.createElement('div');
    node.id = 'cfCartHandoff'; node.className = 'cf-cart-handoff';
    node.innerHTML = `<div><strong>Adicionando sua caneca personalizada…</strong><span>${qty} ${qty === 1 ? 'unidade' : 'unidades'} · preparando seu carrinho.</span></div>`;
    document.body.appendChild(node);
  }

  function clearHandoffParams() {
    try {
      const url = new URL(location.href);
      ['cf_add_personalizada','cf_criacao','cf_produto','cf_modelo','cf_qtd'].forEach(key => url.searchParams.delete(key));
      history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {}
  }

  async function addOriginalProduct(productId, code, index) {
    const add = new URL(`/carrinho/produto/${encodeURIComponent(productId)}/adicionar`, location.origin);
    add.searchParams.set('utm_source', 'canecafacil');
    add.searchParams.set('utm_medium', 'personalizacao');
    add.searchParams.set('utm_campaign', code);
    add.searchParams.set('utm_content', `personalizada-${index}`);
    const response = await fetch(add.href, {
      method:'GET', credentials:'same-origin', cache:'no-store', redirect:'follow', headers:{ 'X-Requested-With':'XMLHttpRequest' }
    });
    if (!response.ok) throw new Error(`Carrinho respondeu ${response.status}`);
  }

  async function addQuantity(productId, code, qty) {
    for (let index = 1; index <= qty; index += 1) {
      let lastError = null;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try { await addOriginalProduct(productId, code, index); lastError = null; break; }
        catch (error) { lastError = error; }
      }
      if (lastError) throw lastError;
    }
  }

  function startHandoff() {
    const params = new URLSearchParams(location.search);
    if (params.get('cf_add_personalizada') !== '1') return false;
    const code = text(params.get('cf_criacao')).toUpperCase();
    const productId = text(params.get('cf_produto'));
    const modelKey = text(params.get('cf_modelo'));
    const qty = quantity(params.get('cf_qtd'));
    if (!/^CF-/i.test(code) || !/^\d+$/.test(productId)) return false;

    upsert({ code, productId, modelKey, quantity:qty, addedAt:Date.now(), status:'carrinho' });
    showHandoff(qty); clearHandoffParams();
    addQuantity(productId, code, qty)
      .then(() => location.replace(CART_URL))
      .catch(error => {
        console.error('[CanecaFácil] falha ao adicionar produto original:', error);
        const rows = readQueue();
        const row = rows.find(item => text(item.code) === code);
        if (row) { row.status = 'verificar'; row.errorAt = Date.now(); saveQueue(rows); }
        location.replace(CART_URL);
      });
    return true;
  }

  function productIdFromElement(element) {
    if (!element) return '';
    const direct = text(element.dataset?.produtoId || element.dataset?.productId || element.getAttribute?.('data-produto-id') || element.getAttribute?.('data-product-id'));
    if (/^\d+$/.test(direct)) return direct;
    const html = element.innerHTML || '';
    const match = html.match(/\/carrinho\/produto\/(\d+)\/(?:adicionar|remover|atualizar)/i) || html.match(/[?&](?:produto|produto_id|id_produto)=(\d+)/i);
    return match?.[1] || '';
  }

  function cartRows() {
    if (!isCartPage()) return [];
    const selectors = ['.carrinho .item', '.item-produto', '.produto-carrinho', '[data-produto-id]', '[data-product-id]', 'tr'];
    const seen = new Set(), rows = [];
    for (const selector of selectors) document.querySelectorAll(selector).forEach(el => {
      if (seen.has(el)) return; seen.add(el); const id = productIdFromElement(el); if (id) rows.push({ el, id });
    });
    return rows;
  }

  function nameAnchor(row) {
    const directSelectors = ['.nome-produto','.produto-nome','[class*="nome-produto"]','[class*="produto-nome"]'];
    for (const selector of directSelectors) {
      const node = row.querySelector(selector);
      if (node && text(node.textContent).length > 2) return node;
    }
    const links = [...row.querySelectorAll('a[href]')].filter(link => !link.querySelector('img') && text(link.textContent).length > 2);
    const mugLink = links.find(link => /caneca/i.test(text(link.textContent)));
    return mugLink || links[0] || row.querySelector('strong,h3,h4');
  }

  function productImage(row) {
    const selectors = ['.imagem-produto img','.produto-imagem img','[class*="imagem-produto"] img','[class*="produto-imagem"] img','a[href] img','img'];
    for (const selector of selectors) {
      const img = row.querySelector(selector);
      if (img) return img;
    }
    return null;
  }

  function decorateImage(row, art, code) {
    if (!art || row.querySelector('[data-cf-personalized-thumb]')) return;
    const img = productImage(row); if (!img) return;
    const picture = img.closest('picture');
    picture?.querySelectorAll('source').forEach(source => source.removeAttribute('srcset'));
    img.removeAttribute('srcset');
    img.removeAttribute('data-src');
    img.src = art;
    img.alt = `Arte personalizada ${code}`;
    img.classList.add('cf-personalized-thumb');
    img.dataset.cfPersonalizedThumb = code;
    img.title = 'Prévia da sua arte personalizada';
  }

  function metaHost(row, anchor) {
    let host = row.querySelector('.cf-personalized-meta');
    if (host) return host;
    host = document.createElement('div');
    host.className = 'cf-personalized-meta';
    anchor.insertAdjacentElement('afterend', host);
    return host;
  }

  async function annotateCart() {
    if (!isCartPage() || annotateBusy) return;
    annotateBusy = true;
    try {
      installStyle();
      const queue = readQueue(); if (!queue.length) return;
      const rows = cartRows();
      for (const entry of queue) {
        const row = rows.find(item => item.id === text(entry.productId)); if (!row) continue;
        const anchor = nameAnchor(row.el); if (!anchor) continue;
        const creation = await fetchCreation(entry.code);
        const art = creationArt(creation || {});
        decorateImage(row.el, art, entry.code);

        const host = metaHost(row.el, anchor);
        if (!host.querySelector(`.cf-personalized-tag[data-code="${CSS.escape(entry.code)}"]`)) {
          const tag = document.createElement('div');
          tag.className = 'cf-personalized-tag'; tag.dataset.code = entry.code;
          tag.innerHTML = `☕ Arte personalizada pronta <span>· ${quantity(entry.quantity)} ${quantity(entry.quantity) === 1 ? 'unidade' : 'unidades'}</span>`;
          host.appendChild(tag);
          if (art) {
            const link = document.createElement('a');
            link.className = 'cf-personalized-art-link';
            link.href = art; link.target = '_blank'; link.rel = 'noopener';
            link.textContent = 'Ver minha arte';
            host.appendChild(link);
          }
        }
      }
    } finally { annotateBusy = false; }
  }

  window.addEventListener('message', event => {
    if (event.origin !== 'https://donaantonia.com.br') return;
    const data = event.data || {}; if (data.type !== 'canecafacil:carrinho-personalizado') return;
    const code = text(data.code), productId = text(data.productId);
    if (!/^CF-/i.test(code) || !/^\d+$/.test(productId)) return;
    upsert({ code, productId, modelKey:text(data.modelKey), quantity:quantity(data.quantity), addedAt:Date.now(), status:'carrinho' });
    annotateCart();
  });

  if (startHandoff()) return;
  if (isCartPage()) {
    let runs = 0;
    const timer = setInterval(() => { runs += 1; annotateCart(); if (runs >= 18) clearInterval(timer); }, 500);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', annotateCart, { once:true }); else annotateCart();
  }

  console.info(`CanecaFácil · item personalizado no carrinho ${BUILD}`);
})();