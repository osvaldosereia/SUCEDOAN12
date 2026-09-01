(() => {
  'use strict';

  const BUILD = '20260901-personalized-order-bridge-v1';
  const FIREBASE = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const STORAGE_KEY = 'cf_personalized_cart_v1';
  const MAX_AGE_MS = 8 * 24 * 60 * 60 * 1000;

  if (window.__CF_PERSONALIZED_ORDER_BRIDGE__ === BUILD) return;
  window.__CF_PERSONALIZED_ORDER_BRIDGE__ = BUILD;

  const text = value => String(value ?? '').trim();
  const safeKey = value => text(value).replace(/[.#$\[\]/]/g, '_');

  function readQueue() {
    try {
      const rows = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      const cutoff = Date.now() - MAX_AGE_MS;
      return (Array.isArray(rows) ? rows : []).filter(row => row && text(row.code) && Number(row.addedAt || 0) >= cutoff);
    } catch { return []; }
  }

  function saveQueue(rows) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(-30)));
  }

  function upsertQueue(entry) {
    const rows = readQueue().filter(row => text(row.code) !== text(entry.code));
    rows.push(entry);
    saveQueue(rows);
  }

  async function patchFirebase(path, data) {
    const response = await fetch(`${FIREBASE}/${path}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error(`Firebase ${response.status}`);
    return response.json().catch(() => null);
  }

  function installStyle() {
    if (document.getElementById('cfPersonalizedOrderStyle')) return;
    const style = document.createElement('style');
    style.id = 'cfPersonalizedOrderStyle';
    style.textContent = `
      .cf-personalized-tag{display:block;width:max-content;max-width:100%;margin-top:4px;padding:3px 7px;border-radius:999px;background:#f1f1f1;color:#222;font-size:10px;font-weight:800;line-height:1.25;letter-spacing:.04em}
      .cf-personalized-tag span{font-weight:600;letter-spacing:0;color:#666}
    `;
    document.head.appendChild(style);
  }

  function startHandoff() {
    const params = new URLSearchParams(location.search);
    if (params.get('cf_add_personalizada') !== '1') return false;
    const code = text(params.get('cf_criacao'));
    const productId = text(params.get('cf_produto'));
    const modelKey = text(params.get('cf_modelo'));
    if (!code || !/^\d+$/.test(productId)) return false;

    upsertQueue({ code, productId, modelKey, addedAt: Date.now(), status: 'carrinho' });
    const add = new URL(`/carrinho/produto/${encodeURIComponent(productId)}/adicionar`, location.origin);
    add.searchParams.set('utm_source', 'canecafacil');
    add.searchParams.set('utm_medium', 'personalizador');
    add.searchParams.set('utm_content', code);
    location.replace(add.href);
    return true;
  }

  function elementProductId(element) {
    if (!element) return '';
    const own = text(element.dataset?.produtoId || element.dataset?.productId || element.getAttribute?.('data-produto-id') || element.getAttribute?.('data-product-id'));
    if (/^\d+$/.test(own)) return own;
    const hrefs = [...element.querySelectorAll?.('a[href]') || []].map(a => a.getAttribute('href') || '');
    for (const href of hrefs) {
      const match = href.match(/\/carrinho\/produto\/(\d+)\/(?:adicionar|remover|atualizar)/i)
        || href.match(/[?&](?:produto|produto_id|id_produto)=(\d+)/i);
      if (match) return match[1];
    }
    const html = element.innerHTML || '';
    return html.match(/\/carrinho\/produto\/(\d+)\//i)?.[1] || '';
  }

  function candidateRows() {
    const selectors = [
      '[data-produto-id]', '[data-product-id]', '.item-produto', '.produto-carrinho', '.produto',
      '.carrinho .item', '.checkout .item', '.resumo-compra .item', 'tr'
    ];
    const seen = new Set();
    const rows = [];
    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach(el => {
        if (seen.has(el)) return;
        seen.add(el);
        const id = elementProductId(el);
        if (id) rows.push({ el, id });
      });
    }
    return rows;
  }

  function nameAnchor(row) {
    return row.querySelector(
      '.nome-produto, .produto-nome, .nome, [class*="nome-produto"], [class*="produto-nome"], a[href*="/produto"], a[href*="/p/"]'
    ) || row.querySelector('strong, h3, h4, a');
  }

  function annotate() {
    installStyle();
    const queue = readQueue();
    if (!queue.length) return;
    const rows = candidateRows();
    for (const entry of queue) {
      const match = rows.find(row => row.id === text(entry.productId));
      if (!match) continue;
      if (match.el.querySelector(`.cf-personalized-tag[data-code="${CSS.escape(entry.code)}"]`)) continue;
      const anchor = nameAnchor(match.el);
      if (!anchor) continue;
      const tag = document.createElement('div');
      tag.className = 'cf-personalized-tag';
      tag.dataset.code = entry.code;
      tag.innerHTML = `PERSONALIZADA <span>· ${entry.code}</span>`;
      anchor.insertAdjacentElement('afterend', tag);
    }
  }

  function visibleProductIds() {
    return new Set(candidateRows().map(row => row.id).filter(Boolean));
  }

  function queueForCurrentCart() {
    const queue = readQueue();
    const ids = visibleProductIds();
    if (!ids.size) return queue;
    return queue.filter(entry => ids.has(text(entry.productId)));
  }

  function findCommentField() {
    const selectors = [
      'textarea[name="cliente_obs"]', '#id_cliente_obs', 'textarea[name*="cliente_obs" i]',
      'textarea[name*="coment" i]', 'textarea[id*="coment" i]', 'textarea[name*="observ" i]', 'textarea[id*="observ" i]',
      'input[name="cliente_obs"]', 'input[name*="coment" i]', 'input[name*="observ" i]'
    ];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node) return node;
    }
    return null;
  }

  function fillComment() {
    const entries = queueForCurrentCart();
    if (!entries.length) return;
    const field = findCommentField();
    if (!field) return;
    const codes = [...new Set(entries.map(entry => text(entry.code)).filter(Boolean))];
    if (!codes.length) return;
    const marker = `CanecaFácil PERSONALIZADA: ${codes.join(', ')}`;
    const current = text(field.value);
    const next = /CanecaFácil PERSONALIZADA:[^\n\r]*/i.test(current)
      ? current.replace(/CanecaFácil PERSONALIZADA:[^\n\r]*/i, marker)
      : [current, marker].filter(Boolean).join('\n');
    if (field.value === next) return;
    field.value = next;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function detectOrderId() {
    const params = new URLSearchParams(location.search);
    for (const key of ['pedido_id', 'pedido', 'order_id', 'order']) {
      const value = text(params.get(key));
      if (/^\d+$/.test(value)) return value;
    }
    const pathMatch = location.pathname.match(/\/(?:pedido|pedidos|order|orders)\/(\d+)/i);
    if (pathMatch) return pathMatch[1];
    const bodyText = text(document.body?.innerText).slice(0, 12000);
    return bodyText.match(/(?:pedido|ordem)\s*(?:n[º°o.]*)?\s*#?\s*(\d{3,})/i)?.[1] || '';
  }

  async function recordOrderHint() {
    const orderId = detectOrderId();
    if (!orderId) return;
    const queue = queueForCurrentCart();
    if (!queue.length) return;
    const now = new Date().toISOString();
    const updated = readQueue();
    for (const entry of queue) {
      const row = updated.find(item => text(item.code) === text(entry.code));
      if (row) { row.status = 'pedido_identificado'; row.orderId = orderId; row.updatedAt = Date.now(); }
      try {
        await Promise.all([
          patchFirebase(`canecas/encomendas_pendentes/${safeKey(entry.code)}`, {
            status: 'pedido_identificado', pedido_id_hint: orderId, atualizado_em: now
          }),
          patchFirebase(`canecas/personalizadas/${safeKey(entry.code)}/encomenda`, {
            status: 'pedido_identificado', pedido_id_hint: orderId, atualizado_em: now
          })
        ]);
      } catch (error) {
        console.debug('[CanecaFácil] não foi possível registrar o número do pedido:', error?.message || error);
      }
    }
    saveQueue(updated);
  }

  if (startHandoff()) return;

  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    annotate();
    fillComment();
    recordOrderHint();
    if (tries >= 60) clearInterval(timer);
  }, 500);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { annotate(); fillComment(); recordOrderHint(); }, { once: true });
  } else {
    annotate(); fillComment(); recordOrderHint();
  }

  console.info(`CanecaFácil · vínculo de personalização ${BUILD}`);
})();
