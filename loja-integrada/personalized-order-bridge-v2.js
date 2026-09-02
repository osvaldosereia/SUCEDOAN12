(() => {
  'use strict';

  const BUILD = '20260901-personalized-order-bridge-v2.2-same-origin-cart';
  const STORAGE_KEY = 'cf_personalized_cart_v2';
  const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
  const CART_URL = '/carrinho/index';

  if (window.__CF_PERSONALIZED_ORDER_BRIDGE_V2__ === BUILD) return;
  window.__CF_PERSONALIZED_ORDER_BRIDGE_V2__ = BUILD;

  const text = value => String(value ?? '').trim();

  function readQueue() {
    try {
      const rows = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      const cutoff = Date.now() - MAX_AGE_MS;
      return (Array.isArray(rows) ? rows : []).filter(row => row && text(row.code) && Number(row.addedAt || 0) >= cutoff);
    } catch { return []; }
  }

  function saveQueue(rows) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(-50))); } catch {}
  }

  function upsert(entry) {
    const rows = readQueue().filter(row => text(row.code) !== text(entry.code));
    rows.push(entry);
    saveQueue(rows);
  }

  function installStyle() {
    if (document.getElementById('cfPersonalizedOrderStyleV2')) return;
    const style = document.createElement('style');
    style.id = 'cfPersonalizedOrderStyleV2';
    style.textContent = `
      .cf-personalized-tag{display:block;width:max-content;max-width:100%;margin:5px 0 0;padding:4px 8px;border-radius:999px;background:#fff3e8;color:#a94c0d;font-size:10px;font-weight:900;line-height:1.25;letter-spacing:.045em}
      .cf-personalized-tag span{font-weight:700;letter-spacing:0;color:#6e6259}
      .cf-cart-handoff{position:fixed;inset:0;z-index:9999999;background:rgba(255,255,255,.96);display:grid;place-items:center;text-align:center;padding:22px;font-family:Arial,sans-serif;color:#171717}
      .cf-cart-handoff strong{display:block;font-size:18px;margin-bottom:6px}.cf-cart-handoff span{font-size:12px;color:#777}
    `;
    document.head.appendChild(style);
  }

  function showHandoff() {
    installStyle();
    if (document.getElementById('cfCartHandoff')) return;
    const node = document.createElement('div');
    node.id = 'cfCartHandoff';
    node.className = 'cf-cart-handoff';
    node.innerHTML = '<div><strong>Adicionando sua caneca personalizada…</strong><span>Estamos usando o produto original e preservando o código da sua arte.</span></div>';
    document.body.appendChild(node);
  }

  function clearHandoffParams() {
    try {
      const url = new URL(location.href);
      ['cf_add_personalizada','cf_criacao','cf_produto','cf_modelo'].forEach(key => url.searchParams.delete(key));
      history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {}
  }

  async function addOriginalProduct(productId, code) {
    const add = new URL(`/carrinho/produto/${encodeURIComponent(productId)}/adicionar`, location.origin);
    add.searchParams.set('utm_source', 'canecafacil');
    add.searchParams.set('utm_medium', 'personalizacao');
    add.searchParams.set('utm_campaign', code);
    add.searchParams.set('utm_content', 'personalizada');

    const response = await fetch(add.href, {
      method:'GET',
      credentials:'same-origin',
      cache:'no-store',
      redirect:'follow',
      headers:{ 'X-Requested-With':'XMLHttpRequest' }
    });
    if (!response.ok) throw new Error(`Carrinho respondeu ${response.status}`);
    return true;
  }

  function startHandoff() {
    const params = new URLSearchParams(location.search);
    if (params.get('cf_add_personalizada') !== '1') return false;
    const code = text(params.get('cf_criacao')).toUpperCase();
    const productId = text(params.get('cf_produto'));
    const modelKey = text(params.get('cf_modelo'));
    if (!/^CF-/i.test(code) || !/^\d+$/.test(productId)) return false;

    upsert({ code, productId, modelKey, addedAt:Date.now(), status:'carrinho' });
    showHandoff();
    clearHandoffParams();

    addOriginalProduct(productId, code)
      .then(() => location.replace(CART_URL))
      .catch(error => {
        console.error('[CanecaFácil] falha ao adicionar produto original:', error);
        // Fallback: abre a rota nativa apenas depois de já estarmos no domínio/sessão da loja.
        const add = new URL(`/carrinho/produto/${encodeURIComponent(productId)}/adicionar`, location.origin);
        add.searchParams.set('utm_source', 'canecafacil');
        add.searchParams.set('utm_medium', 'personalizacao-fallback');
        add.searchParams.set('utm_campaign', code);
        location.replace(add.href);
      });
    return true;
  }

  function productIdFromElement(element) {
    if (!element) return '';
    const direct = text(element.dataset?.produtoId || element.dataset?.productId || element.getAttribute?.('data-produto-id') || element.getAttribute?.('data-product-id'));
    if (/^\d+$/.test(direct)) return direct;
    const html = element.innerHTML || '';
    const match = html.match(/\/carrinho\/produto\/(\d+)\/(?:adicionar|remover|atualizar)/i)
      || html.match(/[?&](?:produto|produto_id|id_produto)=(\d+)/i);
    return match?.[1] || '';
  }

  function cartRows() {
    const selectors = ['.carrinho .item', '.item-produto', '.produto-carrinho', '[data-produto-id]', '[data-product-id]', 'tr'];
    const seen = new Set();
    const rows = [];
    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach(el => {
        if (seen.has(el)) return;
        seen.add(el);
        const id = productIdFromElement(el);
        if (id) rows.push({ el, id });
      });
    }
    return rows;
  }

  function nameAnchor(row) {
    return row.querySelector('.nome-produto,.produto-nome,[class*="nome-produto"],[class*="produto-nome"],strong,h3,h4,a[href]');
  }

  function annotateCart() {
    installStyle();
    const queue = readQueue();
    if (!queue.length) return;
    const rows = cartRows();
    for (const entry of queue) {
      const row = rows.find(item => item.id === text(entry.productId));
      if (!row) continue;
      if (row.el.querySelector(`.cf-personalized-tag[data-code="${CSS.escape(entry.code)}"]`)) continue;
      const anchor = nameAnchor(row.el);
      if (!anchor) continue;
      const tag = document.createElement('div');
      tag.className = 'cf-personalized-tag';
      tag.dataset.code = entry.code;
      tag.innerHTML = `PERSONALIZADA <span>· ${entry.code}</span>`;
      anchor.insertAdjacentElement('afterend', tag);
    }
  }

  window.addEventListener('message', event => {
    if (event.origin !== 'https://donaantonia.com.br') return;
    const data = event.data || {};
    if (data.type !== 'canecafacil:carrinho-personalizado') return;
    const code = text(data.code);
    const productId = text(data.productId);
    if (!/^CF-/i.test(code) || !/^\d+$/.test(productId)) return;
    upsert({ code, productId, modelKey:text(data.modelKey), addedAt:Date.now(), status:'carrinho' });
    annotateCart();
  });

  if (startHandoff()) return;
  let runs = 0;
  const timer = setInterval(() => {
    runs += 1;
    annotateCart();
    if (runs >= 80) clearInterval(timer);
  }, 500);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', annotateCart, { once:true });
  else annotateCart();

  console.info(`CanecaFácil · item personalizado no carrinho ${BUILD}`);
})();
